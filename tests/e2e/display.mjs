// A paired "network display" (the laptop's own LAN address counts as another machine): pairing, read-only access,
// live commands, and that an unpaired browser gets nothing.
import { chromium } from 'playwright';
import fs from 'node:fs';
const local = 'http://localhost:8000';
const info = await (await fetch(`${local}/api/info`)).json();
if (!info.displayUrls?.length) { console.log('SKIP no LAN address / HTTPS'); process.exit(0); }
const pairUrl = info.displayUrls[0], lanBase = new URL(pairUrl).origin;
let fail = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fail++; };
const browser = await chromium.launch(); const errors = [];
const ctx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1280, height: 720 } });
const remote = await ctx.newPage(); remote.on('pageerror', (e) => errors.push(String(e)));
const open = await browser.newContext({ ignoreHTTPSErrors: true }); const stranger = await open.newPage();
const lp = await browser.newPage(); await lp.goto(`${local}/control.html`); await lp.waitForTimeout(500);

await stranger.goto(`${lanBase}/play.html`); await stranger.waitForTimeout(500);
const wsState = (p) => p.evaluate(() => new Promise((res) => { const w = new WebSocket(`wss://${location.host}/ws`); w.onopen = () => { w.close(); res('open'); }; w.onclose = () => res('closed'); w.onerror = () => res('closed'); setTimeout(() => res('timeout'), 3000); }));
ok(await wsState(stranger) === 'closed', 'an unpaired browser on the network cannot open the live link');
ok((await stranger.evaluate(async () => (await fetch('/api/scene')).status)) === 403, 'and cannot read the scene');

await remote.goto(pairUrl); await remote.waitForTimeout(2500);
ok(remote.url().includes('/play.html'), `pairing link lands on the game page (${remote.url().replace(/\?.*/, '')})`);
ok(await wsState(remote) === 'open', 'the paired browser can open the live link');
ok(await remote.evaluate(() => !!window.__pg.scene?.surfaces?.length), 'it received the scene');
ok((await remote.evaluate(async () => (await fetch('/api/settings')).status)) === 403, 'but has no API access');
const media = (await (await fetch(`${local}/api/media`)).json()).files[0];
if (media) ok((await remote.evaluate(async (u) => (await fetch(u)).status, media.url)) === 200, `it can load media (${media.name})`);
// a live command from the laptop's control panel reaches the projector browser
await lp.evaluate(() => new Promise((res) => { const w = new WebSocket(`ws://${location.host}/ws`); w.onopen = () => { w.send(JSON.stringify({ type: 'command', cmd: 'sim', n: 1 })); setTimeout(() => { w.close(); res(); }, 300); }; }));
await remote.waitForTimeout(500);
ok((await remote.locator('#sim-n').textContent()) === '1', 'a command from the control panel reaches the projector browser');
await lp.evaluate(() => new Promise((res) => { const w = new WebSocket(`ws://${location.host}/ws`); w.onopen = () => { w.send(JSON.stringify({ type: 'command', cmd: 'sim', n: 0 })); setTimeout(() => { w.close(); res(); }, 300); }; }));
const h = await (await fetch(`${local}/api/health`)).json();
ok(h.checks.some((c) => c.id === 'display' || /rendering/.test(c.message || '')), 'health sees the display rendering');
console.log(JSON.stringify({ errors })); await browser.close(); process.exit(fail || errors.length ? 1 : 0);
