import { DEFAULT_CONFIG } from './payroll.js';
import {
  getConfig, setConfig, get, setColeccion, insertar, hashPassword, uid, persistir,
} from './store.js';

const CLAVE_DEMO = 'agro2025';

const PUESTOS = [
  {
    nombre: 'Cosecha de arándano',
    area: 'Campo',
    tarifaJornal: 62,
    jornadaHoras: 8,
    descripcion: 'Cosecha manual con jaba calibrada. Pago por jornal más destajo por kilo.',
    metasPlan: [
      { nombre: 'Kilos cosechados', unidad: 'kg', tarifa: 0.45, objetivoDia: 60 },
      { nombre: 'Jabas completas', unidad: 'jaba', tarifa: 1.2, objetivoDia: 12 },
    ],
  },
  {
    nombre: 'Riego y mantenimiento',
    area: 'Campo',
    tarifaJornal: 68,
    jornadaHoras: 8,
    descripcion: 'Operación de riego tecnificado y mantenimiento de líneas.',
    metasPlan: [
      { nombre: 'Hectáreas regadas', unidad: 'ha', tarifa: 18, objetivoDia: 3 },
    ],
  },
  {
    nombre: 'Selección y empaque',
    area: 'Planta',
    tarifaJornal: 58,
    jornadaHoras: 8,
    descripcion: 'Clasificación y empaque en planta de proceso.',
    metasPlan: [
      { nombre: 'Cajas empacadas', unidad: 'caja', tarifa: 0.9, objetivoDia: 70 },
    ],
  },
  {
    nombre: 'Supervisor de cuadrilla',
    area: 'Supervisión',
    tarifaJornal: 85,
    jornadaHoras: 8,
    descripcion: 'Supervisión de cuadrillas de campo y control de calidad.',
    metasPlan: [
      { nombre: 'Cuadrillas supervisadas', unidad: 'cuadrilla', tarifa: 6, objetivoDia: 4 },
    ],
  },
  {
    nombre: 'Aplicación fitosanitaria',
    area: 'Campo',
    tarifaJornal: 75,
    jornadaHoras: 8,
    descripcion: 'Aplicación de insumos con equipo de protección.',
    metasPlan: [
      { nombre: 'Hectáreas aplicadas', unidad: 'ha', tarifa: 15, objetivoDia: 4 },
    ],
  },
];

const TURNOS = [
  { nombre: 'Mañana', horaInicio: '06:00', horaFin: '14:00', nocturno: false, recargoPct: 0, refrigerioMinutos: 45 },
  { nombre: 'Tarde', horaInicio: '14:00', horaFin: '22:00', nocturno: false, recargoPct: 0, refrigerioMinutos: 45 },
  { nombre: 'Noche', horaInicio: '22:00', horaFin: '06:00', nocturno: true, recargoPct: 0.35, refrigerioMinutos: 45 },
  { nombre: 'Mixto', horaInicio: '10:00', horaFin: '19:00', nocturno: false, recargoPct: 0, refrigerioMinutos: 60 },
];

const HORARIOS = [
  {
    nombre: 'Campo lunes a sábado',
    dias: ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'],
    horaEntrada: '06:00',
    horaSalida: '14:00',
    refrigerioMinutos: 45,
    toleranciaMinutos: 10,
  },
  {
    nombre: 'Planta lunes a viernes',
    dias: ['lunes', 'martes', 'miércoles', 'jueves', 'viernes'],
    horaEntrada: '08:00',
    horaSalida: '17:00',
    refrigerioMinutos: 60,
    toleranciaMinutos: 10,
  },
  {
    nombre: 'Turno noche rotativo',
    dias: ['lunes', 'martes', 'miércoles', 'jueves', 'viernes'],
    horaEntrada: '22:00',
    horaSalida: '06:00',
    refrigerioMinutos: 45,
    toleranciaMinutos: 15,
  },
  {
    nombre: 'Medio tiempo campo',
    dias: ['lunes', 'miércoles', 'viernes', 'sábado'],
    horaEntrada: '06:00',
    horaSalida: '10:00',
    refrigerioMinutos: 0,
    toleranciaMinutos: 10,
  },
];

const MODALIDADES = [
  { nombre: 'Presencial', descripcion: 'Trabajo en campo o planta a jornada completa.', diasPorSemana: 6, aplicaBeneficios: true },
  { nombre: 'Presencial medio tiempo', descripcion: 'Jornada parcial de 4 horas.', diasPorSemana: 4, aplicaBeneficios: true },
  { nombre: 'Destajo', descripcion: 'Pago principal por producción, jornal mínimo garantizado.', diasPorSemana: 6, aplicaBeneficios: true },
  { nombre: 'Rotativo nocturno', descripcion: 'Turnos de noche con recargo.', diasPorSemana: 5, aplicaBeneficios: true },
];

const FERIADOS = [
  { fecha: '2026-01-01', nombre: 'Año Nuevo' },
  { fecha: '2026-04-02', nombre: 'Jueves Santo' },
  { fecha: '2026-04-03', nombre: 'Viernes Santo' },
  { fecha: '2026-05-01', nombre: 'Día del Trabajo' },
  { fecha: '2026-06-07', nombre: 'Batalla de Arica y Día de la Bandera' },
  { fecha: '2026-06-29', nombre: 'San Pedro y San Pablo' },
  { fecha: '2026-07-23', nombre: 'Día de la Fuerza Aérea' },
  { fecha: '2026-07-28', nombre: 'Fiestas Patrias' },
  { fecha: '2026-07-29', nombre: 'Fiestas Patrias' },
  { fecha: '2026-08-06', nombre: 'Batalla de Junín' },
  { fecha: '2026-08-30', nombre: 'Santa Rosa de Lima' },
  { fecha: '2026-10-08', nombre: 'Combate de Angamos' },
  { fecha: '2026-11-01', nombre: 'Todos los Santos' },
  { fecha: '2026-12-08', nombre: 'Inmaculada Concepción' },
  { fecha: '2026-12-09', nombre: 'Batalla de Ayacucho' },
  { fecha: '2026-12-25', nombre: 'Navidad' },
];

const TRABAJADORES = [
  {
    dni: '45678912',
    nombres: 'María Elena',
    apellidos: 'Quispe Huamán',
    puesto: 'Cosecha de arándano',
    turno: 'Mañana',
    horario: 'Campo lunes a sábado',
    modalidad: 'Presencial',
    fechaIngreso: '2023-08-14',
    sistemaPension: 'ONP',
    asignacionFamiliar: true,
  },
  {
    dni: '41235678',
    nombres: 'José Luis',
    apellidos: 'Ramos Ccahuana',
    puesto: 'Riego y mantenimiento',
    turno: 'Tarde',
    horario: 'Campo lunes a sábado',
    modalidad: 'Presencial',
    fechaIngreso: '2022-02-01',
    sistemaPension: 'AFP',
    asignacionFamiliar: false,
  },
  {
    dni: '70981234',
    nombres: 'Rosa Aurelia',
    apellidos: 'Huillca Puma',
    puesto: 'Selección y empaque',
    turno: 'Mañana',
    horario: 'Planta lunes a viernes',
    modalidad: 'Presencial',
    fechaIngreso: '2024-11-04',
    sistemaPension: 'ONP',
    asignacionFamiliar: true,
  },
  {
    dni: '09876543',
    nombres: 'Pedro Pablo',
    apellidos: 'Choque Mamani',
    puesto: 'Supervisor de cuadrilla',
    turno: 'Mañana',
    horario: 'Campo lunes a sábado',
    modalidad: 'Presencial',
    fechaIngreso: '2021-05-17',
    sistemaPension: 'AFP',
    asignacionFamiliar: true,
  },
  {
    dni: '76543210',
    nombres: 'Ana Lucía',
    apellidos: 'Ttito Cusi',
    puesto: 'Aplicación fitosanitaria',
    turno: 'Noche',
    horario: 'Turno noche rotativo',
    modalidad: 'Rotativo nocturno',
    fechaIngreso: '2023-01-09',
    sistemaPension: 'ONP',
    asignacionFamiliar: false,
  },
  {
    dni: '32165498',
    nombres: 'Carlos Alberto',
    apellidos: 'Yupanqui Sallo',
    puesto: 'Cosecha de arándano',
    turno: 'Tarde',
    horario: 'Medio tiempo campo',
    modalidad: 'Presencial medio tiempo',
    fechaIngreso: '2025-03-03',
    sistemaPension: 'ONP',
    asignacionFamiliar: false,
  },
];

function fechaLocal(offsetDias = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDias);
  return d.toISOString().slice(0, 10);
}

export function inicializarDatos({ forzar = false } = {}) {
  if (forzar || !getConfig()) {
    setConfig({
      ...DEFAULT_CONFIG,
      feriados: FERIADOS,
      updatedAt: new Date().toISOString(),
      updatedBy: 'sistema',
    });
  }

  if (get('puestos').length === 0) {
    setColeccion('puestos', PUESTOS.map((p) => ({ id: uid('pue'), ...p })));
  }
  if (get('turnos').length === 0) {
    setColeccion('turnos', TURNOS.map((t) => ({ id: uid('tur'), ...t })));
  }
  if (get('horarios').length === 0) {
    setColeccion('horarios', HORARIOS.map((h) => ({ id: uid('hor'), ...h })));
  }
  if (get('modalidades').length === 0) {
    setColeccion('modalidades', MODALIDADES.map((m) => ({ id: uid('mod'), ...m })));
  }

  if (get('usuarios').length === 0) {
    const { salt, hash } = hashPassword(CLAVE_DEMO);
    insertar('usuarios', {
      usuario: 'gestion',
      nombre: 'Gestión Humana',
      rol: 'gh',
      salt,
      hash,
      activo: true,
      creadoEn: new Date().toISOString(),
    });
  }

  if (get('trabajadores').length === 0) {
    const puestos = get('puestos');
    const turnos = get('turnos');
    const horarios = get('horarios');
    const modalidades = get('modalidades');
    const config = getConfig();

    for (const base of TRABAJADORES) {
      const puesto = puestos.find((p) => p.nombre === base.puesto);
      const turno = turnos.find((t) => t.nombre === base.turno);
      const horario = horarios.find((h) => h.nombre === base.horario);
      const modalidad = modalidades.find((m) => m.nombre === base.modalidad);
      const trabajador = insertar('trabajadores', {
        dni: base.dni,
        nombres: base.nombres,
        apellidos: base.apellidos,
        email: `${base.dni}@agrovalle.pe`,
        telefono: `9${Math.floor(10000000 + Math.random() * 89999999)}`,
        puestoId: puesto?.id || null,
        turnoId: turno?.id || null,
        horarioId: horario?.id || null,
        modalidadId: modalidad?.id || null,
        fechaIngreso: base.fechaIngreso,
        tarifaJornal: puesto?.tarifaJornal || 60,
        jornadaHoras: puesto?.jornadaHoras || 8,
        diasPorSemana: modalidad?.diasPorSemana ?? 6,
        sistemaPension: base.sistemaPension,
        asignacionFamiliar: base.asignacionFamiliar,
        activo: true,
        creadoEn: new Date().toISOString(),
      });
      const cred = hashPassword(CLAVE_DEMO);
      insertar('usuarios', {
        usuario: base.dni,
        nombre: `${base.nombres} ${base.apellidos}`,
        rol: 'trabajador',
        trabajadorId: trabajador.id,
        salt: cred.salt,
        hash: cred.hash,
        activo: true,
        creadoEn: new Date().toISOString(),
      });
    }

    // Registros de ejemplo del mes en curso para el panel de gestión humana
    const trabajadores = get('trabajadores');
    for (let i = 0; i < 6; i += 1) {
      const t = trabajadores[i % trabajadores.length];
      const puesto = puestos.find((p) => p.id === t.puestoId);
      const meta = puesto?.metasPlan?.[0];
      const fecha = fechaLocal(-(i + 1));
      const extra = i % 3 === 0 ? 2 : 0;
      insertar('registros', {
        trabajadorId: t.id,
        fecha,
        horasTrabajadas: 8 + extra,
        horasTrabajadasDeclaradas: true,
        horasExtra: extra,
        metas: meta ? [{ nombre: meta.nombre, cantidad: meta.objetivoDia + i * 4 }] : [],
        nocturno: false,
        minutosTardanza: 0,
        observacion: '',
        estado: i < 3 ? 'aprobado' : 'enviado',
        creadoEn: new Date(`${fecha}T18:00:00`).toISOString(),
        creadoPor: t.dni,
        revisadoEn: i < 3 ? new Date().toISOString() : null,
        revisadoPor: i < 3 ? 'gestion' : null,
        comentarioGH: '',
        origen: 'seed',
      });
    }
    persistir();
    console.log(`[seed] Datos iniciales creados. Gestión: gestion / ${CLAVE_DEMO} · Trabajador demo: 45678912 / ${CLAVE_DEMO}`);
  }

  return { claveDemo: CLAVE_DEMO };
}

export function reiniciarTodo() {
  setColeccion('usuarios', []);
  setColeccion('trabajadores', []);
  setColeccion('puestos', []);
  setColeccion('turnos', []);
  setColeccion('horarios', []);
  setColeccion('modalidades', []);
  setColeccion('registros', []);
  setColeccion('auditoria', []);
  setConfig(null);
  inicializarDatos({ forzar: true });
}
