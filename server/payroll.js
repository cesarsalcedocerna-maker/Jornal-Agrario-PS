/**
 * Motor de cálculo de jornal agrario — Régimen Laboral Agrario (Ley 31110).
 *
 * Todas las reglas son parametrizables desde Gestión Humana (colección `config`),
 * de modo que la empresa pueda ajustar RMV, sobretasas, esquema de beneficios,
 * aportes y topes sin tocar el código.
 */

export const DEFAULT_CONFIG = {
  moneda: 'PEN',
  simbolo: 'S/',
  rmv: 1130,
  jornadaHoras: 8,
  horasSemana: 48,
  maxHorasExtraDia: 4,
  // Sobretasa de horas extras: 2 primeras horas +25%, siguientes +35%
  horasExtraTramo1: 2,
  sobretasaExtra1: 0.25,
  sobretasaExtra2: 0.35,
  // Trabajo nocturno (turno de noche): sobretasa adicional sobre la hora ordinaria
  sobretasaNocturna: 0.35,
  // Feriado trabajado: recargo sobre el jornal del día
  feriadoRecargo: 1.0,
  // Descanso semanal remunerado: 1 día por cada N días trabajados
  aplicarDescansoSemanal: true,
  descansoSemanalPorDias: 6,
  semanasPorMes: 4.3333,
  // Esquema de beneficios sociales.
  //  'separado' = la RD es el jornal base y los beneficios se provisionan aparte (Ley 31110 art. 3)
  //  'integral' = la RD ya incluye gratificaciones, CTS y vacaciones (no se provisionan aparte)
  esquemaBeneficios: 'separado',
  ctsDiasPorAnio: 15,
  gratificacionDias: 30,
  gratificacionesPorAnio: 2,
  vacacionesDias: 30,
  // Asignación familiar: 10% de la RMV para trabajadores con hijos a cargo
  asignacionFamiliarPct: 0.1,
  // Aportes
  essaludPct: 0.09,
  seguroVidaMensual: 0,
  sistemaPensionDefault: 'ONP',
  onpPct: 0.13,
  afpAportePct: 0.1,
  afpComisionPct: 0.0155,
  afpPrimaPct: 0.0137,
  // Tolerancia de minutos antes de descontar tardanza
  toleranciaMinutos: 10,
  feriados: [],
  updatedAt: null,
  updatedBy: null,
};

const ROUND = (value, decimals) => {
  const factor = 10 ** decimals;
  return Math.round((Number(value) + Number.EPSILON) * factor) / factor;
};

export const r2 = (value) => ROUND(value, 2);
export const r4 = (value) => ROUND(value, 4);

export function num(value, fallback = 0) {
  const parsed = typeof value === 'string' ? Number(value.replace(',', '.')) : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

/** Normaliza una fecha a 'YYYY-MM-DD'. */
export function fechaISO(value) {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  const text = String(value).trim();
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const dmy = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`;
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
}

export function diasDelMes(anio, mes) {
  return new Date(anio, mes, 0).getDate();
}

/** Rango de fechas del mes (mes 1-12). */
export function rangoMes(anio, mes) {
  const mm = String(mes).padStart(2, '0');
  return {
    desde: `${anio}-${mm}-01`,
    hasta: `${anio}-${mm}-${String(diasDelMes(anio, mes)).padStart(2, '0')}`,
  };
}

/** Semana de lunes a domingo que contiene la fecha. */
export function rangoSemana(fecha) {
  const iso = fechaISO(fecha);
  const date = new Date(`${iso}T12:00:00`);
  const day = date.getDay(); // 0 = domingo
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const lunes = new Date(date);
  lunes.setDate(date.getDate() + diffToMonday);
  const domingo = new Date(lunes);
  domingo.setDate(lunes.getDate() + 6);
  return { desde: fechaISO(lunes), hasta: fechaISO(domingo) };
}

export function nombreDia(fecha) {
  const dias = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
  return dias[new Date(`${fechaISO(fecha)}T12:00:00`).getDay()];
}

export function esFeriado(fecha, config) {
  const iso = fechaISO(fecha);
  const lista = Array.isArray(config?.feriados) ? config.feriados : [];
  const encontrado = lista.find((f) => fechaISO(f.fecha) === iso);
  return encontrado ? { es: true, nombre: encontrado.nombre || 'Feriado' } : { es: false, nombre: null };
}

/** Tarifa por hora a partir del jornal diario y la jornada pactada. */
export function tarifaHora(tarifaJornal, jornadaHoras) {
  const jornada = num(jornadaHoras, 8) || 8;
  return r4(num(tarifaJornal, 0) / jornada);
}

/** Datos efectivos del trabajador (sus overrides ganan sobre el puesto). */
export function contexto(ctx) {
  const config = { ...DEFAULT_CONFIG, ...(ctx?.config || {}) };
  const trabajador = ctx?.trabajador || {};
  const puesto = ctx?.puesto || {};
  const turno = ctx?.turno || {};
  const jornadaHoras = num(trabajador.jornadaHoras ?? puesto.jornadaHoras ?? config.jornadaHoras, config.jornadaHoras);
  const jornal = num(trabajador.tarifaJornal ?? puesto.tarifaJornal ?? 0, 0);
  return { config, trabajador, puesto, turno, jornadaHoras, jornal };
}

function concepto(codigo, descripcion, tipo, { cantidad = null, unidad = '', precio = null, monto = 0, detalle = '' } = {}) {
  return { codigo, descripcion, tipo, cantidad, unidad, precio, monto: r2(monto), detalle };
}

/**
 * Calcula el detalle de pago de UN jornal (un día).
 * @param {object} ctx {config, trabajador, puesto, turno}
 * @param {object} entrada {fecha, horasTrabajadas, horasExtra, metas:[{nombre,cantidad}], bonos, descuentos, feriado, nocturno, minutosTardanza}
 */
export function calcularDia(ctx, entrada = {}) {
  const { config, trabajador, puesto, turno, jornadaHoras, jornal } = contexto(ctx);
  const fecha = fechaISO(entrada.fecha) || fechaISO(new Date());
  const tarifa = tarifaHora(jornal, jornadaHoras);
  const avisos = [];

  const feriadoDia = entrada.feriado === true
    ? { es: true, nombre: entrada.feriadoNombre || esFeriado(fecha, config).nombre || 'Feriado' }
    : esFeriado(fecha, config);

  // Horas trabajadas: el trabajador puede declarar el total o solo las extras.
  const horasDeclaradas = entrada.horasTrabajadas ?? entrada.horas;
  const extrasDeclaradas = entrada.horasExtra;
  let horasTrabajadas;
  if (horasDeclaradas !== undefined && horasDeclaradas !== null && horasDeclaradas !== '') {
    horasTrabajadas = clamp(num(horasDeclaradas, jornadaHoras), 0, 24);
  } else if (extrasDeclaradas !== undefined && extrasDeclaradas !== null && extrasDeclaradas !== '') {
    horasTrabajadas = clamp(jornadaHoras + num(extrasDeclaradas, 0), 0, 24);
  } else {
    horasTrabajadas = jornadaHoras;
  }

  const horasOrdinarias = r2(Math.min(horasTrabajadas, jornadaHoras));
  let horasExtra = r2(Math.max(0, horasTrabajadas - jornadaHoras));
  if (horasExtra > config.maxHorasExtraDia) {
    avisos.push(`Declaraste ${horasExtra} h de horas extras; el tope configurado es ${config.maxHorasExtraDia} h por día.`);
  }
  const tramo1 = r2(Math.min(horasExtra, num(config.horasExtraTramo1, 2)));
  const tramo2 = r2(Math.max(0, horasExtra - tramo1));

  const nocturno = Boolean(entrada.nocturno) || Boolean(turno?.nocturno);
  const sobretasaNocturna = num(entrada.sobretasaNocturna ?? turno?.recargoPct ?? config.sobretasaNocturna, 0);
  const horasNocturnas = nocturno ? r2(horasOrdinarias + horasExtra) : 0;
  const minutosTardanza = clamp(num(entrada.minutosTardanza, 0), 0, 600);
  if (minutosTardanza > num(config.toleranciaMinutos, 0)) {
    avisos.push(`Tardanza de ${minutosTardanza} min (tolerancia ${config.toleranciaMinutos} min).`);
  }

  const conceptos = [];

  // 1. Jornal básico (solo por horas efectivamente ordinarias trabajadas)
  conceptos.push(concepto('jornal_basico', 'Jornal básico (horas ordinarias)', 'ingreso', {
    cantidad: horasOrdinarias,
    unidad: 'h',
    precio: tarifa,
    monto: horasOrdinarias * tarifa,
    detalle: `Jornal diario ${jornal.toFixed(2)} / ${jornadaHoras} h`,
  }));

  // 2. Horas extras con sobretasas escalonadas
  if (tramo1 > 0) {
    const precio = r4(tarifa * (1 + num(config.sobretasaExtra1, 0.25)));
    conceptos.push(concepto('horas_extra_1', `Horas extras 1er tramo (+${(num(config.sobretasaExtra1, 0.25) * 100).toFixed(0)}%)`, 'ingreso', {
      cantidad: tramo1,
      unidad: 'h',
      precio,
      monto: tramo1 * precio,
      detalle: 'Incluye hora ordinaria + sobretasa',
    }));
  }
  if (tramo2 > 0) {
    const precio = r4(tarifa * (1 + num(config.sobretasaExtra2, 0.35)));
    conceptos.push(concepto('horas_extra_2', `Horas extras 2do tramo (+${(num(config.sobretasaExtra2, 0.35) * 100).toFixed(0)}%)`, 'ingreso', {
      cantidad: tramo2,
      unidad: 'h',
      precio,
      monto: tramo2 * precio,
      detalle: 'Horas adicionales al 1er tramo',
    }));
  }

  // 3. Recargo nocturno
  if (horasNocturnas > 0 && sobretasaNocturna > 0) {
    const monto = horasNocturnas * tarifa * sobretasaNocturna;
    conceptos.push(concepto('recargo_nocturno', `Recargo nocturno (+${(sobretasaNocturna * 100).toFixed(0)}%)`, 'ingreso', {
      cantidad: horasNocturnas,
      unidad: 'h',
      precio: r4(tarifa * sobretasaNocturna),
      monto,
      detalle: `Turno ${turno?.nombre || 'nocturno'}`,
    }));
  }

  // 4. Feriado trabajado
  if (feriadoDia.es && horasTrabajadas > 0) {
    const monto = jornal * num(config.feriadoRecargo, 1);
    conceptos.push(concepto('feriado', `Feriado trabajado (${feriadoDia.nombre})`, 'ingreso', {
      cantidad: 1,
      unidad: 'día',
      precio: r2(monto),
      monto,
      detalle: `Recargo ${(num(config.feriadoRecargo, 1) * 100).toFixed(0)}% sobre el jornal`,
    }));
  }

  // 5. Metas / destajo — según el plan de metas del puesto
  const planMetas = Array.isArray(puesto.metasPlan) ? puesto.metasPlan : [];
  const metasDeclaradas = Array.isArray(entrada.metas) ? entrada.metas : [];
  for (const meta of metasDeclaradas) {
    const cantidad = num(meta.cantidad, 0);
    if (cantidad <= 0) continue;
    const plan = planMetas.find((m) => m.nombre === meta.nombre) || {};
    const tarifaUnidad = num(meta.tarifa ?? plan.tarifa, 0);
    if (tarifaUnidad <= 0) continue;
    const monto = cantidad * tarifaUnidad;
    conceptos.push(concepto(`meta:${meta.nombre}`, `Meta: ${meta.nombre}`, 'ingreso', {
      cantidad: r2(cantidad),
      unidad: meta.unidad || plan.unidad || 'und',
      precio: r4(tarifaUnidad),
      monto,
      detalle: meta.superaObjetivo ? 'Objetivo cumplido' : '',
    }));
  }

  // 6. Bonos adicionales declarados
  const bonos = Array.isArray(entrada.bonos) ? entrada.bonos : [];
  for (const bono of bonos) {
    const monto = num(bono.monto, 0);
    if (monto <= 0) continue;
    conceptos.push(concepto(`bono:${bono.motivo || 'bono'}`, `Bono: ${bono.motivo || 'asignado'}`, 'ingreso', {
      cantidad: 1, unidad: '', precio: r2(monto), monto,
    }));
  }
  const bonoManual = num(entrada.bonificacion, 0);
  if (bonoManual > 0) {
    conceptos.push(concepto('bono_manual', 'Bonificación adicional', 'ingreso', {
      cantidad: 1, unidad: '', precio: r2(bonoManual), monto: bonoManual,
    }));
  }

  // Descuentos del día
  const horasNoTrabajadas = r2(Math.max(0, jornadaHoras - horasTrabajadas));
  if (horasNoTrabajadas > 0 && horasTrabajadas > 0) {
    conceptos.push(concepto('descuento_horas', 'Horas no laboradas', 'descuento', {
      cantidad: horasNoTrabajadas,
      unidad: 'h',
      precio: tarifa,
      monto: horasNoTrabajadas * tarifa,
    }));
  }
  const descuentosManuales = num(entrada.descuento, 0) + (Array.isArray(entrada.descuentos)
    ? entrada.descuentos.reduce((sum, d) => sum + num(d.monto, 0), 0)
    : 0);
  if (descuentosManuales > 0) {
    const motivos = Array.isArray(entrada.descuentos)
      ? entrada.descuentos.filter((d) => num(d.monto, 0) > 0).map((d) => `${d.motivo || 'descuento'}: ${r2(num(d.monto, 0))}`).join(' · ')
      : (entrada.motivoDescuento || 'Adelantos / otros');
    conceptos.push(concepto('descuento_manual', 'Otros descuentos', 'descuento', {
      cantidad: 1, unidad: '', precio: r2(descuentosManuales), monto: descuentosManuales, detalle: motivos,
    }));
  }

  const ingresos = r2(conceptos.filter((c) => c.tipo === 'ingreso').reduce((s, c) => s + c.monto, 0));
  const descuentos = r2(conceptos.filter((c) => c.tipo === 'descuento').reduce((s, c) => s + c.monto, 0));

  return {
    fecha,
    dia: nombreDia(fecha),
    feriado: feriadoDia,
    turno: turno?.nombre || null,
    nocturno,
    jornadaHoras,
    horas: {
      jornada: jornadaHoras,
      trabajadas: r2(horasTrabajadas),
      ordinarias: horasOrdinarias,
      extra: horasExtra,
      extraTramo1: tramo1,
      extraTramo2: tramo2,
      nocturnas: horasNocturnas,
      noTrabajadas: horasNoTrabajadas,
      minutosTardanza,
    },
    tarifas: { jornal: r2(jornal), hora: tarifa },
    conceptos,
    totales: { ingresos, descuentos, bruto: r2(ingresos - descuentos) },
    avisos,
  };
}

/** Aportes de ley del trabajador (ONP o AFP) sobre la remuneración afecta. */
export function calcularAportes(baseAfecta, ctx) {
  const { config, trabajador } = contexto(ctx);
  const sistema = (trabajador.sistemaPension || config.sistemaPensionDefault || 'ONP').toUpperCase();
  const base = r2(baseAfecta);
  const detalle = [];
  let total = 0;
  if (sistema === 'AFP') {
    const aporte = r2(base * num(config.afpAportePct, 0.1));
    const comision = r2(base * num(config.afpComisionPct, 0));
    const prima = r2(base * num(config.afpPrimaPct, 0));
    detalle.push({ codigo: 'afp_aporte', descripcion: `AFP aporte obligatorio (${(num(config.afpAportePct, 0.1) * 100).toFixed(2)}%)`, monto: aporte });
    if (comision > 0) detalle.push({ codigo: 'afp_comision', descripcion: `Comisión AFP (${(num(config.afpComisionPct, 0) * 100).toFixed(2)}%)`, monto: comision });
    if (prima > 0) detalle.push({ codigo: 'afp_prima', descripcion: `Prima de seguro AFP (${(num(config.afpPrimaPct, 0) * 100).toFixed(2)}%)`, monto: prima });
    total = r2(aporte + comision + prima);
  } else if (sistema === 'SIN_APORTE') {
    detalle.push({ codigo: 'sin_aporte', descripcion: 'Sin aporte previsional', monto: 0 });
  } else {
    total = r2(base * num(config.onpPct, 0.13));
    detalle.push({ codigo: 'onp', descripcion: `ONP (${(num(config.onpPct, 0.13) * 100).toFixed(0)}%)`, monto: total });
  }
  return { sistema, base, detalle, total };
}

/** Conceptos agregados por código. */
function agregarConceptos(dias) {
  const mapa = new Map();
  for (const dia of dias) {
    for (const c of dia.conceptos) {
      const prev = mapa.get(c.codigo) || { ...c, cantidad: 0, monto: 0 };
      prev.cantidad = r2(num(prev.cantidad, 0) + num(c.cantidad, 0));
      prev.monto = r2(prev.monto + c.monto);
      mapa.set(c.codigo, prev);
    }
  }
  return [...mapa.values()];
}

/**
 * Consolida un conjunto de días en un periodo (día / semana / mes) con
 * beneficios sociales, descanso semanal, aportes y costo del empleador.
 */
export function resumenPeriodo(dias, ctx, opts = {}) {
  const { config, trabajador } = contexto(ctx);
  const tipo = opts.tipo || 'periodo';
  const ordenados = [...dias].sort((a, b) => (a.fecha < b.fecha ? -1 : 1));
  const conTrabajo = ordenados.filter((d) => d.horas.trabajadas > 0);
  const conceptos = agregarConceptos(ordenados);

  const ingresosBrutos = r2(ordenados.reduce((s, d) => s + d.totales.ingresos, 0));
  const descuentosDia = r2(ordenados.reduce((s, d) => s + d.totales.descuentos, 0));

  // Descanso semanal remunerado: 1 día por cada N días trabajados
  let descansoSemanal = 0;
  if (config.aplicarDescansoSemanal && conTrabajo.length > 0 && num(config.descansoSemanalPorDias, 6) > 0) {
    const jornalPromedio = conTrabajo.reduce((s, d) => s + d.tarifas.jornal, 0) / conTrabajo.length;
    descansoSemanal = r2((conTrabajo.length / num(config.descansoSemanalPorDias, 6)) * jornalPromedio);
    conceptos.push(concepto('descanso_semanal', 'Descanso semanal remunerado', 'ingreso', {
      cantidad: r2(conTrabajo.length / num(config.descansoSemanalPorDias, 6)),
      unidad: 'día',
      precio: r2(jornalPromedio),
      monto: descansoSemanal,
      detalle: `1 día por cada ${config.descansoSemanalPorDias} días laborados`,
    }));
  }

  // Asignación familiar (10% RMV) prorrateada por los días del periodo
  let asignacionFamiliar = 0;
  if (trabajador.asignacionFamiliar) {
    const diasPeriodo = opts.diasDelPeriodo || ordenados.length || 1;
    const mensual = num(config.rmv, 0) * num(config.asignacionFamiliarPct, 0.1);
    asignacionFamiliar = r2((mensual / 30) * Math.min(diasPeriodo, 30));
    if (asignacionFamiliar > 0) {
      conceptos.push(concepto('asignacion_familiar', 'Asignación familiar (10% RMV)', 'ingreso', {
        cantidad: 1, unidad: '', precio: asignacionFamiliar, monto: asignacionFamiliar,
      }));
    }
  }

  const ingresos = r2(ingresosBrutos + descansoSemanal + asignacionFamiliar);
  const bruto = r2(ingresos - descuentosDia);
  const aportes = calcularAportes(bruto, ctx);

  // Beneficios sociales del periodo (provisión) según esquema
  const jornalPromedio = conTrabajo.length ? r2(conTrabajo.reduce((s, d) => s + d.tarifas.jornal, 0) / conTrabajo.length) : 0;
  const proporcion = Math.min(1, (opts.diasDelPeriodo || ordenados.length || 0) / 30);
  const beneficios = { esquema: config.esquemaBeneficios, cts: 0, gratificacion: 0, vacaciones: 0, total: 0, detalle: [] };
  if (config.esquemaBeneficios === 'separado' && jornalPromedio > 0 && proporcion > 0) {
    const cts = r2((jornalPromedio * num(config.ctsDiasPorAnio, 15) / 12) * proporcion);
    const gratificacion = r2((jornalPromedio * num(config.gratificacionDias, 30) * num(config.gratificacionesPorAnio, 2) / 12) * proporcion);
    const vacaciones = r2((jornalPromedio * num(config.vacacionesDias, 30) / 12) * proporcion);
    beneficios.cts = cts;
    beneficios.gratificacion = gratificacion;
    beneficios.vacaciones = vacaciones;
    beneficios.total = r2(cts + gratificacion + vacaciones);
    beneficios.detalle = [
      { codigo: 'cts', descripcion: `CTS (${config.ctsDiasPorAnio} jornales/año)`, monto: cts },
      { codigo: 'gratificacion', descripcion: `Gratificaciones (${config.gratificacionesPorAnio} x ${config.gratificacionDias} jornales)`, monto: gratificacion },
      { codigo: 'vacaciones', descripcion: `Vacaciones (${config.vacacionesDias} jornales/año)`, monto: vacaciones },
    ];
  }

  const essalud = r2(bruto * num(config.essaludPct, 0.09));
  const seguroVida = config.esquemaBeneficios === 'separado'
    ? r2(num(config.seguroVidaMensual, 0) * proporcion)
    : 0;
  const costoEmpleador = {
    essalud,
    seguroVida,
    beneficios: beneficios.total,
    total: r2(bruto + essalud + seguroVida + beneficios.total),
  };

  return {
    tipo,
    periodo: {
      desde: ordenados[0]?.fecha || null,
      hasta: ordenados[ordenados.length - 1]?.fecha || null,
      dias: ordenados.length,
      diasTrabajados: conTrabajo.length,
    },
    dias: ordenados,
    conceptos,
    horas: {
      trabajadas: r2(ordenados.reduce((s, d) => s + d.horas.trabajadas, 0)),
      ordinarias: r2(ordenados.reduce((s, d) => s + d.horas.ordinarias, 0)),
      extra: r2(ordenados.reduce((s, d) => s + d.horas.extra, 0)),
      nocturnas: r2(ordenados.reduce((s, d) => s + d.horas.nocturnas, 0)),
    },
    ingresos: {
      jornal: r2(conceptos.filter((c) => c.tipo === 'ingreso' && !c.codigo.startsWith('meta:') && !c.codigo.startsWith('bono') && !['horas_extra_1', 'horas_extra_2', 'recargo_nocturno', 'feriado', 'descanso_semanal', 'asignacion_familiar'].includes(c.codigo)).reduce((s, c) => s + c.monto, 0)),
      horasExtra: r2(conceptos.filter((c) => ['horas_extra_1', 'horas_extra_2'].includes(c.codigo)).reduce((s, c) => s + c.monto, 0)),
      nocturno: r2(conceptos.filter((c) => c.codigo === 'recargo_nocturno').reduce((s, c) => s + c.monto, 0)),
      feriados: r2(conceptos.filter((c) => c.codigo === 'feriado').reduce((s, c) => s + c.monto, 0)),
      metas: r2(conceptos.filter((c) => c.codigo.startsWith('meta:')).reduce((s, c) => s + c.monto, 0)),
      bonos: r2(conceptos.filter((c) => c.codigo.startsWith('bono') || c.codigo === 'bono_manual').reduce((s, c) => s + c.monto, 0)),
      descansoSemanal,
      asignacionFamiliar,
      total: ingresos,
    },
    descuentos: { dia: descuentosDia, pension: aportes.total, total: r2(descuentosDia + aportes.total) },
    aportes,
    beneficios,
    bruto,
    neto: r2(bruto - aportes.total),
    costoEmpleador,
  };
}

/** Consolida días sueltos manteniendo el orden cronológico. */
export function resumenDias(dias, ctx, opts = {}) {
  return resumenPeriodo(dias, ctx, { ...opts, tipo: opts.tipo || 'periodo' });
}

function entradasPatron(patron, cantidad, { desde, saltearFeriados = true } = {}) {
  const salida = [];
  const inicio = desde ? new Date(`${desde}T12:00:00`) : new Date();
  for (let i = 0; i < cantidad; i += 1) {
    const d = new Date(inicio);
    d.setDate(inicio.getDate() + i);
    salida.push({ ...patron, fecha: fechaISO(d) });
  }
  return salida;
}

/**
 * Simulador del trabajador: cuánto gana hoy, esta semana y este mes,
 * y hasta cuánto podría ganar (potencial máximo).
 * @param {object} ctx
 * @param {object} entrada {horasTrabajadas, horasExtra, metas:[{nombre,cantidad}], feriado, diasPorSemana, semanasPorMes, desde}
 */
export function simular(ctx, entrada = {}) {
  const { config, trabajador, puesto } = contexto(ctx);
  const desde = fechaISO(entrada.desde) || fechaISO(new Date());
  const diasPorSemana = clamp(num(entrada.diasPorSemana, trabajador.diasPorSemana ?? 6), 1, 7);
  const semanasPorMes = clamp(num(entrada.semanasPorMes, config.semanasPorMes ?? 4.3333), 1, 6);

  const patron = {
    horasTrabajadas: entrada.horasTrabajadas,
    horasExtra: entrada.horasExtra,
    minutosTardanza: entrada.minutosTardanza,
    metas: entrada.metas,
    bonos: entrada.bonos,
    bonificacion: entrada.bonificacion,
    descuento: entrada.descuento,
    minutosTardanza: entrada.minutosTardanza,
  };

  const dia = calcularDia(ctx, { ...patron, fecha: desde, feriado: entrada.feriado });

  // Semana real: mismo patrón repetido en los días programados
  const diasSemana = entradasPatron(patron, diasPorSemana, { desde });
  const semanaDias = diasSemana.map((e) => calcularDia(ctx, e));
  const semana = resumenPeriodo(semanaDias, ctx, { tipo: 'semana', diasDelPeriodo: 7 });

  // Mes real
  const totalDiasMes = Math.round(diasPorSemana * semanasPorMes);
  const mesDias = entradasPatron(patron, totalDiasMes, { desde });
  const mes = resumenPeriodo(mesDias.map((e) => calcularDia(ctx, e)), ctx, { tipo: 'mes', diasDelPeriodo: 30 });

  // Potencial máximo: tope legal de horas extra + objetivo de metas + semana de 6 días
  const planMetas = Array.isArray(puesto.metasPlan) ? puesto.metasPlan : [];
  const metasObjetivo = planMetas
    .filter((m) => num(m.objetivoDia, 0) > 0)
    .map((m) => ({ nombre: m.nombre, cantidad: num(m.objetivoDia, 0), superaObjetivo: true }));

  const patronMax = {
    ...patron,
    horasTrabajadas: num(entrada.jornadaHoras, trabajador.jornadaHoras ?? puesto.jornadaHoras ?? config.jornadaHoras) + num(config.maxHorasExtraDia, 4),
    horasExtra: num(config.maxHorasExtraDia, 4),
    metas: metasObjetivo,
    feriado: false,
  };
  const diaMax = calcularDia(ctx, { ...patronMax, fecha: desde });
  const semanaMaxDias = entradasPatron(patronMax, 6, { desde });
  const semanaMax = resumenPeriodo(semanaMaxDias.map((e) => calcularDia(ctx, e)), ctx, { tipo: 'semana', diasDelPeriodo: 7 });
  const mesMaxDias = entradasPatron(patronMax, Math.round(6 * semanasPorMes), { desde });
  const mesMax = resumenPeriodo(mesMaxDias.map((e) => calcularDia(ctx, e)), ctx, { tipo: 'mes', diasDelPeriodo: 30 });

  return {
    desde,
    parametros: { diasPorSemana, semanasPorMes, maxHorasExtraDia: config.maxHorasExtraDia, esquemaBeneficios: config.esquemaBeneficios },
    dia,
    semana,
    mes,
    potencial: {
      dia: { bruto: diaMax.totales.bruto, neto: r2(diaMax.totales.bruto - calcularAportes(diaMax.totales.bruto, ctx).total), supuestos: `Jornada + ${config.maxHorasExtraDia} h extra y metas al objetivo` },
      semana: { bruto: semanaMax.bruto, neto: semanaMax.neto, supuestos: '6 días laborados con tope de horas extra' },
      mes: { bruto: mesMax.bruto, neto: mesMax.neto, beneficios: mesMax.beneficios.total, supuestos: 'Mes completo con tope de horas extra y metas al objetivo' },
    },
  };
}

/** Calcula aportes de ley para una base dada, expuesto para pruebas/reportes. */
export function calcularRetencion(base, ctx) {
  return calcularAportes(base, ctx);
}
