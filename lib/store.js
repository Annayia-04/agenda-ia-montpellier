import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { makeDemoEvents } from './seed.js';
import { addHours, formatLocal, normalizeLocal } from './time.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const DATA_DIR = process.env.AGENDA_DATA_DIR
  ? path.resolve(process.env.AGENDA_DATA_DIR)
  : path.join(ROOT, 'data');
const DB_PATH = path.join(DATA_DIR, 'events.json');

/** `demo` (défaut) : quelques évènements fictifs ; `empty` : agenda vide. */
export const SEED_MODE = String(process.env.AGENDA_SEED || 'demo').trim().toLowerCase() === 'empty' ? 'empty' : 'demo';

export const CATEGORIES = ['Atelier', 'Conférence', 'Hackathon', 'Meetup', 'Autre'];

export class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ValidationError';
  }
}

export function uid() {
  return `evt_${Date.now().toString(36)}${crypto.randomBytes(3).toString('hex')}`;
}

const asBool = (value) => value === true || value === 'true' || value === 'on' || value === 1;

function cleanUrl(value) {
  const raw = String(value ?? '').trim().slice(0, 500);
  // Refuse les caractères de contrôle : ils permettraient d'injecter des
  // propriétés supplémentaires dans un fichier .ics (URL:\r\nX-EVIL:...).
  if (!raw || /[\u0000-\u001F\u007F\s]/.test(raw)) return '';
  try {
    const url = new URL(raw);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return '';
    return url.toString();
  } catch {
    return '';
  }
}

/**
 * Valide et normalise un évènement.
 * `base` sert aux mises à jour : les champs absents du patch sont conservés.
 */
export function normalizeEvent(input = {}, base = null, { touch = true } = {}) {
  const src = { ...(base || {}), ...input };
  const now = Date.now();

  const title = String(src.title ?? '').trim().slice(0, 160);
  if (!title) throw new ValidationError('Le titre est obligatoire.');

  const allDay = asBool(src.allDay);
  const start = normalizeLocal(src.start, { allDay, defaultTime: '09:00' });
  if (!start) throw new ValidationError('La date de début est invalide.');

  let end;
  if (src.end === null || src.end === undefined || String(src.end).trim() === '') {
    end = allDay ? `${start.slice(0, 10)}T23:59` : addHours(start, 1);
  } else {
    end = normalizeLocal(src.end, { allDay, defaultTime: '23:59' });
    if (!end) throw new ValidationError('La date de fin est invalide.');
    if (allDay) end = `${end.slice(0, 10)}T23:59`;
  }

  if (end <= start) throw new ValidationError("La fin doit être postérieure au début.");

  const category = CATEGORIES.includes(src.category) ? src.category : 'Autre';

  return {
    id: base?.id || uid(),
    title,
    description: String(src.description ?? '').slice(0, 2000).trim(),
    location: String(src.location ?? '').trim().slice(0, 200) || 'Montpellier',
    category,
    start,
    end,
    allDay,
    organizer: String(src.organizer ?? '').trim().slice(0, 120),
    url: cleanUrl(src.url),
    source: ['web', 'embed', 'api', 'seed'].includes(src.source) ? src.source : 'web',
    createdAt: base ? Number(base.createdAt ?? src.createdAt) || now : now,
    updatedAt: touch ? now : Number(src.updatedAt ?? base?.updatedAt) || now,
  };
}

function readFileEvents() {
  try {
    const raw = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
    if (raw && Array.isArray(raw.events)) return raw.events;
  } catch {
    /* premier lancement */
  }
  return SEED_MODE === 'empty' ? [] : makeDemoEvents();
}

function loadEvents() {
  const events = [];
  for (const input of readFileEvents()) {
    try {
      events.push(
        normalizeEvent(input, { id: input.id, createdAt: input.createdAt, updatedAt: input.updatedAt }, { touch: false })
      );
    } catch {
      /* une entrée corrompue ne doit pas bloquer l'agenda */
    }
  }
  return events;
}

export const db = {
  version: 1,
  events: loadEvents(),
};

export function saveDb() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const temp = `${DB_PATH}.tmp`;
  fs.writeFileSync(temp, `${JSON.stringify(db, null, 2)}\n`, 'utf8');
  fs.renameSync(temp, DB_PATH);
}

export function getEvent(id) {
  return db.events.find((event) => event.id === id) || null;
}

export function createEvent(input) {
  const event = normalizeEvent(input);
  db.events.push(event);
  return event;
}

export function updateEvent(id, patch) {
  const index = db.events.findIndex((event) => event.id === id);
  if (index < 0) return null;
  const event = normalizeEvent(patch, db.events[index]);
  db.events[index] = event;
  return event;
}

export function deleteEvent(id) {
  const index = db.events.findIndex((event) => event.id === id);
  if (index < 0) return false;
  db.events.splice(index, 1);
  return true;
}

/**
 * Liste triée des évènements.
 * `upcoming` compare la fin de l'évènement à l'heure courante (`now`, heure locale).
 */
export function listEvents({ upcoming = false, from = '', to = '', category = '', limit = 0, now = null } = {}) {
  const current = now || formatLocal(new Date());
  let events = db.events.slice().sort((a, b) => a.start.localeCompare(b.start) || a.title.localeCompare(b.title, 'fr'));

  if (upcoming) events = events.filter((event) => event.end >= current);
  if (from) events = events.filter((event) => event.end.slice(0, 10) >= from);
  if (to) events = events.filter((event) => event.start.slice(0, 10) <= to);
  if (category) events = events.filter((event) => event.category === category);
  if (limit > 0) events = events.slice(0, limit);

  return events;
}
