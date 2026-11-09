import test from 'node:test';
import assert from 'node:assert/strict';
import { DiyaWorld } from '../../frontend/js/games/diwali/diyas.js';
import { SweetsWorld } from '../../frontend/js/games/diwali/sweets.js';
import { symmetricPoints, colorFor } from '../../frontend/js/games/diwali/rangoli.js';
import { Fireworks } from '../../frontend/js/games/diwali/fx.js';

const seeded = (seed = 5) => () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
const run = (w, secs, hands, dt = 1 / 60) => { const ev = []; for (let i = 0; i < secs / dt; i++) ev.push(...w.update(dt, hands)); return ev; };

test('a hand held near a diya lights it once, after a short warm-up', () => {
  const w = new DiyaWorld({ cols: 3, rows: 1 }, seeded()); w.resize(1200, 600);
  const d = w.diyas[0], hand = [{ id: 1, x: d.x, y: d.y - w.radius * 0.6 }];
  assert.equal(run(w, 0.1, hand).length, 0, 'not lit instantly');
  const ev = run(w, 0.6, hand);
  assert.equal(ev.filter((e) => e.type === 'light').length, 1);
  assert.equal(w.litCount, 1); assert.equal(w.score, 1);
  assert.equal(run(w, 1, hand).filter((e) => e.type === 'light').length, 0, 'lights only once');
});

test('a hand passing quickly does not light the diya (warm-up decays)', () => {
  const w = new DiyaWorld({ cols: 2, rows: 1 }, seeded()); w.resize(1200, 600);
  const d = w.diyas[0];
  for (let k = 0; k < 5; k++) { run(w, 0.15, [{ id: 1, x: d.x, y: d.y }]); run(w, 0.5, []); }
  assert.equal(w.litCount, 0);
});

test('far hands do nothing; lighting all triggers one celebration then a reset', () => {
  const w = new DiyaWorld({ cols: 2, rows: 1 }, seeded()); w.resize(1200, 600);
  assert.equal(run(w, 1, [{ id: 1, x: -999, y: -999 }]).length, 0);
  const ev = run(w, 1, w.diyas.map((d, i) => ({ id: i, x: d.x, y: d.y - w.radius * 0.6 })));
  assert.equal(ev.filter((e) => e.type === 'all').length, 1);
  run(w, 7, []);
  assert.equal(w.litCount, 0, 'board resets after the celebration');
});

test('sweets fall, are caught once by a nearby hand, and leave the screen otherwise', () => {
  const w = new SweetsWorld({ rate: 50 }, seeded()); w.resize(1280, 720);
  run(w, 0.2, []);
  const it = w.items[0]; it.x = 500; it.y = 300;
  const ev = w.update(1 / 60, [{ id: 1, x: 505, y: 305 }]);
  assert.equal(ev.filter((e) => e.type === 'catch').length, 1);
  assert.equal(w.score, 1);
  run(w, 12, []);
  assert.ok(w.items.every((i) => i.y < w.h + w.r * 2) && w.items.length <= w.max);
});

test('symmetry: n rotations, doubled by the mirror, all at the same distance from the centre', () => {
  const pts = symmetricPoints(700, 300, 640, 360, 8, true);
  assert.equal(pts.length, 16);
  const d0 = Math.hypot(700 - 640, 300 - 360);
  assert.ok(pts.every(([x, y]) => Math.abs(Math.hypot(x - 640, y - 360) - d0) < 1e-6));
  assert.equal(symmetricPoints(1, 2, 0, 0, 6, false).length, 6);
});

test('fireworks: a rocket climbs, bursts, and everything eventually fades', () => {
  const f = new Fireworks(seeded());
  f.launch(400, 100, 700);
  let burst = false;
  for (let i = 0; i < 300; i++) { f.update(1 / 60); if (f.rockets.length === 0 && f.sparks.length > 40) burst = true; }
  assert.ok(burst, 'rocket burst into sparks');
  for (let i = 0; i < 600; i++) f.update(1 / 60);
  assert.equal(f.busy, false);
});

test('every hand id (numbers and strings like "mouse") gets a real colour', () => {
  for (const id of [0, 1, 7, 3.0, 'mouse', 'touch-2', 'sim0']) assert.match(colorFor(id), /^#[0-9a-f]{6}$/i);
});

test('a welcome lights a couple of random diyas and can complete the board', () => {
  const w = new DiyaWorld({ cols: 2, rows: 1 }, seeded()); w.resize(1200, 600);
  const ev = w.lightRandom(1);
  assert.equal(ev.length, 1); assert.equal(w.litCount, 1);
  const ev2 = w.lightRandom(5);
  assert.equal(w.litCount, 2); assert.ok(ev2.some((e) => e.type === 'all'));
  assert.deepEqual(w.lightRandom(2), []);
});

// ---- Shy butterflies ----
import { FriendsWorld } from '../../frontend/js/games/friends/index.js';
const still = (x, y) => [{ id: 1, x, y }];

test('butterflies gather around a still person', () => {
  const w = new FriendsWorld({ count: 8 }, seeded()); w.resize(1200, 600);
  for (let i = 0; i < 60 * 8; i++) w.update(1 / 60, still(600, 300));
  const near = w.list.filter((b) => Math.hypot(b.x - 600, b.y - 300) < 600 * 0.45).length;
  assert.ok(near >= 7, `expected most butterflies near the person, got ${near}`);
  assert.ok(w.friends >= 1);
  const cells = new Set(w.list.map((b) => `${Math.round(b.x / 60)},${Math.round(b.y / 60)}`));
  assert.ok(cells.size >= 6, `butterflies should spread around the person, not pile up (${cells.size} distinct spots)`);
});

test('a fast hand sends them all running away', () => {
  const w = new FriendsWorld({ count: 8 }, seeded()); w.resize(1200, 600);
  for (let i = 0; i < 60 * 6; i++) w.update(1 / 60, still(600, 300));
  const d0 = w.list.reduce((s, b) => s + Math.hypot(b.x - 600, b.y - 300), 0);
  let scares = 0;
  for (let i = 0; i < 20; i++) scares += w.update(1 / 60, still(600 + i * 40, 300)).filter((e) => e.type === 'scare').length; // 40 px/frame = 4 heights/s
  assert.equal(scares, 1, 'one scare event, not one per frame');
  for (let i = 0; i < 90; i++) w.update(1 / 60, still(1000, 300));
  const d1 = w.list.reduce((s, b) => s + Math.hypot(b.x - 600, b.y - 300), 0);
  assert.ok(w.scared > 0 && d1 > d0 * 1.4, 'they flee and keep away while scared');
});

test('a jump (centre of the hands moving up fast) also scares them', () => {
  const w = new FriendsWorld({ count: 4 }, seeded()); w.resize(1200, 600);
  for (let i = 0; i < 120; i++) w.update(1 / 60, still(600, 400));
  let ev = [];
  for (let i = 0; i < 10; i++) ev.push(...w.update(1 / 60, still(600, 400 - i * 8))); // 8 px/frame = 0.8 heights/s upward
  assert.ok(ev.some((e) => e.type === 'scare'));
});

test('they come back after it has been calm again', () => {
  const w = new FriendsWorld({ count: 6 }, seeded()); w.resize(1200, 600);
  for (let i = 0; i < 60; i++) w.update(1 / 60, still(600 + (i % 2) * 300, 300));  // flailing
  for (let i = 0; i < 60 * 12; i++) w.update(1 / 60, still(600, 300));
  assert.equal(w.scared, 0);
  assert.ok(w.list.filter((b) => Math.hypot(b.x - 600, b.y - 300) < 300).length >= 4);
});

test('slow, normal movement does not scare them', () => {
  const w = new FriendsWorld({ count: 4 }, seeded()); w.resize(1200, 600);
  let scares = 0;
  for (let i = 0; i < 300; i++) scares += w.update(1 / 60, still(300 + i, 300)).filter((e) => e.type === 'scare').length; // 1 px/frame = 0.1 heights/s
  assert.equal(scares, 0);
});

test('shy butterflies: count and size can change while running', () => {
  const w = new FriendsWorld({ count: 6 }, seeded()); w.resize(1200, 600);
  const first = w.list[0];
  w.setCount(12); assert.equal(w.list.length, 12); assert.equal(w.list[0], first, 'existing butterflies are kept');
  w.setCount(3); assert.equal(w.list.length, 3);
  const s1 = w.size; w.sizeScale = 2; assert.equal(w.size, s1 * 2);
});

test('scared butterflies scatter in different directions and do not all end up in the corners', () => {
  const w = new FriendsWorld({ count: 24 }, seeded(11)); w.resize(1200, 600);
  for (let i = 0; i < 60 * 6; i++) w.update(1 / 60, still(600, 300));
  for (let i = 0; i < 20; i++) w.update(1 / 60, still(600 + i * 40, 300));  // the scare
  const dirs = new Set(), corner = (b) => (b.x < 240 || b.x > 960) && (b.y < 120 || b.y > 480);
  let cornered = 0, samples = 0;
  for (let i = 0; i < 90; i++) {
    w.update(1 / 60, still(1000, 300));
    if (i % 10 === 9) { for (const b of w.list) { dirs.add(Math.round(Math.atan2(b.vy, b.vx) / (Math.PI / 4))); if (corner(b)) cornered++; samples++; } }
  }
  assert.ok(dirs.size >= 6, `expected many different headings, got ${dirs.size}`);
  assert.ok(cornered / samples < 0.3, `too many in the corners: ${(100 * cornered / samples).toFixed(0)}%`);
});
