import express from 'express';
import {
  get, buscar, listar, insertar, actualizar, eliminar, getConfig, setConfig,
  hashPassword, uid, auditar,
} from './store.js';
import {
  autenticar, soloGH, login, setCookieSesion, limpiarCookie, usuarioPublico,
} from './auth.js';
import {
  DEFAULT_CONFIG, calcularDia, resumenPeriodo, simular, rangoSemana, rangoMes,
  fechaISO, num, r2, esFeriado, nombreDia,
} from './payroll.js';

export const api = express.Router();

/* ------------------------------------------------------------------ utils */

function texto(valor, max = 200) {
  return String(valor ?? '').trim().slice(0, max);
}

function booleano(valor) {
  return valor === true || valor === 'true' || valor === 1 || valor === '1';
}

const ESTADOS = ['borrador', 'enviado', 'aprobado', 'observado'];

function contextoDe(trabajadorId) {
  const trabajador = buscar('trabajadores', trabajadorId);
  if (!trabajador) return null;
  const config = getConfig() || DEFAULT_CONFIG;
  const puesto = trabajador.puestoId ? buscar('puestos', trabajador.puestoId) : null;
  const turno = trabajador.turnoId ? buscar('turnos', trabajador.turnoId) : null;
  const horario = trabajador.horarioId ? buscar('horarios', trabajador.horarioId) : null;
  const modalidad = trabajador.modalidadId ? buscar('modalidades', trabajador.modalidadId) : null;
  return { config, trabajador, puesto, turno, horario, modalidad };
}

/** Sanitiza los datos declarados por el trabajador (lo que puede editar). */
function entradaDesde(body = {}) {
  const metas = Array.isArray(body.metas)
    ? body.metas
      .filter((m) => m && m.nombre)
      .map((m) => ({
        nombre: texto(m.nombre, 80),
        cantidad: Math.max(0, num(m.cantidad, 0)),
        unidad: texto(m.unidad, 20),
      }))
    : [];
  return {
    fecha: fechaISO(body.fecha) || fechaISO(new Date()),
    horasTrabajadas: body.horasTrabajadas === '' || body.horasTrabajadas == null ? null : Math.min(24, Math.max(0, num(body.horasTrabajadas, 8))),
    horasExtra: body.horasExtra === '' || body.horasExtra == null ? null : Math.min(12, Math.max(0, num(body.horasExtra, 0))),
    metas,
    feriado: booleano(body.feriado),
    nocturno: body.nocturno === undefined ? null : booleano(body.nocturno),
    minutosTardanza: Math.min(600, Math.max(0, num(body.minutosTardanza, 0))),
    bonificacion: Math.max(0, num(body.bonificacion, 0)),
    descuento: Math.max(0, num(body.descuento, 0)),
    observacion: texto(body.observacion, 500),
  };
}

function calcularRegistro(registro) {
  const ctx = contextoDe(registro.trabajadorId);
  if (!ctx) return null;
  const entrada = {
    fecha: registro.fecha,
    horasTrabajadas: registro.horasTrabajadasDeclaradas === false ? null : registro.horasTrabajadas,
    horasExtra: registro.horasTrabajadasDeclaradas === false ? registro.horasExtra : null,
    metas: registro.metas || [],
    feriado: registro.feriado,
    nocturno: registro.nocturno === null || registro.nocturno === undefined ? ctx.turno?.nocturno : registro.nocturno,
    minutosTardanza: registro.minutosTardanza || 0,
    bonificacion: registro.bonificacion || 0,
    descuento: registro.descuento || 0,
  };
  const dia = calcularDia(ctx, entrada);
  return {
    ...registro,
    calculo: dia,
    trabajador: {
      id: ctx.trabajador.id,
      dni: ctx.trabajador.dni,
      nombre: `${ctx.trabajador.nombres} ${ctx.trabajador.apellidos}`,
      puesto: ctx.puesto?.nombre || null,
      turno: ctx.turno?.nombre || null,
    },
  };
}

function registrosDe(trabajadorId, { desde, hasta } = {}) {
  return listar('registros', (r) => {
    if (trabajadorId && r.trabajadorId !== trabajadorId) return false;
    if (desde && r.fecha < desde) return false;
    if (hasta && r.fecha > hasta) return false;
    return true;
  });
}

function contextoPublico(ctx) {
  return {
    trabajador: {
      id: ctx.trabajador.id,
      dni: ctx.trabajador.dni,
      nombres: ctx.trabajador.nombres,
      apellidos: ctx.trabajador.apellidos,
      nombre: `${ctx.trabajador.nombres} ${ctx.trabajador.apellidos}`,
      tarifaJornal: num(ctx.trabajador.tarifaJornal, 0),
      jornadaHoras: num(ctx.trabajador.jornadaHoras, 8),
      diasPorSemana: num(ctx.trabajador.diasPorSemana, 6),
      sistemaPension: ctx.trabajador.sistemaPension,
      asignacionFamiliar: !!ctx.trabajador.asignacionFamiliar,
      fechaIngreso: ctx.trabajador.fechaIngreso,
      activo: ctx.trabajador.activo !== false,
    },
    puesto: ctx.puesto ? { id: ctx.puesto.id, nombre: ctx.puesto.nombre, area: ctx.puesto.area, metasPlan: ctx.puesto.metasPlan || [] } : null,
    turno: ctx.turno ? { id: ctx.turno.id, nombre: ctx.turno.nombre, horaInicio: ctx.turno.horaInicio, horaFin: ctx.turno.horaFin, nocturno: !!ctx.turno.nocturno, recargoPct: num(ctx.turno.recargoPct, 0) } : null,
    horario: ctx.horario ? { id: ctx.horario.id, nombre: ctx.horario.nombre, dias: ctx.horario.dias, horaEntrada: ctx.horario.horaEntrada, horaSalida: ctx.horario.horaSalida } : null,
    modalidad: ctx.modalidad ? { id: ctx.modalidad.id, nombre: ctx.modalidad.nombre } : null,
    config: ctx.config,
  };
}

/* ------------------------------------------------------------------- auth */

api.post('/auth/login', (req, res) => {
  const { usuario, password, rol } = req.body || {};
  const rolEsperado = rol === 'gh' || rol === 'trabajador' ? rol : null;
  const resultado = login(usuario, password, rolEsperado);
  if (resultado.error) return res.status(401).json({ error: resultado.error });
  setCookieSesion(res, resultado.usuario);
  return res.json({ usuario: usuarioPublico(resultado.usuario) });
});

api.post('/auth/logout', (req, res) => {
  limpiarCookie(res);
  res.json({ ok: true });
});

api.get('/auth/me', (req, res) => {
  const token = (req.headers.cookie || '').match(/jornal_sesion=([^;]+)/);
  const usuario = token ? usuarioPublico(require_auth(token[1])) : null;
  res.json({ usuario });
});

// helper local para /auth/me sin duplicar el middleware
function require_auth(tokenCrudo) {
  try {
    // eslint-disable-next-line global-require
    const { verificarToken } = { verificarToken: null };
    return verificarToken ? null : null;
  } catch {
    return null;
  }
}

api.get('/me', autenticar, (req, res) => {
  res.json({ usuario: usuarioPublico(req.usuario) });
});

/* -------------------------------------------------------------- bootstrap */

api.get('/bootstrap', autenticar, (req, res) => {
  const usuario = usuarioPublico(req.usuario);
  const config = getConfig() || DEFAULT_CONFIG;
  if (usuario.rol === 'trabajador') {
    const ctx = contextoDe(usuario.trabajadorId);
    if (!ctx) return res.status(404).json({ error: 'No se encontró el legajo del trabajador.' });
    return res.json({
      usuario,
      contexto: contextoPublico(ctx),
      registros: registrosDe(usuario.trabajadorId).map(calcularRegistro).filter(Boolean)
        .sort((a, b) => (a.fecha < b.fecha ? 1 : -1)),
      feriados: config.feriados || [],
      hoy: fechaISO(new Date()),
    });
  }
  return res.json({
    usuario,
    config,
    trabajadores: listar('trabajadores'),
    puestos: listar('puestos'),
    turnos: listar('turnos'),
    horarios: listar('horarios'),
    modalidades: listar('modalidades'),
    totalRegistros: get('registros').length,
    hoy: fechaISO(new Date()),
  });
});

/* -------------------------------------------------------------- simulador */

api.post('/simular', autenticar, (req, res) => {
  const body = req.body || {};
  let trabajadorId = req.usuario.trabajadorId;
  if (req.usuario.rol === 'gh') {
    trabajadorId = body.trabajadorId;
    if (!trabajadorId) return res.status(400).json({ error: 'Selecciona un trabajador para simular.' });
  }
  const ctx = contextoDe(trabajadorId);
  if (!ctx) return res.status(404).json({ error: 'Trabajador no encontrado.' });

  const entrada = entradaDesde(body);
  const resultado = simular(ctx, {
    ...entrada,
    diasPorSemana: num(body.diasPorSemana, ctx.trabajador.diasPorSemana ?? 6),
    semanasPorMes: num(body.semanasPorMes, ctx.config.semanasPorMes ?? 4.3333),
    desde: entrada.fecha,
  });
  res.json({ ...resultado, contexto: contextoPublico(ctx) });
});

/* ------------------------------------------------------------ trabajador  */

api.get('/mis-registros', autenticar, (req, res) => {
  if (!req.usuario.trabajadorId) return res.status(403).json({ error: 'Solo disponible para trabajadores.' });
  const desde = req.query.desde ? fechaISO(req.query.desde) : null;
  const hasta = req.query.hasta ? fechaISO(req.query.hasta) : null;
  const registros = registrosDe(req.usuario.trabajadorId, { desde, hasta })
    .map(calcularRegistro).filter(Boolean)
    .sort((a, b) => (a.fecha < b.fecha ? 1 : -1));
  const ctx = contextoDe(req.usuario.trabajadorId);
  const dias = registros.filter((r) => r.estado !== 'observado').map((r) => r.calculo);
  const resumen = resumenPeriodo(dias, ctx, { tipo: 'periodo', diasDelPeriodo: dias.length || 1 });
  res.json({ registros, resumen });
});

api.post('/mis-registros', autenticar, (req, res) => {
  if (!req.usuario.trabajadorId) return res.status(403).json({ error: 'Solo disponible para trabajadores.' });
  const entrada = entradaDesde(req.body);
  const ctx = contextoDe(req.usuario.trabajadorId);
  if (!ctx) return res.status(404).json({ error: 'Trabajador no encontrado.' });

  const existente = registrosDe(req.usuario.trabajadorId, { desde: entrada.fecha, hasta: entrada.fecha })[0];
  if (existente) {
    if (existente.estado === 'aprobado') {
      return res.status(409).json({ error: 'El jornal de ese día ya fue aprobado. Contacta a Gestión Humana para corregirlo.' });
    }
    const actualizado = actualizar('registros', existente.id, {
      ...entrada,
      horasTrabajadasDeclaradas: entrada.horasTrabajadas !== null && entrada.horasExtra === null,
      estado: 'enviado',
      actualizadoEn: new Date().toISOString(),
      comentarioGH: '',
    });
    auditar(req.usuario.usuario, 'registro.actualizado', `${actualizado.fecha}`);
    return res.json({ registro: calcularRegistro(actualizado) });
  }

  const nuevo = insertar('registros', {
    trabajadorId: req.usuario.trabajadorId,
    ...entrada,
    horasTrabajadasDeclaradas: entrada.horasTrabajadas !== null && entrada.horasExtra === null,
    estado: 'enviado',
    creadoEn: new Date().toISOString(),
    creadoPor: req.usuario.usuario,
    revisadoEn: null,
    revisadoPor: null,
    comentarioGH: '',
    origen: 'trabajador',
  });
  auditar(req.usuario.usuario, 'registro.creado', `${nuevo.fecha}`);
  res.status(201).json({ registro: calcularRegistro(nuevo) });
});

api.delete('/mis-registros/:id', autenticar, (req, res) => {
  const registro = buscar('registros', req.params.id);
  if (!registro) return res.status(404).json({ error: 'Registro no encontrado.' });
  if (req.usuario.rol !== 'gh' && registro.trabajadorId !== req.usuario.trabajadorId) {
    return res.status(403).json({ error: 'No puedes eliminar un registro de otro trabajador.' });
  }
  if (registro.estado === 'aprobado' && req.usuario.rol !== 'gh') {
    return res.status(409).json({ error: 'Un jornal aprobado no puede eliminarse por el trabajador.' });
  }
  eliminar('registros', registro.id);
  auditar(req.usuario.usuario, 'registro.eliminado', `${registro.fecha}`);
  res.json({ ok: true });
});

/* --------------------------------------------------------- gestión humana */

const CATALOGOS = {
  puestos: { campos: ['nombre', 'area', 'tarifaJornal', 'jornadaHoras', 'descripcion'], numericos: ['tarifaJornal', 'jornadaHoras'] },
  turnos: { campos: ['nombre', 'horaInicio', 'horaFin', 'nocturno', 'recargoPct', 'refrigerioMinutos'], numericos: ['recargoPct', 'refrigerioMinutos'], booleanos: ['nocturno'] },
  horarios: { campos: ['nombre', 'dias', 'horaEntrada', 'horaSalida', 'refrigerioMinutos', 'toleranciaMinutos'], numericos: ['refrigerioMinutos', 'toleranciaMinutos'], listas: ['dias'] },
  modalidades: { campos: ['nombre', 'descripcion', 'diasPorSemana', 'aplicaBeneficios'], numericos: ['diasPorSemana'], booleanos: ['aplicaBeneficios'] },
};

for (const [ruta, def] of Object.entries(CATALOGOS)) {
  api.get(`/${ruta}`, autenticar, (req, res) => {
    res.json({ items: listar(ruta) });
  });

  api.post(`/${ruta}`, autenticar, soloGH, (req, res) => {
    const body = req.body || {};
    const datos = {};
    for (const campo of def.campos) {
      if (body[campo] === undefined) continue;
      if (def.numericos?.includes(campo)) datos[campo] = num(body[campo], 0);
      else if (def.booleanos?.includes(campo)) datos[campo] = booleano(body[campo]);
      else if (def.listas?.includes(campo)) datos[campo] = Array.isArray(body[campo]) ? body[campo].map((d) => texto(d, 20)) : [];
      else datos[campo] = texto(body[campo], 500);
    }
    if (!datos.nombre) return res.status(400).json({ error: 'El nombre es obligatorio.' });
    if (ruta === 'puestos') {
      datos.metasPlan = Array.isArray(body.metasPlan)
        ? body.metasPlan.filter((m) => m && m.nombre).map((m) => ({
          nombre: texto(m.nombre, 80),
          unidad: texto(m.unidad, 20) || 'und',
          tarifa: num(m.tarifa, 0),
          objetivoDia: num(m.objetivoDia, 0),
        }))
        : [];
    }
    const creado = insertar(ruta, datos);
    auditar(req.usuario.usuario, `${ruta}.creado`, creado.nombre);
    res.status(201).json({ item: creado });
  });

  api.put(`/${ruta}/:id`, autenticar, soloGH, (req, res) => {
    const actual = buscar(ruta, req.params.id);
    if (!actual) return res.status(404).json({ error: 'No encontrado.' });
    const body = req.body || {};
    const datos = {};
    for (const campo of def.campos) {
      if (body[campo] === undefined) continue;
      if (def.numericos?.includes(campo)) datos[campo] = num(body[campo], 0);
      else if (def.booleanos?.includes(campo)) datos[campo] = booleano(body[campo]);
      else if (def.listas?.includes(campo)) datos[campo] = Array.isArray(body[campo]) ? body[campo].map((d) => texto(d, 20)) : [];
      else datos[campo] = texto(body[campo], 500);
    }
    if (ruta === 'puestos' && body.metasPlan !== undefined) {
      datos.metasPlan = Array.isArray(body.metasPlan)
        ? body.metasPlan.filter((m) => m && m.nombre).map((m) => ({
          nombre: texto(m.nombre, 80),
          unidad: texto(m.unidad, 20) || 'und',
          tarifa: num(m.tarifa, 0),
          objetivoDia: num(m.objetivoDia, 0),
        }))
        : [];
    }
    const actualizadoItem = actualizar(ruta, req.params.id, datos);
    auditar(req.usuario.usuario, `${ruta}.actualizado`, actualizadoItem.nombre);
    res.json({ item: actualizadoItem });
  });

  api.delete(`/${ruta}/:id`, autenticar, soloGH, (req, res) => {
    const enUso = listar('trabajadores', (t) => t[`${ruta.slice(0, -1)}Id`] === req.params.id).length;
    if (enUso > 0) return res.status(409).json({ error: `No se puede eliminar: ${enUso} trabajador(es) lo tienen asignado.` });
    const borrado = eliminar(ruta, req.params.id);
    if (!borrado) return res.status(404).json({ error: 'No encontrado.' });
    auditar(req.usuario.usuario, `${ruta}.eliminado`, req.params.id);
    res.json({ ok: true });
  });
}

/* --------------------------------------------------------- trabajadores  */

function sanitizarTrabajador(body, { parcial = false } = {}) {
  const datos = {};
  const set = (campo, valor) => { if (!parcial || valor !== undefined) datos[campo] = valor; };
  if (!parcial || body.dni !== undefined) {
    const dni = String(body.dni || '').replace(/\D/g, '');
    if (dni.length < 7 || dni.length > 12) return { error: 'El DNI debe tener entre 7 y 12 dígitos.' };
    datos.dni = dni;
  }
  if (!parcial || body.nombres !== undefined) {
    const nombres = texto(body.nombres, 80);
    if (!nombres) return { error: 'Los nombres son obligatorios.' };
    datos.nombres = nombres;
  }
  if (!parcial || body.apellidos !== undefined) {
    const apellidos = texto(body.apellidos, 80);
    if (!apellidos) return { error: 'Los apellidos son obligatorios.' };
    datos.apellidos = apellidos;
  }
  set('email', body.email !== undefined ? texto(body.email, 120) : undefined);
  set('telefono', body.telefono !== undefined ? texto(body.telefono, 30) : undefined);
  set('puestoId', body.puestoId !== undefined ? (body.puestoId || null) : undefined);
  set('turnoId', body.turnoId !== undefined ? (body.turnoId || null) : undefined);
  set('horarioId', body.horarioId !== undefined ? (body.horarioId || null) : undefined);
  set('modalidadId', body.modalidadId !== undefined ? (body.modalidadId || null) : undefined);
  set('fechaIngreso', body.fechaIngreso !== undefined ? fechaISO(body.fechaIngreso) : undefined);
  set('tarifaJornal', body.tarifaJornal !== undefined ? Math.max(0, num(body.tarifaJornal, 0)) : undefined);
  set('jornadaHoras', body.jornadaHoras !== undefined ? Math.min(12, Math.max(1, num(body.jornadaHoras, 8))) : undefined);
  set('diasPorSemana', body.diasPorSemana !== undefined ? Math.min(7, Math.max(1, num(body.diasPorSemana, 6))) : undefined);
  set('sistemaPension', body.sistemaPension !== undefined ? texto(body.sistemaPension, 20) : undefined);
  set('asignacionFamiliar', body.asignacionFamiliar !== undefined ? booleano(body.asignacionFamiliar) : undefined);
  set('activo', body.activo !== undefined ? booleano(body.activo) : undefined);
  set('categoria', body.categoria !== undefined ? texto(body.categoria, 40) : undefined);
  for (const key of Object.keys(datos)) if (datos[key] === undefined) delete datos[key];
  return { datos };
}

api.get('/trabajadores', autenticar, soloGH, (req, res) => {
  const items = listar('trabajadores').map((t) => {
    const ctx = contextoDe(t.id);
    return {
      ...t,
      puesto: ctx?.puesto?.nombre || null,
      turno: ctx?.turno?.nombre || null,
      horario: ctx?.horario?.nombre || null,
      modalidad: ctx?.modalidad?.nombre || null,
      cuenta: get('usuarios').some((u) => u.trabajadorId === t.id && u.activo !== false),
      registros: listar('registros', (r) => r.trabajadorId === t.id).length,
    };
  });
  res.json({ items });
});

api.post('/trabajadores', autenticar, soloGH, (req, res) => {
  const { datos, error } = sanitizarTrabajador(req.body || {});
  if (error) return res.status(400).json({ error });
  if (listar('trabajadores', (t) => t.dni === datos.dni).length > 0) {
    return res.status(409).json({ error: 'Ya existe un trabajador con ese DNI.' });
  }
  const puesto = datos.puestoId ? buscar('puestos', datos.puestoId) : null;
  const modalidad = datos.modalidadId ? buscar('modalidades', datos.modalidadId) : null;
  const trabajador = insertar('trabajadores', {
    fechaIngreso: fechaISO(new Date()),
    tarifaJornal: puesto?.tarifaJornal ?? 60,
    jornadaHoras: puesto?.jornadaHoras ?? 8,
    diasPorSemana: modalidad?.diasPorSemana ?? 6,
    sistemaPension: 'ONP',
    asignacionFamiliar: false,
    activo: true,
    ...datos,
    creadoEn: new Date().toISOString(),
  });
  const clave = texto(req.body?.password, 100) || 'agro2025';
  const cred = hashPassword(clave);
  insertar('usuarios', {
    usuario: trabajador.dni,
    nombre: `${trabajador.nombres} ${trabajador.apellidos}`,
    rol: 'trabajador',
    trabajadorId: trabajador.id,
    salt: cred.salt,
    hash: cred.hash,
    activo: true,
    creadoEn: new Date().toISOString(),
  });
  auditar(req.usuario.usuario, 'trabajador.creado', `${trabajador.dni} ${trabajador.apellidos}`);
  res.status(201).json({ item: trabajador, passwordTemporal: clave });
});

api.put('/trabajadores/:id', autenticar, soloGH, (req, res) => {
  const actual = buscar('trabajadores', req.params.id);
  if (!actual) return res.status(404).json({ error: 'Trabajador no encontrado.' });
  const { datos, error } = sanitizarTrabajador(req.body || {}, { parcial: true });
  if (error) return res.status(400).json({ error });
  if (datos.dni && datos.dni !== actual.dni && listar('trabajadores', (t) => t.dni === datos.dni).length > 0) {
    return res.status(409).json({ error: 'Ya existe otro trabajador con ese DNI.' });
  }
  const actualizadoT = actualizar('trabajadores', req.params.id, datos);
  if (datos.dni) {
    const cuenta = get('usuarios').find((u) => u.trabajadorId === req.params.id);
    if (cuenta) actualizar('usuarios', cuenta.id, { usuario: datos.dni });
  }
  auditar(req.usuario.usuario, 'trabajador.actualizado', `${actualizadoT.dni}`);
  res.json({ item: actualizadoT });
});

api.post('/trabajadores/:id/password', autenticar, soloGH, (req, res) => {
  const trabajador = buscar('trabajadores', req.params.id);
  if (!trabajador) return res.status(404).json({ error: 'Trabajador no encontrado.' });
  const nueva = texto(req.body?.password, 100);
  if (nueva.length < 6) return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres.' });
  const cuenta = get('usuarios').find((u) => u.trabajadorId === trabajador.id);
  const cred = hashPassword(nueva);
  if (cuenta) actualizar('usuarios', cuenta.id, { salt: cred.salt, hash: cred.hash, activo: true });
  else {
    insertar('usuarios', {
      usuario: trabajador.dni, nombre: `${trabajador.nombres} ${trabajador.apellidos}`,
      rol: 'trabajador', trabajadorId: trabajador.id, salt: cred.salt, hash: cred.hash, activo: true,
    });
  }
  auditar(req.usuario.usuario, 'trabajador.password', trabajador.dni);
  res.json({ ok: true });
});

api.delete('/trabajadores/:id', autenticar, soloGH, (req, res) => {
  const trabajador = buscar('trabajadores', req.params.id);
  if (!trabajador) return res.status(404).json({ error: 'Trabajador no encontrado.' });
  const cuenta = get('usuarios').find((u) => u.trabajadorId === trabajador.id);
  if (cuenta) eliminar('usuarios', cuenta.id);
  eliminar('trabajadores', trabajador.id);
  auditar(req.usuario.usuario, 'trabajador.eliminado', trabajador.dni);
  res.json({ ok: true });
});

/* ----------------------------------------------------------- parámetros  */

api.get('/config', autenticar, (req, res) => {
  res.json({ config: getConfig() || DEFAULT_CONFIG });
});

api.put('/config', autenticar, soloGH, (req, res) => {
  const body = req.body || {};
  const actual = getConfig() || { ...DEFAULT_CONFIG };
  const siguiente = { ...actual };
  const numericos = [
    'rmv', 'jornadaHoras', 'horasSemana', 'maxHorasExtraDia', 'horasExtraTramo1', 'sobretasaExtra1',
    'sobretasaExtra2', 'sobretasaNocturna', 'feriadoRecargo', 'descansoSemanalPorDias', 'semanasPorMes',
    'ctsDiasPorAnio', 'gratificacionDias', 'gratificacionesPorAnio', 'vacacionesDias',
    'asignacionFamiliarPct', 'essaludPct', 'seguroVidaMensual', 'onpPct', 'afpAportePct',
    'afpComisionPct', 'afpPrimaPct', 'toleranciaMinutos',
  ];
  for (const campo of numericos) {
    if (body[campo] !== undefined && body[campo] !== '') siguiente[campo] = num(body[campo], actual[campo]);
  }
  if (body.esquemaBeneficios !== undefined) {
    siguiente.esquemaBeneficios = body.esquemaBeneficios === 'integral' ? 'integral' : 'separado';
  }
  if (body.aplicarDescansoSemanal !== undefined) siguiente.aplicarDescansoSemanal = booleano(body.aplicarDescansoSemanal);
  if (body.sistemaPensionDefault !== undefined) siguiente.sistemaPensionDefault = texto(body.sistemaPensionDefault, 20);
  if (Array.isArray(body.feriados)) {
    siguiente.feriados = body.feriados
      .map((f) => ({ fecha: fechaISO(f.fecha), nombre: texto(f.nombre, 80) || 'Feriado' }))
      .filter((f) => f.fecha);
  }
  siguiente.updatedAt = new Date().toISOString();
  siguiente.updatedBy = req.usuario.usuario;
  setConfig(siguiente);
  auditar(req.usuario.usuario, 'config.actualizada', `${numericos.length} parámetros`);
  res.json({ config: siguiente });
});

/* ------------------------------------------- registros del lado de GH    */

api.get('/registros', autenticar, soloGH, (req, res) => {
  const desde = req.query.desde ? fechaISO(req.query.desde) : null;
  const hasta = req.query.hasta ? fechaISO(req.query.hasta) : null;
  const estado = req.query.estado || null;
  const trabajadorId = req.query.trabajadorId || null;
  const items = registrosDe(trabajadorId, { desde, hasta })
    .filter((r) => !estado || r.estado === estado)
    .map(calcularRegistro).filter(Boolean)
    .sort((a, b) => (a.fecha === b.fecha ? 0 : a.fecha < b.fecha ? 1 : -1));
  res.json({ items });
});

api.post('/registros', autenticar, soloGH, (req, res) => {
  const body = req.body || {};
  const trabajadorId = body.trabajadorId;
  if (!trabajadorId || !buscar('trabajadores', trabajadorId)) {
    return res.status(400).json({ error: 'Selecciona un trabajador válido.' });
  }
  const entrada = entradaDesde(body);
  const estado = ESTADOS.includes(body.estado) ? body.estado : 'aprobado';
  const existente = registrosDe(trabajadorId, { desde: entrada.fecha, hasta: entrada.fecha })[0];
  const datos = {
    ...entrada,
    horasTrabajadasDeclaradas: entrada.horasTrabajadas !== null && entrada.horasExtra === null,
    estado,
    comentarioGH: texto(body.comentarioGH, 500),
    revisadoEn: new Date().toISOString(),
    revisadoPor: req.usuario.usuario,
  };
  let guardado;
  if (existente) guardado = actualizar('registros', existente.id, { ...datos, actualizadoEn: new Date().toISOString() });
  else {
    guardado = insertar('registros', {
      trabajadorId, ...datos, creadoEn: new Date().toISOString(), creadoPor: req.usuario.usuario, origen: 'gh',
    });
  }
  auditar(req.usuario.usuario, 'registro.gh', `${entrada.fecha}`);
  res.status(201).json({ registro: calcularRegistro(guardado) });
});

api.put('/registros/:id', autenticar, soloGH, (req, res) => {
  const registro = buscar('registros', req.params.id);
  if (!registro) return res.status(404).json({ error: 'Registro no encontrado.' });
  const body = req.body || {};
  const cambios = {};
  if (body.estado !== undefined) {
    if (!ESTADOS.includes(body.estado)) return res.status(400).json({ error: 'Estado no válido.' });
    cambios.estado = body.estado;
    cambios.revisadoEn = new Date().toISOString();
    cambios.revisadoPor = req.usuario.usuario;
  }
  if (body.comentarioGH !== undefined) cambios.comentarioGH = texto(body.comentarioGH, 500);
  // Corrección de horas / metas / conceptos por parte de GH
  if (body.horasTrabajadas !== undefined) {
    cambios.horasTrabajadas = Math.min(24, Math.max(0, num(body.horasTrabajadas, registro.horasTrabajadas)));
    cambios.horasTrabajadasDeclaradas = true;
    cambios.horasExtra = null;
  }
  if (body.horasExtra !== undefined) cambios.horasExtra = Math.min(12, Math.max(0, num(body.horasExtra, 0)));
  if (Array.isArray(body.metas)) {
    cambios.metas = body.metas.filter((m) => m && m.nombre).map((m) => ({
      nombre: texto(m.nombre, 80), cantidad: Math.max(0, num(m.cantidad, 0)),
    }));
  }
  if (body.minutosTardanza !== undefined) cambios.minutosTardanza = Math.min(600, Math.max(0, num(body.minutosTardanza, 0)));
  if (body.bonificacion !== undefined) cambios.bonificacion = Math.max(0, num(body.bonificacion, 0));
  if (body.descuento !== undefined) cambios.descuento = Math.max(0, num(body.descuento, 0));
  if (body.nocturno !== undefined) cambios.nocturno = booleano(body.nocturno);
  if (body.feriado !== undefined) cambios.feriado = booleano(body.feriado);
  cambios.actualizadoEn = new Date().toISOString();
  const actualizadoR = actualizar('registros', registro.id, cambios);
  auditar(req.usuario.usuario, 'registro.revisado', `${registro.fecha} → ${actualizadoR.estado}`);
  res.json({ registro: calcularRegistro(actualizadoR) });
});

api.delete('/registros/:id', autenticar, soloGH, (req, res) => {
  if (!eliminar('registros', req.params.id)) return res.status(404).json({ error: 'No encontrado.' });
  auditar(req.usuario.usuario, 'registro.eliminado', req.params.id);
  res.json({ ok: true });
});

/* -------------------------------------------------------------- reportes */

function planilla({ desde, hasta, trabajadorId = null }) {
  const config = getConfig() || DEFAULT_CONFIG;
  const trabajadores = listar('trabajadores', (t) => t.activo !== false && (!trabajadorId || t.id === trabajadorId));
  const filas = trabajadores.map((t) => {
    const ctx = contextoDe(t.id);
    const registrosDia = registrosDe(t.id, { desde, hasta })
      .filter((r) => r.estado !== 'observado')
      .map(calcularRegistro).filter(Boolean);
    const resumen = resumenPeriodo(registrosDia.map((r) => r.calculo), ctx, {
      tipo: 'mes', diasDelPeriodo: registrosDia.length || 1,
    });
    return {
      trabajadorId: t.id,
      dni: t.dni,
      nombre: `${t.nombres} ${t.apellidos}`,
      puesto: ctx?.puesto?.nombre || '—',
      turno: ctx?.turno?.nombre || '—',
      dias: resumen.periodo.diasTrabajados,
      horas: resumen.horas.trabajadas,
      extra: resumen.horas.extra,
      jornal: resumen.ingresos.jornal,
      horasExtra: resumen.ingresos.horasExtra,
      metas: resumen.ingresos.metas,
      feriados: resumen.ingresos.feriados,
      bonos: resumen.ingresos.bonos + resumen.ingresos.descansoSemanal + resumen.ingresos.asignacionFamiliar,
      bruto: resumen.bruto,
      pension: resumen.aportes.total,
      neto: resumen.neto,
      beneficios: resumen.beneficios.total,
      essalud: resumen.costoEmpleador.essalud,
      costoTotal: resumen.costoEmpleador.total,
      registros: registrosDia.length,
    };
  }).filter((f) => f.registros > 0);
  const totales = filas.reduce((acc, f) => {
    for (const key of ['dias', 'horas', 'extra', 'jornal', 'horasExtra', 'metas', 'feriados', 'bonos', 'bruto', 'pension', 'neto', 'beneficios', 'essalud', 'costoTotal']) {
      acc[key] = r2(num(acc[key], 0) + num(f[key], 0));
    }
    return acc;
  }, {});
  return { desde, hasta, esquema: config.esquemaBeneficios, filas, totales, generadoEn: new Date().toISOString() };
}

function rangoPorDefecto(query) {
  if (query.desde || query.hasta) {
    return {
      desde: fechaISO(query.desde) || `${new Date().getFullYear()}-01-01`,
      hasta: fechaISO(query.hasta) || fechaISO(new Date()),
    };
  }
  const hoy = new Date();
  const r = rangoMes(hoy.getFullYear(), hoy.getMonth() + 1);
  return { desde: r.desde, hasta: r.hasta };
}

api.get('/reportes/planilla', autenticar, soloGH, (req, res) => {
  const { desde, hasta } = rangoPorDefecto(req.query);
  res.json(planilla({ desde, hasta, trabajadorId: req.query.trabajadorId || null }));
});

api.get('/reportes/planilla.csv', autenticar, soloGH, (req, res) => {
  const { desde, hasta } = rangoPorDefecto(req.query);
  const data = planilla({ desde, hasta, trabajadorId: req.query.trabajadorId || null });
  const cabecera = ['DNI', 'Trabajador', 'Puesto', 'Turno', 'Días', 'Horas', 'Horas extra', 'Jornal', 'Horas extra S/', 'Metas S/', 'Feriados S/', 'Otros S/', 'Bruto S/', 'Pensión S/', 'Neto S/', 'Beneficios S/', 'EsSalud S/', 'Costo total S/'];
  const filas = data.filas.map((f) => [
    f.dni, f.nombre, f.puesto, f.turno, f.dias, f.horas, f.extra, f.jornal, f.horasExtra,
    f.metas, f.feriados, f.bonos, f.bruto, f.pension, f.neto, f.beneficios, f.essalud, f.costoTotal,
  ]);
  const totales = ['', 'TOTAL', '', '', data.totales.dias, data.totales.horas, data.totales.extra,
    data.totales.jornal, data.totales.horasExtra, data.totales.metas, data.totales.feriados, data.totales.bonos,
    data.totales.bruto, data.totales.pension, data.totales.neto, data.totales.beneficios, data.totales.essalud, data.totales.costoTotal];
  const csv = [cabecera, ...filas, totales]
    .map((fila) => fila.map((valor) => `"${String(valor ?? '').replace(/"/g, '""')}"`).join(';'))
    .join('\r\n');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="planilla_${desde}_${hasta}.csv"`);
  res.send(`\uFEFF${csv}`);
});

api.get('/reportes/resumen', autenticar, soloGH, (req, res) => {
  const config = getConfig() || DEFAULT_CONFIG;
  const hoy = new Date();
  const mes = rangoMes(hoy.getFullYear(), hoy.getMonth() + 1);
  const data = planilla({ desde: mes.desde, hasta: mes.hasta });
  const porPuesto = {};
  for (const fila of data.filas) {
    porPuesto[fila.puesto] = r2(num(porPuesto[fila.puesto], 0) + fila.costoTotal);
  }
  const registros = listar('registros');
  res.json({
    periodo: mes,
    trabajadoresActivos: listar('trabajadores', (t) => t.activo !== false).length,
    registrosPendientes: registros.filter((r) => r.estado === 'enviado').length,
    registrosObservados: registros.filter((r) => r.estado === 'observado').length,
    registrosAprobados: registros.filter((r) => r.estado === 'aprobado').length,
    planillaMes: data.totales,
    porPuesto,
    esquemaBeneficios: config.esquemaBeneficios,
    feriadosRegistrados: (config.feriados || []).length,
  });
});

api.get('/auditoria', autenticar, soloGH, (req, res) => {
  res.json({ items: [...get('auditoria')].reverse().slice(0, 100) });
});

api.get('/feriados', autenticar, (req, res) => {
  const config = getConfig() || DEFAULT_CONFIG;
  res.json({ feriados: config.feriados || [] });
});

api.get('/calendario', autenticar, (req, res) => {
  if (!req.usuario.trabajadorId) return res.status(403).json({ error: 'Solo disponible para trabajadores.' });
  const ctx = contextoDe(req.usuario.trabajadorId);
  const hoy = req.query.fecha ? fechaISO(req.query.fecha) : fechaISO(new Date());
  const semana = rangoSemana(hoy);
  const fecha = new Date(`${hoy}T12:00:00`);
  const mes = rangoMes(fecha.getFullYear(), fecha.getMonth() + 1);
  const dias = [];
  for (let d = 1; d <= new Date(fecha.getFullYear(), fecha.getMonth() + 1, 0).getDate(); d += 1) {
    const iso = `${mes.desde.slice(0, 8)}${String(d).padStart(2, '0')}`;
    const feriado = esFeriado(iso, ctx.config);
    const registro = registrosDe(req.usuario.trabajadorId, { desde: iso, hasta: iso })[0];
    dias.push({ fecha: iso, dia: nombreDia(iso), feriado, registrado: !!registro, estado: registro?.estado || null });
  }
  res.json({ hoy, semana, mes, dias });
});
