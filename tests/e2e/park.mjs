// Animal park: three players (still by a flower, waving near the pond, still by a tree) - checks it runs without errors and shows the scene.
import { resetScene, restoreScene } from './util.mjs';
import { chromium } from 'playwright';
const base = 'http://localhost:8000', shots = process.env.SHOTS || '/tmp';
await resetScene();
const r = await fetch(`${base}/api/scene`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ surfaces: [{ id: 'main', name: 'Main wall', content: { type: 'game', game: 'park' }, quad: [[0, 0], [1, 0], [1, 1], [0, 1]] }] }) });
if (!r.ok) throw new Error('scene rejected: ' + (await r.text()));
const browser = await chromium.launch(); const errors = [];
const out = await browser.newPage({ viewport: { width: 1280, height: 720 } });
out.on('pageerror', (e) => errors.push(String(e))); out.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
await out.goto(`${base}/play.html`); await out.waitForTimeout(1500);
await out.evaluate(() => { const t0 = performance.now(); setInterval(() => { const t = (performance.now() - t0) / 1000;
  window.__pg.input.setCameraHands({ hands: [{ id: 1, x: 0.37, y: 0.86 }, { id: 2, x: 0.2 + 0.1 * Math.sin(t * 5), y: 0.78 }, { id: 3, x: 0.62, y: 0.7 }, { id: 4, x: 0.85, y: 0.35 + 0.1 * Math.sin(t) }] }); }, 33); });
await out.waitForTimeout(4500); await out.screenshot({ path: `${shots}/park.png` });
const fps = await out.evaluate(() => window.__pg.perf.fps);
console.log(JSON.stringify({ errors, fps: Math.round(fps) }));
await browser.close(); await restoreScene(); process.exit(errors.length ? 1 : 0);
