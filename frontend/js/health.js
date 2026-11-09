// Health tab + header pill: renders /ws "health" messages and the event log.
import { app } from './core/app.js';
import { api } from './core/ws.js';

const $ = (id) => document.getElementById(id);
const ICON = { ok: '✅', info: 'ℹ️', warn: '⚠️', fail: '❌' };
const LABEL = { ok: 'all good', degraded: 'degraded', down: 'problem' };
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export function renderChecks(report) {
  return report.checks.map((c) => `<div class="check ${c.status}"><span class="ic">${ICON[c.status]}</span><b>${esc(c.message)}</b>${c.hint && c.status !== 'ok' ? `<span class="hint">${esc(c.hint)}</span>` : ''}</div>`).join('');
}

let lastId = 0, events = [], hideBefore = 0;
function renderEvents() {
  const showInfo = $('h-info').checked;
  const rows = events.filter((e) => e.id > hideBefore && (showInfo || e.level !== 'info')).slice(-150).reverse();
  $('h-events').innerHTML = rows.map((e) => `<div class="${e.level}"><span class="t">${new Date(e.t * 1000).toLocaleTimeString()}</span>[${esc(e.source)}] ${esc(e.message)}</div>`).join('') || '<div class="small">Nothing yet.</div>';
}
async function pollEvents() {
  try { const r = await api(`/api/events?after=${lastId}`); if (r.events.length) { events = events.concat(r.events).slice(-500); lastId = events[events.length - 1].id; renderEvents(); } } catch { /* server restarting */ }
}

export function initHealth() {
  app.on('health', (h) => {
    const pill = $('health-pill');
    pill.textContent = `health: ${LABEL[h.status] || h.status}`;
    pill.className = 'pill ' + (h.status === 'ok' ? 'ok' : h.status === 'degraded' ? 'warn' : 'bad');
    $('h-checks').innerHTML = renderChecks(h);
  });
  $('health-pill').onclick = () => document.querySelector('#tabs button[data-tab="health"]').click();
  $('h-clear').onclick = () => { hideBefore = lastId; renderEvents(); };
  $('h-info').onchange = renderEvents;
  pollEvents(); setInterval(pollEvents, 2000);
}
