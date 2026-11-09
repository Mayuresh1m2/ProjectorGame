// Playroom Quest zone editor: draw zones on a photo of the room, pick triggers/rewards, watch the live skeleton.
import { app } from './core/app.js';
import { api } from './core/ws.js';

const $ = (id) => document.getElementById(id);
const COLORS = ['#ff7eb6', '#4de3ff', '#ffc94d', '#8dff6b', '#c79bff', '#ff9a52'];
const TRIGGERS = { jump: 'Jump (on the stairs, a mat)', climb: 'Climb (the wall)', enter: 'Stand in the zone' };
const REWARDS = { laddu: 'Laddu', fuljhadi: 'Fuljhadi', jalebi: 'Jalebi', diya: 'Diya' };
const BONES = [[11, 12], [11, 13], [13, 15], [12, 14], [14, 16], [11, 23], [12, 24], [23, 24], [23, 25], [25, 27], [24, 26], [26, 28]];

let cfg = { zones: [], targets: { laddu: 10, fuljhadi: 5 } }, photo = null, drawing = null, cv, g, poses = [], lastLog = [];
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const say = (t, bad) => { const m = $('q-msg'); m.textContent = t; m.className = 'msg ' + (bad ? 'err' : 'ok'); };

async function loadPhoto() {
  try {
    const r = await fetch('/api/quest/photo.jpg?' + Date.now(), { cache: 'no-store' });
    photo = r.status === 200 ? await createImageBitmap(await r.blob()) : null;
  } catch { photo = null; }
  if (photo) { cv.height = Math.round(cv.width * photo.height / photo.width); }
  draw();
}

function draw() {
  const W = cv.width, H = cv.height;
  g.fillStyle = '#111'; g.fillRect(0, 0, W, H);
  if (photo) g.drawImage(photo, 0, 0, W, H);
  else if (app.preview) g.drawImage(app.preview, 0, 0, W, H);
  else { g.fillStyle = '#888'; g.font = '16px system-ui'; g.textAlign = 'center'; g.fillText('No photo yet. Use the live camera frame or upload one.', W / 2, H / 2); }
  cfg.zones.forEach((z, i) => poly(z.polygon, COLORS[i % COLORS.length], `${z.name}`, true));
  if (drawing) { poly(drawing.points, '#fff', 'new zone', false); }
  for (const p of poses) skeleton(p);
}
function poly(pts, color, label, close) {
  if (!pts.length) return;
  g.save(); g.strokeStyle = color; g.fillStyle = color + '33'; g.lineWidth = 3;
  g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x * cv.width, y * cv.height) : g.moveTo(x * cv.width, y * cv.height))); if (close) g.closePath();
  if (close) g.fill(); g.stroke();
  for (const [x, y] of pts) { g.beginPath(); g.arc(x * cv.width, y * cv.height, 4, 0, 7); g.fillStyle = color; g.fill(); }
  g.fillStyle = color; g.font = '700 14px system-ui'; g.textAlign = 'left'; g.fillText(label, pts[0][0] * cv.width + 6, pts[0][1] * cv.height - 6); g.restore();
}
function skeleton(p) {
  const j = Object.fromEntries(p.j.map(([i, x, y, v]) => [i, [x * cv.width, y * cv.height, v]]));
  g.save(); g.strokeStyle = '#00ff9c'; g.lineWidth = 3;
  for (const [a, b] of BONES) if (j[a] && j[b] && j[a][2] > 0.4 && j[b][2] > 0.4) { g.beginPath(); g.moveTo(j[a][0], j[a][1]); g.lineTo(j[b][0], j[b][1]); g.stroke(); }
  g.fillStyle = '#fff'; g.font = '700 13px system-ui'; if (j[23]) g.fillText('#' + p.id, j[23][0] + 8, j[23][1]);
  g.restore();
}

function renderZones() {
  $('q-zones').innerHTML = cfg.zones.map((z, i) => `<div class="check" style="grid-template-columns:1fr">
    <div class="row wrap"><b style="color:${COLORS[i % COLORS.length]}">●</b><input type="text" data-i="${i}" data-k="name" value="${esc(z.name)}" size="12">
      <select data-i="${i}" data-k="trigger">${Object.entries(TRIGGERS).map(([k, v]) => `<option value="${k}" ${z.trigger === k ? 'selected' : ''}>${v}</option>`).join('')}</select>
      <select data-i="${i}" data-k="reward">${Object.entries(REWARDS).map(([k, v]) => `<option value="${k}" ${z.reward === k ? 'selected' : ''}>→ ${v}</option>`).join('')}</select>
      <button class="sm danger" data-del="${i}">Delete</button></div>
    <div class="row wrap small">sensitivity <input type="range" min="0.5" max="2" step="0.1" value="${z.sensitivity}" data-i="${i}" data-k="sensitivity"> <output>${z.sensitivity}</output>
      cooldown <input type="number" min="0.2" max="30" step="0.1" value="${z.cooldown}" data-i="${i}" data-k="cooldown" style="width:64px"> s</div></div>`).join('') || '<p class="small">No zones yet.</p>';
  $('q-zones').querySelectorAll('[data-k]').forEach((el) => (el.oninput = () => {
    const z = cfg.zones[+el.dataset.i], k = el.dataset.k;
    z[k] = el.type === 'range' || el.type === 'number' ? +el.value : el.value;
    if (el.type === 'range') el.nextElementSibling.textContent = el.value;
    if (k === 'reward') renderTargets();
    draw();
  }));
  $('q-zones').querySelectorAll('[data-del]').forEach((b) => (b.onclick = () => { cfg.zones.splice(+b.dataset.del, 1); renderZones(); renderTargets(); draw(); }));
}
function renderTargets() {
  const used = [...new Set(cfg.zones.map((z) => z.reward))];
  for (const k of used) cfg.targets[k] ||= 5;
  for (const k of Object.keys(cfg.targets)) if (!used.includes(k) && cfg.zones.length) delete cfg.targets[k];
  $('q-targets').innerHTML = Object.entries(cfg.targets).map(([k, v]) => `<label>${REWARDS[k]} needed<input type="number" min="1" max="99" value="${v}" data-t="${k}" style="width:70px"></label>`).join('') || '<p class="small">Add a zone first.</p>';
  $('q-targets').querySelectorAll('[data-t]').forEach((el) => (el.oninput = () => { cfg.targets[el.dataset.t] = Math.max(1, Math.min(99, parseInt(el.value, 10) || 1)); }));
}

function setDrawing(on) { drawing = on ? { points: [] } : null; $('q-finish').disabled = !on; $('q-undo').disabled = !on; $('q-add').disabled = on; draw(); }

export function initQuest() {
  cv = $('q-canvas'); g = cv.getContext('2d');
  cv.onclick = (e) => {
    if (!drawing) return;
    const r = cv.getBoundingClientRect();
    drawing.points.push([Math.round(((e.clientX - r.left) / r.width) * 1000) / 1000, Math.round(((e.clientY - r.top) / r.height) * 1000) / 1000]);
    draw();
  };
  $('q-add').onclick = () => { setDrawing(true); say('Click the corners of the zone on the photo, then press Finish shape.'); };
  $('q-undo').onclick = () => { drawing?.points.pop(); draw(); };
  $('q-finish').onclick = () => {
    if (!drawing || drawing.points.length < 3) return say('A zone needs at least 3 corners.', true);
    const i = cfg.zones.length + 1;
    cfg.zones.push({ id: 'z' + Date.now().toString(36), name: `Zone ${i}`, trigger: 'jump', reward: 'laddu', polygon: drawing.points, cooldown: 0.8, sensitivity: 1 });
    setDrawing(false); renderZones(); renderTargets(); say('Zone added. Choose its trigger and reward, then Save zones.');
  };
  $('q-save').onclick = async () => {
    try { cfg = await api('/api/quest', 'PUT', { zones: cfg.zones, targets: cfg.targets }); say('Saved.'); renderZones(); renderTargets(); } catch (e) { say(e.message, true); }
  };
  $('q-snap').onclick = async () => { try { await api('/api/quest/photo', 'POST'); await loadPhoto(); say('Photo saved from the live camera frame.'); } catch (e) { say(e.message, true); } };
  $('q-upload').onclick = () => $('q-file').click();
  $('q-file').onchange = async () => {
    const f = $('q-file').files[0]; if (!f) return;
    try { const r = await fetch('/api/quest/photo', { method: 'POST', body: f }); if (!r.ok) throw new Error((await r.json()).detail); await loadPhoto(); say('Photo saved.'); } catch (e) { say(e.message, true); }
    $('q-file').value = '';
  };
  $('q-pose').onclick = async () => { try { await api('/api/settings', 'PUT', { tracking: { mode: 'pose' } }); } catch (e) { say(e.message, true); } };
  $('q-hands').onclick = async () => { try { await api('/api/settings', 'PUT', { tracking: { mode: 'hands' } }); } catch (e) { say(e.message, true); } };
  document.querySelectorAll('#tab-quest [data-reward]').forEach((b) => (b.onclick = () => app.command('reward-test', { reward: b.dataset.reward })));
  app.on('quest', (q) => { if (!drawing) { cfg = { zones: q.zones, targets: q.targets }; renderZones(); renderTargets(); draw(); } });
  app.on('settings', (s) => { $('q-mode').textContent = 'tracking: ' + (s.tracking.mode === 'pose' ? 'body pose' : 'hands'); });
  app.on('poses', (m) => {
    poses = m.poses;
    $('q-live').textContent = poses.length ? `${poses.length} ${poses.length === 1 ? 'person' : 'people'} seen` : 'no people seen';
    draw();
  });
  app.on('preview', () => { if (!photo) draw(); });
  app.on('zone', (m) => {
    lastLog.unshift(`${new Date().toLocaleTimeString()}  ${m.name}: ${m.trigger} → ${m.reward} (person ${m.person})`); lastLog = lastLog.slice(0, 8);
    $('q-log').innerHTML = lastLog.map((l) => `<div>${esc(l)}</div>`).join('');
  });
  app.on('stats', (s) => { $('q-model').textContent = s.tracking.mode === 'pose' && s.tracking.lastError.includes('pose model') ? 'The pose model file is missing: run scripts/fetch_models.sh' : ''; });
  app.on('tab', (t) => { if (t === 'quest') { loadPhoto(); } });
  loadPhoto(); renderZones(); renderTargets();
}
