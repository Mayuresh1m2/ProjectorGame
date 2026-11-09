// Projector tab: display list, output window placement, resolution/aspect.
import { app } from './core/app.js';
import { api } from './core/ws.js';

const $ = (id) => document.getElementById(id);
let screens = [];       // Window Management API screens (Chromium), when permitted
let gridOn = false, outWin = null;

function listDisplays() {
  const d = app.info?.displays || [];
  $('p-displays').innerHTML = d.length ? d.map((x) => `<li><b>${x.name}</b> ${x.width}×${x.height} at (${x.x}, ${x.y})${x.primary ? ' – primary' : ''}</li>`).join('') : '<li>(xrandr not available – use the browser list above)</li>';
  const note = $('p-note');
  note.textContent = 'getScreenDetails' in window
    ? 'This browser can place the window on a chosen display. The first time, allow “window management”.'
    : 'This browser cannot choose a display from a web page: the output window opens here – drag it onto the projector, then press F for fullscreen.';
}

async function loadScreens() {
  if (!('getScreenDetails' in window)) return;
  try {
    const det = await window.getScreenDetails(); screens = det.screens;
    const sel = $('p-screen'); sel.innerHTML = '';
    screens.forEach((s, i) => sel.add(new Option(`${s.label || 'Display ' + (i + 1)} – ${s.width}×${s.height}${s.isPrimary ? ' (primary)' : ''}`, i)));
    const ext = screens.findIndex((s) => !s.isPrimary); if (ext >= 0) sel.value = ext;
  } catch { $('p-note').textContent = 'Permission for multi-display was denied; the output window will open on this screen.'; }
}

function openOutput() {
  const idx = $('p-screen').value;
  let feat = 'popup,width=1280,height=720';
  if (idx !== '' && screens[idx]) { const s = screens[idx]; feat = `popup,left=${s.availLeft ?? s.left},top=${s.availTop ?? s.top},width=${s.availWidth ?? s.width},height=${s.availHeight ?? s.height}`; }
  outWin = window.open('play.html?autofs=1', 'playground-output', feat);
  if (!outWin) $('p-note').textContent = 'The browser blocked the pop-up. Allow pop-ups for this page and try again.';
}

function syncOutputForm() {
  const o = app.settings?.output; if (!o) return;
  $('o-mode').value = o.mode; $('o-w').value = o.width; $('o-h').value = o.height; $('o-fit').value = o.fit;
  $('o-preset').value = ['1280x720', '1920x1080', '1024x768', '1280x800', '854x480'].includes(`${o.width}x${o.height}`) ? `${o.width}x${o.height}` : '';
  $('o-w').disabled = $('o-h').disabled = $('o-preset').disabled = o.mode !== 'fixed';
}

export function initProjection() {
  app.on('info', listDisplays);
  app.on('settings', syncOutputForm);
  $('p-open').onclick = async () => { if ('getScreenDetails' in window && !screens.length) await loadScreens(); openOutput(); };
  if ('getScreenDetails' in window) $('p-screen').addEventListener('focus', loadScreens, { once: true });
  $('p-grid').onclick = () => { gridOn = !gridOn; app.command('grid', { on: gridOn }); };
  $('o-mode').onchange = () => { const f = $('o-mode').value === 'fixed'; $('o-w').disabled = $('o-h').disabled = $('o-preset').disabled = !f; };
  $('o-preset').onchange = () => { const v = $('o-preset').value; if (v) { const [w, h] = v.split('x'); $('o-w').value = w; $('o-h').value = h; } };
  $('o-save').onclick = async () => {
    const w = +$('o-w').value, h = +$('o-h').value;
    if (!(w >= 320 && h >= 240)) return alert('Width/height too small');
    await api('/api/settings', 'PUT', { output: { mode: $('o-mode').value, width: w, height: h, fit: $('o-fit').value } });
  };
}
