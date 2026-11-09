// Browser smoke test of the butterfly game: loads the page, starts the game, drives a mouse "hand", checks the score.
import { resetScene } from './util.mjs';
await resetScene();
import { chromium } from 'playwright';
const base = process.env.BASE || 'http://localhost:8000';
const shots = process.env.SHOTS || '/tmp';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(`${base}/play.html?game=butterfly`);
await page.waitForTimeout(1500);
await page.screenshot({ path: `${shots}/p1-ready.png` });
const ready = await page.evaluate(() => !document.getElementById('overlay').classList.contains('hidden') && document.getElementById('ov-btn').innerText);
await page.click('#ov-btn');
await page.mouse.move(640, 360);
let score = 0;
for (let i = 0; i < 80 && score < 3; i++) {
  await page.mouse.move(640 + Math.sin(i / 5) * 200, 360 + Math.cos(i / 7) * 120);
  await page.waitForTimeout(100);
  score = await page.evaluate(() => window.__pg.renderer.primary().game.score);
}
await page.screenshot({ path: `${shots}/p1-playing.png` });
const states = await page.evaluate(() => window.__pg.renderer.primary().game.world.butterflies.map((b) => b.state));
const fps = await page.evaluate(() => window.__pg.perf.fps);
console.log(JSON.stringify({ overlayButton: ready, score, states, renderFps: Math.round(fps), errors }));
await browser.close();
if (errors.length || score < 1) process.exit(1);
