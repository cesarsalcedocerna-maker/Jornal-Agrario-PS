import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const COLECCIONES = ['usuarios', 'trabajadores', 'puestos', 'turnos', 'horarios', 'modalidades', 'registros', 'auditoria'];

function resolverDataDir() {
  if (process.env.DATA_DIR) return process.env.DATA_DIR;
  try {
    if (fs.existsSync('/data') && fs.statSync('/data').isDirectory()) return '/data';
  } catch {
    /* ignorar */
  }
  return path.join(process.cwd(), 'data');
}

export const DATA_DIR = resolverDataDir();
const DB_FILE = path.join(DATA_DIR, 'db.json');

const db = {
  version: 1,
  config: null,
  usuarios: [],
  trabajadores: [],
  puestos: [],
  turnos: [],
  horarios: [],
  modalidades: [],
  registros: [],
  auditoria: [],
};

let cargado = false;

function asegurarCarga() {
  if (cargado) return;
  cargado = true;
  try {
    if (fs.existsSync(DB_FILE)) {
      const crudo = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
      for (const key of Object.keys(db)) {
        if (crudo[key] !== undefined && crudo[key] !== null) db[key] = crudo[key];
      }
    }
  } catch (error) {
    console.error('[store] No se pudo leer la base de datos, se inicia vacía:', error.message);
  }
}

export function persistir() {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const tmp = `${DB_FILE}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
    fs.renameSync(tmp, DB_FILE);
  } catch (error) {
    console.error('[store] No se pudo guardar la base de datos:', error.message);
  }
}

export function uid(prefijo = '') {
  const id = crypto.randomUUID();
  return prefijo ? `${prefijo}_${id}` : id;
}

export function get(coleccion) {
  asegurarCarga();
  if (!COLECCIONES.includes(coleccion)) throw new Error(`Colección desconocida: ${coleccion}`);
  return db[coleccion];
}

export function setColeccion(coleccion, valor) {
  asegurarCarga();
  if (!COLECCIONES.includes(coleccion)) throw new Error(`Colección desconocida: ${coleccion}`);
  db[coleccion] = valor;
  persistir();
}

export function getConfig() {
  asegurarCarga();
  return db.config;
}

export function setConfig(config) {
  asegurarCarga();
  db.config = config;
  persistir();
  return db.config;
}

export function listar(coleccion, filtro = null) {
  const items = get(coleccion);
  return filtro ? items.filter(filtro) : [...items];
}

export function buscar(coleccion, id) {
  return get(coleccion).find((item) => item.id === id) || null;
}

export function insertar(coleccion, item) {
  const lista = get(coleccion);
  const nuevo = { id: item.id || uid(coleccion.slice(0, 3)), ...item };
  lista.push(nuevo);
  persistir();
  return nuevo;
}

export function actualizar(coleccion, id, cambios) {
  const lista = get(coleccion);
  const indice = lista.findIndex((item) => item.id === id);
  if (indice === -1) return null;
  const actualizado = { ...lista[indice], ...cambios, id };
  lista[indice] = actualizado;
  persistir();
  return actualizado;
}

export function eliminar(coleccion, id) {
  const lista = get(coleccion);
  const indice = lista.findIndex((item) => item.id === id);
  if (indice === -1) return false;
  lista.splice(indice, 1);
  persistir();
  return true;
}

export function auditar(usuario, accion, detalle = '') {
  const lista = get('auditoria');
  lista.push({
    id: uid('aud'),
    fecha: new Date().toISOString(),
    usuario: usuario || 'sistema',
    accion,
    detalle,
  });
  if (lista.length > 2000) lista.splice(0, lista.length - 2000);
  persistir();
}

export function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return { salt, hash };
}

export function verificarPassword(password, salt, hash) {
  try {
    const calculado = crypto.scryptSync(String(password), salt, 64).toString('hex');
    return crypto.timingSafeEqual(Buffer.from(calculado, 'hex'), Buffer.from(hash, 'hex'));
  } catch {
    return false;
  }
}

export function dbSnapshot() {
  asegurarCarga();
  return db;
}
