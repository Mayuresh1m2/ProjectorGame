import test from 'node:test';
import assert from 'node:assert/strict';
import { PlayerTracker, ParkWorld, ANIMALS, GAIT } from '../../frontend/js/games/park/world.js';
import { ParkGame } from '../../frontend/js/games/park/index.js';

const seeded = (seed = 7) => () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
const H = 720, W = 1280, DT = 1 / 30;
const world = () => { const w = new ParkWorld({}, seeded()); w.resize(W, H); return w; };
const run = (w, secs, hands, dt = DT) => { const ev = []; for (let t = 0; t < secs; t += dt) ev.push(...w.update(dt, typeof hands === 'function' ? hands(t) : hands)); return ev; };

test('two hands close together are one player; far apart hands are two', () => {
  const t = new PlayerTracker();
  assert.equal(t.update(DT, [{ x: 600, y: 400 }, { x: 700, y: 420 }], H).length, 1);
  const t2 = new PlayerTracker();
  assert.equal(t2.update(DT, [{ x: 100, y: 400 }, { x: 1100, y: 420 }], H).length, 2);
});

test('a player keeps its id while moving and is forgotten after a while without hands', () => {
  const t = new PlayerTracker();
  t.update(DT, [{ x: 300, y: 400 }], H); const id = t.players[0].id;
  for (let i = 1; i <= 30; i++) t.update(DT, [{ x: 300 + i * 6, y: 400 }], H);
  assert.equal(t.players.length, 1); assert.equal(t.players[0].id, id);
  for (let i = 0; i < 20; i++) t.update(DT, [], H);
  assert.equal(t.players.length, 1);           // still remembered (1.5 s)
  for (let i = 0; i < 40; i++) t.update(DT, [], H);
  assert.equal(t.players.length, 0);
});

test('at most six players, and each gets a different animal while the bag lasts', () => {
  const w = world();
  const hands = Array.from({ length: 10 }, (_, i) => ({ id: i, x: 100 + (i % 4) * 330, y: i < 4 ? 150 : i < 8 ? 600 : 380 }));
  run(w, 1, hands);
  assert.equal(w.animals.length, 6);
  assert.equal(new Set(w.animals.map((a) => a.kind)).size, 6);
  assert.ok(w.animals.every((a) => ANIMALS.includes(a.kind)));
});

test('standing still by a flower blooms it, and moving on does not', () => {
  const w = world(), f = w.flowers[3], pos = { id: 1, x: f.x * W, y: f.y * H };
  run(w, 1, [pos]); assert.ok(f.bloom < 0.2);
  const ev = run(w, 4, [pos]);
  assert.ok(ev.some((e) => e.type === 'bloom' && e.i === 3));
  assert.ok(f.bloom > 0.8);
  const w2 = world(), g = w2.flowers[3];
  const ev2 = run(w2, 4, (t) => [{ id: 1, x: g.x * W + 300 * Math.sin(t * 2.5), y: g.y * H }]);
  assert.ok(!ev2.some((e) => e.type === 'bloom'));
});

test('standing by a tree lights its lanterns, and they go out again later', () => {
  const w = world(), t = w.trees[0];
  const ev = run(w, 5, [{ id: 1, x: t.x * W, y: (t.y + 0.18) * H }]);
  assert.ok(ev.some((e) => e.type === 'lantern'));
  assert.ok(t.glow > 0.8);
  run(w, 30, []);
  assert.ok(t.glow < 0.1);
});

test('standing in the pond adds lilies; they drift away so it can happen again', () => {
  const w = world(), p = w.pond, pos = { id: 1, x: p.x * W, y: p.y * H };
  const ev = run(w, 5, [pos]);
  assert.ok(ev.filter((e) => e.type === 'lily').length >= 2);
  const n = p.lilies; run(w, 40, []);
  assert.ok(p.lilies < n);
});

test('a fast movement splashes the pond, shakes a tree, or sparkles in the open', () => {
  const fast = (x0, y0) => (t) => [{ id: 1, x: x0 + 700 * ((t * 1.3) % 1), y: y0 }];
  const w = world();
  assert.ok(run(w, 1.5, fast(w.trees[0].x * W - 350, (w.trees[0].y + 0.1) * H)).some((e) => e.type === 'leaves' || e.type === 'sparkle'));
  const w2 = world();
  const ev = run(w2, 1.5, (t) => [{ id: 1, x: w2.pond.x * W + 500 * Math.sin(t * 4), y: w2.pond.y * H }]);
  assert.ok(ev.some((e) => e.type === 'splash'));
  const w3 = world();
  assert.ok(run(w3, 1.5, fast(100, 150)).some((e) => e.type === 'sparkle'));
});

test('two still players standing near each other become friends and their animals are happy', () => {
  const w = world();
  const ev = run(w, 4, [{ id: 1, x: 400, y: 400 }, { id: 2, x: 800, y: 400 }]);   // 400 px apart: two people, close enough to be friends
  assert.ok(ev.some((e) => e.type === 'friends'));
  const w2 = world();
  assert.ok(!run(w2, 4, [{ id: 1, x: 100, y: 150 }, { id: 2, x: 1180, y: 650 }]).some((e) => e.type === 'friends'));   // far apart
  const w3 = world();
  assert.ok(!run(w3, 4, (t) => [{ id: 1, x: 300 + 200 * Math.sin(t * 3), y: 400 }, { id: 2, x: 800, y: 400 }]).some((e) => e.type === 'friends'));   // one keeps moving
});

test('hoppers leap in arcs toward the person, walkers walk, birds glide; all stay on screen', () => {
  for (const kind of ANIMALS) {
    const w = world(); w.nextKind = () => kind;
    run(w, 0.1, [{ id: 1, x: 100, y: 500 }]);
    const a = w.animals[0]; a.x = 100; a.y = 500;
    let maxZ = 0;
    const ev = (t) => { const k = Math.min(1, t / 2); return [{ id: 1, x: 100 + 1000 * k, y: 500 - 200 * k }]; };
    for (let t = 0; t < 12; t += DT) { w.update(DT, ev(t)); maxZ = Math.max(maxZ, a.z); assert.ok(a.x >= 0 && a.x <= W && a.y >= 0 && a.y <= H, kind); }
    assert.ok(Math.hypot(a.x - 1100, a.y - 300) < 0.12 * H, `${kind} reached the person (${a.x | 0},${a.y | 0})`);
    if (GAIT[kind].mode !== 'walk') assert.ok(maxZ > 0.02 * H, `${kind} leaves the ground`);
  }
});

test('hop length follows the animal: a kangaroo covers more ground per leap than a frog', () => {
  const leap = (kind) => { const w = world(); w.nextKind = () => kind; run(w, 0.05, [{ id: 1, x: 1100, y: 400 }]); const a = w.animals[0]; a.x = 100; a.y = 400; a.rest = 0;
    for (let i = 0; i < 60 && a.hop < 0; i++) w.update(DT, [{ id: 1, x: 1100, y: 400 }]); return Math.hypot(a.hopTo.x - a.hopFrom.x, a.hopTo.y - a.hopFrom.y); };
  assert.ok(leap('kangaroo') > leap('frog') * 2);
});

test('an animal fades and goes to sleep when its person leaves, then is removed', () => {
  const w = world(); run(w, 1, [{ id: 1, x: 400, y: 400 }]);
  run(w, 1.2, []); assert.ok(w.animals[0].alpha < 1);
  run(w, 3, []); assert.equal(w.animals.length, 0);
});

test('the game renders every scene state without throwing', () => {
  const calls = []; const ctx = new Proxy({}, { get: (_, k) => (k === 'createLinearGradient' || k === 'createRadialGradient' ? () => ({ addColorStop() {} }) : typeof k === 'string' ? (() => { calls.push(k); }) : undefined), set: () => true });
  const g = new ParkGame({ settings: {}, quality: 2 }); g.resize(W, H);
  for (let i = 0; i < 300; i++) { g.update(DT, [{ id: 1, x: 200 + i * 3, y: 400 + 80 * Math.sin(i / 10) }, { id: 2, x: 900, y: 300 }]); g.render(ctx); }
  assert.ok(calls.length > 1000);
  g.restart(); g.render(ctx);
});
