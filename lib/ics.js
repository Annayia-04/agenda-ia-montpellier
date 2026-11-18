import { addDays, formatIcsDate, formatIcsUtc, zonedToUtc } from './time.js';

const CRLF = '\r\n';

/** Échappement des valeurs TEXT selon la RFC 5545. */
export function escapeText(value) {
  return String(value ?? '')
    .replace(/\r\n?/g, '\n')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n');
}

/** Replie une ligne à 75 octets maximum (UTF-8), comme l'exige la RFC 5545. */
export function foldLine(line) {
  const output = [];
  let current = '';
  let bytes = 0;

  for (const char of String(line)) {
    const size = Buffer.byteLength(char, 'utf8');
    if (bytes + size > 75) {
      output.push(current);
      current = ` ${char}`;
      bytes = 1 + size;
    } else {
      current += char;
      bytes += size;
    }
  }

  output.push(current);
  return output.join(CRLF);
}

function timestamp(value) {
  const date = new Date(Number(value));
  return Number.isNaN(date.getTime()) ? null : formatIcsUtc(date);
}

function descriptionOf(event) {
  const parts = [];
  if (event.description) parts.push(event.description);
  if (event.organizer) parts.push(`Organisé par : ${event.organizer}`);
  if (event.url) parts.push(`Inscription : ${event.url}`);
  return parts.join('\n\n');
}

/** Lignes (non repliées) d'un bloc VEVENT. */
export function eventToVevent(event, { timezone = 'Europe/Paris', baseUrl = '', now = new Date() } = {}) {
  const lines = ['BEGIN:VEVENT'];
  const created = timestamp(event.createdAt);
  const updated = timestamp(event.updatedAt);

  lines.push(`UID:${escapeText(event.id)}@agenda-ia-montpellier`);
  lines.push(`DTSTAMP:${formatIcsUtc(now)}`);
  if (created) lines.push(`CREATED:${created}`);
  if (updated) lines.push(`LAST-MODIFIED:${updated}`);
  lines.push('SEQUENCE:0');

  if (event.allDay) {
    lines.push(`DTSTART;VALUE=DATE:${formatIcsDate(event.start)}`);
    // DTEND est exclusif : un évènement d'une journée se termine le lendemain.
    lines.push(`DTEND;VALUE=DATE:${formatIcsDate(addDays(event.end.slice(0, 10), 1))}`);
    lines.push('X-MICROSOFT-CDO-ALLDAYEVENT:TRUE');
  } else {
    lines.push(`DTSTART:${formatIcsUtc(zonedToUtc(event.start, timezone))}`);
    lines.push(`DTEND:${formatIcsUtc(zonedToUtc(event.end, timezone))}`);
  }

  lines.push(`SUMMARY:${escapeText(event.title)}`);
  const description = descriptionOf(event);
  if (description) lines.push(`DESCRIPTION:${escapeText(description)}`);
  if (event.location) lines.push(`LOCATION:${escapeText(event.location)}`);
  if (event.category) lines.push(`CATEGORIES:${escapeText(event.category)}`);
  if (event.organizer) lines.push(`CONTACT:${escapeText(event.organizer)}`);

  if (event.url) lines.push(`URL:${event.url}`);
  else if (baseUrl) lines.push(`URL:${baseUrl}/#event-${encodeURIComponent(event.id)}`);

  lines.push('STATUS:CONFIRMED');
  lines.push('TRANSP:OPAQUE');
  lines.push('END:VEVENT');
  return lines;
}

export function buildCalendar(
  events,
  {
    name = 'Agenda IA Montpellier — Oreegami',
    description = 'Les évènements IA à Montpellier pour les étudiants d’Oreegami.',
    timezone = 'Europe/Paris',
    baseUrl = '',
    now = new Date(),
  } = {}
) {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Oreegami//Agenda IA Montpellier//FR',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeText(name)}`,
    `X-WR-CALDESC:${escapeText(description)}`,
    `X-WR-TIMEZONE:${timezone}`,
    'REFRESH-INTERVAL;VALUE=DURATION:PT1H',
    'X-PUBLISHED-TTL:PT1H',
  ];

  for (const event of events) {
    lines.push(...eventToVevent(event, { timezone, baseUrl, now }));
  }

  lines.push('END:VCALENDAR');
  return `${lines.map(foldLine).join(CRLF)}${CRLF}`;
}

export function singleEventCalendar(event, options = {}) {
  return buildCalendar([event], { ...options, name: event.title, description: event.description || event.title });
}

export function icsFilename(value, dateKey = '') {
  const slug = String(value || 'evenement')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  const date = String(dateKey).slice(0, 10);
  return `${slug || 'evenement'}${date ? `-${date}` : ''}.ics`;
}
