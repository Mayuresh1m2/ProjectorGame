// The headline scenario: a (fake) iPhone streams a photo of hands -> server tracks them -> butterflies in the game land on them.
import { resetScene } from './util.mjs';
await resetScene();
import { chromium } from 'playwright';
import fs from 'node:fs';
const token = fs.readFileSync('data/camera_token', 'utf8').trim();
const shots = process.env.SHOTS || '/tmp';
const browser = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-video-capture=${process.env.VIDEO}`] });
const phone = await (await browser.newContext({ ignoreHTTPSErrors: true, permissions: ['camera'] })).newPage();
const game = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
const errors = []; for (const p of [phone, game]) { p.on('pageerror', (e) => errors.push(String(e))); }
await game.goto('http://localhost:8000/play.html?game=butterfly&debug=1');
await game.click('#ov-btn');
await phone.goto(`https://localhost:8443/camera.html?k=${token}`);
await phone.click('#start');
await phone.waitForFunction(() => document.getElementById('status').textContent.includes('Streaming'), null, { timeout: 15000 });
let score = 0, hands = [];
for (let i = 0; i < 100 && score < 2; i++) {
  await game.waitForTimeout(200);
  hands = await game.evaluate(() => window.__pg.input.snapshot().map((h) => ({ id: h.id, src: h.source, x: +h.x.toFixed(2), y: +h.y.toFixed(2) })));
  score = await game.evaluate(() => window.__pg.renderer.primary().game.score);
}
await game.waitForTimeout(1500);
await game.screenshot({ path: `${shots}/full-live.png` });
const perf = await game.evaluate(() => document.getElementById('perf').textContent);
console.log(JSON.stringify({ score, hands, errors }));
console.log(perf);
await browser.close();
if (errors.length || score < 1 || !hands.some((h) => h.src === 'camera')) process.exit(1);
