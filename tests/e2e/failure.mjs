// Failure injection: stream a fake camera, check health is ok, then kill the browser abruptly (phone vanishes)
// and verify the server notices (stall -> event, health leaves "ok") without anyone pressing stop.
import { chromium } from 'playwright';
import fs from 'node:fs';
const token = fs.readFileSync('data/camera_token', 'utf8').trim();
const args = ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'];
if (process.env.VIDEO) args.push(`--use-file-for-fake-video-capture=${process.env.VIDEO}`);
const browser = await chromium.launch({ args });
const ctx = await browser.newContext({ ignoreHTTPSErrors: true, permissions: ['camera'] });
const page = await ctx.newPage();
await page.goto(`https://localhost:8443/camera.html?k=${token}`);
await page.click('#start');
await page.waitForFunction(() => document.getElementById('status').textContent.includes('Streaming'), null, { timeout: 15000 });
await new Promise((r) => setTimeout(r, 3000));
const get = async (p) => (await fetch('http://localhost:8000' + p)).json();
const h1 = await get('/api/health');
const cam1 = h1.checks.find((c) => c.id === 'camera');
console.log('while streaming:', h1.status, '|', cam1.status, cam1.message);
const m1 = await (await fetch('http://localhost:8000/api/metrics')).text();
console.log('metrics:', m1.split('\n').filter((l) => /camera_connected |camera_fps |tracking_fps /.test(l) && !l.startsWith('#')).join(' ; '));

// the phone vanishes (battery died, Safari killed): no stop message, frames just cease
await browser.close();
const t0 = Date.now();
let seen = null;
while (Date.now() - t0 < 40000) {
  const h = await get('/api/health');
  const c = h.checks.find((x) => x.id === 'camera');
  if (c.status === 'fail') { seen = { afterS: ((Date.now() - t0) / 1000).toFixed(1), msg: c.message, overall: h.status }; break; }
  await new Promise((r) => setTimeout(r, 500));
}
console.log('stall detected:', JSON.stringify(seen));
await new Promise((r) => setTimeout(r, 12000));
const ev = (await get('/api/events')).events.slice(-8).map((e) => `${e.level}:${e.source}:${e.message}`);
console.log('events:\n  ' + ev.join('\n  '));
const h2 = await get('/api/health');
console.log('after phone vanished:', h2.status, h2.checks.find((c) => c.id === 'camera').message);
if (!seen) { console.log('FAILED: vanished camera was not detected'); process.exit(1); }
if (cam1.status !== 'ok') { console.log('FAILED: camera not ok while streaming'); process.exit(1); }
