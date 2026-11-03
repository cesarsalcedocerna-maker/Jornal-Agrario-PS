import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_CONFIG, calcularDia, simular, resumenPeriodo, rangoSemana, rangoMes,
  esFeriado, tarifaHora, calcularAportes,
} from '../server/payroll.js';

const config = { ...DEFAULT_CONFIG, feriados: [{ fecha: '2026-05-01', nombre: 'Día del Trabajo' }] };
const ctx = {
  config,
  trabajador: { nombres: 'Ana', apellidos: 'Quispe', tarifaJornal: 46, jornadaHoras: 8, sistemaPension: 'ONP' },
  puesto: { nombre: 'Cosecha', metasPlan: [{ nombre: 'Kilos cosechados', unidad: 'kg', tarifa: 0.45, objetivoDia: 60 }] },
  turno: { nombre: 'Mañana', nocturno: false, recargoPct: 0 },
};

const sumar = (c) => c.conceptos.filter((x) => x.tipo === 'ingreso').reduce((s, x) => s + x.monto, 0);

test('tarifa hora = jornal / jornada', () => {
  assert.equal(tarifaHora(46, 8), 5.75);
});

test('jornal sin extras ni metas = tarifa diaria', () => {
  const d = calcularDia(ctx, { fecha: '2026-03-02', horasTrabajadas: 8 });
  assert.equal(d.horas.ordinarias, 8);
  assert.equal(d.horas.extra, 0);
  assert.equal(d.conceptos.find((c) => c.codigo === 'jornal_basico').monto, 46);
  assert.equal(d.totales.bruto, 46);
});

test('horas extras con sobretasa escalonada 25% y 35%', () => {
  const d = calcularDia(ctx, { fecha: '2026-03-02', horasTrabajadas: 12 });
  assert.equal(d.horas.extra, 4);
  assert.equal(d.horas.extraTramo1, 2);
  assert.equal(d.horas.extraTramo2, 2);
  const c1 = d.conceptos.find((c) => c.codigo === 'horas_extra_1');
  const c2 = d.conceptos.find((c) => c.codigo === 'horas_extra_2');
  assert.equal(c1.monto, 2 * (5.75 * 1.25));
  assert.equal(c2.monto, 2 * (5.75 * 1.35));
  assert.equal(d.totales.bruto, Math.round((46 + 14.375 + 15.525) * 100) / 100);
});

test('solo horas extra declaradas se suman a la jornada', () => {
  const d = calcularDia(ctx, { fecha: '2026-03-02', horasExtra: 2 });
  assert.equal(d.horas.trabajadas, 10);
  assert.equal(d.horas.extra, 2);
});

test('aviso cuando se supera el tope diario de horas extras', () => {
  const d = calcularDia(ctx, { fecha: '2026-03-02', horasTrabajadas: 14 });
  assert.ok(d.avisos.some((a) => a.includes('tope')));
});

test('metas pagadas por tarifa del plan de puesto', () => {
  const d = calcularDia(ctx, {
    fecha: '2026-03-02', horasTrabajadas: 8,
    metas: [{ nombre: 'Kilos cosechados', cantidad: 70 }],
  });
  const meta = d.conceptos.find((c) => c.codigo === 'meta:Kilos cosechados');
  assert.ok(meta);
  assert.equal(meta.monto, 31.5);
  assert.equal(d.totales.bruto, 77.5);
});

test('meta desconocida sin tarifa no genera pago', () => {
  const d = calcularDia(ctx, { fecha: '2026-03-02', metas: [{ nombre: 'Meta inexistente', cantidad: 10 }] });
  assert.equal(d.conceptos.some((c) => c.codigo.startsWith('meta:')), false);
});

test('feriado trabajado genera recargo adicional', () => {
  const d = calcularDia(ctx, { fecha: '2026-05-01', horasTrabajadas: 8 });
  assert.equal(d.feriado.es, true);
  const fer = d.conceptos.find((c) => c.codigo === 'feriado');
  assert.equal(fer.monto, 46);
  assert.equal(d.totales.bruto, 92);
});

test('turno nocturno aplica recargo configurado', () => {
  const nocturno = { ...ctx, turno: { nombre: 'Noche', nocturno: true, recargoPct: 0.35 } };
  const d = calcularDia(nocturno, { fecha: '2026-03-02', horasTrabajadas: 8 });
  assert.equal(d.horas.nocturnas, 8);
  const rec = d.conceptos.find((c) => c.codigo === 'recargo_nocturno');
  assert.equal(rec.monto, 8 * 5.75 * 0.35);
});

test('tardanza y horas no laboradas generan descuento', () => {
  const d = calcularDia(ctx, { fecha: '2026-03-02', horasTrabajadas: 6, minutosTardanza: 45 });
  const desc = d.conceptos.find((c) => c.codigo === 'descuento_horas');
  assert.equal(desc.monto, 2 * 5.75);
  assert.ok(d.avisos.some((a) => a.includes('Tardanza')));
});

test('aportes ONP 13% y EsSalud 9%', () => {
  const aportes = calcularAportes(1000, ctx);
  assert.equal(aportes.total, 130);
  const d = resumenPeriodo([calcularDia(ctx, { fecha: '2026-03-02', horasTrabajadas: 8 })], ctx, { tipo: 'dia', diasDelPeriodo: 1 });
  assert.equal(d.costoEmpleador.essalud, Math.round(46 * 0.09 * 100) / 100);
});

test('descanso semanal remunerado: 1 día por cada 6 laborados', () => {
  const dias = [];
  for (let i = 2; i <= 7; i += 1) dias.push(calcularDia(ctx, { fecha: `2026-03-0${i}`, horasTrabajadas: 8 }));
  const r = resumenPeriodo(dias, ctx, { tipo: 'semana', diasDelPeriodo: 7 });
  assert.equal(r.periodo.diasTrabajados, 6);
  assert.equal(r.ingresos.descansoSemanal, 46);
  assert.equal(r.ingresos.total, 6 * 46 + 46);
});

test('esquema de beneficios separado provisiona CTS, gratificación y vacaciones', () => {
  const dias = [];
  for (let i = 2; i <= 7; i += 1) dias.push(calcularDia(ctx, { fecha: `2026-03-0${i}`, horasTrabajadas: 8 }));
  const r = resumenPeriodo(dias, ctx, { tipo: 'semana', diasDelPeriodo: 7 });
  assert.equal(r.beneficios.esquema, 'separado');
  assert.ok(r.beneficios.cts > 0);
  assert.ok(r.beneficios.gratificacion > 0);
  assert.ok(r.beneficios.vacaciones > 0);
  assert.equal(r.beneficios.total, Math.round((r.beneficios.cts + r.beneficios.gratificacion + r.beneficios.vacaciones) * 100) / 100);
});

test('esquema integral no provisiona beneficios aparte', () => {
  const integral = { ...ctx, config: { ...config, esquemaBeneficios: 'integral' } };
  const r = resumenPeriodo([calcularDia(integral, { fecha: '2026-03-02', horasTrabajadas: 8 })], integral, { tipo: 'dia', diasDelPeriodo: 1 });
  assert.equal(r.beneficios.total, 0);
});

test('simulador devuelve día, semana y mes con potencial máximo', () => {
  const r = simular(ctx, {
    fecha: '2026-03-02', horasTrabajadas: 10,
    metas: [{ nombre: 'Kilos cosechados', cantidad: 60 }], diasPorSemana: 6, semanasPorMes: 4.3333,
  });
  assert.ok(r.dia.totales.bruto > 46);
  assert.ok(r.semana.bruto > r.dia.totales.bruto);
  assert.ok(r.mes.bruto > r.semana.bruto);
  assert.ok(r.potencial.mes.bruto >= r.mes.bruto);
  assert.ok(r.potencial.mes.neto >= 0);
});

test('rangos de semana y mes son correctos', () => {
  const semana = rangoSemana('2026-03-04');
  assert.equal(semana.desde, '2026-03-02');
  assert.equal(semana.hasta, '2026-03-08');
  const mes = rangoMes(2026, 2);
  assert.equal(mes.desde, '2026-02-01');
  assert.equal(mes.hasta, '2026-02-28');
});

test('esFeriado detecta feriados configurados', () => {
  assert.equal(esFeriado('2026-05-01', config).es, true);
  assert.equal(esFeriado('2026-05-02', config).es, false);
});
