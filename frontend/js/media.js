// Layout editor: video frames / game areas / mapped surfaces on the projector output.
// A surface is a quad (4 corners) + mask + content. Rect, rotation and perspective warp are all just corner positions.
import { app } from './core/app.js';
import { api } from './core/ws.js';
import { GAMES } from './games/index.js';
import { quadFromRect, rectFromQuad, rectToQuad, applyH, invert3, pointInPolygon, clamp } from './core/geometry.js';

const $ = (id) => document.getElementById(id);
let scene = { surfaces: [], background: '#000' };
let sel = null, drag = null, saveT = 0, lastLocalEdit = 0, media = [], cv, g;

const COLORS = { game: '#3b82f6', video: '#10b981', color: '#a78bfa', image: '#f97316', slideshow: '#eab308' };
const videos = () => media.filter((m) => m.kind !== 'image'), images = () => media.filter((m) => m.kind === 'image');
const POLYS = {
  triangle: [[0.5, 0], [1, 1], [0, 1]], house: [[0.5, 0], [1, 0.35], [1, 1], [0, 1], [0, 0.35]],
  hexagon: [[0.25, 0], [0.75, 0], [1, 0.5], [0.75, 1], [0.25, 1], [0, 0.5]],
  door: [[0, 1], [0, 0.25], [0.15, 0.05], [0.5, 0], [0.85, 0.05], [1, 0.25], [1, 1]],
};

const uid = () => 's' + Math.random().toString(36).slice(2, 7);
const cur = () => scene.surfaces.find((s) => s.id === sel);
const A = () => app.aspect;

function commit(immediate = false) {
  lastLocalEdit = performance.now();
  render(); buildList(); // form is rebuilt only by selection changes, so typing is not interrupted
  clearTimeout(saveT);
  saveT = setTimeout(async () => { try { await api('/api/scene', 'PUT', scene); } catch (e) { $('surf-form').insertAdjacentHTML('afterbegin', `<p class="msg err">${e.message}</p>`); } }, immediate ? 0 : 120);
}

// ---------- geometry in editor space ----------
const toPx = (p) => [p[0] * cv.clientWidth, p[1] * cv.clientHeight];
const toNorm = (x, y) => [x / cv.clientWidth, y / cv.clientHeight];
const unitToQuad = (s) => rectToQuad(1, 1, s.quad);          // unit square -> normalized quad
const mapLocal = (s, [u, v]) => { const H = unitToQuad(s); return applyH(H, u, v); };
const inQuad = (s, p) => pointInPolygon(p, s.quad);

function handles(s) {
  const q = s.quad, top = [(q[0][0] + q[1][0]) / 2, (q[0][1] + q[1][1]) / 2];
  const cx = q.reduce((a, p) => a + p[0], 0) / 4, cy = q.reduce((a, p) => a + p[1], 0) / 4;
  const dx = top[0] - cx, dy = top[1] - cy, l = Math.hypot(dx * A(), dy) || 1;
  const rot = [top[0] + (dx * A() / l) * 0.06 / A(), top[1] + (dy / l) * 0.06];
  return { corners: q, rotate: rot, poly: s.shape === 'polygon' ? s.polygon.map((p) => mapLocal(s, p)) : [] };
}

function hit(nx, ny) {
  const R = 12, near = (p) => { const [x, y] = toPx(p), [px, py] = toPx([nx, ny]); return Math.hypot(x - px, y - py) <= R; };
  const s = cur();
  if (s) {
    const h = handles(s);
    if (near(h.rotate)) return { kind: 'rotate', s };
    const ci = h.corners.findIndex(near); if (ci >= 0) return { kind: 'corner', i: ci, s };
    const pi = h.poly.findIndex(near); if (pi >= 0) return { kind: 'poly', i: pi, s };
  }
  for (let i = scene.surfaces.length - 1; i >= 0; i--) { const t = scene.surfaces[i]; if (t.visible && inQuad(t, [nx, ny])) return { kind: 'move', s: t }; }
  return null;
}

// ---------- drawing ----------
function render() {
  if (!cv) return;
  const dpr = devicePixelRatio || 1, W = cv.clientWidth, H = cv.clientHeight;
  if (cv.width !== Math.round(W * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.fillStyle = '#1c1830'; g.fillRect(0, 0, W, H);
  g.strokeStyle = 'rgba(255,255,255,.07)'; g.lineWidth = 1;
  for (let i = 1; i < 10; i++) { g.beginPath(); g.moveTo((W * i) / 10, 0); g.lineTo((W * i) / 10, H); g.moveTo(0, (H * i) / 10); g.lineTo(W, (H * i) / 10); g.stroke(); }
  scene.surfaces.forEach((s) => { if (s.visible) drawSurface(s, s.id === sel); });
  const s = cur(); if (s && s.visible) drawHandles(s);
}
function maskPath(s) {
  const pts = [];
  if (s.shape === 'ellipse') for (let i = 0; i < 64; i++) { const a = (i / 64) * Math.PI * 2; pts.push(mapLocal(s, [0.5 + 0.5 * Math.cos(a), 0.5 + 0.5 * Math.sin(a)])); }
  else if (s.shape === 'polygon' && s.polygon.length >= 3) s.polygon.forEach((p) => pts.push(mapLocal(s, p)));
  else if (s.shape === 'rounded') { const r = 0.08; [[r, 0], [1 - r, 0], [1, r], [1, 1 - r], [1 - r, 1], [r, 1], [0, 1 - r], [0, r]].forEach((p) => pts.push(mapLocal(s, p))); }
  else s.quad.forEach((p) => pts.push(p));
  g.beginPath(); pts.forEach((p, i) => { const [x, y] = toPx(p); i ? g.lineTo(x, y) : g.moveTo(x, y); }); g.closePath();
}
function drawSurface(s, selected) {
  const col = s.content.type === 'color' ? s.content.color || COLORS.color : COLORS[s.content.type];
  maskPath(s); g.fillStyle = col + (selected ? 'bb' : '77'); g.fill();
  g.lineWidth = selected ? 2.5 : 1.5; g.strokeStyle = selected ? '#fff' : 'rgba(255,255,255,.55)'; g.stroke();
  // outline of the full quad (the area the content is warped into) when it differs from the mask
  if (s.shape !== 'rect') { g.setLineDash([4, 4]); g.beginPath(); s.quad.forEach((p, i) => { const [x, y] = toPx(p); i ? g.lineTo(x, y) : g.moveTo(x, y); }); g.closePath(); g.strokeStyle = 'rgba(255,255,255,.3)'; g.lineWidth = 1; g.stroke(); g.setLineDash([]); }
  const c = toPx([s.quad.reduce((a, p) => a + p[0], 0) / 4, s.quad.reduce((a, p) => a + p[1], 0) / 4]);
  g.fillStyle = '#fff'; g.font = '600 13px system-ui'; g.textAlign = 'center';
  const sub = s.content.type === 'game' ? (GAMES[s.content.game]?.meta.name || 'Game menu') : s.content.type === 'video' ? (s.content.src || '').split('/').pop() : s.content.type === 'image' ? (s.content.src || '').split('/').pop() : s.content.type === 'slideshow' ? `${(s.content.srcs || []).length} pictures` : 'color';
  g.fillText(s.name, c[0], c[1] - 2); g.globalAlpha = 0.8; g.font = '11px system-ui'; g.fillText(sub, c[0], c[1] + 13); g.globalAlpha = 1;
}
function drawHandles(s) {
  const h = handles(s);
  const top = [(s.quad[0][0] + s.quad[1][0]) / 2, (s.quad[0][1] + s.quad[1][1]) / 2];
  g.strokeStyle = '#ffd36e'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(...toPx(top)); g.lineTo(...toPx(h.rotate)); g.stroke();
  g.fillStyle = '#ffd36e'; g.beginPath(); g.arc(...toPx(h.rotate), 7, 0, 7); g.fill();
  g.fillStyle = '#fff'; g.strokeStyle = '#6c5ce7'; g.lineWidth = 2;
  for (const p of h.corners) { const [x, y] = toPx(p); g.fillRect(x - 6, y - 6, 12, 12); g.strokeRect(x - 6, y - 6, 12, 12); }
  g.fillStyle = '#ff7eb6';
  for (const p of h.poly) { g.beginPath(); g.arc(...toPx(p), 5, 0, 7); g.fill(); }
}

// ---------- interaction ----------
function pointerNorm(e) { const r = cv.getBoundingClientRect(); return [(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height]; }

function onDown(e) {
  const [nx, ny] = pointerNorm(e); const h = hit(nx, ny);
  if (!h) { sel = null; buildForm(); render(); buildList(); return; }
  if (sel !== h.s.id) { sel = h.s.id; buildForm(); buildList(); }
  drag = { ...h, start: [nx, ny], orig: structuredClone(h.s.quad), origPoly: structuredClone(h.s.polygon) };
  cv.setPointerCapture(e.pointerId); render();
}
function onMove(e) {
  const [nx, ny] = pointerNorm(e);
  if (!drag) { const h = hit(nx, ny); cv.style.cursor = !h ? 'default' : h.kind === 'move' ? 'move' : h.kind === 'rotate' ? 'grab' : 'pointer'; return; }
  const s = drag.s, a = A();
  if (drag.kind === 'move') {
    let dx = nx - drag.start[0], dy = ny - drag.start[1];
    if ($('ed-snap').checked) {
      const xs = drag.orig.map((p) => p[0] + dx), ys = drag.orig.map((p) => p[1] + dy), T = 0.012;
      for (const [vals, set, ax] of [[xs, (d) => (dx += d), 'x'], [ys, (d) => (dy += d), 'y']]) {
        const mn = Math.min(...vals), mx = Math.max(...vals);
        for (const target of [0, 0.5, 1]) { if (Math.abs(mn - target) < T) { set(target - mn); break; } if (Math.abs(mx - target) < T) { set(target - mx); break; } }
        void ax;
      }
    }
    s.quad = drag.orig.map(([x, y]) => [x + dx, y + dy]);
  } else if (drag.kind === 'corner') {
    if ($('ed-lock').checked) {
      const r = rectFromQuad(drag.orig, a), rad = (r.rot * Math.PI) / 180, u = [Math.cos(rad), Math.sin(rad)], v = [-Math.sin(rad), Math.cos(rad)];
      const O = [drag.orig[(drag.i + 2) % 4][0] * a, drag.orig[(drag.i + 2) % 4][1]], P = [nx * a, ny];
      const d = [P[0] - O[0], P[1] - O[1]], lw = d[0] * u[0] + d[1] * u[1], lh = d[0] * v[0] + d[1] * v[1];
      const w = Math.max(0.02, Math.abs(lw)), h = Math.max(0.02, Math.abs(lh));
      const c = [O[0] + (u[0] * lw + v[0] * lh) / 2, O[1] + (u[1] * lw + v[1] * lh) / 2];
      s.quad = quadFromRect({ cx: c[0] / a, cy: c[1], w: w / a, h, rot: r.rot }, a);
    } else s.quad[drag.i] = [nx, ny];
  } else if (drag.kind === 'rotate') {
    const r = rectFromQuad(drag.orig, a);
    const ang = (Math.atan2(ny - r.cy, (nx - r.cx) * a) * 180) / Math.PI + 90;
    const snap = $('ed-snap').checked ? Math.round(ang / 5) * 5 : ang;
    s.quad = quadFromRect({ ...r, rot: Math.abs(snap - ang) < 2.5 ? snap : ang }, a);
  } else if (drag.kind === 'poly') {
    const inv = invert3(unitToQuad({ quad: drag.orig })); if (!inv) return;
    const [u, v] = applyH(inv, nx, ny); s.polygon[drag.i] = [clamp(u, -0.1, 1.1), clamp(v, -0.1, 1.1)];
  }
  commit(); syncRectFields();
}
function onUp() { if (drag) { drag = null; commit(true); } }

// ---------- list + form ----------
function buildList() {
  const L = $('surf-list');
  L.innerHTML = [...scene.surfaces].reverse().map((s) => `
    <div class="surf-item ${s.id === sel ? 'sel' : ''}" data-id="${s.id}">
      <span class="sw" style="background:${COLORS[s.content.type]}"></span><span class="nm">${esc(s.name)}</span>
      <button class="sm" data-a="vis" title="Show/hide">${s.visible ? '👁' : '🚫'}</button>
      <button class="sm" data-a="up" title="Bring forward">▲</button><button class="sm" data-a="down" title="Send back">▼</button>
      <button class="sm" data-a="dup" title="Duplicate">⧉</button><button class="sm" data-a="del" title="Remove">🗑</button>
    </div>`).join('') || '<p class="small">No surfaces yet – add one below.</p>';
  L.querySelectorAll('.surf-item').forEach((el) => (el.onclick = (e) => {
    const id = el.dataset.id, a = e.target.dataset?.a, i = scene.surfaces.findIndex((s) => s.id === id);
    if (a === 'vis') scene.surfaces[i].visible = !scene.surfaces[i].visible;
    else if (a === 'up' && i < scene.surfaces.length - 1) [scene.surfaces[i], scene.surfaces[i + 1]] = [scene.surfaces[i + 1], scene.surfaces[i]];
    else if (a === 'down' && i > 0) [scene.surfaces[i], scene.surfaces[i - 1]] = [scene.surfaces[i - 1], scene.surfaces[i]];
    else if (a === 'dup') { const c = structuredClone(scene.surfaces[i]); c.id = uid(); c.name += ' copy'; c.quad = c.quad.map(([x, y]) => [x + 0.03, y + 0.03]); scene.surfaces.push(c); sel = c.id; buildForm(); }
    else if (a === 'del') { scene.surfaces.splice(i, 1); if (sel === id) sel = null; buildForm(); }
    else { sel = id; buildForm(); }
    commit(true);
  }));
}
const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function syncRectFields() {
  const s = cur(); if (!s || !$('f-cx')) return;
  const r = rectFromQuad(s.quad, A());
  $('f-cx').value = (r.cx * 100).toFixed(1); $('f-cy').value = (r.cy * 100).toFixed(1);
  $('f-w').value = (r.w * 100).toFixed(1); $('f-h').value = (r.h * 100).toFixed(1); $('f-rot').value = r.rot.toFixed(1);
}

function buildForm() {
  const s = cur(), F = $('surf-form');
  if (!s) { F.innerHTML = '<p class="small">Select a frame to edit its content, shape and position.</p>'; return; }
  const c = s.content;
  const opts = (arr, v) => arr.map(([val, label]) => `<option value="${val}" ${val === v ? 'selected' : ''}>${esc(label)}</option>`).join('');
  F.innerHTML = `
    <label>Name <input type="text" id="f-name" value="${esc(s.name)}"></label>
    <label>Content <select id="f-type">${opts([['game', 'Interactive game'], ['video', 'Video'], ['image', 'Picture'], ['slideshow', 'Slideshow'], ['color', 'Color']], c.type)}</select></label>
    ${c.type === 'game' ? `<label>Game <select id="f-game">${opts([['menu', 'Game menu'], ...Object.values(GAMES).map((G) => [G.meta.id, `${G.meta.icon} ${G.meta.name}`])], c.game)}</select></label>` : ''}
    ${c.type === 'video' ? `
      <label>Video file <select id="f-src">${opts([['', '— choose —'], ...videos().map((m) => [m.url, m.name])], c.src)}</select></label>
      ${videos().length ? '' : '<p class="small">No videos found in <code>media/</code> yet.</p>'}
      <div class="row wrap"><button id="f-play" class="sm">${c.playing ? '⏸ Pause' : '▶ Play'}</button>
        <label class="inline"><input type="checkbox" id="f-loop" ${c.loop ? 'checked' : ''}> Loop</label>
        <label class="inline"><input type="checkbox" id="f-muted" ${c.muted ? 'checked' : ''}> Mute</label></div>
      <label>Volume <input type="range" id="f-vol" min="0" max="1" step="0.05" value="${c.volume}"></label>
      <div class="two"><label>Scaling <select id="f-fit">${opts([['cover', 'Fill (crop)'], ['contain', 'Fit (bars)'], ['fill', 'Stretch']], c.fit)}</select></label>
      <label>Speed <select id="f-rate">${opts([[0.5, '0.5×'], [1, '1×'], [1.5, '1.5×'], [2, '2×']], c.rate ?? 1)}</select></label></div>` : ''}
    ${c.type === 'image' ? `
      <label>Picture <select id="f-src">${opts([['', '— choose —'], ...images().map((m) => [m.url, m.name])], c.src)}</select></label>
      ${images().length ? '' : '<p class="small">No pictures found in <code>media/</code> yet (PNG, JPG, WebP, GIF or SVG). Run <code>scripts/make_sample_media.py</code> for sample decorations.</p>'}
      <label>Scaling <select id="f-fit">${opts([['cover', 'Fill (crop)'], ['contain', 'Fit (bars)'], ['fill', 'Stretch']], c.fit)}</select></label>` : ''}
    ${c.type === 'slideshow' ? `
      <div class="small">Pictures to show (in the order of the file list):</div>
      <div class="pics">${images().map((m) => `<label class="inline"><input type="checkbox" data-pic="${esc(m.url)}" ${(c.srcs || []).includes(m.url) ? 'checked' : ''}> ${esc(m.name)}</label>`).join('') || '<p class="small">No pictures found in <code>media/</code> yet.</p>'}</div>
      <div class="two"><label>Seconds each <input type="number" id="f-secs" min="2" max="600" step="1" value="${c.seconds ?? 10}"></label>
      <label>Fade (s) <input type="number" id="f-fade" min="0" max="5" step="0.5" value="${c.fadeSeconds ?? 1.5}"></label>
      <label>Scaling <select id="f-fit">${opts([['cover', 'Fill (crop)'], ['contain', 'Fit (bars)'], ['fill', 'Stretch']], c.fit)}</select></label>
      <label class="inline"><input type="checkbox" id="f-shuffle" ${c.shuffle ? 'checked' : ''}> Shuffle</label></div>` : ''}
    ${c.type === 'color' ? `<label>Color <input type="color" id="f-color" value="${c.color || '#2244aa'}"></label>` : ''}
    <label>Shape / mask <select id="f-shape">${opts([['rect', 'Rectangle'], ['rounded', 'Rounded'], ['ellipse', 'Ellipse'], ['polygon', 'Custom polygon']], s.shape)}</select></label>
    ${s.shape === 'polygon' ? `<label>Polygon preset <select id="f-poly"><option value="">(drag the pink points)</option>${Object.keys(POLYS).map((k) => `<option>${k}</option>`).join('')}</select></label>` : ''}
    <div class="two"><label>Gold border (px, 0 = none) <input type="number" id="f-bw" min="0" max="60" step="1" value="${s.border?.width ?? 0}"></label>
      <label class="inline"><input type="checkbox" id="f-bglow" ${s.border?.glow !== false ? 'checked' : ''}> Soft glow</label></div>
    <label class="inline"><input type="checkbox" id="f-inter" ${s.interactive ? 'checked' : ''}> Reacts to hands</label>
    ${s.interactive && c.type !== 'game' ? `<div class="react">
      <label class="inline"><input type="checkbox" id="f-wake" ${s.reaction?.wake ? 'checked' : ''}> Wake up when someone is near (dim otherwise)</label>
      ${s.reaction?.wake ? `<div class="two"><label>Dim level <input type="range" id="f-dim" min="0" max="0.8" step="0.05" value="${s.reaction.dim ?? 0.15}"></label>
        <label>Stay awake (s) <input type="number" id="f-hold" min="1" max="60" step="1" value="${s.reaction.hold ?? 4}"></label></div>` : ''}
      <label>Change to the next picture/video <select id="f-next">${opts([['off', 'never'], ['touch', 'when touched'], ['wave', 'when waved at']], s.reaction?.next || 'off')}</select></label>
      ${c.type === 'video' ? `<div class="small">Extra videos for "next" (after the one above):</div><div class="pics">${videos().filter((m) => m.url !== c.src).map((m) => `<label class="inline"><input type="checkbox" data-pl="${esc(m.url)}" ${(c.playlist || []).includes(m.url) ? 'checked' : ''}> ${esc(m.name)}</label>`).join('') || '<span class="small">no other videos</span>'}</div>` : ''}
      ${c.type === 'image' || c.type === 'color' ? '<div class="small">Pictures and colours only wake up; use a slideshow for "next".</div>' : ''}
    </div>` : ''}
    <h3>Position</h3>
    <div class="two"><label>X % <input type="number" id="f-cx" step="0.5"></label><label>Y % <input type="number" id="f-cy" step="0.5"></label>
    <label>Width % <input type="number" id="f-w" step="0.5"></label><label>Height % <input type="number" id="f-h" step="0.5"></label>
    <label>Rotation ° <input type="number" id="f-rot" step="1"></label><button id="f-rectify" class="sm" title="Remove any warp">Make rectangular</button></div>`;
  syncRectFields();
  const on = (id, ev, fn) => { const el = $(id); if (el) el[ev] = fn; };
  on('f-name', 'oninput', (e) => { s.name = e.target.value; commit(); });
  on('f-type', 'onchange', (e) => {
    const t = e.target.value;
    s.content = t === 'image' ? { type: 'image', src: images()[0]?.url || '', fit: 'cover' }
      : t === 'slideshow' ? { type: 'slideshow', srcs: images().map((m) => m.url).slice(0, 12), seconds: 10, fadeSeconds: 1.5, shuffle: false, fit: 'cover' }
      : t === 'game' ? { type: 'game', game: 'butterfly' } : t === 'video' ? { type: 'video', src: videos()[0]?.url || '', playing: true, loop: true, muted: false, volume: 0.8, fit: 'cover', rate: 1 } : { type: 'color', color: '#2244aa' };
    buildForm(); commit(true);
  });
  on('f-game', 'onchange', (e) => { c.game = e.target.value; commit(true); });
  on('f-src', 'onchange', (e) => { c.src = e.target.value; commit(true); });
  on('f-play', 'onclick', () => { c.playing = !c.playing; buildForm(); commit(true); });
  on('f-loop', 'onchange', (e) => { c.loop = e.target.checked; commit(true); });
  on('f-muted', 'onchange', (e) => { c.muted = e.target.checked; commit(true); });
  on('f-vol', 'oninput', (e) => { c.volume = +e.target.value; commit(); });
  on('f-fit', 'onchange', (e) => { c.fit = e.target.value; commit(true); });
  on('f-secs', 'oninput', (e) => { c.seconds = Math.max(2, +e.target.value || 10); commit(); });
  on('f-fade', 'oninput', (e) => { c.fadeSeconds = Math.max(0, +e.target.value || 0); commit(); });
  on('f-shuffle', 'onchange', (e) => { c.shuffle = e.target.checked; commit(true); });
  F.querySelectorAll('[data-pic]').forEach((cb) => (cb.onchange = () => { c.srcs = [...F.querySelectorAll('[data-pic]')].filter((x) => x.checked).map((x) => x.dataset.pic); if (c.srcs.length) commit(true); }));
  on('f-rate', 'onchange', (e) => { c.rate = +e.target.value; commit(true); });
  on('f-color', 'oninput', (e) => { c.color = e.target.value; commit(); });
  on('f-shape', 'onchange', (e) => { s.shape = e.target.value; if (s.shape === 'polygon' && s.polygon.length < 3) s.polygon = structuredClone(POLYS.hexagon); buildForm(); commit(true); });
  on('f-poly', 'onchange', (e) => { if (POLYS[e.target.value]) { s.polygon = structuredClone(POLYS[e.target.value]); commit(true); } });
  on('f-inter', 'onchange', (e) => { s.interactive = e.target.checked; buildForm(); commit(true); });
  const bd = () => (s.border ||= { width: 0, color: '#d4a937', glow: true });
  on('f-bw', 'oninput', (e) => { bd().width = Math.max(0, Math.min(60, +e.target.value || 0)); commit(); });
  on('f-bglow', 'onchange', (e) => { bd().glow = e.target.checked; commit(true); });
  const rx = () => (s.reaction ||= { wake: false, dim: 0.15, hold: 4, next: 'off' });
  on('f-wake', 'onchange', (e) => { rx().wake = e.target.checked; buildForm(); commit(true); });
  on('f-dim', 'oninput', (e) => { rx().dim = +e.target.value; commit(); });
  on('f-hold', 'oninput', (e) => { rx().hold = Math.max(1, +e.target.value || 4); commit(); });
  on('f-next', 'onchange', (e) => { rx().next = e.target.value; commit(true); });
  F.querySelectorAll('[data-pl]').forEach((cb) => (cb.onchange = () => { c.playlist = [...F.querySelectorAll('[data-pl]')].filter((x) => x.checked).map((x) => x.dataset.pl); commit(true); }));
  const rectInput = () => {
    const v = (id) => +$(id).value; if (![v('f-w'), v('f-h')].every((x) => x > 0)) return;
    s.quad = quadFromRect({ cx: v('f-cx') / 100, cy: v('f-cy') / 100, w: v('f-w') / 100, h: v('f-h') / 100, rot: v('f-rot') }, A()); commit();
  };
  ['f-cx', 'f-cy', 'f-w', 'f-h', 'f-rot'].forEach((id) => on(id, 'oninput', rectInput));
  on('f-rectify', 'onclick', () => { s.quad = quadFromRect(rectFromQuad(s.quad, A()), A()); commit(true); syncRectFields(); });
}

// ---------- adding / presets ----------
function newSurface(type) {
  const a = A(), w = 0.4, n = scene.surfaces.length + 1;
  const content = type === 'video' ? { type: 'video', src: videos()[(n - 1) % Math.max(1, videos().length)]?.url || '', playing: true, loop: true, muted: true, volume: 0.8, fit: 'cover', rate: 1 }
    : type === 'image' ? { type: 'image', src: images()[(n - 1) % Math.max(1, images().length)]?.url || '', fit: 'cover' }
    : type === 'slideshow' ? { type: 'slideshow', srcs: images().map((m) => m.url).slice(0, 12), seconds: 10, fadeSeconds: 1.5, shuffle: false, fit: 'cover' }
    : type === 'game' ? { type: 'game', game: 'butterfly' } : { type: 'color', color: '#3b5bdb' };
  const h = type === 'video' ? (w * a) / (16 / 9) : 0.4;
  const s = { id: uid(), name: `${{ video: 'Video', game: 'Game', color: 'Color', image: 'Picture', slideshow: 'Slideshow' }[type]} ${n}`, visible: true, content, shape: 'rect', polygon: [], interactive: type === 'game',
    quad: quadFromRect({ cx: 0.3 + 0.06 * (n % 5), cy: 0.3 + 0.06 * (n % 5), w, h, rot: 0 }, a) };
  scene.surfaces.push(s); sel = s.id; buildForm(); commit(true);
}

function applyPreset(name) {
  const a = A(), vid = (i) => ({ type: 'video', src: videos()[i % Math.max(1, videos().length)]?.url || '', playing: true, loop: true, muted: true, volume: 0.8, fit: 'cover', rate: 1 });
  const hasMedia = videos().length > 0, base = { visible: true, shape: 'rect', polygon: [], interactive: true };
  const mk = (id, name, content, rect, extra = {}) => ({ id, name, content, quad: quadFromRect(rect, a), ...base, ...extra });
  if (name === 'single') scene.surfaces = [mk('main', 'Main wall', { type: 'game', game: 'menu' }, { cx: 0.5, cy: 0.5, w: 1, h: 1 })];
  else if (name === 'grid4') scene.surfaces = [[0.26, 0.27], [0.74, 0.27], [0.26, 0.73], [0.74, 0.73]].map(([cx, cy], i) =>
    mk(`f${i + 1}`, `Frame ${i + 1}`, hasMedia ? vid(i) : i === 0 ? { type: 'game', game: 'butterfly' } : { type: 'color', color: ['#3b82f6', '#10b981', '#f59e0b', '#ec4899'][i] }, { cx, cy, w: 0.46, h: 0.44 }, { shape: i === 1 ? 'rounded' : 'rect' }));
  else if (name === 'wall-door') scene.surfaces = [
    mk('wall', 'Main wall', { type: 'game', game: 'butterfly' }, { cx: 0.36, cy: 0.5, w: 0.68, h: 0.9 }),
    mk('door', 'Door', hasMedia ? vid(0) : { type: 'color', color: '#0ea5e9' }, { cx: 0.8, cy: 0.5, w: 0.16, h: 0.7 }, { shape: 'polygon', polygon: POLYS.door }),
    { ...mk('side', 'Side wall', hasMedia ? vid(1) : { type: 'color', color: '#f59e0b' }, { cx: 0.92, cy: 0.5, w: 0.1, h: 0.6 }), quad: [[0.87, 0.22], [0.98, 0.15], [0.98, 0.85], [0.87, 0.78]] }];
  sel = scene.surfaces[0]?.id || null; buildForm(); commit(true);
}

export async function initLayout() {
  cv = $('ed'); g = cv.getContext('2d');
  cv.addEventListener('pointerdown', onDown); cv.addEventListener('pointermove', onMove); cv.addEventListener('pointerup', onUp); cv.addEventListener('pointercancel', onUp);
  new ResizeObserver(render).observe(cv);
  const setAspect = () => { cv.style.aspectRatio = String(A()); render(); };
  app.on('scene', (sc) => {
    if (drag || performance.now() - lastLocalEdit < 600) return; // do not fight an edit in progress
    scene = structuredClone(sc); if (sel && !cur()) sel = null; buildList(); buildForm(); setAspect();
  });
  app.on('settings', setAspect); app.on('output-size', setAspect);
  app.on('tab', async (t) => { if (t === 'layout') { await loadMedia(); setAspect(); } });
  $('add-image').onclick = () => newSurface('image'); $('add-slides').onclick = () => newSurface('slideshow');
  const al = $('ed-align'); al.onchange = () => app.command('align', { on: al.checked });
  app.on('output-size', () => { al.checked = false; });  // a freshly loaded game window starts without the overlay
  $('add-video').onclick = () => newSurface('video'); $('add-game').onclick = () => newSurface('game'); $('add-color').onclick = () => newSurface('color');
  $('preset').onchange = (e) => { if (e.target.value) applyPreset(e.target.value); e.target.value = ''; };
  await loadMedia();
}
async function loadMedia() { try { media = (await api('/api/media')).files; } catch { media = []; } if (cur()) buildForm(); }


// ---------- ready-made layouts ----------
export async function initPresets() {
  const sel = $('preset-sel'); if (!sel) return;
  try {
    const { presets } = await api('/api/presets');
    sel.innerHTML = presets.map((p) => `<option value="${p.id}" title="${p.description}">${p.title}</option>`).join('');
    const show = () => { const p = presets.find((x) => x.id === sel.value); $('preset-desc').textContent = p ? p.description : ''; };
    sel.onchange = show; show();
    $('preset-apply').onclick = async () => {
      if (!confirm('Replace the current layout with this one? (Your current layout is overwritten.)')) return;
      try { scene = await api(`/api/presets/${sel.value}/apply`, 'POST'); sel_clear(); render(); buildList(); } catch (e) { alert(e.message); }
    };
  } catch { /* server offline: the rest of the editor still works */ }
}
function sel_clear() { sel = null; }
