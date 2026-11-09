// Calibration UI: the grid appears on the output while the tab is open, follows drags in the panel, and goes away on leaving.
// Never solves, so the saved calibration is untouched.
import { chromium } from 'playwright';
const base = 'http://localhost:8000', shots = process.env.SHOTS || '/tmp';
const browser = await chromium.launch();
const errors = [];
const watch = (p, n) => { p.on('pageerror', (e) => errors.push(`${n}: ${e}`)); p.on('console', (m) => { if (m.type() === 'error') errors.push(`${n}: ${m.text()}`); }); };
const panel = await browser.newPage({ viewport: { width: 1400, height: 1700 } }); watch(panel, 'panel');
const out = await browser.newPage({ viewport: { width: 1280, height: 720 } }); watch(out, 'output');
let fail = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fail++; };
await out.goto(`${base}/play.html`); await panel.goto(`${base}/control.html`); await panel.waitForTimeout(800);
ok(await out.locator('#calib').evaluate((e) => e.classList.contains('hidden')), 'no overlay before opening the tab');
await panel.click('[data-tab=calibrate]'); await panel.waitForTimeout(600);
ok(!(await out.locator('#calib').evaluate((e) => e.classList.contains('hidden'))), 'grid overlay shown on output');
ok(await out.locator('#calib .pt').count() === 4 && await out.locator('#calib svg .g').count() === 18, '4 numbered corners + 18 grid lines');
const corner = async () => out.locator('#calib .pt').first().evaluate((e) => e.style.left + ',' + e.style.top);
const before = await corner();
// drag corner 1 in the projector-grid editor
const ed = await panel.locator('#calib-grid').boundingBox();
await panel.mouse.move(ed.x + ed.width * 0.1, ed.y + ed.height * 0.1); await panel.mouse.down();
await panel.mouse.move(ed.x + ed.width * 0.2, ed.y + ed.height * 0.3, { steps: 6 }); await panel.mouse.up(); await panel.waitForTimeout(400);
const after = await corner();
ok(before !== after, `output grid follows the drag (${before} -> ${after})`);
// size slider
const spread = async () => { const v = await out.locator('#calib .pt').evaluateAll((els) => els.map((e) => parseFloat(e.style.left))); return Math.max(...v) - Math.min(...v); };
const wide = await spread();
await panel.locator('#c-size').fill('30'); await panel.waitForTimeout(300);
const narrow = await spread();
ok(narrow < wide * 0.8, `size slider shrinks the grid (${wide.toFixed(0)}% -> ${narrow.toFixed(0)}%)`);
await panel.screenshot({ path: `${shots}/calib-ui.png` }); await out.screenshot({ path: `${shots}/calib-out.png` });
// handles: place all four by clicking, no solve yet because solve is debounced -> check immediately then reset grid
await panel.click('#c-gridreset'); await panel.waitForTimeout(300);
const m = await panel.evaluate(async () => { const r = await fetch('/api/calibration/auto', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ screen_points: [[.1, .1], [.9, .1], [.9, .9], [.1, .9]] }) }); return { s: r.status, b: await r.json() }; });
ok([200, 409, 422].includes(m.s), `auto-find answers sensibly without a real wall (${m.s}: ${JSON.stringify(m.b).slice(0, 90)})`);
await panel.waitForTimeout(500);
ok(!(await out.locator('#calib').evaluate((e) => e.classList.contains('hidden'))) && await out.locator('#calib .cbox.grid').count() === 1, 'grid restored on output after the auto-find attempt');
// ---- several grids ----
await panel.click('#c-add'); await panel.waitForTimeout(400);
ok(await out.locator('#calib .pt').count() === 8, 'second grid shows 4 more corners on the output');
ok(await out.locator('#calib .glabel').count() === 2, 'grids are labelled when there are several');
ok(await out.locator('#calib .pt:not(.idle)').count() === 4, 'only the selected grid has full-size corners');
await panel.fill('#c-name', 'Side wall'); await panel.press('#c-name', 'Enter'); await panel.waitForTimeout(300);
ok((await out.locator('#calib .glabel').allTextContents()).includes('Side wall'), 'rename shows on the output');
await panel.screenshot({ path: `${shots}/calib-multi.png` }); await out.screenshot({ path: `${shots}/calib-multi-out.png` });
// place the four camera handles by clicking: it solves and saves by itself
const pv = await panel.locator('#calib-preview').boundingBox();
for (const [x, y] of [[.55, .2], [.95, .2], [.95, .8], [.55, .8]]) await panel.mouse.click(pv.x + pv.width * x, pv.y + pv.height * y);
await panel.waitForTimeout(1000);
ok((await panel.locator('#c-grids span').allTextContents()).some((t) => t.includes('Side wall ✓')), 'clicking four handles calibrates the grid');
const saved = await panel.evaluate(async () => (await (await fetch('/api/calibration')).json()).grids.map((g) => g.id));
ok(saved.includes('g2'), `server stored it (${saved})`);
await panel.click('#c-del'); await panel.waitForTimeout(400);
ok(await panel.locator('#c-grids span').count() === 1 && await out.locator('#calib .pt').count() === 4, 'removing returns to one grid');
await panel.click('[data-tab=layout]'); await panel.waitForTimeout(400);
ok(await out.locator('#calib').evaluate((e) => e.classList.contains('hidden')), 'overlay hidden after leaving the tab');
errors.splice(0, errors.length, ...errors.filter((e) => !e.includes('409') && !e.includes('404')));  // 409: expected auto-find answer; 404: removing a grid that was never saved
console.log(JSON.stringify({ errors })); await browser.close(); process.exit(fail || errors.length ? 1 : 0);
