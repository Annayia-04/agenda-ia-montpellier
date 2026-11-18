/* ==========================================================================
   Agenda IA Montpellier — Oreegami
   Front vanilla (aucune dépendance), partagé entre la page complète et /embed.
   ========================================================================== */

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const EMBED = document.body.classList.contains('mode-embed');

const ADMIN_KEY = 'agenda-admin-token';
const THEME_KEY = 'agenda-theme';

const CATEGORY_META = {
  Atelier: 'atelier',
  Conférence: 'conference',
  Hackathon: 'hackathon',
  Meetup: 'meetup',
  Autre: 'autre',
};
const CATEGORY_NAMES = Object.keys(CATEGORY_META);

/* ------------------------------- Icônes ------------------------------- */

const ICONS = {
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2.5"/><path d="M8 3v4M16 3v4M3 11h18"/><path d="M8 15h2M14 15h2"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  pin: '<path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0z"/><circle cx="12" cy="10" r="3"/>',
  users: '<path d="M16 20v-1.5a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4V20"/><circle cx="9" cy="7" r="3.2"/><path d="M22 20v-1.5a4 4 0 0 0-3-3.87"/><path d="M16.5 4.2a3.2 3.2 0 0 1 0 6.2"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  close: '<path d="M18 6 6 18M6 6l12 12"/>',
  trash: '<path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/><path d="M10 11v5M14 11v5"/>',
  edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
  external: '<path d="M14 3h7v7"/><path d="M21 3l-9 9"/><path d="M19 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h6"/>',
  download: '<path d="M12 4v12"/><path d="m7 11 5 5 5-5"/><path d="M4 20h16"/>',
  copy: '<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h8"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  moon: '<path d="M21 13A9 9 0 1 1 11 3a7 7 0 0 0 10 10z"/>',
  left: '<path d="m15 18-6-6 6-6"/>',
  right: '<path d="m9 18 6-6-6-6"/>',
  sparkles: '<path d="M12 3v4M12 17v4M5 12H3M21 12h-2M6.3 6.3 4.9 4.9M19.1 19.1l-1.4-1.4M6.3 17.7l-1.4 1.4M19.1 4.9l-1.4 1.4"/><circle cx="12" cy="12" r="3"/>',
  check: '<path d="m4 12.5 5 5L20 6.5"/>',
  code: '<path d="m8 9-4 3 4 3"/><path d="m16 9 4 3-4 3"/><path d="M13 5 11 19"/>',
  warn: '<path d="M12 9v4M12 17h.01"/><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/>',
  lock: '<rect x="4" y="10" width="16" height="11" rx="2.5"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
};

const icon = (name, cls = '') =>
  `<svg class="${cls}" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ''}</svg>`;

/* ------------------------------- État -------------------------------- */

const state = {
  events: [],
  config: null,
  error: '',
  loading: true,
  view: EMBED ? 'list' : 'month',
  month: startOfMonth(new Date()),
  category: 'all',
  showPast: false,
  adminToken: sessionStorage.getItem(ADMIN_KEY) || '',
  editingId: null,
  theme: 'light',
};

/* ------------------------------ Helpers ------------------------------ */

const esc = (value) =>
  String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));

const pad2 = (value) => String(value).padStart(2, '0');
const capitalize = (value) => String(value).charAt(0).toUpperCase() + String(value).slice(1);

function toKey(date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function fromKey(key) {
  const [year, month, day] = String(key).split('-').map(Number);
  return new Date(year, month - 1, day);
}

function startOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function addMonths(date, amount) {
  return new Date(date.getFullYear(), date.getMonth() + amount, 1);
}

function todayKey() {
  return toKey(new Date());
}

function nowKey() {
  const date = new Date();
  return `${toKey(date)}T${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

function monthLabel(date) {
  return capitalize(date.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' }));
}

function formatLongDate(key) {
  return capitalize(
    fromKey(key).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })
  );
}

function formatShortDate(key) {
  return fromKey(key).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}

function formatTime(event) {
  if (event.allDay) return 'Toute la journée';
  const start = event.start.slice(11, 16);
  const end = event.end.slice(11, 16);
  if (event.end.slice(0, 10) !== event.start.slice(0, 10)) {
    return `${start} → ${formatShortDate(event.end.slice(0, 10))} ${end}`;
  }
  return end && end !== '00:00' ? `${start} – ${end}` : start;
}

function shortTitle(title) {
  return title.length > 26 ? `${title.slice(0, 24)}…` : title;
}

const categoryClass = (category) => `cat-${CATEGORY_META[category] || 'autre'}`;

function dayLabel(key) {
  const today = todayKey();
  if (key === today) return 'Aujourd’hui';
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  if (key === toKey(tomorrow)) return 'Demain';
  return formatLongDate(key);
}

/* --------------------------- Données filtrées -------------------------- */

function filteredEvents() {
  return state.events
    .filter((event) => state.category === 'all' || event.category === state.category)
    .slice()
    .sort((a, b) => a.start.localeCompare(b.start) || a.title.localeCompare(b.title, 'fr'));
}

function upcomingEvents() {
  const current = nowKey();
  return filteredEvents().filter((event) => event.end >= current);
}

function pastEvents() {
  const current = nowKey();
  return filteredEvents()
    .filter((event) => event.end < current)
    .sort((a, b) => b.start.localeCompare(a.start))
    .slice(0, 30);
}

function eventsForDay(key) {
  return filteredEvents().filter((event) => {
    const start = event.start.slice(0, 10);
    const end = event.allDay ? event.end.slice(0, 10) : start;
    return key >= start && key <= end;
  });
}

function groupByDay(events, descending = false) {
  const map = new Map();
  for (const event of events) {
    const key = event.start.slice(0, 10);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(event);
  }
  return [...map.entries()].sort((a, b) =>
    descending ? b[0].localeCompare(a[0]) : a[0].localeCompare(b[0])
  );
}

function monthDays(month) {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const offset = (first.getDay() + 6) % 7; // lundi = 0
  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const total = Math.ceil((offset + daysInMonth) / 7) * 7;
  const start = new Date(first);
  start.setDate(first.getDate() - offset);
  return Array.from({ length: total }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return date;
  });
}

/* -------------------------------- API -------------------------------- */

async function api(path, { method = 'GET', body, admin = false, token } = {}) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const adminToken = token || (admin ? state.adminToken : '');
  if (adminToken) headers['X-Admin-Token'] = adminToken;

  const response = await fetch(path, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = {};
  }
  if (!response.ok) throw new Error(data.error || `Erreur ${response.status}`);
  return data;
}

async function load() {
  state.loading = true;
  try {
    const [eventsData, config] = await Promise.all([api('/api/events'), api('/api/config')]);
    state.events = Array.isArray(eventsData.events) ? eventsData.events : [];
    state.config = config;
    state.error = '';
  } catch (err) {
    state.error = err.message || 'Impossible de charger l’agenda.';
  } finally {
    state.loading = false;
    render();
  }
}

/* ------------------------------- Rendu ------------------------------- */

function render() {
  document.documentElement.dataset.theme = state.theme;
  const app = $('#app');
  if (!app) return;

  if (state.loading && !state.config) {
    app.innerHTML = loadingHtml();
    return;
  }

  app.innerHTML = EMBED ? embedHtml() : fullHtml();
  document.title = EMBED ? 'Agenda IA Montpellier — Oreegami' : 'Agenda IA Montpellier — Oreegami';
}

function loadingHtml() {
  return `<div class="loading"><span class="spinner"></span><p>Chargement de l’agenda…</p></div>`;
}

function errorHtml() {
  if (!state.error) return '';
  return `<div class="banner error">${icon('warn')}<span>${esc(state.error)}</span><button class="btn btn-ghost btn-sm" data-act="reload">Réessayer</button></div>`;
}

function emptyHtml() {
  return `<div class="empty">${icon('sparkles')}<p>Aucun évènement pour l’instant.</p><button class="btn btn-soft btn-sm" data-act="new-event">Proposer le premier</button></div>`;
}

/* --------------------------- Page complète --------------------------- */

function fullHtml() {
  return `
    <header class="site-header">
      <a class="brand" href="/" aria-label="Agenda IA Montpellier">
        <span class="brand-mark">IA</span>
        <span class="brand-text"><strong>Agenda IA</strong><small>Montpellier · Oreegami</small></span>
      </a>
      <nav class="site-nav" aria-label="Navigation principale">
        <button class="nav-link ${state.view === 'month' ? 'is-active' : ''}" data-act="view" data-view="month">Calendrier</button>
        <button class="nav-link ${state.view === 'list' ? 'is-active' : ''}" data-act="view" data-view="list">Évènements</button>
      </nav>
      <div class="header-actions">
        <button class="icon-btn" data-act="theme" title="Thème clair / sombre" aria-label="Changer de thème">${icon(state.theme === 'dark' ? 'sun' : 'moon')}</button>
        <button class="btn btn-ghost hide-sm" data-act="embed">${icon('code')}Intégrer</button>
        <button class="btn btn-ghost hide-sm" data-act="subscribe">${icon('calendar')}S’abonner</button>
        <button class="btn btn-primary" data-act="new-event">${icon('plus')}Proposer</button>
      </div>
    </header>

    <main>
      ${errorHtml()}
      ${heroHtml()}
      <section class="workspace">
        <div class="workspace-main">${state.view === 'month' ? calendarHtml() : listHtml()}</div>
        <aside class="workspace-side">${sideHtml()}</aside>
      </section>
    </main>

    ${footerHtml()}
  `;
}

function heroHtml() {
  const upcoming = upcomingEvents();
  const next = upcoming[0];
  return `
    <section class="hero">
      <div class="hero-copy">
        <span class="eyebrow">${icon('sparkles')} Oreegami · Montpellier</span>
        <h1>Les rendez-vous IA des étudiants</h1>
        <p>Ateliers, meetups, hackathons et conférences autour de l’intelligence artificielle à Montpellier. Propose un évènement en 30 secondes, ajoute-le à ton agenda en un clic.</p>
        <div class="hero-actions">
          <button class="btn btn-primary" data-act="new-event">${icon('plus')}Proposer un évènement</button>
          <button class="btn btn-soft" data-act="subscribe">${icon('calendar')}S’abonner à l’agenda</button>
        </div>
      </div>
      <div class="hero-stats">
        <div class="stat">
          <strong>${upcoming.length}</strong>
          <span>évènement${upcoming.length > 1 ? 's' : ''} à venir</span>
        </div>
        <div class="stat">
          <strong>${next ? formatShortDate(next.start.slice(0, 10)) : '—'}</strong>
          <span>${next ? `prochain : ${esc(next.title)}` : 'aucune date pour l’instant'}</span>
        </div>
      </div>
    </section>
  `;
}

function calendarHtml(compact = false) {
  return `
    <section class="panel calendar-panel ${compact ? 'is-compact' : ''}">
      <div class="panel-head">
        <div class="month-nav">
          <button class="icon-btn" data-act="month-prev" aria-label="Mois précédent">${icon('left')}</button>
          <h2>${esc(monthLabel(state.month))}</h2>
          <button class="icon-btn" data-act="month-next" aria-label="Mois suivant">${icon('right')}</button>
          <button class="btn btn-ghost btn-sm" data-act="today">Aujourd’hui</button>
        </div>
        ${categoryChipsHtml()}
      </div>
      <div class="weekdays">${['lun', 'mar', 'mer', 'jeu', 'ven', 'sam', 'dim'].map((day) => `<span>${day}</span>`).join('')}</div>
      <div class="month-grid">${monthDays(state.month).map(dayHtml).join('')}</div>
    </section>
  `;
}

function dayHtml(date) {
  const key = toKey(date);
  const inMonth = date.getMonth() === state.month.getMonth();
  const isToday = key === todayKey();
  const events = eventsForDay(key);
  const shown = events.slice(0, 3);

  return `
    <div class="day ${inMonth ? '' : 'is-out'} ${isToday ? 'is-today' : ''}" data-act="day" data-date="${key}">
      <div class="day-head">
        <span class="day-num">${date.getDate()}</span>
        <button class="day-add" data-act="new-event" data-date="${key}" title="Proposer un évènement ce jour" aria-label="Proposer un évènement le ${key}">${icon('plus')}</button>
      </div>
      <div class="day-events">
        ${shown
          .map(
            (event) => `<button class="event-chip ${categoryClass(event.category)}" data-act="open-event" data-id="${event.id}" title="${esc(event.title)}"><span class="dot"></span><span>${esc(shortTitle(event.title))}</span></button>`
          )
          .join('')}
        ${
          events.length > shown.length
            ? `<button class="more" data-act="day" data-date="${key}">+${events.length - shown.length} autre${events.length - shown.length > 1 ? 's' : ''}</button>`
            : ''
        }
      </div>
    </div>
  `;
}

function categoryChipsHtml() {
  const present = new Set(state.events.map((event) => event.category));
  const names = ['all', ...CATEGORY_NAMES.filter((name) => present.has(name))];
  return `<div class="chips">${names
    .map(
      (name) => `<button class="chip ${state.category === name ? 'is-active' : ''}" data-act="category" data-category="${name}">${name === 'all' ? 'Tous' : esc(name)}</button>`
    )
    .join('')}</div>`;
}

function listHtml() {
  const upcoming = upcomingEvents();
  const groups = groupByDay(upcoming);
  const past = pastEvents();

  return `
    <section class="panel list-panel">
      <div class="panel-head">
        <div>
          <h2>Évènements à venir</h2>
          <p class="panel-sub">${upcoming.length} rendez-vous${upcoming.length > 1 ? 's' : ''}${state.category !== 'all' ? ` · ${esc(state.category)}` : ''}</p>
        </div>
        ${categoryChipsHtml()}
      </div>
      <div class="list-body">
        ${
          groups.length
            ? groups
                .map(
                  ([key, events]) => `
                    <section class="day-group">
                      <h3 class="day-label">${esc(dayLabel(key))}</h3>
                      <div class="event-stack">${events.map((event) => eventCardHtml(event)).join('')}</div>
                    </section>`
                )
                .join('')
            : emptyHtml()
        }
        <div class="past-toggle">
          <button class="btn btn-ghost btn-sm" data-act="toggle-past">${state.showPast ? 'Masquer' : 'Afficher'} les évènements passés</button>
        </div>
        ${
          state.showPast
            ? `<section class="past-list">
                <h3 class="day-label">Passés</h3>
                ${
                  past.length
                    ? groupByDay(past, true)
                        .map(
                          ([key, events]) => `
                            <section class="day-group">
                              <h3 class="day-label">${esc(dayLabel(key))}</h3>
                              <div class="event-stack">${events.map((event) => eventCardHtml(event, { past: true })).join('')}</div>
                            </section>`
                        )
                        .join('')
                    : `<p class="muted">Aucun évènement passé.</p>`
                }
              </section>`
            : ''
        }
      </div>
    </section>
  `;
}

function eventCardHtml(event, { past = false } = {}) {
  const date = fromKey(event.start.slice(0, 10));
  return `
    <article class="event-card ${past ? 'is-past' : ''}">
      <div class="date-block">
        <span class="d">${date.getDate()}</span>
        <span class="m">${date.toLocaleDateString('fr-FR', { month: 'short' })}</span>
      </div>
      <div class="event-body">
        <div class="event-top">
          <span class="cat-chip ${categoryClass(event.category)}">${esc(event.category)}</span>
          <span class="time">${icon('clock')}${esc(formatTime(event))}</span>
        </div>
        <h3>${esc(event.title)}</h3>
        <div class="event-meta">
          ${event.location ? `<span>${icon('pin')}${esc(event.location)}</span>` : ''}
          ${event.organizer ? `<span>${icon('users')}${esc(event.organizer)}</span>` : ''}
        </div>
        ${event.description ? `<p>${esc(event.description)}</p>` : ''}
      </div>
      <div class="event-actions">
        <a class="btn btn-soft btn-sm" href="/events/${encodeURIComponent(event.id)}.ics" download title="Télécharger pour mon agenda">${icon('calendar')}.ics</a>
        <button class="btn btn-ghost btn-sm" data-act="open-event" data-id="${event.id}">Détails</button>
        ${
          state.adminToken
            ? `<button class="icon-btn" data-act="edit-event" data-id="${event.id}" title="Modifier">${icon('edit')}</button>
               <button class="icon-btn danger" data-act="delete-event" data-id="${event.id}" title="Supprimer">${icon('trash')}</button>`
            : ''
        }
      </div>
    </article>
  `;
}

function sideHtml() {
  const upcoming = upcomingEvents().slice(0, 5);
  const total = upcomingEvents().length;

  return `
    <div class="side-card">
      <div class="side-head"><h2>Prochains rendez-vous</h2><span class="side-count">${total}</span></div>
      ${upcoming.length ? upcoming.map(sideEventHtml).join('') : `<p class="muted small">Rien à l’horizon. Propose le premier évènement !</p>`}
      <a class="side-feed" href="/events.ics" download>${icon('download')}Tout ajouter à mon agenda</a>
    </div>
    <div class="side-card side-cta">
      <span class="side-emoji">${icon('sparkles')}</span>
      <h2>Une idée d’évènement ?</h2>
      <p>Un atelier, un meetup, une conférence IA à Montpellier ? Publie-le en 30 secondes.</p>
      <button class="btn btn-primary" data-act="new-event">${icon('plus')}Proposer</button>
    </div>
  `;
}

function sideEventHtml(event) {
  const date = fromKey(event.start.slice(0, 10));
  return `
    <button class="side-event" data-act="open-event" data-id="${event.id}">
      <span class="side-date"><b>${date.getDate()}</b><small>${date.toLocaleDateString('fr-FR', { month: 'short' })}</small></span>
      <span class="side-info">
        <strong>${esc(event.title)}</strong>
        <span>${esc(formatTime(event))}${event.location ? ` · ${esc(event.location)}` : ''}</span>
      </span>
    </button>
  `;
}

function footerHtml() {
  return `
    <footer class="site-footer">
      <span>Agenda IA Montpellier · Oreegami${state.config?.seed === 'demo' ? ' · données de démonstration' : ''}</span>
      <div class="footer-links">
        <a href="/events.ics" download>Flux .ics</a>
        <button data-act="subscribe">S’abonner</button>
        <button data-act="embed">Intégrer au CRM</button>
        <button data-act="admin">${state.adminToken ? 'Modération active' : 'Modération'}</button>
      </div>
    </footer>
  `;
}

/* ------------------------------- Embed -------------------------------- */

function embedHtml() {
  return `
    <header class="embed-header">
      <a class="brand small" href="/" target="_blank" rel="noopener" title="Ouvrir l’agenda complet">
        <span class="brand-mark">IA</span>
        <span class="brand-text"><strong>Agenda IA</strong><small>Montpellier · Oreegami</small></span>
      </a>
      <div class="header-actions">
        <button class="btn btn-primary btn-sm" data-act="new-event">${icon('plus')}Proposer</button>
        <a class="icon-btn" href="/" target="_blank" rel="noopener" title="Ouvrir l’agenda complet">${icon('external')}</a>
      </div>
    </header>
    ${errorHtml()}
    <div class="embed-body">
      <div class="embed-tabs">
        <button class="${state.view === 'list' ? 'is-active' : ''}" data-act="view" data-view="list">À venir</button>
        <button class="${state.view === 'month' ? 'is-active' : ''}" data-act="view" data-view="month">Calendrier</button>
        <button data-act="subscribe">S’abonner</button>
      </div>
      ${state.view === 'month' ? calendarHtml(true) : embedListHtml()}
      <div class="embed-foot">
        <a href="/events.ics" download>${icon('download')}Tout ajouter (.ics)</a>
        <button data-act="admin">${state.adminToken ? 'Modération active' : 'Modération'}</button>
      </div>
    </div>
  `;
}

function embedListHtml() {
  const upcoming = upcomingEvents().slice(0, 8);
  if (!upcoming.length) return `<div class="panel">${emptyHtml()}</div>`;
  return `<div class="panel embed-list">${upcoming.map((event) => eventCardHtml(event)).join('')}</div>`;
}

/* ------------------------------- Modales ------------------------------- */

function openModal(html, { wide = false } = {}) {
  const modal = $('#modal');
  modal.className = `modal ${wide ? 'modal-wide' : ''}`;
  modal.innerHTML = html;
  $('#modal-backdrop').hidden = false;
  document.body.classList.add('has-modal');
  setTimeout(() => {
    const first = $('#modal input:not([name="website"]), #modal textarea, #modal select, #modal button');
    first?.focus();
  }, 40);
}

function closeModal() {
  const backdrop = $('#modal-backdrop');
  if (!backdrop) return;
  backdrop.hidden = true;
  $('#modal').innerHTML = '';
  document.body.classList.remove('has-modal');
  state.editingId = null;
  if (location.hash.startsWith('#event-')) {
    history.replaceState(null, '', `${location.pathname}${location.search}`);
  }
}

function confirmModal(title, message, onConfirm, { label = 'Supprimer' } = {}) {
  openModal(`
    <div class="modal-head">
      <div><span class="eyebrow">Confirmation</span><h2>${esc(title)}</h2></div>
      <button type="button" class="icon-btn" data-act="modal-close" aria-label="Fermer">${icon('close')}</button>
    </div>
    <p class="form-sub">${esc(message)}</p>
    <div class="form-actions">
      <button type="button" class="btn btn-ghost" data-act="modal-close">Annuler</button>
      <button type="button" class="btn btn-danger" id="confirm-action">${icon('trash')}${esc(label)}</button>
    </div>
  `);

  $('#confirm-action').addEventListener('click', async (clickEvent) => {
    const button = clickEvent.currentTarget;
    button.disabled = true;
    try {
      await onConfirm();
    } catch (err) {
      button.disabled = false;
      toast(err.message, 'err', 5000);
    }
  });
}

function eventLink(id) {
  const base = state.config?.publicUrl || location.origin;
  return `${base}/#event-${encodeURIComponent(id)}`;
}

function openEvent(id) {
  const event = state.events.find((item) => item.id === id);
  if (!event) return;

  openModal(`
    <div class="modal-head">
      <div>
        <span class="cat-chip ${categoryClass(event.category)}">${esc(event.category)}</span>
        <h2 class="detail-title">${esc(event.title)}</h2>
      </div>
      <button type="button" class="icon-btn" data-act="modal-close" aria-label="Fermer">${icon('close')}</button>
    </div>
    <div class="detail-meta">
      <div>${icon('calendar')}<span>${esc(formatLongDate(event.start.slice(0, 10)))}</span></div>
      <div>${icon('clock')}<span>${esc(formatTime(event))}</span></div>
      ${event.location ? `<div>${icon('pin')}<span>${esc(event.location)}</span></div>` : ''}
      ${event.organizer ? `<div>${icon('users')}<span>${esc(event.organizer)}</span></div>` : ''}
    </div>
    ${event.description ? `<p class="detail-desc">${esc(event.description)}</p>` : ''}
    <div class="detail-actions">
      <a class="btn btn-primary" href="/events/${encodeURIComponent(event.id)}.ics" download>${icon('calendar')}Ajouter à mon agenda</a>
      ${event.url ? `<a class="btn" href="${esc(event.url)}" target="_blank" rel="noopener">${icon('external')}S’inscrire</a>` : ''}
      <button class="btn btn-ghost" data-act="copy" data-copy="${esc(eventLink(event.id))}">${icon('copy')}Copier le lien</button>
      ${
        state.adminToken
          ? `<button class="btn btn-ghost" data-act="edit-event" data-id="${event.id}">${icon('edit')}Modifier</button>
             <button class="btn btn-ghost danger" data-act="delete-event" data-id="${event.id}">${icon('trash')}Supprimer</button>`
          : ''
      }
    </div>
  `);

  history.replaceState(null, '', `#event-${encodeURIComponent(event.id)}`);
}

function openForm(id = null, { date = '' } = {}) {
  const event = id ? state.events.find((item) => item.id === id) : null;
  state.editingId = id;

  const dateValue = event ? event.start.slice(0, 10) : date || todayKey();
  const allDay = Boolean(event?.allDay);
  const startTime = event && !event.allDay ? event.start.slice(11, 16) : '18:00';
  const endTime = event && !event.allDay ? event.end.slice(11, 16) : '20:00';

  openModal(`
    <form id="event-form" class="event-form">
      <div class="modal-head">
        <div>
          <span class="eyebrow">${event ? 'Modifier' : 'Nouvel évènement'}</span>
          <h2>${event ? 'Modifier l’évènement' : 'Proposer un évènement'}</h2>
        </div>
        <button type="button" class="icon-btn" data-act="modal-close" aria-label="Fermer">${icon('close')}</button>
      </div>
      <p class="form-sub">Quelques champs suffisent. L’évènement apparaîtra immédiatement dans l’agenda partagé.</p>

      <div class="hp" aria-hidden="true">
        <label>Site web<input name="website" tabindex="-1" autocomplete="off"></label>
      </div>

      <label class="field">
        <span>Titre *</span>
        <input name="title" required maxlength="160" value="${esc(event?.title || '')}" placeholder="Atelier prompt engineering" />
      </label>

      <div class="form-row">
        <label class="field">
          <span>Date *</span>
          <input type="date" name="date" required value="${dateValue}" />
        </label>
        <label class="check"><input type="checkbox" name="allDay" ${allDay ? 'checked' : ''} /> Toute la journée</label>
      </div>

      <div class="form-row" id="time-fields" ${allDay ? 'hidden' : ''}>
        <label class="field"><span>Début</span><input type="time" name="startTime" value="${startTime}" /></label>
        <label class="field"><span>Fin</span><input type="time" name="endTime" value="${endTime}" /></label>
      </div>

      <div class="form-row">
        <label class="field">
          <span>Lieu</span>
          <input name="location" maxlength="200" value="${esc(event?.location || 'Montpellier')}" placeholder="Oreegami — Campus Port Marianne" />
        </label>
        <label class="field">
          <span>Catégorie</span>
          <select name="category">
            ${CATEGORY_NAMES.map((name) => `<option ${event?.category === name ? 'selected' : ''}>${esc(name)}</option>`).join('')}
          </select>
        </label>
      </div>

      <details class="more-fields" ${event && (event.description || event.url || event.organizer) ? 'open' : ''}>
        <summary>Détails complémentaires <span>(optionnel)</span></summary>

        <label class="field">
          <span>Description</span>
          <textarea name="description" rows="3" maxlength="2000" placeholder="Au programme, public visé, ce qu’il faut apporter…">${esc(event?.description || '')}</textarea>
        </label>

        <div class="form-row">
          <label class="field">
            <span>Lien d’inscription</span>
            <input type="url" name="url" maxlength="500" value="${esc(event?.url || '')}" placeholder="https://…" />
          </label>
          <label class="field">
            <span>Organisé par</span>
            <input name="organizer" maxlength="120" value="${esc(event?.organizer || '')}" placeholder="Oreegami, une asso, un étudiant…" />
          </label>
        </div>
      </details>

      <div class="form-actions">
        <button type="button" class="btn btn-ghost" data-act="modal-close">Annuler</button>
        <button class="btn btn-primary" type="submit">${event ? 'Enregistrer' : 'Publier l’évènement'}</button>
      </div>
    </form>
  `);

  syncTimeFields();
}

function syncTimeFields() {
  const form = $('#event-form');
  if (!form) return;
  const allDay = form.querySelector('[name="allDay"]')?.checked;
  const row = $('#time-fields', form);
  if (!row) return;
  row.hidden = Boolean(allDay);
  for (const input of $$('#time-fields input', form)) input.required = !allDay;
}

async function submitEventForm(form) {
  const editing = Boolean(state.editingId);
  const data = new FormData(form);
  const allDay = data.get('allDay') === 'on';
  const date = String(data.get('date') || '');
  const startTime = String(data.get('startTime') || '');
  const endTime = String(data.get('endTime') || '');

  if (!date) return toast('Choisis une date.', 'err');
  if (!allDay && !startTime) return toast('Choisis une heure de début.', 'err');
  if (!allDay && endTime && `${date}T${endTime}` <= `${date}T${startTime}`) {
    return toast('L’heure de fin doit être après le début.', 'err');
  }

  const payload = {
    title: String(data.get('title') || '').trim(),
    description: String(data.get('description') || '').trim(),
    location: String(data.get('location') || '').trim(),
    category: String(data.get('category') || 'Autre'),
    organizer: String(data.get('organizer') || '').trim(),
    url: String(data.get('url') || '').trim(),
    website: String(data.get('website') || ''),
    allDay,
    start: allDay ? `${date}T00:00` : `${date}T${startTime}`,
    end: allDay ? `${date}T23:59` : endTime ? `${date}T${endTime}` : '',
    source: EMBED ? 'embed' : 'web',
  };

  if (!payload.title) return toast('Le titre est obligatoire.', 'err');

  const submit = form.querySelector('button[type="submit"]');
  const originalLabel = submit.innerHTML;
  submit.disabled = true;
  submit.textContent = editing ? 'Enregistrement…' : 'Publication…';

  try {
    const result = await api(editing ? `/api/events/${encodeURIComponent(state.editingId)}` : '/api/events', {
      method: editing ? 'PATCH' : 'POST',
      body: payload,
      admin: editing,
    });

    const eventStart = result.event?.start || payload.start;
    state.month = startOfMonth(fromKey(eventStart.slice(0, 10)));
    closeModal();
    await load();
    toast(editing ? 'Évènement mis à jour' : 'Évènement publié');
  } catch (err) {
    submit.disabled = false;
    submit.innerHTML = originalLabel;
    toast(err.message, 'err', 5000);
  }
}

function openDay(key) {
  const events = eventsForDay(key);
  openModal(
    `
      <div class="modal-head">
        <div><span class="eyebrow">Journée</span><h2>${esc(formatLongDate(key))}</h2></div>
        <button type="button" class="icon-btn" data-act="modal-close" aria-label="Fermer">${icon('close')}</button>
      </div>
      <div class="event-stack day-modal-events">
        ${events.length ? events.map((event) => eventCardHtml(event)).join('') : `<p class="muted">Aucun évènement ce jour.</p>`}
      </div>
      <div class="form-actions">
        <button class="btn btn-primary" data-act="new-event" data-date="${key}">${icon('plus')}Proposer ce jour</button>
      </div>
    `,
    { wide: true }
  );
}

function openSubscribe() {
  const feed = state.config?.feedUrl || `${location.origin}/events.ics`;
  openModal(`
    <div class="modal-head">
      <div><span class="eyebrow">Flux iCalendar</span><h2>Ajouter l’agenda au vôtre</h2></div>
      <button type="button" class="icon-btn" data-act="modal-close" aria-label="Fermer">${icon('close')}</button>
    </div>
    <p class="form-sub">Abonnez-vous une fois : les nouveaux évènements arrivent automatiquement dans Google Agenda, Apple Calendar ou Outlook.</p>
    <div class="copy-row">
      <input class="input" readonly value="${esc(feed)}" aria-label="URL du flux iCalendar" />
      <button class="btn btn-primary" data-act="copy" data-copy="${esc(feed)}">${icon('copy')}Copier</button>
    </div>
    <div class="subscribe-actions">
      <a class="btn btn-soft" href="/events.ics" download>${icon('download')}Télécharger le fichier .ics</a>
    </div>
    <ol class="howto">
      <li><b>Google Agenda</b> : Autres agendas → S’abonner à un agenda → coller l’URL.</li>
      <li><b>Apple Calendar</b> : Fichier → Nouvel abonnement à un calendrier → coller l’URL.</li>
      <li><b>Outlook</b> : Ajouter un calendrier → S’abonner à partir du web → coller l’URL.</li>
    </ol>
    <p class="hint">Astuce : le bouton <b>.ics</b> de chaque évènement ajoute uniquement cet évènement.</p>
  `);
}

function openEmbed() {
  const source = state.config?.embedUrl || `${location.origin}/embed`;
  const snippet = `<iframe src="${source}" width="100%" height="640" style="border:0;border-radius:16px;max-width:100%" title="Agenda IA Montpellier — Oreegami" loading="lazy"></iframe>`;
  openModal(
    `
      <div class="modal-head">
        <div><span class="eyebrow">Intégration CRM</span><h2>Intégrer l’agenda</h2></div>
        <button type="button" class="icon-btn" data-act="modal-close" aria-label="Fermer">${icon('close')}</button>
      </div>
      <p class="form-sub">Collez ce code dans une page, un article ou un bloc HTML de votre CRM.</p>
      <pre class="code">${esc(snippet)}</pre>
      <div class="form-actions">
        <button class="btn btn-primary" data-act="copy" data-copy="${esc(snippet)}">${icon('copy')}Copier le code</button>
      </div>
      <p class="hint">La page <code>/embed</code> est autonome et se met à jour avec l’agenda. Pour restreindre les domaines autorisés, configurez <code>AGENDA_EMBED_ORIGINS</code>.</p>
    `,
    { wide: true }
  );
}

function openAdmin() {
  if (state.adminToken) {
    openModal(`
      <div class="modal-head">
        <div><span class="eyebrow">Modération</span><h2>Mode modération actif</h2></div>
        <button type="button" class="icon-btn" data-act="modal-close" aria-label="Fermer">${icon('close')}</button>
      </div>
      <p class="form-sub">Vous pouvez modifier ou supprimer n’importe quel évènement depuis les fiches et la liste.</p>
      <div class="form-actions">
        <button class="btn btn-ghost" data-act="modal-close">Fermer</button>
        <button class="btn btn-danger" data-act="admin-logout">${icon('close')}Quitter la modération</button>
      </div>
    `);
    return;
  }

  openModal(`
    <form id="admin-form">
      <div class="modal-head">
        <div><span class="eyebrow">Modération</span><h2>Déverrouiller</h2></div>
        <button type="button" class="icon-btn" data-act="modal-close" aria-label="Fermer">${icon('close')}</button>
      </div>
      <p class="form-sub">Saisissez le jeton de modération (variable <code>AGENDA_ADMIN_TOKEN</code>) pour modifier ou supprimer des évènements.</p>
      <label class="field">
        <span>Jeton</span>
        <input type="password" name="token" required autocomplete="current-password" placeholder="••••••••••••" />
      </label>
      <div class="form-actions">
        <button type="button" class="btn btn-ghost" data-act="modal-close">Annuler</button>
        <button class="btn btn-primary" type="submit">${icon('lock')}Déverrouiller</button>
      </div>
    </form>
  `);
}

async function submitAdmin(form) {
  const token = String(new FormData(form).get('token') || '').trim();
  if (!token) return;

  const submit = form.querySelector('button[type="submit"]');
  submit.disabled = true;

  try {
    await api('/api/admin/check', { method: 'POST', body: {}, token });
    state.adminToken = token;
    sessionStorage.setItem(ADMIN_KEY, token);
    closeModal();
    render();
    toast('Mode modération activé');
  } catch (err) {
    submit.disabled = false;
    toast(err.message, 'err', 5000);
  }
}

function deleteEvent(id) {
  const event = state.events.find((item) => item.id === id);
  if (!event) return;

  confirmModal(
    'Supprimer cet évènement ?',
    `« ${event.title} » sera retiré de l’agenda et du flux .ics.`,
    async () => {
      await api(`/api/events/${encodeURIComponent(id)}`, { method: 'DELETE', admin: true });
      closeModal();
      await load();
      toast('Évènement supprimé');
    }
  );
}

/* ------------------------------- Toasts ------------------------------- */

function toast(message, type = 'ok', ms = 3200) {
  const host = $('#toasts');
  if (!host) return;
  const element = document.createElement('div');
  element.className = `toast ${type}`;
  element.innerHTML = `${icon(type === 'err' ? 'warn' : 'check')}<span>${esc(message)}</span>`;
  host.appendChild(element);
  setTimeout(() => {
    element.classList.add('is-hiding');
    setTimeout(() => element.remove(), 220);
  }, ms);
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    toast('Copié dans le presse-papiers');
    return;
  } catch {
    /* navigateur sans API clipboard */
  }

  const area = document.createElement('textarea');
  area.value = text;
  area.className = 'copy-fallback';
  document.body.appendChild(area);
  area.select();
  try {
    document.execCommand('copy');
    toast('Copié dans le presse-papiers');
  } catch {
    toast('Impossible de copier. Sélectionnez le texte manuellement.', 'err');
  }
  area.remove();
}

/* ------------------------------- Thème ------------------------------- */

function initTheme() {
  const param = new URLSearchParams(location.search).get('theme');
  const stored = localStorage.getItem(THEME_KEY);
  const prefersDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches;
  state.theme =
    param === 'dark' || param === 'light'
      ? param
      : stored === 'dark' || stored === 'light'
        ? stored
        : prefersDark
          ? 'dark'
          : 'light';
  document.documentElement.dataset.theme = state.theme;
}

function toggleTheme() {
  state.theme = state.theme === 'dark' ? 'light' : 'dark';
  localStorage.setItem(THEME_KEY, state.theme);
  render();
}

/* ----------------------------- Interactions ----------------------------- */

document.addEventListener('click', async (event) => {
  if (event.target.id === 'modal-backdrop') {
    closeModal();
    return;
  }

  const element = event.target.closest('[data-act]');
  if (!element) return;

  const action = element.dataset.act;
  const id = element.dataset.id;

  switch (action) {
    case 'view':
      state.view = element.dataset.view === 'month' ? 'month' : 'list';
      render();
      break;
    case 'month-prev':
      state.month = addMonths(state.month, -1);
      render();
      break;
    case 'month-next':
      state.month = addMonths(state.month, 1);
      render();
      break;
    case 'today':
      state.month = startOfMonth(new Date());
      state.view = 'month';
      render();
      break;
    case 'category':
      state.category = element.dataset.category || 'all';
      render();
      break;
    case 'toggle-past':
      state.showPast = !state.showPast;
      render();
      break;
    case 'open-event':
      openEvent(id);
      break;
    case 'new-event':
      openForm(null, { date: element.dataset.date || '' });
      break;
    case 'edit-event':
      openForm(id);
      break;
    case 'delete-event':
      deleteEvent(id);
      break;
    case 'day':
      openDay(element.dataset.date);
      break;
    case 'subscribe':
      openSubscribe();
      break;
    case 'embed':
      openEmbed();
      break;
    case 'admin':
      openAdmin();
      break;
    case 'admin-logout':
      state.adminToken = '';
      sessionStorage.removeItem(ADMIN_KEY);
      closeModal();
      render();
      toast('Mode modération désactivé');
      break;
    case 'modal-close':
      closeModal();
      break;
    case 'copy':
      copyText(element.dataset.copy || '');
      break;
    case 'theme':
      toggleTheme();
      break;
    case 'reload':
      load();
      break;
    default:
      break;
  }
});

document.addEventListener('submit', async (event) => {
  if (event.target.id === 'event-form') {
    event.preventDefault();
    await submitEventForm(event.target);
  } else if (event.target.id === 'admin-form') {
    event.preventDefault();
    await submitAdmin(event.target);
  }
});

document.addEventListener('change', (event) => {
  if (event.target.matches('#event-form [name="allDay"]')) syncTimeFields();
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !$('#modal-backdrop')?.hidden) closeModal();
});

/* ---------------------------- Liens profonds ---------------------------- */

function openHashEvent() {
  const match = location.hash.match(/^#event-(.+)$/);
  if (!match) return;
  let id;
  try {
    id = decodeURIComponent(match[1]);
  } catch {
    return;
  }
  if (state.events.some((event) => event.id === id)) openEvent(id);
}

window.addEventListener('hashchange', openHashEvent);

/* --------------------------- Mise à jour auto --------------------------- */

async function refreshEvents() {
  if (document.hidden || !$('#modal-backdrop')?.hidden) return;
  try {
    const data = await api('/api/events');
    if (!Array.isArray(data.events)) return;
    if (JSON.stringify(data.events) === JSON.stringify(state.events)) return;
    state.events = data.events;
    const scrollY = window.scrollY;
    render();
    window.scrollTo({ top: scrollY });
  } catch {
    /* réseau momentanément indisponible : nouvel essai au prochain tick */
  }
}

window.addEventListener('visibilitychange', () => {
  if (!document.hidden) refreshEvents();
});
setInterval(refreshEvents, 30000);

/* ------------------------------- Démarrage ------------------------------- */

initTheme();
render();
await load();
openHashEvent();
