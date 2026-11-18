import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agenda-test-'));
const adminToken = 'jeton-de-test';

function startServer() {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['server.js'], {
      cwd: ROOT,
      env: {
        ...process.env,
        PORT: '0',
        HOST: '127.0.0.1',
        AGENDA_DATA_DIR: dataDir,
        AGENDA_SEED: 'empty',
        AGENDA_ADMIN_TOKEN: adminToken,
        AGENDA_PUBLIC_URL: 'https://agenda.test',
        AGENDA_RATE_LIMIT: '50',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let output = '';
    const timer = setTimeout(() => reject(new Error(`Délai dépassé au démarrage du serveur.\n${output}`)), 10000);

    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      output += chunk;
      const match = output.match(/AGENDA_READY (http:\/\/\S+)/);
      if (match) {
        clearTimeout(timer);
        resolve({ child, base: match[1] });
      }
    });

    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk) => {
      output += chunk;
    });

    child.on('exit', (code) => {
      clearTimeout(timer);
      reject(new Error(`Le serveur s’est arrêté (code ${code}).\n${output}`));
    });
  });
}

const { child, base } = await startServer();

async function request(pathname, options = {}) {
  const response = await fetch(`${base}${pathname}`, options);
  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  return { response, text, data };
}

async function createEvent(body) {
  return request('/api/events', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

try {
  /* ----------------------------- Pages ----------------------------- */

  const home = await request('/');
  assert.equal(home.response.status, 200);
  assert.match(home.response.headers.get('content-type') || '', /text\/html/);
  assert.ok(home.text.includes('mode-full'), 'La page complète est servie');

  const embed = await request('/embed');
  assert.equal(embed.response.status, 200);
  assert.ok(embed.text.includes('mode-embed'), 'La page embed est servie');
  assert.ok((embed.response.headers.get('content-security-policy') || '').includes('frame-ancestors'));
  assert.match(embed.response.headers.get('content-security-policy') || '', /object-src 'none'/);

  assert.equal(embed.response.headers.get('access-control-allow-origin'), '*', 'CORS public');
  assert.equal(home.response.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(home.response.headers.get('x-permitted-cross-domain-policies'), 'none');
  assert.equal(home.response.headers.get('cross-origin-opener-policy'), 'same-origin');
  assert.match(home.response.headers.get('referrer-policy') || '', /strict-origin-when-cross-origin/);
  assert.match(home.response.headers.get('strict-transport-security') || '', /max-age=31536000/, 'HSTS actif en HTTPS');

  /* ----------------------------- Config ---------------------------- */

  const config = await request('/api/config');
  assert.equal(config.response.status, 200);
  assert.equal(config.data.name, 'Agenda IA Montpellier');
  assert.equal(config.data.organization, 'Oreegami');
  assert.equal(config.data.timezone, 'Europe/Paris');
  assert.ok(config.data.feedUrl.endsWith('/events.ics'));
  assert.ok(config.data.embedUrl.endsWith('/embed'));
  assert.equal(config.data.adminEnabled, true);

  /* ------------------------- Agenda vide -------------------------- */

  const empty = await request('/api/events');
  assert.equal(empty.response.status, 200);
  assert.equal(empty.data.count, 0, 'AGENDA_SEED=empty ne crée aucun évènement');

  /* -------------------------- Création ---------------------------- */

  const created = await createEvent({
    title: 'Atelier IA; découverte, test',
    description: 'Une ligne\nDeux lignes',
    start: '2026-12-01T18:00',
    end: '2026-12-01T20:00',
    location: 'Oreegami — Campus Port Marianne',
    category: 'Atelier',
    organizer: 'Oreegami',
    url: 'https://example.com/inscription',
    id: 'evt_id_impose_par_le_client',
    createdAt: 1,
  });

  assert.equal(created.response.status, 201);
  assert.ok(created.data.event.id.startsWith('evt_'));
  assert.notEqual(created.data.event.id, 'evt_id_impose_par_le_client', 'L’identifiant est généré par le serveur');
  assert.notEqual(created.data.event.createdAt, 1, 'La date de création est générée par le serveur');
  assert.equal(created.data.event.title, 'Atelier IA; découverte, test');
  assert.equal(created.data.event.source, 'web');
  assert.equal(created.data.event.url, 'https://example.com/inscription');
  assert.equal(typeof created.data.editToken, 'string');
  assert.ok(created.data.editToken.length >= 20, 'Un jeton d’édition est renvoyé à la création');
  assert.equal(created.data.event.editTokenHash, undefined, 'Le hash du jeton n’est pas exposé');

  const eventId = created.data.event.id;

  const list = await request('/api/events');
  assert.equal(list.data.count, 1);
  assert.equal(list.data.events[0].editTokenHash, undefined, 'Le hash n’est pas exposé dans la liste');

  const publicOne = await request(`/api/events/${eventId}`);
  assert.equal(publicOne.data.event.editTokenHash, undefined, 'Le hash n’est pas exposé dans le détail');

  /* --------------------- Édition par le créateur ------------------- */

  const selfUpdated = await request(`/api/events/${eventId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', 'X-Edit-Token': created.data.editToken },
    body: JSON.stringify({ description: 'Modifié par son auteur', editTokenHash: 'a'.repeat(64) }),
  });
  assert.equal(selfUpdated.response.status, 200, 'Le créateur peut modifier avec son jeton');
  assert.equal(selfUpdated.data.event.description, 'Modifié par son auteur');
  assert.equal(selfUpdated.data.event.editTokenHash, undefined);

  const wrongEditToken = await request(`/api/events/${eventId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', 'X-Edit-Token': 'mauvais-jeton' },
    body: JSON.stringify({ title: 'Tentative avec un mauvais jeton' }),
  });
  assert.equal(wrongEditToken.response.status, 401);

  const other = await createEvent({
    title: 'Autre évènement',
    start: '2026-12-05T18:00',
    end: '2026-12-05T20:00',
  });
  assert.equal(other.response.status, 201);
  assert.ok(other.data.editToken);

  const crossEdit = await request(`/api/events/${eventId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', 'X-Edit-Token': other.data.editToken },
    body: JSON.stringify({ title: 'Jeton d’un autre évènement' }),
  });
  assert.equal(crossEdit.response.status, 401, 'Un jeton ne peut pas modifier un autre évènement');

  const selfDeleted = await request(`/api/events/${other.data.event.id}`, {
    method: 'DELETE',
    headers: { 'X-Edit-Token': other.data.editToken },
  });
  assert.equal(selfDeleted.response.status, 200, 'Le créateur peut supprimer son évènement');

  /* ---------------------------- Fichiers .ics --------------------- */

  const single = await request(`/events/${encodeURIComponent(eventId)}.ics`);
  assert.equal(single.response.status, 200);
  assert.match(single.response.headers.get('content-type') || '', /text\/calendar/);
  assert.match(single.response.headers.get('content-disposition') || '', /attachment/);
  assert.ok(single.text.includes('BEGIN:VCALENDAR'));
  assert.ok(single.text.includes('SUMMARY:Atelier IA\\; découverte\\, test'));
  assert.ok(single.text.includes('DTSTART:20261201T170000Z'), '18 h à Paris en hiver = 17 h UTC');
  assert.ok(single.text.includes('DTEND:20261201T190000Z'));
  assert.ok(single.text.includes('URL:https://example.com/inscription'));

  const feed = await request('/events.ics');
  assert.equal(feed.response.status, 200);
  assert.match(feed.response.headers.get('content-disposition') || '', /inline/);
  assert.ok(feed.text.includes('X-WR-CALNAME:Agenda IA Montpellier'));
  assert.ok(feed.text.includes('SUMMARY:Atelier IA\\; découverte\\, test'));

  /* --------------------------- Modération ------------------------- */

  const forbidden = await request(`/api/events/${eventId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: 'Tentative sans jeton' }),
  });
  assert.equal(forbidden.response.status, 401);

  const queryToken = await request(`/api/events/${eventId}?token=${encodeURIComponent(adminToken)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: 'Jeton dans l’URL' }),
  });
  assert.equal(queryToken.response.status, 401, 'Le jeton en query string est refusé');

  const updated = await request(`/api/events/${eventId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', 'X-Admin-Token': adminToken },
    body: JSON.stringify({ title: 'Atelier IA — mise à jour', url: 'https://example.com\r\nX-EVIL:1' }),
  });
  assert.equal(updated.response.status, 200);
  assert.equal(updated.data.event.title, 'Atelier IA — mise à jour');
  assert.equal(updated.data.event.category, 'Atelier', 'Les champs absents sont conservés');
  assert.equal(updated.data.event.url, '', 'Les caractères de contrôle sont refusés');

  const sanitizedIcs = await request(`/events/${encodeURIComponent(eventId)}.ics`);
  assert.ok(!sanitizedIcs.text.includes('X-EVIL'), 'Pas d’injection de propriété iCalendar');

  /* ------------------------ Validation / spam --------------------- */

  const invalid = await createEvent({ title: '', start: '2026-12-01T18:00' });
  assert.equal(invalid.response.status, 400);

  const nullBody = await request('/api/events', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: 'null',
  });
  assert.equal(nullBody.response.status, 400, 'Un corps JSON non-objet est refusé');

  const wrongType = await request('/api/events', {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify({ title: 'Mauvais Content-Type', start: '2026-12-01T18:00' }),
  });
  assert.equal(wrongType.response.status, 415, 'Content-Type application/json exigé');

  const honeypot = await createEvent({
    title: 'Spam robot',
    website: 'https://spam.example',
    start: '2026-12-02T18:00',
    end: '2026-12-02T20:00',
  });
  assert.equal(honeypot.response.status, 201);
  assert.equal(honeypot.data.event, undefined, 'Le piège ne crée rien');

  const afterHoneypot = await request('/api/events');
  assert.equal(afterHoneypot.data.count, 1, 'Le honeypot n’ajoute pas d’évènement');

  /* ----------------------- Filtres / passés ----------------------- */

  assert.equal((await createEvent({ title: 'Vieux meetup', start: '2020-01-10T18:00', end: '2020-01-10T20:00' })).response.status, 201);
  assert.equal((await createEvent({ title: 'Meetup 2099', start: '2099-01-10T18:00', end: '2099-01-10T20:00' })).response.status, 201);

  const upcoming = await request('/api/events?upcoming=1');
  const titles = upcoming.data.events.map((event) => event.title);
  assert.ok(titles.includes('Meetup 2099'));
  assert.ok(!titles.includes('Vieux meetup'), 'Le filtre upcoming exclut les évènements passés');
  assert.equal(upcoming.data.count, 2);

  const ateliers = await request('/api/events?category=Atelier');
  assert.equal(ateliers.data.count, 1);
  assert.equal(ateliers.data.events[0].category, 'Atelier');

  const upcomingIcs = await request('/events.ics?upcoming=1');
  assert.ok(upcomingIcs.text.includes('SUMMARY:Meetup 2099'));
  assert.ok(!upcomingIcs.text.includes('SUMMARY:Vieux meetup'));

  /* ---------------------------- Suppression ----------------------- */

  const deleteForbidden = await request(`/api/events/${eventId}`, { method: 'DELETE' });
  assert.equal(deleteForbidden.response.status, 401);

  const deleted = await request(`/api/events/${eventId}`, {
    method: 'DELETE',
    headers: { 'X-Admin-Token': adminToken },
  });
  assert.equal(deleted.response.status, 200);
  assert.deepEqual(deleted.data, { ok: true });

  const remaining = await request('/api/events');
  assert.equal(remaining.data.count, 2);

  /* ----------------------------- Erreurs -------------------------- */

  assert.equal((await request('/api/inconnue')).response.status, 404);
  assert.equal((await request('/events/evt_inexistant.ics')).response.status, 404);

  /* --------------------- Limite des essais admin ------------------- */

  const adminStatuses = [];
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const response = await request('/api/admin/check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Admin-Token': 'mauvais-jeton' },
      body: '{}',
    });
    adminStatuses.push(response.response.status);
  }
  assert.ok(adminStatuses.includes(429), 'Les échecs répétés de jeton sont limités');

  const correctAfterFailures = await request('/api/admin/check', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Admin-Token': adminToken },
    body: '{}',
  });
  assert.equal(correctAfterFailures.response.status, 200, 'Le bon jeton reste accepté');

  console.log('ok — api');
} finally {
  child.kill();
  await new Promise((resolve) => setTimeout(resolve, 150));
  fs.rmSync(dataDir, { recursive: true, force: true });
}
