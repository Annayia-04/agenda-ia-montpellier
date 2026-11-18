import assert from 'node:assert/strict';
import { buildCalendar, escapeText, icsFilename, singleEventCalendar } from '../lib/ics.js';
import { zonedToUtc } from '../lib/time.js';

/* ------------------------- Fuseau / heure d'été ------------------------- */

assert.equal(
  zonedToUtc('2026-07-01T10:00', 'Europe/Paris').toISOString(),
  '2026-07-01T08:00:00.000Z',
  '10 h à Paris en été = 8 h UTC'
);

assert.equal(
  zonedToUtc('2026-01-15T10:00', 'Europe/Paris').toISOString(),
  '2026-01-15T09:00:00.000Z',
  '10 h à Paris en hiver = 9 h UTC'
);

/* ------------------------------- Échappement ---------------------------- */

assert.equal(escapeText('Atelier; IA, test\nligne 2'), 'Atelier\\; IA\\, test\\nligne 2');

/* -------------------------------- Calendrier ---------------------------- */

const event = {
  id: 'evt_test',
  title: 'Atelier IA; prompt, test',
  description: 'Ligne 1\nLigne 2',
  location: 'Oreegami — Montpellier',
  category: 'Atelier',
  organizer: 'Oreegami',
  url: '',
  allDay: false,
  start: '2026-07-01T18:00',
  end: '2026-07-01T20:00',
  createdAt: Date.UTC(2026, 5, 1, 12, 0, 0),
  updatedAt: Date.UTC(2026, 5, 1, 12, 0, 0),
};

const calendar = buildCalendar([event], {
  name: 'Test',
  timezone: 'Europe/Paris',
  baseUrl: 'https://agenda.example.test',
  now: new Date('2026-06-01T00:00:00Z'),
});

assert.ok(calendar.startsWith('BEGIN:VCALENDAR\r\n'), 'Le calendrier commence par BEGIN:VCALENDAR');
assert.ok(calendar.endsWith('END:VCALENDAR\r\n'), 'Le calendrier se termine par END:VCALENDAR');
assert.ok(calendar.includes('SUMMARY:Atelier IA\\; prompt\\, test'), 'Le titre est échappé');
assert.ok(calendar.includes('DTSTART:20260701T160000Z'), '18 h à Paris en été = 16 h UTC');
assert.ok(calendar.includes('DTEND:20260701T180000Z'), '20 h à Paris en été = 18 h UTC');
assert.ok(calendar.includes('DESCRIPTION:Ligne 1\\nLigne 2'), 'Les retours à la ligne sont échappés');
assert.ok(calendar.includes('UID:evt_test@agenda-ia-montpellier'), 'UID stable');
assert.ok(calendar.includes('URL:https://agenda.example.test/#event-evt_test'), 'Lien de repli');

for (const line of calendar.split('\r\n')) {
  assert.ok(Buffer.byteLength(line, 'utf8') <= 75, `Ligne trop longue (${Buffer.byteLength(line, 'utf8')} octets) : ${line}`);
}

/* --------------------------- Journée entière ---------------------------- */

const allDay = { ...event, id: 'evt_day', allDay: true, start: '2026-07-01T00:00', end: '2026-07-01T23:59' };
const dayCalendar = buildCalendar([allDay], { timezone: 'Europe/Paris', now: new Date('2026-06-01T00:00:00Z') });

assert.ok(dayCalendar.includes('DTSTART;VALUE=DATE:20260701'), 'DTSTART en DATE');
assert.ok(dayCalendar.includes('DTEND;VALUE=DATE:20260702'), 'DTEND exclusif le lendemain');
assert.ok(dayCalendar.includes('X-MICROSOFT-CDO-ALLDAYEVENT:TRUE'), 'Compatibilité Outlook');

/* ------------------------------ Évènement seul -------------------------- */

const single = singleEventCalendar(event, { timezone: 'Europe/Paris', now: new Date('2026-06-01T00:00:00Z') });
assert.ok(single.includes('X-WR-CALNAME:Atelier IA\\; prompt\\, test'), 'Le nom du calendrier reprend le titre');

/* -------------------------------- Nom de fichier ------------------------ */

assert.equal(icsFilename('Conférence IA — Montpellier', '2026-07-01'), 'conference-ia-montpellier-2026-07-01.ics');

console.log('ok — ics');
