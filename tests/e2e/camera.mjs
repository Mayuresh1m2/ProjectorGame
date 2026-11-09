// End-to-end: camera.html (headless Chromium with a fake camera, over self-signed HTTPS) -> WebRTC -> server -> stats.
// Optional VIDEO=path/to/file.y4m feeds a recording (e.g. a photo of hands) instead of the synthetic test pattern.
import { resetScene } from './util.mjs';
await resetScene();
import { chromium } from 'playwright';
import fs from 'node:fs';
const token = fs.readFileSync('data/camera_token', 'utf8').trim();
const args = ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'];
if (process.env.VIDEO) args.push(`--use-file-for-fake-video-capture=${process.env.VIDEO}`);
const browser = await chromium.launch({ args });
const ctx = await browser.newContext({ ignoreHTTPSErrors: true, permissions: ['camera'] });
const page = await ctx.newPage();
const errors = []; page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(`https://localhost:8443/camera.html?k=${token}`);
const secure = await page.evaluate(() => window.isSecureContext);
await page.click('#start');
await page.waitForFunction(() => document.getElementById('status').textContent.includes('Streaming'), null, { timeout: 15000 }).catch(async (e) => { console.log('status:', await page.textContent('#status'), '| msg:', await page.textContent('#msg')); throw e; });
const got = [];
const ws = new WebSocket('ws://localhost:8000/ws');
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.type === 'hands' && m.hands.length) got.push(m); };
await page.waitForTimeout(5000);
ws.close();
if (got.length) { const h = got[got.length - 1]; console.log('hands over websocket:', got.length, 'msgs; last =', JSON.stringify(h.hands.map((x) => ({ id: x.id, x: x.x, y: x.y, conf: x.confidence, tips: x.tips.length, lm: x.landmarks.length, hand: x.handedness }))), 'cam', JSON.stringify(h.cam)); }

const stats = await (await fetch('http://localhost:8000/api/stats')).json();
console.log(JSON.stringify({ secure, status: await page.textContent('#status'), actual: await page.textContent('#actual'), camera: stats.camera, tracking: stats.tracking, errors }));
await page.click('#stop');
await page.waitForTimeout(800);
console.log('after stop:', JSON.stringify((await (await fetch('http://localhost:8000/api/stats')).json()).camera));
await browser.close();
