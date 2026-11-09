// Menu -> select games by tapping; layout editor drag/resize/rotate through real pointer events.
import { resetScene, restoreScene } from './util.mjs';
await resetScene();
import { chromium } from 'playwright';
const base = 'http://localhost:8000', shots = process.env.SHOTS || '/tmp';
const browser = await chromium.launch();
const errors = [];
const out = await browser.newPage({ viewport: { width: 1280, height: 720 } });
out.on('pageerror', (e) => errors.push(String(e))); out.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
await out.goto(`${base}/play.html`); await out.waitForTimeout(600);
await out.screenshot({ path: `${shots}/g-menu.png` });
const tiles = await out.evaluate(() => window.__pg.renderer.primary().game.tiles().map((t) => ({ id: t.id, cx: t.x + t.w / 2, cy: t.y + t.h / 2 })));
const result = {};
for (const t of tiles) {
  await out.mouse.click(t.cx, t.cy); await out.waitForTimeout(500);
  await out.mouse.move(640, 500); const startBtn = await out.$('#ov-btn:visible'); if (startBtn) await startBtn.click(); // ambient games have no start screen
  await out.evaluate(() => window.__pg.input.setSimulated(2)); await out.waitForTimeout(3500);
  result[t.id] = await out.evaluate(() => ({ game: window.__pg.renderer.primary().game.constructor.meta.id, score: window.__pg.renderer.primary().game.score }));
  await out.screenshot({ path: `${shots}/g-${t.id}.png` });
  await out.evaluate(() => window.__pg.input.setSimulated(0));
  await out.mouse.move(600, 600); await out.click('#b-menu'); await out.waitForTimeout(300);
}
console.log(JSON.stringify(result));

const panel = await browser.newPage({ viewport: { width: 1400, height: 900 } });
panel.on('pageerror', (e) => errors.push('panel ' + e));
await panel.goto(`${base}/control.html`); await panel.click('[data-tab=layout]'); await panel.selectOption('#preset', 'grid4'); await panel.waitForTimeout(600);
const box = await panel.locator('#ed').boundingBox();
const at = (nx, ny) => [box.x + nx * box.width, box.y + ny * box.height];
const quad0 = await panel.evaluate(async () => (await (await fetch('/api/scene')).json()).surfaces[0].quad);
// drag frame 1 body right by 10% of width
let [x, y] = at(0.26, 0.27); await panel.mouse.move(x, y); await panel.mouse.down(); await panel.mouse.move(x + box.width * 0.1, y, { steps: 6 }); await panel.mouse.up(); await panel.waitForTimeout(500);
const quad1 = await panel.evaluate(async () => (await (await fetch('/api/scene')).json()).surfaces[0].quad);
// resize via bottom-right corner (keep rectangle)
[x, y] = at(quad1[2][0], quad1[2][1]); await panel.mouse.move(x, y); await panel.mouse.down(); await panel.mouse.move(x + 40, y + 20, { steps: 5 }); await panel.mouse.up(); await panel.waitForTimeout(500);
const quad2 = await panel.evaluate(async () => (await (await fetch('/api/scene')).json()).surfaces[0].quad);
// warp: untick lock, drag top-left corner
await panel.uncheck('#ed-lock'); [x, y] = at(quad2[0][0], quad2[0][1]); await panel.mouse.move(x, y); await panel.mouse.down(); await panel.mouse.move(x + 30, y + 40, { steps: 5 }); await panel.mouse.up(); await panel.waitForTimeout(500);
const quad3 = await panel.evaluate(async () => (await (await fetch('/api/scene')).json()).surfaces[0].quad);
const f = (q) => q.map((p) => p.map((v) => +v.toFixed(3)));
console.log(JSON.stringify({ moved: +(quad1[0][0] - quad0[0][0]).toFixed(3), resizedW: +(quad2[2][0] - quad2[0][0]).toFixed(3), warpedTL: f([quad3[0]])[0], stillRectBefore: f(quad2), after: f(quad3), errors }));
await panel.screenshot({ path: `${shots}/c-edit.png` });
await browser.close();
await restoreScene(); // the layout steps above save a 4-panel scene; put back what the wall was showing
if (errors.length) process.exit(1);
