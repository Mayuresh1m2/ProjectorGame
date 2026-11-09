// Control panel shell: tabs, connection info, live status, camera preview, tracking settings.
import { app, link } from './core/app.js';
import { api } from './core/ws.js';
import { initCalibration } from './calibration.js';
import { initProjection } from './projection.js';
import { initLayout, initPresets } from './media.js';
import { drawPreview } from './core/preview.js';
import { initHealth } from './health.js';
import { initQuest } from './quest.js';

const $ = (id) => document.getElementById(id);

// ---------- tabs ----------
let tab = 'connect';
function showTab(name) {
  tab = name;
  document.querySelectorAll('#tabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === name));
  document.querySelectorAll('.tab').forEach((s) => s.classList.toggle('hidden', s.id !== `tab-${name}`));
  app.emit('tab', name);
  try { sessionStorage.setItem('bp.tab', name); } catch { /* ignore */ }
}
document.querySelectorAll('#tabs button').forEach((b) => (b.onclick = () => showTab(b.dataset.tab)));
app.on('server', (up) => { $('srv').textContent = up ? 'server connected' : 'server offline'; $('srv').className = 'pill ' + (up ? 'ok' : 'bad'); });

// ---------- connection info (QR + links) ----------
async function loadInfo() {
  try {
    const info = await api('/api/info');
    app.info = info; app.emit('info', info);
    $('qr').innerHTML = info.qrSvg || '';
    $('urls').innerHTML = info.cameraUrls.map((u) => `<a href="${u}" target="_blank">${u.replace(/\?k=.*/, '?k=…')}</a>`).join('') + (info.cameraUrls[0] ? `<button class="sm" id="copy">Copy full link</button>` : '');
    $('dqr').innerHTML = info.displayQrSvg || '';
    $('durls').innerHTML = (info.displayUrls || []).map((u) => `<a href="${u}" target="_blank">${u.replace(/\?d=.*/, '?d=…')}</a>`).join('') || '<span class="small">No Wi-Fi address found, or HTTPS is disabled.</span>';
    const copy = $('copy'); if (copy) copy.onclick = () => navigator.clipboard?.writeText(info.cameraUrls[0]).then(() => (copy.textContent = 'Copied!'));
    $('https-note').textContent = info.httpsEnabled ? (info.ips.length ? '' : 'No Wi-Fi address found – is this laptop connected to your network?') : 'HTTPS is disabled (PLAYGROUND_HTTPS=0): the iPhone camera will NOT work.';
  } catch (e) { $('https-note').textContent = 'Cannot reach the server: ' + e.message; }
}

$('d-revoke').onclick = async () => {
  try { await api('/api/display/reset', 'POST'); $('d-msg').textContent = 'All displays disconnected. Scan the new QR code to pair again.'; await loadInfo(); } catch (e) { $('d-msg').textContent = e.message; }
};

// ---------- status ----------
const fmt = (v, unit = '') => (v === undefined || v === null ? '–' : v + unit);
app.on('stats', (s) => {
  const c = s.camera, t = s.tracking;
  const label = { idle: 'not connected', connecting: 'connecting…', connected: '● streaming', disconnected: 'disconnected', failed: 'failed' }[c.state] || c.state;
  $('s-cam').textContent = label + (c.width ? `  ${c.width}×${c.height}` : '');
  $('s-camfps').textContent = fmt(c.fps, ' fps');
  $('s-trkfps').textContent = fmt(t.fps, ' fps');
  $('s-proc').textContent = fmt(t.procMs, ' ms');
  $('s-lat').textContent = fmt(t.latencyMs, ' ms');
  $('s-hands').textContent = fmt(t.hands);
  $('s-level').textContent = `${t.level} ${['(full model)', '(fast model)', '(fast, 480px)', '(fast, 320px)'][t.level] || ''}`;
  $('s-cal').textContent = s.calibrated ? 'calibrated' : 'not calibrated (camera fills screen)';
  $('preview-note').textContent = c.state === 'connected' ? '' : 'Waiting for the iPhone camera…';
});
$('btn-stopcam').onclick = async () => { await api('/api/camera/stop', 'POST', {}); };

// ---------- preview polling (only while a tab that shows it is visible) ----------
let polling = false;
async function pollPreview() {
  if (polling) return; polling = true;
  while (tab === 'connect' || tab === 'calibrate' || tab === 'quest') {
    try {
      const r = await fetch('/api/preview.jpg', { cache: 'no-store' });
      if (r.status === 200) { app.preview = await createImageBitmap(await r.blob()); app.emit('preview', app.preview); }
    } catch { /* server restarting */ }
    await new Promise((res) => setTimeout(res, 110));
  }
  polling = false;
}
app.on('tab', (t) => { if (t === 'connect' || t === 'calibrate' || t === 'quest') pollPreview(); });

app.on('preview', () => {
  if (tab === 'connect') drawPreview($('preview'), { rotation: app.calibration?.rotation || 0, mirror: !!app.calibration?.mirror });
});

// ---------- tracking settings ----------
const TRK = [['maxHands', 'Max hands', 1, 4, 1], ['minCutoff', 'Smoothing (min cutoff)', 0.1, 5, 0.1], ['beta', 'Speed gain (beta)', 0, 40, 1],
  ['holdMs', 'Keep lost hand (ms)', 0, 2000, 50], ['minConfidence', 'Min confidence', 0.2, 0.95, 0.05], ['targetFps', 'Target tracking fps', 10, 60, 5],
  ['maxDegrade', 'Lowest quality auto may use (1 = keep far hands)', 0, 3, 1]];
function buildTracking() {
  const t = app.settings?.tracking; if (!t) return;
  $('trk-form').innerHTML = TRK.map(([k, l, a, b, s]) => `<label>${l}<span><input type="range" id="trk-${k}" min="${a}" max="${b}" step="${s}" value="${t[k]}"> <output id="o-${k}">${t[k]}</output></span></label>`).join('');
  TRK.forEach(([k]) => ($(`trk-${k}`).oninput = (e) => ($(`o-${k}`).textContent = e.target.value)));
}
$('trk-save').onclick = async () => {
  const tracking = {}; TRK.forEach(([k]) => (tracking[k] = +$(`trk-${k}`).value));
  try { await api('/api/settings', 'PUT', { tracking }); $('trk-save').textContent = 'Saved ✓'; setTimeout(() => ($('trk-save').textContent = 'Save'), 1500); } catch (e) { alert(e.message); }
};
app.on('settings', buildTracking);
let sim = 0;
$('t-sim').onclick = () => { sim = (sim + 1) % 3; $('t-sim-n').textContent = sim; app.command('sim', { n: sim }); };
$('t-debug').onclick = () => { app.dbg = !app.dbg; app.command('debug', { on: app.dbg }); };
$('t-restart').onclick = () => app.command('restart');

initCalibration(); initProjection(); initLayout(); initPresets(); initHealth(); initQuest();
loadInfo();
try { showTab(location.hash === '#health' ? 'health' : sessionStorage.getItem('bp.tab') || 'connect'); } catch { showTab('connect'); }
