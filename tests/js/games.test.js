import test from 'node:test';
import assert from 'node:assert/strict';
import { FishWorld } from '../../frontend/js/games/fish/logic.js';
import { BalloonWorld } from '../../frontend/js/games/balloons/logic.js';

const seeded = (seed = 3) => () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };

test('fish swim away from an approaching hand', () => {
  const w = new FishWorld({}, seeded()); w.resize(1280, 720); w.reset();
  const f = w.fish[0]; f.x = 600; f.y = 360; f.vx = 0; f.vy = 0; w.fish.slice(1).forEach((o) => { o.x = 50; o.y = 50; });
  const hand = [{ id: 1, x: 560, y: 360 }];
  const d0 = Math.hypot(f.x - 560, f.y - 360);
  for (let i = 0; i < 40; i++) w.update(1 / 60, hand);
  assert.ok(Math.hypot(f.x - 560, f.y - 360) > d0 * 1.5);
  assert.ok(w.score >= 1);
});

test('fish ignore far-away hands', () => {
  const w = new FishWorld({}, seeded()); w.resize(1280, 720); w.reset();
  for (let i = 0; i < 60; i++) w.update(1 / 60, [{ id: 1, x: 5000, y: 5000 }]);
  assert.equal(w.score, 0);
});

test('fish stay within vertical bounds and population is kept', () => {
  const w = new FishWorld({}, seeded()); w.resize(1280, 720); w.reset();
  for (let i = 0; i < 600; i++) w.update(1 / 60, [{ id: 1, x: 640 + 300 * Math.sin(i / 20), y: 360 }]);
  assert.ok(w.fish.every((f) => f.y >= 0 && f.y <= 720));
  assert.equal(w.fish.length, w.target);
});

test('balloon pops when touched and scores once', () => {
  const w = new BalloonWorld({}, seeded()); w.resize(1280, 720); w.reset();
  const b = w.balloons[0]; b.x = 400; b.y = 400;
  const ev = w.update(1 / 60, [{ id: 1, x: 400, y: 405 }]);
  assert.equal(ev.filter((e) => e.type === 'pop').length, 1);
  assert.equal(w.score, 1);
  w.update(1 / 60, [{ id: 1, x: 400, y: 405 }]);
  assert.equal(w.score, 1);
});

test('balloons rise, never pop without a hand, and leave the screen', () => {
  const w = new BalloonWorld({}, seeded()); w.resize(1280, 720); w.reset();
  const y0 = w.balloons.map((b) => b.y);
  for (let i = 0; i < 120; i++) w.update(1 / 60, []);
  assert.equal(w.score, 0);
  assert.ok(w.balloons.some((b, i) => y0[i] === undefined || b.y < y0[i] + 1));
  for (let i = 0; i < 60 * 60; i++) w.update(1 / 60, []);
  assert.ok(w.balloons.every((b) => b.y > -300), 'balloons that left the top are removed');
  assert.ok(w.balloons.length > 0, 'new balloons keep appearing');
});
