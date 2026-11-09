// Playroom Quest end to end (server must be running; VIDEO=<y4m of a photo with a person>):
// pose mode over a real WebRTC camera, photo from the live frame, zone save, scoreboard + finale in the game window.
import { chromium } from 'playwright';
import fs from 'node:fs';
const base = 'http://localhost:8000';
const token = fs.readFileSync('data/camera_token', 'utf8').trim();
const put = (p, body) => fetch(base + p, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
const get = async (p) => (await fetch(base + p)).json();
const args = ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'];
if (process.env.VIDEO) args.push(`--use-file-for-fake-video-capture=${process.env.VIDEO}`);
const browser = await chromium.launch({ args });
const errors = [];
const watch = (p) => { p.on('pageerror', (e) => errors.push(String(e))); p.on('console', (m) => m.type() === 'error' && errors.push(m.text())); };

const prevMode = (await (await fetch(`${base}/api/settings`)).json()).tracking.mode;
await put('/api/settings', { tracking: { mode: 'pose' } });
const phone = await (await browser.newContext({ ignoreHTTPSErrors: true, permissions: ['camera'] })).newPage(); watch(phone);
await phone.goto(`https://localhost:8443/camera.html?k=${token}`);
await phone.click('#start');
await phone.waitForFunction(() => document.getElementById('status').textContent.includes('Streaming'), null, { timeout: 15000 });

const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const panel = await ctx.newPage(); watch(panel);
await panel.goto(`${base}/control.html`);
await panel.click('#tabs button[data-tab="quest"]');
await panel.waitForFunction(() => /person|people/.test(document.getElementById('q-live').textContent) && !/no people/.test(document.getElementById('q-live').textContent), null, { timeout: 20000 });
const live = await panel.textContent('#q-live');
await panel.click('#q-snap'); await panel.waitForFunction(() => /Photo saved/.test(document.getElementById('q-msg').textContent), null, { timeout: 5000 });
// draw one zone by clicking on the canvas
await panel.click('#q-add');
const box = await panel.locator('#q-canvas').boundingBox();
for (const [fx, fy] of [[0.1, 0.5], [0.5, 0.5], [0.5, 0.95], [0.1, 0.95]]) await panel.mouse.click(box.x + box.width * fx, box.y + box.height * fy);
await panel.click('#q-finish');
await panel.click('#q-save'); await panel.waitForFunction(() => /Saved/.test(document.getElementById('q-msg').textContent));
const saved = await get('/api/quest');
await panel.screenshot({ path: '/tmp/claude-1000/shots/quest-panel.png' });

const stats = await get('/api/stats');
const health = await get('/api/health');

// game window: reward tests via the panel's test buttons, then finale
const game = await ctx.newPage(); watch(game);
await game.goto(`${base}/play.html?game=quest`);
await game.waitForTimeout(1500);
for (let i = 0; i < 5; i++) await panel.click('#tab-quest [data-reward="fuljhadi"]');
for (let i = 0; i < 10; i++) await panel.click('#tab-quest [data-reward="laddu"]');
await game.waitForTimeout(2500);
await game.screenshot({ path: '/tmp/claude-1000/shots/quest-finale.png' });

console.log(JSON.stringify({ live, zones: saved.zones.length, hasPhoto: saved.hasPhoto, mode: stats.tracking.mode, procMs: stats.tracking.procMs, fps: stats.tracking.fps, health: health.status, errors }));
await put('/api/settings', { tracking: { mode: prevMode } }); // leave the tracking mode as the user had it
await put('/api/quest', { zones: [], targets: { laddu: 10, fuljhadi: 5 } });
await fetch(base + '/api/quest/photo', { method: 'DELETE' });
await browser.close();
if (!(saved.zones.length === 1 && saved.hasPhoto && stats.tracking.mode === 'pose' && errors.length === 0)) { console.log('FAILED'); process.exit(1); }
console.log('OK');
