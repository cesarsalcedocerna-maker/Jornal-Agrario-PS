import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { get, verificarPassword, buscar, auditar } from './store.js';

const COOKIE = 'jornal_sesion';
const DURACION_MS = 1000 * 60 * 60 * 12;

function cargarSecreto() {
  if (process.env.SESSION_SECRET) return process.env.SESSION_SECRET;
  try {
    const dir = process.env.DATA_DIR || (fs.existsSync('/data') ? '/data' : path.join(process.cwd(), 'data'));
    const archivo = path.join(dir, '.session-secret');
    if (fs.existsSync(archivo)) return fs.readFileSync(archivo, 'utf8').trim();
    const secreto = crypto.randomBytes(32).toString('hex');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(archivo, secreto, { mode: 0o600 });
    return secreto;
  } catch {
    return crypto.randomBytes(32).toString('hex');
  }
}

const SECRETO = cargarSecreto();

function firmar(payload) {
  return crypto.createHmac('sha256', SECRETO).update(payload).digest('base64url');
}

export function crearToken(usuario) {
  const payload = Buffer.from(JSON.stringify({
    sub: usuario.id,
    rol: usuario.rol,
    trabajadorId: usuario.trabajadorId || null,
    exp: Date.now() + DURACION_MS,
  })).toString('base64url');
  return `${payload}.${firmar(payload)}`;
}

export function verificarToken(token) {
  if (!token || typeof token !== 'string' || !token.includes('.')) return null;
  const [payload, firma] = token.split('.');
  const esperado = firmar(payload);
  try {
    if (!crypto.timingSafeEqual(Buffer.from(firma), Buffer.from(esperado))) return null;
  } catch {
    return null;
  }
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (!data?.exp || data.exp < Date.now()) return null;
    const usuario = buscar('usuarios', data.sub);
    if (!usuario || usuario.activo === false) return null;
    return usuario;
  } catch {
    return null;
  }
}

function parseCookies(req) {
  const crudo = req.headers.cookie || '';
  return crudo.split(';').reduce((acc, parte) => {
    const idx = parte.indexOf('=');
    if (idx === -1) return acc;
    acc[parte.slice(0, idx).trim()] = decodeURIComponent(parte.slice(idx + 1).trim());
    return acc;
  }, {});
}

export function autenticar(req, res, next) {
  const token = parseCookies(req)[COOKIE] || (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const usuario = verificarToken(token);
  if (!usuario) {
    return res.status(401).json({ error: 'Sesión no válida o expirada. Inicia sesión nuevamente.' });
  }
  req.usuario = usuario;
  return next();
}

export function soloGH(req, res, next) {
  if (req.usuario?.rol !== 'gh') {
    return res.status(403).json({ error: 'Esta acción requiere el rol de Gestión Humana.' });
  }
  return next();
}

export function login(usuario, password, rolEsperado) {
  const loginLimpio = String(usuario || '').trim();
  if (!loginLimpio || !password) {
    return { error: 'Ingresa tu usuario/DNI y contraseña.' };
  }
  const encontrado = get('usuarios').find(
    (u) => u.usuario.toLowerCase() === loginLimpio.toLowerCase() || u.dni === loginLimpio,
  );
  if (!encontrado || encontrado.activo === false) {
    return { error: 'Credenciales incorrectas. Verifica tu usuario o DNI.' };
  }
  if (rolEsperado && encontrado.rol !== rolEsperado) {
    return {
      error: rolEsperado === 'gh'
        ? 'Esta cuenta no pertenece a Gestión Humana.'
        : 'Esta cuenta no es de trabajador.',
    };
  }
  if (!verificarPassword(password, encontrado.salt, encontrado.hash)) {
    return { error: 'Credenciales incorrectas. Verifica tu contraseña.' };
  }
  auditar(encontrado.usuario, 'login', `rol=${encontrado.rol}`);
  return { usuario: encontrado };
}

export function setCookieSesion(res, usuario) {
  const token = crearToken(usuario);
  const partes = [
    `${COOKIE}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${Math.floor(DURACION_MS / 1000)}`,
  ];
  if (process.env.COOKIE_SECURE === 'true' || process.env.NODE_ENV === 'production') {
    if (process.env.COOKIE_SECURE === 'true') partes.push('Secure');
  }
  res.append('Set-Cookie', partes.join('; '));
}

export function limpiarCookie(res) {
  res.append('Set-Cookie', `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
}

export function usuarioPublico(usuario) {
  if (!usuario) return null;
  const trabajador = usuario.trabajadorId ? buscar('trabajadores', usuario.trabajadorId) : null;
  return {
    id: usuario.id,
    usuario: usuario.usuario,
    nombre: usuario.nombre,
    rol: usuario.rol,
    trabajadorId: usuario.trabajadorId || null,
    dni: trabajador?.dni || (usuario.rol === 'gh' ? usuario.usuario : null),
  };
}
