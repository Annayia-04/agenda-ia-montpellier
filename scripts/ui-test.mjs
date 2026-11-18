/**
 * Test d'interface de l'agenda via le protocole DevTools (Chrome headless).
 * Usage : npm run test:ui (depuis agenda/) ou CHROME_PATH=... node scripts/ui-test.mjs
 */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const ADMIN_TOKEN = 'ui-test-token';
const PORT = 9336;
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agenda-ui-'));
const profile = path.join(os.tmpdir(), `agenda-ui-profile-${Date.now()}`);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

if (!fs.existsSync(CHROME)) {
  console.error(`Chrome introuvable : ${CHROME}\nDéfinissez CHROME_PATH pour lancer ce test.`);
  process.exit(1);
}

async function waitFor(check, timeout = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try {
      if (await check()) return;
    } catch {
      /* nouvelle tentative */
    }
    await sleep(120);
  }
  throw new Error('Délai dépassé');
}

function startServer() {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['server.js'], {
      cwd: ROOT,
      env: {
        ...process.env,
        PORT: '0',
        HOST: '127.0.0.1',
        AGENDA_DATA_DIR: dataDir,
        AGENDA_SEED: 'demo',
        AGENDA_ADMIN_TOKEN: ADMIN_TOKEN,
        AGENDA_RATE_LIMIT: '50',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let output = '';
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`Le serveur n’a pas démarré.\n${output}`));
    }, 10000);

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

const server = await startServer();
const chrome = spawn(
  CHROME,
  [
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    '--hide-scrollbars',
    '--window-size=1440,1100',
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${profile}`,
    'about:blank',
  ],
  { stdio: 'ignore' }
);

const problems = [];

try {
  await waitFor(async () => (await fetch(`http://127.0.0.1:${PORT}/json/version`)).ok);
  const targets = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
  const page = targets.find((target) => target.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = reject;
  });

  let sequence = 0;
  const waiting = new Map();

  ws.onmessage = (event) => {
    const message = JSON.parse(event.data);
    if (message.id && waiting.has(message.id)) {
      const { resolve, reject } = waiting.get(message.id);
      waiting.delete(message.id);
      if (message.error) reject(new Error(message.error.message));
      else resolve(message.result);
      return;
    }
    if (message.method === 'Runtime.exceptionThrown') {
      problems.push(
        `EXCEPTION: ${message.params.exceptionDetails.exception?.description || message.params.exceptionDetails.text}`
      );
    }
    if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') {
      problems.push(`CONSOLE: ${message.params.args.map((arg) => arg.value || arg.description || '').join(' ')}`);
    }
    if (message.method === 'Log.entryAdded' && message.params.entry.level === 'error') {
      problems.push(`LOG: ${message.params.entry.text}`);
    }
  };

  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = ++sequence;
      waiting.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params }));
    });

  const evaluate = async (expression) => {
    const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) {
      throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    }
    return result.result.value;
  };

  await send('Page.enable');
  await send('Runtime.enable');
  await send('Log.enable');
  await send('Page.navigate', { url: server.base });
  await waitFor(() => evaluate(`document.querySelector('.month-grid') !== null`));

  assert.equal(await evaluate('document.title'), 'Agenda IA Montpellier — Oreegami');
  assert.ok((await evaluate(`document.querySelectorAll('.month-grid .day').length`)) >= 28);

  /* Création via le formulaire public */
  await evaluate(`document.querySelector('[data-act="new-event"]').click(); true`);
  await waitFor(() => evaluate(`!!document.querySelector('#event-form')`));
  await evaluate(`(() => {
    const form = document.querySelector('#event-form');
    form.querySelector('[name="title"]').value = 'Test UI — atelier IA';
    form.querySelector('[name="date"]').value = '2026-12-15';
    form.querySelector('[name="startTime"]').value = '18:00';
    form.querySelector('[name="endTime"]').value = '20:00';
    form.querySelector('[name="location"]').value = 'Oreegami Test';
    form.querySelector('[name="category"]').value = 'Atelier';
    form.requestSubmit();
    return true;
  })()`);
  await waitFor(() => evaluate(`document.querySelector('#modal-backdrop').hidden`));

  const created = await (await fetch(`${server.base}/api/events`)).json();
  const createdEvent = created.events.find((event) => event.title === 'Test UI — atelier IA');
  assert.ok(createdEvent, 'Évènement créé');

  /* Édition par le créateur, sans jeton admin */
  await evaluate(`document.querySelector('[data-act="open-event"][data-id="${createdEvent.id}"]').click(); true`);
  await waitFor(() => evaluate(`!!document.querySelector('.detail-title')`));
  assert.ok(
    await evaluate(`!!document.querySelector('.detail-actions [data-act="edit-event"]')`),
    'Le créateur voit le bouton Modifier sans mode admin'
  );

  await evaluate(`document.querySelector('.detail-actions [data-act="edit-event"]').click(); true`);
  await waitFor(() => evaluate(`!!document.querySelector('#event-form')`));
  await evaluate(`(() => {
    const form = document.querySelector('#event-form');
    form.querySelector('[name="title"]').value = 'Titre modifié par le créateur';
    form.requestSubmit();
    return true;
  })()`);
  await waitFor(() => evaluate(`document.querySelector('#modal-backdrop').hidden`));

  const selfUpdated = await (await fetch(`${server.base}/api/events`)).json();
  assert.ok(
    selfUpdated.events.some((event) => event.title === 'Titre modifié par le créateur'),
    'Évènement modifié par son créateur'
  );

  /* Fiche détail */
  await evaluate(`document.querySelector('[data-act="open-event"]').click(); true`);
  await waitFor(() => evaluate(`!!document.querySelector('.detail-title')`));
  assert.ok((await evaluate(`document.querySelector('.detail-title').textContent`)).length > 0);
  await evaluate(`document.querySelector('[data-act="modal-close"]').click(); true`);
  await waitFor(() => evaluate(`document.querySelector('#modal-backdrop').hidden`));

  /* Modération puis édition */
  await evaluate(`document.querySelector('[data-act="admin"]').click(); true`);
  await waitFor(() => evaluate(`!!document.querySelector('#admin-form')`));
  await evaluate(`(() => {
    const form = document.querySelector('#admin-form');
    form.querySelector('[name="token"]').value = '${ADMIN_TOKEN}';
    form.requestSubmit();
    return true;
  })()`);
  await waitFor(() => evaluate(`sessionStorage.getItem('agenda-admin-token') === '${ADMIN_TOKEN}'`));

  await evaluate(`document.querySelector('[data-act="open-event"]').click(); true`);
  await waitFor(() => evaluate(`!!document.querySelector('.detail-title')`));
  assert.ok(await evaluate(`!!document.querySelector('.detail-actions [data-act="edit-event"]')`), 'Boutons admin visibles');

  await evaluate(`document.querySelector('.detail-actions [data-act="edit-event"]').click(); true`);
  await waitFor(() => evaluate(`!!document.querySelector('#event-form')`));
  await evaluate(`(() => {
    const form = document.querySelector('#event-form');
    form.querySelector('[name="title"]').value = 'Titre modifié UI';
    form.requestSubmit();
    return true;
  })()`);
  await waitFor(() => evaluate(`document.querySelector('#modal-backdrop').hidden`));

  const updated = await (await fetch(`${server.base}/api/events`)).json();
  assert.ok(updated.events.some((event) => event.title === 'Titre modifié UI'), 'Évènement modifié');

  /* Page embed */
  await send('Page.navigate', { url: `${server.base}/embed` });
  await waitFor(() => evaluate(`document.querySelector('.embed-list') !== null`));
  assert.ok((await evaluate(`document.querySelectorAll('.event-card').length`)) > 0);
  assert.ok((await evaluate(`!!document.querySelector('.embed-foot a[href="/events.ics"]')`)) === true);

  assert.deepEqual(problems, [], `Erreurs navigateur :\n${problems.join('\n')}`);

  console.log('ok — ui');
} finally {
  chrome.kill();
  server.child.kill();
  await sleep(180);
  try {
    fs.rmSync(profile, { recursive: true, force: true });
  } catch {
    /* profil encore verrouillé */
  }
  try {
    fs.rmSync(dataDir, { recursive: true, force: true });
  } catch {
    /* fichiers encore verrouillés */
  }
}
