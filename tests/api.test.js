import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const RAIZ = path.resolve(import.meta.dirname, '..');
const CLAVE = 'agro2025';

let servidor;
let baseURL;

function esperar(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function esperarServidor(url, intentos = 60) {
  for (let i = 0; i < intentos; i += 1) {
    try {
      const res = await fetch(`${url}/api/salud`);
      if (res.ok) return true;
    } catch {
      /* sigue intentando */
    }
    await esperar(150);
  }
  return false;
}

async function arrancar() {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jornal-test-'));
  const puerto = 3400 + Math.floor(Math.random() * 300);
  baseURL = `http://127.0.0.1:${puerto}`;
  servidor = spawn(process.execPath, ['server/index.js'], {
    cwd: RAIZ,
    env: { ...process.env, PORT: String(puerto), DATA_DIR: dataDir, NODE_ENV: 'test' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  servidor.stderr.on('data', (d) => process.stderr.write(`[server] ${d}`));
  const listo = await esperarServidor(baseURL);
  assert.ok(listo, 'el servidor debe responder /api/salud');
}

let cookies = '';

async function pedir(metodo, ruta, body) {
  const res = await fetch(`${baseURL}${ruta}`, {
    method: metodo,
    headers: { 'Content-Type': 'application/json', ...(cookies ? { Cookie: cookies } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const setCookie = res.headers.getSetCookie?.() || [];
  for (const c of setCookie) {
    const par = c.split(';')[0];
    if (par.startsWith('jornal_sesion=')) cookies = par;
  }
  let json = null;
  const texto = await res.text();
  try {
    json = JSON.parse(texto);
  } catch {
    json = texto;
  }
  return { status: res.status, body: json };
}

test.before(arrancar);
test.after(() => {
  if (servidor) servidor.kill('SIGTERM');
});

test('salud pública responde sin sesión', async () => {
  const r = await fetch(`${baseURL}/api/salud`);
  assert.equal(r.status, 200);
});

test('rutas protegidas rechazan sin sesión', async () => {
  cookies = '';
  const r = await pedir('GET', '/api/bootstrap');
  assert.equal(r.status, 401);
});

test('login de trabajador demo y bootstrap con contexto', async () => {
  cookies = '';
  const mal = await pedir('POST', '/api/auth/login', { usuario: '45678912', password: 'incorrecta', rol: 'trabajador' });
  assert.equal(mal.status, 401);
  const r = await pedir('POST', '/api/auth/login', { usuario: '45678912', password: CLAVE, rol: 'trabajador' });
  assert.equal(r.status, 200);
  assert.equal(r.body.usuario.rol, 'trabajador');
  const boot = await pedir('GET', '/api/bootstrap');
  assert.equal(boot.status, 200);
  assert.ok(boot.body.contexto.puesto.nombre);
  assert.ok(Array.isArray(boot.body.registros));
});

test('trabajador no puede acceder a endpoints de gestión humana', async () => {
  const r = await pedir('GET', '/api/trabajadores');
  assert.equal(r.status, 403);
});

test('simulación del trabajador devuelve día, semana y mes', async () => {
  const r = await pedir('POST', '/api/simular', { fecha: '2026-03-02', horasTrabajadas: 10, metas: [] });
  assert.equal(r.status, 200);
  assert.ok(r.body.dia.totales.bruto > 0);
  assert.ok(r.body.semana.bruto >= r.body.dia.totales.bruto);
  assert.ok(r.body.mes.bruto >= r.body.semana.bruto);
  assert.ok(r.body.potencial.mes.bruto > 0);
});

let registroId;

test('trabajador registra su jornal y queda en estado enviado', async () => {
  const r = await pedir('POST', '/api/mis-registros', {
    fecha: '2026-03-02', horasTrabajadas: 10, metas: [{ nombre: 'Kilos cosechados', cantidad: 60 }],
  });
  assert.equal(r.status, 201);
  assert.equal(r.body.registro.estado, 'enviado');
  registroId = r.body.registro.id;
  const lista = await pedir('GET', '/api/mis-registros');
  assert.equal(lista.status, 200);
  assert.ok(lista.body.registros.some((x) => x.id === registroId));
});

test('login de gestión humana y revisión del registro', async () => {
  cookies = '';
  const r = await pedir('POST', '/api/auth/login', { usuario: 'gestion', password: CLAVE, rol: 'gh' });
  assert.equal(r.status, 200);
  assert.equal(r.body.usuario.rol, 'gh');

  const pendientes = await pedir('GET', '/api/registros?estado=enviado');
  assert.equal(pendientes.status, 200);
  assert.ok(pendientes.body.items.some((x) => x.id === registroId));

  const revision = await pedir('PUT', `/api/registros/${registroId}`, {
    estado: 'aprobado', horasExtra: 2, comentarioGH: 'Validado en campo',
  });
  assert.equal(revision.status, 200);
  assert.equal(revision.body.registro.estado, 'aprobado');
  assert.equal(revision.body.registro.horas.extra, 2);
});

test('gestión humana administra catálogos y trabajadores', async () => {
  const crear = await pedir('POST', '/api/puestos', {
    nombre: 'Poda técnica', tarifaJornal: 52, jornadaHoras: 8,
    metasPlan: [{ nombre: 'Plantas podadas', unidad: 'planta', tarifa: 0.2, objetivoDia: 200 }],
  });
  assert.ok([200, 201].includes(crear.status), `status ${crear.status}`);
  const puestoId = crear.body.puesto?.id || crear.body.item?.id || crear.body.id;
  assert.ok(puestoId);

  const trab = await pedir('POST', '/api/trabajadores', {
    dni: '12345678', nombres: 'Luis', apellidos: 'Ramos', puestoId,
    modalidadId: null, turnoId: null, horarioId: null, tarifaJornal: 52, diasPorSemana: 6, asignacionFamiliar: false,
  });
  assert.ok([200, 201].includes(trab.status), `status ${trab.status}`);
  const trabajadorId = trab.body.trabajador?.id || trab.body.item?.id || trab.body.id;
  assert.ok(trabajadorId);

  const cfg = await pedir('PUT', '/api/config', { maxHorasExtraDia: 3 });
  assert.equal(cfg.status, 200);
  const leer = await pedir('GET', '/api/config');
  assert.equal(leer.body.config.maxHorasExtraDia, 3);
  await pedir('PUT', '/api/config', { maxHorasExtraDia: 4 });
});

test('reportes de planilla y CSV para gestión humana', async () => {
  const planilla = await pedir('GET', '/api/reportes/planilla?desde=2026-03-01&hasta=2026-03-31');
  assert.equal(planilla.status, 200);
  assert.ok(planilla.body.filas.length >= 1);
  assert.ok(planilla.body.totales.neto > 0);

  const csvRes = await fetch(`${baseURL}/api/reportes/planilla.csv?desde=2026-03-01&hasta=2026-03-31`, {
    headers: { Cookie: cookies },
  });
  assert.equal(csvRes.status, 200);
  const csv = await csvRes.text();
  assert.ok(csv.split('\r\n').length >= 3);
});

test('logout invalida la sesión', async () => {
  await pedir('POST', '/api/auth/logout');
  cookies = '';
  const r = await pedir('GET', '/api/bootstrap');
  assert.equal(r.status, 401);
});
