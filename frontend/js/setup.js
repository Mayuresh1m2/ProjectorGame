// Projector setup helper: coverage calculator, full-screen test pattern, display-to-camera latency test.
import { Link, api } from './core/ws.js';
import { imageSize, totalEstimate, feel } from './core/projector.js';

const $ = (id) => document.getElementById(id);
const fmt = (m) => (m >= 1 ? `${m.toFixed(2)} m` : `${Math.round(m * 100)} cm`);

// ---- status ----
let camera = { state: 'idle', fps: 0 };
new Link((m) => {
  if (m.type !== 'stats') return;
  camera = m.camera;
  $('l-cam').textContent = camera.state === 'connected' ? `streaming ${camera.width}×${camera.height}` : camera.state;
  $('l-fps').textContent = camera.state === 'connected' ? `${camera.fps} fps` : '–';
}, (ok) => { $('srv').textContent = ok ? 'server online' : 'server offline'; $('srv').className = 'pill ' + (ok ? 'ok' : 'bad'); });

// ---- coverage calculator ----
function calc() {
  const s = imageSize(parseFloat($('c-throw').value), parseFloat($('c-dist').value), $('c-aspect').value);
  $('c-w').textContent = s ? fmt(s.width) : '–';
  $('c-h').textContent = s ? fmt(s.height) : '–';
  $('c-d').textContent = s ? `${(s.diagonal * 39.37).toFixed(0)} in (${fmt(s.diagonal)})` : '–';
  $('c-i').textContent = s ? fmt(s.minIcon) : '–';
}
['c-throw', 'c-dist', 'c-aspect'].forEach((id) => $(id).addEventListener('input', calc));
calc();

// ---- full-screen stage (pattern + flashes) ----
const stage = $('stage'), cv = $('pattern');
let abort = null;

async function openStage() {
  stage.className = '';
  try { await stage.requestFullscreen?.(); } catch { /* fullscreen refused: the overlay still covers the window */ }
}
function closeStage() {
  stage.className = 'hidden';
  if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
  abort?.(); abort = null;
}
document.addEventListener('fullscreenchange', () => { if (!document.fullscreenElement && !stage.classList.contains('hidden') && !abort) closeStage(); });
addEventListener('keydown', (e) => { if (e.key === 'Escape' && !stage.classList.contains('hidden')) closeStage(); });
stage.addEventListener('click', () => { if (!abort) closeStage(); });

function drawPattern() {
  const dpr = devicePixelRatio || 1, W = cv.width = Math.round(innerWidth * dpr), H = cv.height = Math.round(innerHeight * dpr);
  const g = cv.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
  g.strokeStyle = '#2a2a2a'; g.lineWidth = 1;
  const cols = 16, step = W / cols;
  for (let i = 0; i <= cols; i++) { g.beginPath(); g.moveTo(i * step, 0); g.lineTo(i * step, H); g.stroke(); }
  for (let y = 0; y <= H; y += step) { g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }
  g.strokeStyle = '#fff'; g.lineWidth = 6; g.strokeRect(3, 3, W - 6, H - 6);                        // full picture
  g.strokeStyle = '#ffc94d'; g.lineWidth = 3; g.setLineDash([18, 12]);
  g.strokeRect(W * .05, H * .05, W * .9, H * .9); g.setLineDash([]);                               // 90% safe area
  g.strokeStyle = '#7ee8c0'; g.lineWidth = 4; g.beginPath(); g.arc(W / 2, H / 2, H * .3, 0, Math.PI * 2); g.stroke(); // should be round
  g.beginPath(); g.moveTo(W / 2, 0); g.lineTo(W / 2, H); g.moveTo(0, H / 2); g.lineTo(W, H / 2); g.stroke();
  const bars = ['#fff', '#ffe14d', '#4de3ff', '#6bff6b', '#ff5ce1', '#ff4d4d', '#4d6bff', '#000'];       // colour bars
  const bw = W * .5 / bars.length, by = H * .6;
  bars.forEach((c, i) => { g.fillStyle = c; g.fillRect(W * .25 + i * bw, by, bw, H * .09); });
  for (let i = 0; i < 16; i++) { g.fillStyle = `rgb(${i * 17},${i * 17},${i * 17})`; g.fillRect(W * .25 + i * W * .5 / 16, by + H * .1, W * .5 / 16, H * .06); } // grey ramp
  g.fillStyle = '#fff'; g.textAlign = 'center';
  g.font = `700 ${H * .08}px system-ui`; g.fillText('Projector test', W / 2, H * .24);
  g.font = `600 ${H * .035}px system-ui`; g.fillText(`${innerWidth}×${innerHeight} px window · white border = whole picture · dashed = 90% safe area`, W / 2, H * .32);
  g.fillStyle = '#ffc94d';
  [[.1, 'Aa 10% of height'], [.05, 'Aa 5%'], [.03, 'Aa 3% (small text)'], [.02, 'Aa 2% (too small for kids)']].reduce((y, [f, t]) => { g.font = `700 ${H * f}px system-ui`; g.fillText(t, W / 2, y); return y + H * f * 1.15; }, H * .44);
  g.fillStyle = '#fff'; g.font = `600 ${H * .03}px system-ui`;
  g.textAlign = 'left'; g.fillText('◤ top-left', W * .02, H * .08); g.textAlign = 'right'; g.fillText('top-right ◥', W * .98, H * .08);
  g.textAlign = 'left'; g.fillText('◣ bottom-left', W * .02, H * .96); g.textAlign = 'right'; g.fillText('bottom-right ◢', W * .98, H * .96);
  $('stage-msg').textContent = 'Esc or click to close';
}
$('b-pattern').addEventListener('click', async () => { await openStage(); drawPattern(); });
addEventListener('resize', () => { if (!stage.classList.contains('hidden') && !abort) drawPattern(); });

// ---- latency test ----
const nowS = () => (performance.timeOrigin + performance.now()) / 1000;   // wall-clock seconds, same clock as the server's time.time()
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const frame = () => new Promise((r) => requestAnimationFrame(r));

async function runLatency() {
  const res = $('l-result');
  if (camera.state !== 'connected') {
    res.className = 'result warn'; res.textContent = 'The camera is not streaming. Start the iPhone camera first (Control panel → Camera).'; return;
  }
  const flashes = [], N = 8;
  let stopped = false;
  abort = () => { stopped = true; };
  res.className = 'result hidden';
  try { await api('/api/latency/arm', 'POST', { seconds: 40 }); } catch (e) { res.className = 'result warn'; res.textContent = 'Could not start: ' + e.message; abort = null; return; }
  await openStage();
  stage.className = 'dark'; $('stage-msg').textContent = '';
  await sleep(1200);
  for (let i = 0; i < N && !stopped; i++) {
    stage.className = 'flash';
    await frame();                      // the callback runs just before the frame that paints white
    flashes.push(nowS());
    await sleep(900);
    stage.className = 'dark';
    await sleep(1400 + Math.random() * 800);
  }
  const done = !stopped;
  abort = null; closeStage();
  if (!done) { res.className = 'result warn'; res.textContent = 'Stopped.'; return; }
  try { showResult(await api('/api/latency/analyze', 'POST', { flashes }), res); }
  catch (e) { res.className = 'result warn'; res.textContent = 'Could not analyse: ' + e.message; }
}

function showResult(r, el) {
  el.replaceChildren();
  const add = (html) => { const d = document.createElement('div'); d.innerHTML = html; el.append(d); };
  if (r.medianMs == null) {
    el.className = 'result warn';
    add('<b>No usable measurement.</b> The camera did not see the flash. Aim the phone at the lit wall, dim the room, and make sure the projector is on.');
  } else {
    el.className = 'result';
    const t = totalEstimate(r);
    add(`<b class="big">${Math.round(r.medianMs)} ms</b> median from flash on the projector to the camera frame reaching the laptop (${r.valid} of ${r.total} flashes usable, range ${Math.round(r.minMs)}–${Math.round(r.maxMs)} ms)`);
    if (t && t.totalMs != null) add(`Plus ${t.trackingMs} ms tracking (live stat) ≈ <b>${t.totalMs} ms</b> from movement to a reaction being ready – ${feel(t.totalMs)}.`);
    else add('Tracking time is not available yet (no frames processed); add about 25 ms for hand tracking.');
    add('<span class="small">Excludes drawing on screen (about 24 ms measured earlier) and the projector delay of the final picture only to the extent the flash shows it; accurate to about one camera frame.</span>');
  }
  const rows = r.trials.map((t, i) => `<tr><td>Flash ${i + 1}</td><td>${t.ok ? Math.round(t.ms) + ' ms' : 'skipped – ' + t.reason}</td></tr>`).join('');
  add(`<table>${rows}</table>`);
}
$('b-latency').addEventListener('click', runLatency);
