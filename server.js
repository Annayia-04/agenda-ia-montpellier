import http from 'node:http';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import {
  CATEGORIES,
  DATA_DIR,
  SEED_MODE,
  ValidationError,
  createEvent,
  db,
  deleteEvent,
  getEvent,
  listEvents,
  saveDb,
  updateEvent,
} from './lib/store.js';
import { buildCalendar, icsFilename, singleEventCalendar } from './lib/ics.js';
import { nowInZone } from './lib/time.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(ROOT, 'public');

const rawPort = process.env.PORT === undefined || process.env.PORT === '' ? 4500 : Number(process.env.PORT);
const PORT = Number.isFinite(rawPort) ? rawPort : 4500;
const HOST = process.env.HOST || '127.0.0.1';

function safeTimeZone(value) {
  const timeZone = String(value || '').trim() || 'Europe/Paris';
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
    return timeZone;
  } catch {
    console.warn(`[agenda] Fuseau inconnu « ${timeZone} » : Europe/Paris utilisé.`);
    return 'Europe/Paris';
  }
}

const TIMEZONE = safeTimeZone(process.env.AGENDA_TZ);

function safeOrigin(value) {
  const raw = String(value || '').trim();
  if (raw === '*') return '*';
  try {
    const url = new URL(raw);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return '';
    return url.origin;
  } catch {
    return '';
  }
}

function normalizePublicUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  try {
    const url = new URL(raw);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return '';
    return url.toString().replace(/\/+$/, '');
  } catch {
    return '';
  }
}

const PUBLIC_URL = normalizePublicUrl(process.env.AGENDA_PUBLIC_URL);
if (process.env.AGENDA_PUBLIC_URL && !PUBLIC_URL) {
  console.warn('[agenda] AGENDA_PUBLIC_URL invalide : valeur ignorée.');
}

const CORS_ORIGIN =
  process.env.AGENDA_CORS_ORIGIN === undefined ? '*' : safeOrigin(process.env.AGENDA_CORS_ORIGIN);
if (process.env.AGENDA_CORS_ORIGIN !== undefined && !CORS_ORIGIN) {
  console.warn('[agenda] AGENDA_CORS_ORIGIN invalide : CORS désactivé.');
}

const FRAME_ORIGINS = String(process.env.AGENDA_EMBED_ORIGINS || '*')
  .split(',')
  .map((origin) => safeOrigin(origin))
  .filter(Boolean);
const FRAME_ANCESTORS = FRAME_ORIGINS.length ? FRAME_ORIGINS.join(' ') : "'none'";
const HSTS = PUBLIC_URL.startsWith('https://') ? 'max-age=31536000; includeSubDomains' : '';
const TRUST_PROXY = /^(1|true|yes|on)$/i.test(String(process.env.AGENDA_TRUST_PROXY || '').trim());

const ENV_ADMIN_TOKEN = String(process.env.AGENDA_ADMIN_TOKEN || '').trim();
const ADMIN_TOKEN = ENV_ADMIN_TOKEN || crypto.randomBytes(18).toString('base64url');

const RATE_MAX = Math.max(1, Number(process.env.AGENDA_RATE_LIMIT) || 8);
const ADMIN_RATE_MAX = Math.max(3, Number(process.env.AGENDA_ADMIN_RATE_LIMIT) || 10);
const RATE_WINDOW = Math.max(1000, Number(process.env.AGENDA_RATE_WINDOW_MS) || 10 * 60 * 1000);
const MAX_BODY = 64 * 1024;

const DB_FILE = path.join(DATA_DIR, 'events.json');
if (!fs.existsSync(DB_FILE)) {
  try {
    saveDb();
  } catch (err) {
    console.error(`[agenda] Impossible de créer ${DB_FILE} : ${err.message}`);
  }
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.webmanifest': 'application/manifest+json',
};

/* ------------------------------------------------------------------ */
/* Helpers HTTP                                                        */
/* ------------------------------------------------------------------ */

function baseHeaders() {
  return {
    'X-Content-Type-Options': 'nosniff',
    'X-Permitted-Cross-Domain-Policies': 'none',
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'geolocation=(), microphone=(), camera=()',
    ...(HSTS ? { 'Strict-Transport-Security': HSTS } : {}),
    'Content-Security-Policy': [
      "default-src 'self'",
      "img-src 'self' data:",
      "style-src 'self'",
      "script-src 'self'",
      "connect-src 'self'",
      "object-src 'none'",
      `frame-ancestors ${FRAME_ANCESTORS}`,
      "base-uri 'none'",
      "form-action 'self'",
    ].join('; '),
  };
}

function json(res, status, payload, extra = {}) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    ...baseHeaders(),
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Content-Length': Buffer.byteLength(body),
    ...extra,
  });
  res.end(body);
}

function fail(res, status, message, extra = {}) {
  json(res, status, { error: message }, extra);
}

const isPlainObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const isJsonRequest = (req) =>
  String(req.headers['content-type'] || '')
    .toLowerCase()
    .includes('application/json');

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];

    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY) {
        const error = new Error('Corps de requête trop volumineux (64 Ko maximum).');
        error.status = 413;
        reject(error);
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });

    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try {
        return resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        const error = new Error('Corps JSON invalide.');
        error.status = 400;
        return reject(error);
      }
    });

    req.on('error', reject);
  });
}

function publicBaseUrl(req) {
  if (PUBLIC_URL) return PUBLIC_URL;
  const proto = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim() || 'http';
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || 'localhost').split(',')[0].trim();
  return `${proto}://${host}`;
}

function sameSecret(a, b) {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function checkAdmin(req) {
  const provided = String(req.headers['x-admin-token'] || '').trim();
  return Boolean(provided) && sameSecret(provided, ADMIN_TOKEN);
}

function clientIp(req) {
  if (TRUST_PROXY) {
    const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
    if (forwarded) return forwarded;
  }
  return req.socket.remoteAddress || 'inconnu';
}

/* Limite les échecs de jeton de modération : 10 par IP et par fenêtre. */
const adminFailures = new Map();

function noteAdminFailure(req) {
  const ip = clientIp(req);
  const now = Date.now();
  const recent = (adminFailures.get(ip) || []).filter((time) => now - time < RATE_WINDOW);
  recent.push(now);
  adminFailures.set(ip, recent);

  if (adminFailures.size > 5000) {
    for (const [key, times] of adminFailures) {
      if (!times.some((time) => now - time < RATE_WINDOW)) adminFailures.delete(key);
    }
  }

  return recent.length > ADMIN_RATE_MAX;
}

/** Vérifie le jeton ; en cas d'échec, répond 401 ou 429 et renvoie false. */
function requireAdmin(req, res) {
  if (checkAdmin(req)) return true;
  const limited = noteAdminFailure(req);
  fail(
    res,
    limited ? 429 : 401,
    limited ? 'Trop de tentatives de modération. Réessaie dans quelques minutes.' : 'Jeton de modération requis.',
    limited ? { 'Retry-After': String(Math.ceil(RATE_WINDOW / 1000)) } : {}
  );
  return false;
}

/* Limite basique les propositions publiques : 8 par IP toutes les 10 minutes. */
const submissions = new Map();

function allowSubmission(req) {
  const ip = clientIp(req);
  const now = Date.now();
  const recent = (submissions.get(ip) || []).filter((time) => now - time < RATE_WINDOW);

  if (recent.length >= RATE_MAX) {
    submissions.set(ip, recent);
    return false;
  }

  recent.push(now);
  submissions.set(ip, recent);

  if (submissions.size > 5000) {
    for (const [key, times] of submissions) {
      if (!times.some((time) => now - time < RATE_WINDOW)) submissions.delete(key);
    }
  }

  return true;
}

function sendCalendar(req, res, text, filename, { attachment = false } = {}) {
  const body = Buffer.from(text, 'utf8');
  res.writeHead(200, {
    ...baseHeaders(),
    'Content-Type': 'text/calendar; charset=utf-8',
    'Content-Disposition': `${attachment ? 'attachment' : 'inline'}; filename="${filename}"`,
    'Cache-Control': 'no-store',
    'Content-Length': body.length,
  });
  if (req.method === 'HEAD') return res.end();
  return res.end(body);
}

/* ------------------------------------------------------------------ */
/* Fichiers statiques                                                  */
/* ------------------------------------------------------------------ */

async function serveFile(req, res, filePath) {
  const stat = await fsp.stat(filePath);
  if (stat.isDirectory()) throw new Error('Répertoire');

  const ext = path.extname(filePath).toLowerCase();
  res.writeHead(200, {
    ...baseHeaders(),
    'Content-Type': MIME[ext] || 'application/octet-stream',
    'Cache-Control': 'no-cache',
    'Content-Length': stat.size,
  });

  if (req.method === 'HEAD') return res.end();
  return fs.createReadStream(filePath).pipe(res);
}

async function serveStatic(req, res, url) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return fail(res, 405, 'Méthode non autorisée.');
  }

  let pathname;
  try {
    pathname = decodeURIComponent(url.pathname);
  } catch {
    return fail(res, 400, 'Chemin invalide.');
  }

  if (pathname === '/' || pathname === '') pathname = '/index.html';
  if (pathname === '/agenda') pathname = '/index.html';
  if (pathname === '/embed' || pathname === '/embed/') pathname = '/embed.html';
  if (pathname === '/favicon.ico') pathname = '/favicon.svg';

  const filePath = path.join(PUBLIC_DIR, path.normalize(pathname).replace(/^([/\\])+/, ''));
  if (!filePath.startsWith(PUBLIC_DIR)) return fail(res, 403, 'Accès refusé.');

  try {
    return await serveFile(req, res, filePath);
  } catch {
    return json(res, 404, { error: 'Fichier introuvable.' });
  }
}

/* ------------------------------------------------------------------ */
/* API                                                                 */
/* ------------------------------------------------------------------ */

async function handleApi(req, res, url) {
  const parts = url.pathname.replace(/^\/api\/?/, '').split('/').filter(Boolean);
  const method = req.method;
  const now = nowInZone(TIMEZONE);

  if (parts[0] === 'config' && parts.length === 1 && method === 'GET') {
    const base = publicBaseUrl(req);
    return json(res, 200, {
      name: 'Agenda IA Montpellier',
      organization: 'Oreegami',
      city: 'Montpellier',
      timezone: TIMEZONE,
      categories: CATEGORIES,
      feedUrl: `${base}/events.ics`,
      embedUrl: `${base}/embed`,
      publicUrl: base,
      adminEnabled: true,
      seed: SEED_MODE,
      eventCount: db.events.length,
    });
  }

  if (parts[0] === 'admin' && parts[1] === 'check' && method === 'POST') {
    if (!requireAdmin(req, res)) return;
    return json(res, 200, { ok: true });
  }

  if (parts[0] === 'events' && parts.length === 1) {
    if (method === 'GET') {
      const events = listEvents({
        upcoming: url.searchParams.get('upcoming') === '1',
        from: url.searchParams.get('from') || '',
        to: url.searchParams.get('to') || '',
        category: url.searchParams.get('category') || '',
        limit: Math.max(0, Math.min(500, Number(url.searchParams.get('limit')) || 0)),
        now,
      });
      return json(res, 200, { events, count: events.length, timezone: TIMEZONE });
    }

    if (method === 'POST') {
      if (!isJsonRequest(req)) return fail(res, 415, 'Content-Type application/json requis.');
      if (!allowSubmission(req)) {
        return fail(res, 429, 'Trop de propositions en peu de temps. Réessaie dans quelques minutes.', {
          'Retry-After': String(Math.ceil(RATE_WINDOW / 1000)),
        });
      }

      const body = await readBody(req);
      if (!isPlainObject(body)) return fail(res, 400, 'Corps de requête JSON invalide.');
      // Champ piège invisible : seuls les robots le remplissent.
      if (body.website) return json(res, 201, { ok: true });

      try {
        const event = createEvent({ ...body, source: body.source === 'embed' ? 'embed' : 'web' });
        saveDb();
        console.log(`[agenda] + ${event.start} — ${event.title}`);
        return json(res, 201, { event });
      } catch (err) {
        if (err instanceof ValidationError) return fail(res, 400, err.message);
        throw err;
      }
    }

    return fail(res, 405, 'Méthode non autorisée.');
  }

  if (parts[0] === 'events' && parts[1]) {
    let id;
    try {
      id = decodeURIComponent(parts[1]);
    } catch {
      return fail(res, 400, 'Identifiant invalide.');
    }

    const event = getEvent(id);
    if (!event) return fail(res, 404, 'Évènement introuvable.');

    if (method === 'GET') return json(res, 200, { event });

    if (method === 'PATCH') {
      if (!requireAdmin(req, res)) return;
      if (!isJsonRequest(req)) return fail(res, 415, 'Content-Type application/json requis.');
      const body = await readBody(req);
      if (!isPlainObject(body)) return fail(res, 400, 'Corps de requête JSON invalide.');
      try {
        const updated = updateEvent(event.id, body);
        saveDb();
        return json(res, 200, { event: updated });
      } catch (err) {
        if (err instanceof ValidationError) return fail(res, 400, err.message);
        throw err;
      }
    }

    if (method === 'DELETE') {
      if (!requireAdmin(req, res)) return;
      deleteEvent(event.id);
      saveDb();
      return json(res, 200, { ok: true });
    }

    return fail(res, 405, 'Méthode non autorisée.');
  }

  return fail(res, 404, 'Route inconnue.');
}

/* ------------------------------------------------------------------ */
/* Fichiers .ics                                                       */
/* ------------------------------------------------------------------ */

function handleCalendar(req, res, url) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return false;

  if (url.pathname === '/events.ics' || url.pathname === '/agenda.ics') {
    const events = listEvents({ upcoming: url.searchParams.get('upcoming') === '1', now: nowInZone(TIMEZONE) });
    const body = buildCalendar(events, {
      timezone: TIMEZONE,
      baseUrl: publicBaseUrl(req),
      now: new Date(),
    });
    sendCalendar(req, res, body, 'agenda-ia-montpellier.ics');
    return true;
  }

  const match = url.pathname.match(/^\/events\/([^/]+)\.ics$/);
  if (!match) return false;

  let id;
  try {
    id = decodeURIComponent(match[1]);
  } catch {
    fail(res, 400, 'Identifiant invalide.');
    return true;
  }

  const event = getEvent(id);
  if (!event) {
    fail(res, 404, 'Évènement introuvable.');
    return true;
  }

  const body = singleEventCalendar(event, {
    timezone: TIMEZONE,
    baseUrl: publicBaseUrl(req),
    now: new Date(),
  });
  sendCalendar(req, res, body, icsFilename(event.title, event.start), { attachment: true });
  return true;
}

/* ------------------------------------------------------------------ */
/* Serveur                                                             */
/* ------------------------------------------------------------------ */

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

  res.setHeader('Access-Control-Allow-Origin', CORS_ORIGIN);
  if (CORS_ORIGIN !== '*') res.setHeader('Vary', 'Origin');

  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      ...baseHeaders(),
      'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-Admin-Token',
      'Access-Control-Max-Age': '86400',
    });
    return res.end();
  }

  try {
    if (url.pathname === '/healthz') {
      return json(res, 200, { ok: true, events: db.events.length, timezone: TIMEZONE });
    }

    if (url.pathname.startsWith('/api/')) return await handleApi(req, res, url);
    if (handleCalendar(req, res, url)) return;
    return await serveStatic(req, res, url);
  } catch (err) {
    console.error('[agenda]', err);
    if (!res.headersSent) {
      const status = Number(err.status) || 500;
      return fail(res, status, status >= 500 ? 'Erreur interne du serveur.' : err.message || 'Requête invalide.');
    }
    return res.destroy();
  }
});

server.requestTimeout = 15000;
server.headersTimeout = 10000;
server.keepAliveTimeout = 5000;
server.maxHeadersCount = 100;

server.on('error', (err) => {
  console.error(`[agenda] ${err.message}`);
  process.exitCode = 1;
});

server.listen(PORT, HOST, () => {
  const address = server.address();
  const displayHost = HOST === '0.0.0.0' ? 'localhost' : HOST;
  const base = `http://${displayHost}:${address.port}`;

  console.log('');
  console.log('  Agenda IA Montpellier — Oreegami');
  console.log(`  ${base}`);
  console.log(`  Données : ${path.join(DATA_DIR, 'events.json')}`);
  console.log(`  Fuseau  : ${TIMEZONE}`);
  console.log(
    `  Modération : ${
      ENV_ADMIN_TOKEN ? 'jeton défini par AGENDA_ADMIN_TOKEN' : `jeton généré : ${ADMIN_TOKEN} (définis AGENDA_ADMIN_TOKEN pour le garder)`
    }`
  );
  console.log(`  Flux .ics : ${base}/events.ics`);
  console.log(`  Embed CRM : <iframe src="${base}/embed" width="100%" height="640" style="border:0"></iframe>`);
  console.log('');
  console.log(`AGENDA_READY ${base}`);
});
