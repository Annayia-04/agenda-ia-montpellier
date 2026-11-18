/* --------------------------------------------------------------------------
   Dates et heures
   --------------------------------------------------------------------------
   Les évènements sont stockés en « heure locale de Montpellier » sous la forme
   `YYYY-MM-DDTHH:mm` (sans fuseau). C'est volontaire : le formulaire reste
   simple, et les fichiers .ics convertissent ces heures en UTC avec le fuseau
   configuré (Europe/Paris par défaut), ce qui gère correctement l'heure d'été.
   -------------------------------------------------------------------------- */

const pad = (n) => String(n).padStart(2, '0');

/** `YYYY-MM-DDTHH:mm` à partir d'un objet Date local. */
export function formatLocal(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function localParts(value) {
  const match = String(value ?? '')
    .trim()
    .match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?$/);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = match[4] === undefined ? null : Number(match[4]);
  const minute = match[5] === undefined ? null : Number(match[5]);

  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  if (hour !== null && hour > 23) return null;
  if (minute !== null && minute > 59) return null;

  const check = new Date(year, month - 1, day);
  if (check.getFullYear() !== year || check.getMonth() !== month - 1 || check.getDate() !== day) return null;

  return { year, month, day, hour, minute };
}

/**
 * Normalise une saisie date/heure.
 * - `2026-11-18` avec `defaultTime` → `2026-11-18T09:00`
 * - `allDay` → toujours `YYYY-MM-DDT00:00`
 * Retourne `null` si la valeur est invalide.
 */
export function normalizeLocal(value, { allDay = false, defaultTime = '09:00' } = {}) {
  const parts = localParts(value);
  if (!parts) return null;

  const date = `${parts.year}-${pad(parts.month)}-${pad(parts.day)}`;
  if (allDay) return `${date}T00:00`;

  let { hour, minute } = parts;
  if (hour === null) {
    [hour, minute] = defaultTime.split(':').map(Number);
  }
  return `${date}T${pad(hour)}:${pad(minute)}`;
}

/** Date locale complète à partir de `YYYY-MM-DDTHH:mm`. */
export function parseLocal(value) {
  const parts = localParts(value);
  if (!parts) return null;
  return new Date(parts.year, parts.month - 1, parts.day, parts.hour ?? 0, parts.minute ?? 0);
}

export function addHours(value, hours) {
  const date = parseLocal(value);
  if (!date) return value;
  date.setHours(date.getHours() + hours);
  return formatLocal(date);
}

/** Ajoute des jours à une clé `YYYY-MM-DD` (sans problème de fuseau). */
export function addDays(dateKey, days) {
  const [year, month, day] = String(dateKey).split('-').map(Number);
  const date = new Date(year, month - 1, day + days);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function todayKey() {
  return formatLocal(new Date()).slice(0, 10);
}

/* --------------------------- Fuseau horaire --------------------------- */

function partsInZone(date, timeZone) {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
  const result = {};
  for (const part of formatter.formatToParts(date)) {
    if (part.type !== 'literal') result[part.type] = Number(part.value);
  }
  return result;
}

/** Heure « murale » actuelle dans un fuseau, au format `YYYY-MM-DDTHH:mm`. */
export function nowInZone(timeZone) {
  const parts = partsInZone(new Date(), timeZone);
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}T${pad(parts.hour)}:${pad(parts.minute)}`;
}

/**
 * Convertit une heure locale (heure de Montpellier) en instant UTC.
 * Itération courte pour gérer les changements d'heure.
 */
export function zonedToUtc(value, timeZone = 'Europe/Paris') {
  const parts = localParts(value);
  if (!parts) return new Date(NaN);

  const wallClockAsUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour ?? 0, parts.minute ?? 0, 0);
  let timestamp = wallClockAsUtc;

  for (let i = 0; i < 3; i += 1) {
    const rendered = partsInZone(new Date(timestamp), timeZone);
    const renderedAsUtc = Date.UTC(rendered.year, rendered.month - 1, rendered.day, rendered.hour, rendered.minute, rendered.second);
    const next = wallClockAsUtc - (renderedAsUtc - timestamp);
    if (next === timestamp) break;
    timestamp = next;
  }

  return new Date(timestamp);
}

/** `20260701T080000Z` (format DATE-TIME UTC d'un fichier .ics). */
export function formatIcsUtc(date) {
  return (
    `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}` +
    `T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`
  );
}

/** `20260701` (format DATE d'un fichier .ics). */
export function formatIcsDate(dateKey) {
  return String(dateKey).slice(0, 10).replace(/-/g, '');
}
