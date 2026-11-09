// Calibration: one or more grids are shown on the output (screen quads). For each, the camera's view of its four corners
// is found automatically or dragged into place; each grid gets its own camera->screen mapping on the server.
import { app } from './core/app.js';
import { api } from './core/ws.js';
import { drawPreview } from './core/preview.js';

const $ = (id) => document.getElementById(id);
const NAMES = ['top-left', 'top-right', 'bottom-right', 'bottom-left'];
const MAX_GRIDS = 8;
const defaultGrid = (size = 0.8) => { const m = (1 - size) / 2; return [[m, m], [1 - m, m], [1 - m, 1 - m], [m, 1 - m]]; };
const clamp01 = (v) => Math.min(1, Math.max(0, v));
const blank = () => [null, null, null, null];
const COLORS = ['#39d98a', '#7fb4ff', '#ffb35c', '#e58bff', '#ff7e7e', '#7ee6e6', '#d6e65c', '#ffa0c8'];

// grids: [{id, name, S: screen quad, C: camera quad (4 points or null), dirty}]; sel: index of the grid being edited
let grids = [{ id: 'main', name: 'Main', S: defaultGrid(), C: blank(), dirty: false }];
let sel = 0, active = 0, shown = true, drag = null, solveTimer = 0, autoBusy = false;
const cur = () => grids[sel];

const say = (t, kind = '') => { $('c-msg').textContent = t; $('c-msg').className = 'msg ' + kind; };
const onTab = () => !$('tab-calibrate').classList.contains('hidden');
const rel = (e, el) => { const r = el.getBoundingClientRect(); return [(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height]; };
const near = (list, p, rect, px = 22) => {
  let best = -1, bd = px;
  list.forEach((q, i) => { if (!q) return; const d = Math.hypot((q[0] - p[0]) * rect.width, (q[1] - p[1]) * rect.height); if (d < bd) { bd = d; best = i; } });
  return best;
};
const inside = (poly, [x, y]) => { let c = false; for (let i = 0, j = 3; i < 4; j = i++) { const a = poly[i], b = poly[j]; if ((a[1] > y) !== (b[1] > y) && x < ((b[0] - a[0]) * (y - a[1])) / (b[1] - a[1]) + a[0]) c = !c; } return c; };
const complete = (g) => g.C.every(Boolean);

function sendGrid() {
  app.command('calib', {
    show: shown && onTab(), mode: 'grid', active, points: cur().S,
    grids: grids.map((g, i) => ({ points: g.S, name: grids.length > 1 ? g.name : '', active: i === sel })),
  });
}

function renderTabs() {
  $('c-grids').innerHTML = grids.map((g, i) => `<span data-i="${i}" class="${i === sel ? 'active' : ''} ${complete(g) && !g.dirty ? 'set' : ''}" style="border-left:6px solid ${COLORS[i % 8]}">${g.name}${complete(g) && !g.dirty ? ' ✓' : ''}</span>`).join('');
  $('c-grids').querySelectorAll('span').forEach((s) => (s.onclick = () => select(+s.dataset.i)));
  $('c-name').value = cur().name; $('c-name').disabled = cur().id === 'main';
  $('c-del').disabled = cur().id === 'main'; $('c-add').disabled = grids.length >= MAX_GRIDS;
  $('c-autoall').style.display = grids.length > 1 ? '' : 'none';
}
function renderList() {
  $('c-active').textContent = active + 1;
  $('calib-pts').innerHTML = cur().C.map((p, i) => `<span data-i="${i}" class="${p ? 'set' : ''} ${i === active ? 'active' : ''}">${i + 1} ${NAMES[i]}${p ? ' ✓' : ''}</span>`).join('');
  $('calib-pts').querySelectorAll('span').forEach((s) => (s.onclick = () => { active = +s.dataset.i; renderList(); sendGrid(); }));
}
function select(i) { sel = i; active = Math.max(0, cur().C.findIndex((p) => !p)); renderTabs(); renderList(); draw(); sendGrid(); }

function drawQuad(g, pts, col, W, H, fill) {
  g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x * W, y * H) : g.moveTo(x * W, y * H))); g.closePath();
  if (fill) { g.fillStyle = fill; g.fill(); } g.strokeStyle = col; g.stroke();
}

function draw() {
  const cv = $('calib-preview');
  const c = app.calibration || {};
  drawPreview(cv, { rotation: c.rotation || 0, mirror: !!c.mirror });
  const g = cv.getContext('2d');
  grids.forEach((gr, gi) => {
    if (gi === sel) return;
    if (complete(gr) && !gr.dirty) { g.lineWidth = 2; drawQuad(g, gr.C, COLORS[gi % 8], cv.width, cv.height); g.fillStyle = COLORS[gi % 8]; g.font = 'bold 13px sans-serif'; g.textAlign = 'center'; g.fillText(gr.name, gr.C.reduce((a, p) => a + p[0], 0) / 4 * cv.width, gr.C.reduce((a, p) => a + p[1], 0) / 4 * cv.height); }
  });
  const pts = cur().C;
  g.lineWidth = 2; g.strokeStyle = '#ffb300'; g.beginPath();
  pts.forEach((p, i) => { if (p) { const x = p[0] * cv.width, y = p[1] * cv.height; i ? g.lineTo(x, y) : g.moveTo(x, y); } });
  if (pts.every(Boolean)) g.closePath(); g.stroke();
  pts.forEach((p, i) => {
    if (!p) return; const x = p[0] * cv.width, y = p[1] * cv.height;
    g.fillStyle = i === active ? '#ff3d71' : '#ffb300'; g.beginPath(); g.arc(x, y, 11, 0, 7); g.fill();
    g.fillStyle = '#000'; g.font = 'bold 13px sans-serif'; g.textAlign = 'center'; g.fillText(i + 1, x, y + 4.5);
  });
  drawGrid(); drawMap();
}

function drawGrid() {
  const cv = $('calib-grid'), g = cv.getContext('2d');
  cv.height = Math.round(cv.width / app.aspect);
  const W = cv.width, H = cv.height;
  g.fillStyle = '#1c1830'; g.fillRect(0, 0, W, H);
  g.strokeStyle = '#6c5ce7'; g.lineWidth = 1; g.strokeRect(0.5, 0.5, W - 1, H - 1);
  grids.forEach((gr, gi) => {
    const col = COLORS[gi % 8], isSel = gi === sel;
    g.globalAlpha = isSel ? 1 : 0.55; g.lineWidth = isSel ? 2.5 : 1.5;
    drawQuad(g, gr.S, col, W, H, isSel ? 'rgba(57,217,138,.15)' : 'rgba(255,255,255,.05)');
    const P = gr.S.map(([x, y]) => [x * W, y * H]);
    if (isSel) {
      g.lineWidth = 1; g.strokeStyle = 'rgba(255,255,255,.35)';
      for (let i = 1; i < 6; i++) {
        const t = i / 6, l = (a, b) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
        let a = l(P[0], P[1]), b = l(P[3], P[2]); g.beginPath(); g.moveTo(...a); g.lineTo(...b); g.stroke();
        a = l(P[0], P[3]); b = l(P[1], P[2]); g.beginPath(); g.moveTo(...a); g.lineTo(...b); g.stroke();
      }
    }
    P.forEach(([x, y], i) => {
      g.fillStyle = col; g.beginPath(); g.arc(x, y, isSel ? 10 : 6, 0, 7); g.fill();
      if (isSel) { g.fillStyle = '#000'; g.font = 'bold 12px sans-serif'; g.textAlign = 'center'; g.fillText(i + 1, x, y + 4); }
    });
    g.fillStyle = '#fff'; g.font = 'bold 12px sans-serif'; g.textAlign = 'center';
    g.fillText(gr.name, P.reduce((a, p) => a + p[0], 0) / 4, P.reduce((a, p) => a + p[1], 0) / 4);
    g.globalAlpha = 1;
  });
  const S = cur().S, w = Math.hypot(S[1][0] - S[0][0], S[1][1] - S[0][1]);
  $('c-size').value = String(Math.round(Math.min(100, w * 100))); $('c-size-v').textContent = $('c-size').value;
}

function drawMap() {
  const cv = $('calib-map'), g = cv.getContext('2d');
  cv.height = Math.round(cv.width / app.aspect);
  g.fillStyle = '#1c1830'; g.fillRect(0, 0, cv.width, cv.height);
  g.strokeStyle = '#6c5ce7'; g.strokeRect(0.5, 0.5, cv.width - 1, cv.height - 1);
  grids.forEach((gr, gi) => { g.lineWidth = 1; drawQuad(g, gr.S, COLORS[gi % 8], cv.width, cv.height, 'rgba(255,255,255,.06)'); });
  g.fillStyle = '#39d98a';
  for (const h of app.hands) { if (h.lost) continue; g.beginPath(); g.arc(h.x * cv.width, h.y * cv.height, 9, 0, 7); g.fill(); }
}

const calParams = () => ({ mirror: $('c-mirror').checked, rotation: +$('c-rot').value });

async function solve(quiet = false, gr = cur()) {
  if (!complete(gr)) return quiet || say('Set all 4 points first.', 'err');
  try {
    if (gr.id === 'main') await api('/api/calibration/solve', 'POST', { ...calParams(), camera_points: gr.C, screen_points: gr.S });
    else await api(`/api/calibration/grids/${gr.id}`, 'POST', { name: gr.name, camera_points: gr.C, screen_points: gr.S });
    gr.dirty = false; renderTabs();
    say(`"${gr.name}" saved. Move your hand: the green dot should follow it.`, 'ok');
  } catch (e) { say(e.message, 'err'); }
}
const solveSoon = () => { clearTimeout(solveTimer); const gr = cur(); solveTimer = setTimeout(() => solve(true, gr), 350); };

/** The grid moved, so its handles no longer sit on its corners. The saved calibration stays in force until replaced. */
function invalidate(why) {
  const gr = cur();
  if (gr.C.every((p) => !p)) return;
  gr.C = blank(); gr.dirty = true; active = 0; renderList(); renderTabs(); draw();
  say(why + ' (The saved calibration keeps working until then.)', '');
}

function setPoint(p) {
  const gr = cur(); gr.C[active] = p;
  const next = gr.C.findIndex((q, i) => !q && i > active);
  active = next >= 0 ? next : Math.min(3, active + 1);
  renderList(); draw(); sendGrid();
  if (complete(gr)) solveSoon();
}

/** Merge the server's calibration into the local list: server wins unless the user has moved that grid since. */
function mergeServer(c) {
  const server = c.grids || [];
  const next = server.map((sg, i) => {
    const local = grids.find((g) => g.id === sg.id);
    if (local && (local.dirty || drag)) return local;
    return { id: sg.id, name: sg.name, S: sg.screen_points.map((p) => [...p]), C: sg.camera_points.map((p) => [...p]), dirty: false };
  });
  if (!next.some((g) => g.id === 'main')) next.unshift(grids.find((g) => g.id === 'main') || { id: 'main', name: 'Main', S: defaultGrid(), C: blank(), dirty: false });
  const mainIdx = next.findIndex((g) => g.id === 'main'); if (mainIdx > 0) next.unshift(next.splice(mainIdx, 1)[0]);
  for (const g of grids) if (!next.some((n) => n.id === g.id) && (g.dirty || g.C.every((p) => !p)) && g.id !== 'main') next.push(g); // local drafts
  const selId = cur().id;
  grids = next; sel = Math.max(0, grids.findIndex((g) => g.id === selId));
}

async function autoFind(gr) {
  const r = await api('/api/calibration/auto', 'POST', { ...calParams(), screen_points: gr.S });
  gr.C = r.camera_points.map((p) => [...p]); active = 3;
  await solve(true, gr);
}

export function initCalibration() {
  renderTabs(); renderList();
  app.on('preview', () => { if (onTab()) draw(); });
  app.on('hands', () => { if (onTab()) drawMap(); });
  app.on('calibration', (c) => {
    $('c-mirror').checked = c.mirror; $('c-rot').value = String(c.rotation);
    if (!autoBusy) mergeServer(c);
    renderTabs(); renderList(); draw();
  });
  app.on('tab', (t) => {
    if (t === 'calibrate') { draw(); sendGrid(); } else if (shown) app.command('calib', { show: false });
  });
  addEventListener('beforeunload', () => app.command('calib', { show: false }));
  app.on('server', (up) => { if (up && onTab()) sendGrid(); });

  $('c-show').onclick = () => { shown = !shown; $('c-show').textContent = shown ? 'Hide grid on output' : 'Show grid on output'; sendGrid(); };

  // ---- grids: add / remove / rename ----
  $('c-add').onclick = () => {
    if (grids.length >= MAX_GRIDS) return;
    let n = grids.length + 1, id; while (grids.some((g) => g.id === (id = 'g' + n))) n++;
    const k = grids.length, w = 0.3, x0 = 0.05 + (k % 3) * 0.3, y0 = 0.15 + Math.floor(k / 3) * 0.4;  // a small grid in free space
    const S = [[x0, y0], [x0 + w, y0], [x0 + w, y0 + 0.3], [x0, y0 + 0.3]].map(([x, y]) => [clamp01(x), clamp01(y)]);
    grids.push({ id, name: `Grid ${n}`, S, C: blank(), dirty: true });
    say('New grid added. Drag it into place on the projector grid, then press Auto-find corners.', '');
    select(grids.length - 1);
  };
  $('c-del').onclick = async () => {
    const gr = cur(); if (gr.id === 'main') return;
    try { await api(`/api/calibration/grids/${gr.id}`, 'DELETE'); } catch { /* it was only a draft */ }
    grids = grids.filter((g) => g !== gr); select(Math.min(sel, grids.length - 1)); say(`Removed "${gr.name}".`, 'ok');
  };
  $('c-name').onchange = async () => {
    const gr = cur(); gr.name = $('c-name').value.trim() || gr.id; renderTabs(); draw(); sendGrid();
    if (complete(gr) && !gr.dirty) await solve(true, gr);
  };

  // ---- camera view: drag the four handles ----
  const pv = $('calib-preview');
  pv.onpointerdown = (e) => {
    const p = rel(e, pv), i = near(cur().C, p, pv.getBoundingClientRect());
    if (i >= 0) { drag = { kind: 'cam', i }; active = i; pv.setPointerCapture(e.pointerId); renderList(); }
    else { setPoint(p); }
  };
  pv.onpointermove = (e) => {
    if (drag?.kind !== 'cam') return;
    const p = rel(e, pv); cur().C[drag.i] = [clamp01(p[0]), clamp01(p[1])]; draw();
  };
  pv.onpointerup = () => { if (drag?.kind === 'cam') { drag = null; if (complete(cur())) solveSoon(); } };

  // ---- projector grids: drag corners / move / select / size ----
  const gc = $('calib-grid');
  gc.onpointerdown = (e) => {
    const p = rel(e, gc), rect = gc.getBoundingClientRect(), S = cur().S, i = near(S, p, rect);
    if (i >= 0) drag = { kind: 'corner', i };
    else if (inside(S, p)) drag = { kind: 'move', last: p };
    else { const other = grids.findIndex((g, gi) => gi !== sel && inside(g.S, p)); if (other >= 0) select(other); return; }
    gc.setPointerCapture(e.pointerId);
  };
  gc.onpointermove = (e) => {
    if (!drag || drag.kind === 'cam') return;
    const p = rel(e, gc), gr = cur();
    if (drag.kind === 'corner') gr.S[drag.i] = [clamp01(p[0]), clamp01(p[1])];
    else {
      let dx = p[0] - drag.last[0], dy = p[1] - drag.last[1];
      dx = Math.min(Math.max(dx, -Math.min(...gr.S.map((q) => q[0]))), 1 - Math.max(...gr.S.map((q) => q[0])));
      dy = Math.min(Math.max(dy, -Math.min(...gr.S.map((q) => q[1]))), 1 - Math.max(...gr.S.map((q) => q[1])));
      gr.S = gr.S.map(([x, y]) => [x + dx, y + dy]); drag.last = p;
    }
    drag.moved = true; draw(); sendGrid();
  };
  gc.onpointerup = () => {
    if (drag && drag.kind !== 'cam') {
      if (drag.moved) { cur().dirty = true; invalidate('Grid moved – press Auto-find corners, or drag the handles onto its new corners.'); renderTabs(); }
      drag = null;
    }
  };
  $('c-size').oninput = () => {
    const gr = cur(), S = gr.S, s = +$('c-size').value / 100, cx = S.reduce((a, q) => a + q[0], 0) / 4, cy = S.reduce((a, q) => a + q[1], 0) / 4;
    const w = Math.hypot(S[1][0] - S[0][0], S[1][1] - S[0][1]) || 0.8, k = s / w;
    gr.S = S.map(([x, y]) => [clamp01(cx + (x - cx) * k), clamp01(cy + (y - cy) * k)]); gr.dirty = true;
    draw(); sendGrid(); invalidate('Grid resized – press Auto-find corners, or drag the handles onto its new corners.'); renderTabs();
  };
  $('c-gridreset').onclick = () => { const gr = cur(); gr.S = defaultGrid(grids.length > 1 ? 0.4 : 0.8); gr.dirty = true; draw(); sendGrid(); invalidate('Grid reset – press Auto-find corners, or drag the handles.'); renderTabs(); };

  // ---- auto-find ----
  const busy = (on) => { autoBusy = on; for (const id of ['c-auto', 'c-autoall']) $(id).disabled = on; };
  $('c-auto').onclick = async () => {
    busy(true); const gr = cur(); say(`Flashing four dots for "${gr.name}"… keep the phone still (about 5 seconds).`, '');
    try { await autoFind(gr); draw(); say(`Found the corners of "${gr.name}" and saved. Check the yellow outline sits on the grid; drag a handle to fine-tune.`, 'ok'); }
    catch (e) { say(e.message, 'err'); }
    busy(false); sendGrid();
  };
  $('c-autoall').onclick = async () => {
    busy(true); const failed = [];
    for (const gr of [...grids]) {
      say(`Finding "${gr.name}"… (${grids.indexOf(gr) + 1}/${grids.length})`, '');
      try { await autoFind(gr); draw(); } catch (e) { failed.push(`${gr.name}: ${e.message}`); }
    }
    busy(false); sendGrid(); renderTabs(); draw();
    say(failed.length ? `Some grids were not found – ${failed.join(' | ')}` : `All ${grids.length} grids found and saved.`, failed.length ? 'err' : 'ok');
  };

  const capture = () => {
    const h = app.hands.find((q) => !q.lost && q.camTips?.[1]);
    if (!h) return say('No hand detected – hold a hand in view with the index fingertip on the grid corner.', 'err');
    setPoint([...h.camTips[1]]); say(`Point ${active === 3 && cur().C[3] ? 4 : active} captured.`, 'ok');
  };
  $('c-capture').onclick = capture;
  addEventListener('keydown', (e) => { if (e.code === 'Space' && onTab() && !['INPUT', 'SELECT', 'BUTTON'].includes(e.target.tagName)) { e.preventDefault(); capture(); } });

  const base = async () => {
    grids.forEach((g) => { g.C = blank(); g.dirty = true; }); active = 0;
    try { await api('/api/calibration/base', 'PUT', calParams()); say('Orientation changed – all grids cleared. Press Auto-find corners.', ''); } catch (e) { say(e.message, 'err'); }
    renderTabs(); renderList(); draw();
  };
  $('c-mirror').onchange = base; $('c-rot').onchange = base;
  $('c-reset').onclick = async () => {
    await api('/api/calibration', 'DELETE'); grids = grids.slice(0, 1); grids[0].C = blank(); sel = 0; active = 0;
    say('Calibration cleared (all grids).', 'ok'); renderTabs(); renderList(); draw(); sendGrid();
  };
  $('c-solve').onclick = () => solve();
}
