// Game/projector output page: stage sizing, input, scene rendering, HUD, calibration targets, statistics.
import { SceneRenderer } from './core/scene.js';
import { InputManager } from './core/input.js';
import { Audio } from './core/audio.js';
import { Perf } from './core/perf.js';
import { Link, api } from './core/ws.js';
import { MicMonitor } from './core/cues.js';
import { DEFAULT_SETTINGS, DEFAULT_SCENE } from './core/defaults.js';
import { REGISTRY } from './games/index.js';

const $ = (id) => document.getElementById(id);
const q = new URLSearchParams(location.search);
const stage = $('stage');

let settings = structuredClone(DEFAULT_SETTINGS);
try { Object.assign(settings.game, JSON.parse(localStorage.getItem('bp.game') || '{}')); } catch { /* storage unavailable */ }
let scene = structuredClone(DEFAULT_SCENE);
let serverUp = false, gotScene = false, stats = null, questCfg = null;
const forced = q.get('game'); // ?game=butterfly overrides the first surface locally (not saved)
// One full-wall surface for a game (used when a game or the menu is asked for on a multi-surface layout: a small tile is no place for a menu)
const fullWall = (game) => ({ ...structuredClone(scene), surfaces: [{ id: 'main', name: 'Main wall', visible: true, content: { type: 'game', game },
  quad: [[0, 0], [1, 0], [1, 1], [0, 1]], shape: 'rect', polygon: [], interactive: true }] });
const applyForced = (sc) => {
  if (forced && REGISTRY[forced] && !applyForced.done) {
    const vis = sc.surfaces.filter((x) => x.visible !== false);
    if (vis.length === 1 && vis[0].content.type === 'game') { sc = structuredClone(sc); vis[0] = sc.surfaces.find((x) => x.id === vis[0].id); vis[0].content = { type: 'game', game: forced }; }
    else sc = fullWall(forced);
  }
  return sc;
};

const audio = new Audio();
const perf = new Perf();
const input = new InputManager(stage);
const renderer = new SceneRenderer($('scene'), {
  settings: () => settings, audio, perf, quest: () => questCfg,
  onSelect: (surfaceId, gameId) => setSurfaceContent(surfaceId, { type: 'game', game: gameId }),
  onSoundBlocked: () => toast('Click anywhere to turn video sound on'),
  onActivity: (name, kind) => link.send({ type: 'activity', name, kind }),
});

// ---------- stage size (fill window, or a fixed logical resolution scaled to fit) ----------
function layoutStage() {
  const o = { ...settings.output };
  if (q.get('w') && q.get('h')) { o.mode = 'fixed'; o.width = +q.get('w'); o.height = +q.get('h'); }
  const iw = innerWidth, ih = innerHeight;
  let W = iw, H = ih;
  if (o.mode === 'fixed') {
    W = o.width; H = o.height;
    const sx = o.fit === 'stretch' ? iw / W : Math.min(iw / W, ih / H), sy = o.fit === 'stretch' ? ih / H : sx;
    stage.style.width = W + 'px'; stage.style.height = H + 'px';
    stage.style.transform = `translate(${(iw - W * sx) / 2}px, ${(ih - H * sy) / 2}px) scale(${sx}, ${sy})`;
  } else { stage.style.width = iw + 'px'; stage.style.height = ih + 'px'; stage.style.transform = 'none'; }
  renderer.setSize(W, H);
  link.send({ type: 'command', cmd: 'output-size', w: W, h: H });
}
addEventListener('resize', layoutStage);

// ---------- server link ----------
const link = new Link((m) => {
  switch (m.type) {
    case 'hands': input.setCameraHands(m); lastHandsMsg = m; trackLatency(m); break;
    case 'stats': stats = m; break;
    case 'health': onHealth(m); break;
    case 'cue': onCue(m.name); break;
    case 'zone': renderer.broadcast({ type: 'zone', zone: m.zone, reward: m.reward, trigger: m.trigger }); break;
    case 'quest': questCfg = m.quest; renderer.broadcast({ type: 'quest-config', quest: m.quest }); break;
    case 'settings': mergeSettings(m.settings); break;
    case 'scene': gotScene = true; scene = m.scene; renderer.setScene(applyForced(scene)); applyForced.done = true; break;
    case 'calibration': break;
    case 'command': onCommand(m); break;
  }
}, (up) => { serverUp = up; if (up) layoutStage(); showBanner(); });
// Cues (someone arrived, fist-open gesture, clap) are forwarded to every game; games decide what they mean.
let lastCue = '';
function onCue(name) { lastCue = name; renderer.broadcast({ type: 'cue', name }); }
const mic = new MicMonitor(() => { onCue('clap'); link.send({ type: 'cue', name: 'clap' }); }, (on) => { $('b-mic').classList.toggle('on', on); $('mic-ind').classList.toggle('hidden', !on); });
$('b-mic').onclick = async () => { if (mic.on) { mic.stop(); return; } try { await mic.start(); } catch (e) { toast(e.name === 'NotAllowedError' ? 'Microphone permission was denied' : 'Microphone unavailable: ' + e.message, 4000); } };

// Failure visibility on the wall: a health dot in the HUD, and a banner only for problems a parent should notice.
let health = null;
function onHealth(h) {
  health = h;
  const dot = $('b-health'); dot.className = h.status;
  const bad = h.checks.filter((c) => c.status === 'warn' || c.status === 'fail');
  dot.title = `Health: ${h.status}` + bad.map((c) => `\n• ${c.message}`).join('');
  showBanner();
}
function showBanner() {
  const b = $('banner'); let msg = '';
  if (!serverUp && link.everUp) msg = 'Lost connection to the game server – hands will not move until it is back';
  else if (health) { const cam = health.checks.find((c) => c.id === 'camera'); if (cam?.status === 'fail') msg = cam.message; }
  b.textContent = msg; b.classList.toggle('hidden', !msg);
}
setInterval(() => link.send({ type: 'report', role: 'display', fps: Math.round(perf.fps), hidden: document.hidden }), 2000);
let lastHandsMsg = null; const lat = [];
function trackLatency(m) { if (!m.t_frame) return; lat.push(Date.now() / 1000 - m.t_frame); if (lat.length > 30) lat.shift(); }

function mergeSettings(s) {
  settings = { ...settings, ...s, game: { ...settings.game, ...s.game }, output: { ...settings.output, ...s.output } };
  audio.enabled = settings.game.sound;
  $('b-sound').textContent = audio.enabled ? '🔊' : '🔇';
  renderer.setSettings(); layoutStage();
  if (!$('settings').classList.contains('hidden')) buildSettings();
}

function onCommand(m) {
  if (m.cmd === 'calib') showCalib(m);
  else if (m.cmd === 'game') setSurfaceContent(m.surface, { type: 'game', game: m.game });
  else if (m.cmd === 'restart') primaryGame()?.restart();
  else if (m.cmd === 'sim') setSim(m.n);
  else if (m.cmd === 'debug') setDebug(!!m.on);
  else if (m.cmd === 'hello') layoutStage();
  else if (m.cmd === 'reward-test') renderer.broadcast({ type: 'reward-test', reward: m.reward });
  else if (m.cmd === 'grid') showGrid(!!m.on);
  else if (m.cmd === 'align') renderer.setAlign(!!m.on);
}

function setSurfaceContent(id, content) {
  let sc = structuredClone(scene);
  if (content.type === 'game' && sc.surfaces.filter((x) => x.visible !== false).length > 1) sc = fullWall(content.game); // not saved
  else { const s = sc.surfaces.find((x) => x.id === id) || sc.surfaces[0]; if (!s) return; s.content = content; }
  scene = sc; applyForced.done = true;
  renderer.setScene(scene); // picking a game from the menu is per-session; the layout editor is what saves scenes
}

// fall back to a local scene when no server answers (plain static use)
setTimeout(() => { if (!gotScene) { renderer.setScene(applyForced(scene)); applyForced.done = true; } }, 1200);

// ---------- HUD / overlay ----------
const primaryGame = () => renderer.primary()?.game;
let idleTimer = 0;
function wake() { document.body.classList.remove('idle'); clearTimeout(idleTimer); idleTimer = setTimeout(() => !q.has('keepcursor') && document.body.classList.add('idle'), 3500); }
addEventListener('pointermove', wake); addEventListener('pointerdown', wake); wake();

function toast(msg, ms = 2500) { const t = $('toast'); t.textContent = msg; t.classList.remove('hidden'); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.add('hidden'), ms); }

let sim = 0;
function setSim(n) { sim = n % 3; input.setSimulated(sim); $('sim-n').textContent = sim; $('b-sim').classList.toggle('on', sim > 0); }
$('b-sim').onclick = () => setSim(sim + 1);
$('b-menu').onclick = () => setSurfaceContent(renderer.primary()?.def.id || scene.surfaces[0].id, { type: 'game', game: 'menu' });
$('b-restart').onclick = () => primaryGame()?.restart();
$('b-sound').onclick = () => { audio.unlock(); audio.enabled = !audio.enabled; $('b-sound').textContent = audio.enabled ? '🔊' : '🔇'; if (audio.enabled) audio.chime(0); };
$('b-fs').onclick = toggleFs;
$('b-debug').onclick = () => setDebug($('perf').classList.contains('hidden'));
function toggleFs() { document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen?.().catch(() => toast('Fullscreen was blocked by the browser')); }
let debug = false;
function setDebug(on) { debug = on; $('perf').classList.toggle('hidden', !on); $('hands-debug').classList.toggle('hidden', !on && calibShown === false); $('b-debug').classList.toggle('on', on); }

addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
  const k = e.key.toLowerCase();
  if (k === 'f') toggleFs(); else if (k === 'd') $('b-debug').click(); else if (k === 's') $('b-sim').click();
  else if (k === 'r') $('b-restart').click(); else if (k === 'm') $('b-menu').click(); else if (k === 'n') $('b-sound').click();
});
stage.addEventListener('pointerdown', (e) => {
  audio.unlock();
  const r = stage.getBoundingClientRect();
  renderer.tap((e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height);
  for (const s of renderer.surfaces.values()) if (s.forceMuted && s.video) { s.forceMuted = false; s.video.muted = s.def.content.muted; }
});

const ovBtn = $('ov-btn'); let ovMode = null, dwellT = 0;
ovBtn.innerHTML = '<span class="dwell"></span><span class="lbl"></span>';
ovBtn.onclick = () => { audio.unlock(); const g = primaryGame(); if (!g) return; ovMode === 'over' ? g.restart() : g.start(); };
function updateOverlay(dt, hands) {
  const g = primaryGame();
  const show = g && g.ctx && renderer.primary().def.content.game !== 'menu' && (g.status === 'ready' || g.status === 'over');
  $('overlay').classList.toggle('hidden', !show);
  if (!show) { ovMode = null; dwellT = 0; return; }
  if (ovMode !== g.status) {
    ovMode = g.status;
    const m = g.constructor.meta;
    $('ov-title').textContent = g.status === 'ready' ? `${m.icon} ${m.name}` : 'Great job! 🎉';
    $('ov-sub').textContent = g.status === 'ready' ? m.description : `You scored ${g.score}!`;
    ovBtn.querySelector('.lbl').textContent = g.status === 'ready' ? 'Start' : 'Play again';
  }
  // hover a hand over the button for ~1.2 s to press it (no touching the laptop needed)
  const b = ovBtn.getBoundingClientRect(), r = stage.getBoundingClientRect();
  const over = hands.some((h) => { const x = r.left + h.x * r.width, y = r.top + h.y * r.height; return h.source !== 'mouse' && x >= b.left && x <= b.right && y >= b.top && y <= b.bottom; });
  dwellT = over ? dwellT + dt : Math.max(0, dwellT - dt * 2);
  ovBtn.querySelector('.dwell').style.width = Math.min(100, (dwellT / 1.2) * 100) + '%';
  if (dwellT >= 1.2) { dwellT = 0; ovBtn.click(); }
}

// ---------- calibration targets + hand markers ----------
let calibShown = false, calibMsg = null;
const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
/** Calibration overlay. mode 'grid': the adjustable rectangle (outline, grid, diagonals, numbered corners);
 *  'discs': four bright discs on black, used by the camera auto-detect; 'black': plain black (its reference frame). */
function showCalib(m) {
  calibShown = !!m.show; calibMsg = m;
  const c = $('calib'); c.classList.toggle('hidden', !m.show); c.innerHTML = '';
  $('hands-debug').classList.toggle('hidden', !(m.show || debug));
  if (!m.show) return;
  const r = stage.getBoundingClientRect(), pts = m.points || [], mode = m.mode || 'points';
  const box = document.createElement('div'); box.className = 'cbox ' + mode;
  Object.assign(box.style, { left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', height: r.height + 'px' });
  c.appendChild(box);
  if (mode === 'black') return;
  if (mode === 'discs') {
    pts.forEach(([x, y]) => { const d = document.createElement('div'); d.className = 'disc'; d.style.left = x * 100 + '%'; d.style.top = y * 100 + '%'; box.appendChild(d); });
    return;
  }
  if (mode === 'grid') {
    const gs = m.grids || (pts.length === 4 ? [{ points: pts, name: '', active: true }] : []);
    const N = 10, line = (p, q, cls) => `<line class="${cls}" x1="${p[0] * 100}" y1="${p[1] * 100}" x2="${q[0] * 100}" y2="${q[1] * 100}"/>`;
    let svg = '';
    for (const g of gs) {
      const P = g.points; if (!P || P.length !== 4) continue;
      let inner = '';
      for (let i = 1; i < N; i++) {
        const t = i / N;
        inner += line(lerp(P[0], P[1], t), lerp(P[3], P[2], t), 'g') + line(lerp(P[0], P[3], t), lerp(P[1], P[2], t), 'g');
      }
      inner += line(P[0], P[2], 'd') + line(P[1], P[3], 'd');
      inner += `<polygon class="o" points="${P.map((p) => p[0] * 100 + ',' + p[1] * 100).join(' ')}"/>`;
      svg += `<g class="${g.active ? 'act' : 'idle'}">${inner}</g>`;
    }
    box.innerHTML = `<svg viewBox="0 0 100 100" preserveAspectRatio="none">${svg}</svg>`;
    for (const g of gs) {
      const P = g.points; if (!P || P.length !== 4) continue;
      const cx = P.reduce((a, q) => a + q[0], 0) / 4, cy = P.reduce((a, q) => a + q[1], 0) / 4;
      if (g.name) { const l = document.createElement('div'); l.className = 'glabel' + (g.active ? ' act' : ''); l.style.left = cx * 100 + '%'; l.style.top = cy * 100 + '%'; l.textContent = g.name; box.appendChild(l); }
      P.forEach(([x, y], i) => {
        const d = document.createElement('div'); d.className = 'pt' + (g.active ? ' active' : ' idle');
        d.style.left = x * 100 + '%'; d.style.top = y * 100 + '%'; d.textContent = i + 1; box.appendChild(d);
      });
    }
    return;
  }
  pts.forEach(([x, y], i) => {
    const d = document.createElement('div'); d.className = 'pt' + (i === m.active ? ' active' : '');
    d.style.left = x * 100 + '%'; d.style.top = y * 100 + '%'; d.textContent = i + 1; box.appendChild(d);
  });
}
addEventListener('resize', () => { if (calibShown && calibMsg) showCalib(calibMsg); });
function drawHandMarkers(hands) {
  const box = $('hands-debug'); if (box.classList.contains('hidden')) return;
  const r = stage.getBoundingClientRect();
  while (box.children.length < hands.length) box.appendChild(document.createElement('i'));
  [...box.children].forEach((el, i) => {
    const h = hands[i]; el.style.display = h ? '' : 'none'; if (!h) return;
    el.className = h.source + (h.lost ? ' lost' : '');
    el.style.left = r.left + h.x * r.width + 'px'; el.style.top = r.top + h.y * r.height + 'px';
  });
}

// ---------- test grid for aiming / zooming the projector ----------
function showGrid(on) {
  let el = $('grid');
  if (!on) { el?.remove(); return; }
  if (el) return;
  el = document.createElement('div'); el.id = 'grid';
  const r = stage.getBoundingClientRect();
  el.innerHTML = `<b>${Math.round(r.width)}×${Math.round(r.height)}</b>`;
  document.body.appendChild(el);
}
if (q.get('autofs')) { toast('Click once to go fullscreen', 6000); addEventListener('pointerdown', () => !document.fullscreenElement && document.documentElement.requestFullscreen?.().catch(() => {}), { once: true }); }

// ---------- settings panel ----------
const CONTROLS = [
  ['shyCount', 'Shy butterflies: how many', 'range', 1, 40, 1], ['shySize', 'Shy butterflies: size', 'range', 0.4, 2.5, 0.1],
  ['butterflies', 'Butterflies', 'range', 1, 30, 1], ['speed', 'Butterfly speed', 'range', 0.3, 2.5, 0.1],
  ['interactionDistance', 'Landing distance', 'range', 0.02, 0.2, 0.01], ['spawnRate', 'Spawn rate (per s)', 'range', 0.1, 3, 0.1],
  ['animationSpeed', 'Animation speed', 'range', 0.3, 2.5, 0.1], ['duration', 'Game duration (s, 0 = endless)', 'range', 0, 300, 10],
  ['difficulty', 'Difficulty', 'select', ['easy', 'normal', 'hard']],
];
let saveT = 0;
function buildSettings() {
  const body = $('settings-body'); body.innerHTML = '';
  for (const [key, label, type, a, b, step] of CONTROLS) {
    const l = document.createElement('label'); const out = document.createElement('span'); l.append(label, out);
    let el;
    if (type === 'select') { el = document.createElement('select'); a.forEach((v) => el.add(new Option(v, v))); el.value = settings.game[key]; out.textContent = ''; }
    else { el = document.createElement('input'); el.type = 'range'; el.min = a; el.max = b; el.step = step; el.value = settings.game[key]; out.textContent = el.value; }
    el.oninput = () => {
      const v = type === 'select' ? el.value : +el.value; out.textContent = type === 'select' ? '' : v;
      settings.game[key] = v; renderer.setSettings();
      clearTimeout(saveT); saveT = setTimeout(saveSettings, 400);
    };
    l.appendChild(el); body.appendChild(l);
  }
}
function saveSettings() {
  try { localStorage.setItem('bp.game', JSON.stringify(settings.game)); } catch { /* ignore */ }
  if (serverUp) api('/api/settings', 'PUT', { game: settings.game }).catch(() => {});
}
$('b-settings').onclick = () => { buildSettings(); $('settings').classList.toggle('hidden'); };
$('settings-close').onclick = () => $('settings').classList.add('hidden');

// ---------- main loop ----------
let last = performance.now(), statTick = 0;
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  perf.frame(now);
  const hands = input.snapshot(now);
  renderer.update(dt, hands, now);
  updateOverlay(dt, hands);
  drawHandMarkers(hands);
  if (debug && now - statTick > 250) { statTick = now; $('perf').textContent = statsText(hands); }
  requestAnimationFrame(frame);
}
function statsText(hands) {
  const c = stats?.camera, t = stats?.tracking;
  const avg = lat.length ? (lat.reduce((a, b) => a + b, 0) / lat.length) * 1000 : 0;
  const src = [...new Set(hands.map((h) => h.source))].join(',') || 'none';
  return [
    `render  ${perf.fps.toFixed(0)} fps  (quality ${perf.quality}/2)`,
    `server  ${serverUp ? 'connected' : 'offline (standalone)'}`,
    `camera  ${c ? `${c.state}  ${c.fps} fps  ${c.width}x${c.height}` : '-'}`,
    `track   ${t ? `${t.fps} fps  ${t.procMs} ms/frame  level ${t.level}` : '-'}`,
    `latency ${t ? `frame->hands ${t.latencyMs} ms` : '-'}  frame->screen ${avg ? avg.toFixed(0) + ' ms' : '-'}`,
    `hands   ${hands.length}  (${src})`,
    `cue     ${lastCue || '-'}`,
    `stage   ${Math.round(stage.getBoundingClientRect().width)}x${Math.round(stage.getBoundingClientRect().height)}`,
  ].join('\n');
}
layoutStage();
if (q.get('sim')) setSim(+q.get('sim'));
if (q.has('debug')) setDebug(true);
requestAnimationFrame(frame);
window.__pg = { renderer, input, perf, get settings() { return settings; }, get scene() { return scene; } }; // for tests/debugging
