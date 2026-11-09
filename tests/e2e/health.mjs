// End-to-end: health tab, header pill, game health dot, report from the game window, setup page (needs a running server).
import { chromium } from 'playwright';
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const errors = [];
const watch = (p) => { p.on('pageerror', (e) => errors.push(String(e))); p.on('console', (m) => m.type() === 'error' && errors.push(m.text())); };

const game = await ctx.newPage(); watch(game);
await game.goto('http://localhost:8000/play.html?game=butterfly');
await game.waitForTimeout(3500);
const dot = await game.evaluate(() => document.getElementById('b-health').className);

const panel = await ctx.newPage(); watch(panel);
await panel.goto('http://localhost:8000/control.html#health');
await panel.waitForFunction(() => document.getElementById('h-checks').children.length > 3, null, { timeout: 8000 });
const pill = await panel.textContent('#health-pill');
const checks = await panel.$$eval('#h-checks .check b', (els) => els.map((e) => e.textContent));
const events = await panel.$$eval('#h-events div', (els) => els.length);
const health = await (await fetch('http://localhost:8000/api/health')).json();
const display = health.checks.find((c) => c.id === 'display');

const setup = await ctx.newPage(); watch(setup);
await setup.goto('http://localhost:8000/setup.html');
await setup.fill('#c-throw', '1.2'); await setup.fill('#c-dist', '3');
const width = await setup.textContent('#c-w');
await setup.click('#b-pattern');
await setup.waitForTimeout(300);
const patternShown = await setup.evaluate(() => !document.getElementById('stage').classList.contains('hidden') && document.getElementById('pattern').width > 100);
await setup.keyboard.press('Escape');
await setup.waitForTimeout(200);
const patternHidden = await setup.evaluate(() => document.getElementById('stage').classList.contains('hidden'));
await setup.click('#b-latency');
await setup.waitForTimeout(300);
const noCam = await setup.textContent('#l-result');

console.log(JSON.stringify({ dot, pill, checks, events, display: display?.status, width, patternShown, patternHidden, noCam, errors }));
const ok = dot && /health/.test(pill) && checks.length >= 4 && events > 0 && display?.status === 'ok' && width === '2.50 m' && patternShown && patternHidden && /not streaming/.test(noCam) && errors.length === 0;
await browser.close();
if (!ok) { console.log('FAILED'); process.exit(1); }
console.log('OK');
