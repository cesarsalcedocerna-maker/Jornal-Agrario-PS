import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { api } from './api.js';
import { inicializarDatos } from './seed.js';
import { DATA_DIR } from './store.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const raiz = path.resolve(__dirname, '..');
const PUERTO = Number(process.env.PORT) || 3000;

inicializarDatos();

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(express.json({ limit: '512kb' }));

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'same-origin');
  next();
});

app.get('/api/salud', (req, res) => {
  res.json({ ok: true, servicio: 'jornal-agrario', hora: new Date().toISOString() });
});

app.use('/api', api);

// Archivos estáticos del frontend
app.use(express.static(path.join(raiz, 'public'), { extensions: ['html'], maxAge: '1h' }));

app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  return res.sendFile(path.join(raiz, 'public', 'index.html'));
});

app.use((req, res) => {
  res.status(404).json({ error: 'Ruta no encontrada.' });
});

// eslint-disable-next-line no-unused-vars
app.use((error, req, res, next) => {
  console.error('[api] Error:', error.message);
  if (error.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'El cuerpo de la solicitud no es JSON válido.' });
  }
  return res.status(500).json({ error: 'Ocurrió un error en el servidor. Intenta nuevamente.' });
});

app.listen(PUERTO, '0.0.0.0', () => {
  console.log(`[jornal-agrario] Servidor escuchando en http://0.0.0.0:${PUERTO}`);
  console.log(`[jornal-agrario] Datos en: ${DATA_DIR}`);
});
