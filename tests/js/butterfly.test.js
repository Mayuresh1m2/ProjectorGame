import test from 'node:test';
import assert from 'node:assert/strict';
import { ButterflyWorld, State, DIFFICULTY } from '../../frontend/js/games/butterfly/logic.js';

function seeded(seed = 7) { // mulberry32
  return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const mk = (s = {}) => { const w = new ButterflyWorld({ butterflies: 6, ...s }, seeded()); w.resize(1280, 720); w.reset(); return w; };
const run = (w, secs, hands = [], dt = 1 / 60) => { const ev = []; for (let t = 0; t < secs; t += dt) ev.push(...w.update(dt, hands)); return ev; };

test('reset spawns the configured number of butterflies in SPAWNING state', () => {
  const w = mk({ butterflies: 5 });
  assert.equal(w.butterflies.length, 5);
  assert.ok(w.butterflies.every((b) => b.state === State.SPAWNING));
});

test('spawning butterflies fade in then fly', () => {
  const w = mk();
  run(w, 0.3);
  assert.ok(w.butterflies.every((b) => b.alpha > 0 && b.alpha < 1));
  run(w, 1.5);
  assert.ok(w.butterflies.every((b) => b.state === State.FLYING && b.alpha === 1));
});

test('butterflies stay roughly inside the screen while wandering', () => {
  const w = mk();
  run(w, 40);
  for (const b of w.butterflies) { assert.ok(b.x > -100 && b.x < 1380 && b.y > -100 && b.y < 820, `out of bounds ${b.x},${b.y}`); }
});

test('movement is continuous: no teleporting between frames', () => {
  const w = mk();
  const hand = [{ id: 1, x: 640, y: 360 }];
  run(w, 1.5);
  let maxStep = 0;
  for (let i = 0; i < 600; i++) {
    const before = w.butterflies.map((b) => [b.id, b.x, b.y]);
    w.update(1 / 60, hand);
    for (const [id, x, y] of before) { const b = w.butterflies.find((q) => q.id === id); if (b) maxStep = Math.max(maxStep, Math.hypot(b.x - x, b.y - y)); }
  }
  assert.ok(maxStep < 0.06 * 720, `max per-frame step ${maxStep}px`);
});

test('a hand attracts a nearby butterfly, which lands, scores, and is replaced', () => {
  const w = mk();
  run(w, 1.5);
  const hand = [{ id: 1, x: 640, y: 360 }];
  const ev = run(w, 8, hand);
  assert.ok(ev.some((e) => e.type === 'landed'), 'no landing happened');
  assert.ok(w.score >= 1);
  assert.ok(w.butterflies.length >= 6, 'replacement butterfly should have been spawned');
});

test('state sequence: FLYING -> CHASING_HAND -> LANDING -> RESTING', () => {
  const w = mk({ butterflies: 1, difficulty: 'easy' });
  run(w, 1.5);
  const hand = [{ id: 1, x: w.butterflies[0].x + 100, y: w.butterflies[0].y }];
  const seen = [];
  for (let i = 0; i < 60 * 12; i++) {
    w.update(1 / 60, hand);
    const b = w.butterflies[0]; const st = b.state;
    if (seen[seen.length - 1] !== st) seen.push(st);
    if (st === State.RESTING) break;
  }
  const idx = (s) => seen.indexOf(s);
  assert.ok(idx(State.CHASING_HAND) >= 0 && idx(State.LANDING) > idx(State.CHASING_HAND) && idx(State.RESTING) > idx(State.LANDING), seen.join('>'));
});

test('resting butterfly sits on the moving hand', () => {
  const w = mk({ butterflies: 1, difficulty: 'easy' });
  run(w, 1.5);
  let hand = { id: 1, x: w.butterflies[0].x + 60, y: w.butterflies[0].y };
  for (let i = 0; i < 60 * 6 && !w.butterflies.some((b) => b.state === State.RESTING); i++) w.update(1 / 60, [hand]);
  const rest = w.butterflies.find((b) => b.state === State.RESTING);
  assert.ok(rest, 'never rested');
  hand = { ...hand, x: hand.x + 5, y: hand.y + 2 }; // gentle move
  w.update(1 / 60, [hand]);
  assert.ok(Math.hypot(rest.x - hand.x, rest.y - hand.y) < 0.05 * 720);
});

test('fast hand startles a resting butterfly into FLYING_AWAY', () => {
  const w = mk({ butterflies: 1, difficulty: 'easy' });
  run(w, 1.5);
  let x = w.butterflies[0].x + 60; const y = w.butterflies[0].y;
  for (let i = 0; i < 60 * 6 && !w.butterflies.some((b) => b.state === State.RESTING); i++) w.update(1 / 60, [{ id: 1, x, y }]);
  const rest = w.butterflies.find((b) => b.state === State.RESTING);
  assert.ok(rest);
  for (let i = 0; i < 20; i++) { x += 40; w.update(1 / 60, [{ id: 1, x, y }]); }
  assert.equal(rest.state, State.FLYING_AWAY);
});

test('butterfly abandons a hand that disappears', () => {
  const w = mk({ butterflies: 1 });
  run(w, 1.5);
  const b = w.butterflies[0];
  const hand = [{ id: 1, x: b.x + 150, y: b.y }];
  for (let i = 0; i < 30 && b.state !== State.CHASING_HAND; i++) w.update(1 / 60, hand);
  assert.equal(b.state, State.CHASING_HAND);
  run(w, 1.0, []);
  assert.notEqual(b.state, State.CHASING_HAND);
  assert.equal(b.target, null);
});

test('a single-frame ghost hand does not attract butterflies', () => {
  const w = mk({ butterflies: 3 });
  run(w, 1.5);
  const b = w.butterflies[0];
  w.update(1 / 60, [{ id: 9, x: b.x + 20, y: b.y }]);
  w.update(1 / 60, []);
  assert.ok(w.butterflies.every((q) => q.state !== State.CHASING_HAND));
});

test('one hand attracts at most `chasers` butterflies (calm behavior)', () => {
  const w = mk({ butterflies: 12, difficulty: 'hard', interactionDistance: 0.001 });
  run(w, 1.5);
  const hand = [{ id: 1, x: 640, y: 360 }];
  let maxEngaged = 0;
  for (let i = 0; i < 300; i++) { w.update(1 / 60, hand); maxEngaged = Math.max(maxEngaged, w.butterflies.filter((b) => b.target === 1).length); }
  assert.ok(maxEngaged <= DIFFICULTY.hard.chasers, `engaged ${maxEngaged}`);
});

test('two hands each attract their own butterflies', () => {
  const w = mk({ butterflies: 10, difficulty: 'easy' });
  run(w, 1.5);
  const hands = [{ id: 1, x: 300, y: 360 }, { id: 2, x: 980, y: 360 }];
  const ev = run(w, 10, hands);
  const landed = ev.filter((e) => e.type === 'landed');
  assert.ok(landed.some((e) => e.x === 300) && landed.some((e) => e.x === 980));
});

test('population is maintained at the target count', () => {
  const w = mk({ butterflies: 7 });
  run(w, 20);
  assert.equal(w.activeCount, 7);
});

test('settings: speed multiplier changes travel distance', () => {
  const dist = (speed) => {
    const w = mk({ butterflies: 1, speed }); run(w, 1.5);
    const b = w.butterflies[0]; let d = 0, lx = b.x, ly = b.y;
    for (let i = 0; i < 300; i++) { w.update(1 / 60); d += Math.hypot(b.x - lx, b.y - ly); lx = b.x; ly = b.y; }
    return d;
  };
  assert.ok(dist(2) > dist(0.5) * 1.5);
});

test('huge dt (tab was in the background) is clamped', () => {
  const w = mk(); run(w, 1.5);
  const before = w.butterflies.map((b) => [b.x, b.y]);
  w.update(30, []);
  w.butterflies.slice(0, before.length).forEach((b, i) => assert.ok(Math.hypot(b.x - before[i][0], b.y - before[i][1]) < 0.08 * 720));
});
