import test from 'node:test';
import assert from 'node:assert/strict';
import { QuestWorld, FINALE_S } from '../../frontend/js/games/quest/logic.js';

test('rewards fill their own row; the finale starts exactly when every target is met', () => {
  const w = new QuestWorld({ laddu: 2, fuljhadi: 1 });
  assert.deepEqual(w.give('laddu')[0], { type: 'reward', reward: 'laddu', n: 1, overflow: false });
  assert.equal(w.phase, 'playing');
  w.give('laddu');
  assert.equal(w.phase, 'playing', 'laddu done but fuljhadi still missing');
  const ev = w.give('fuljhadi');
  assert.ok(ev.some((e) => e.type === 'finale')); assert.equal(w.phase, 'finale'); assert.equal(w.rounds, 1);
});

test('extra rewards are celebrated but do not count past the target', () => {
  const w = new QuestWorld({ laddu: 1, fuljhadi: 2 });
  w.give('laddu');
  const ev = w.give('laddu');
  assert.equal(ev[0].overflow, true); assert.equal(w.counts.laddu, 1);
});

test('a reward with no target on this scoreboard is ignored, not crashed on', () => {
  const w = new QuestWorld({ laddu: 1 });
  assert.equal(w.give('diya')[0].type, 'ignored'); assert.equal(w.total, 0);
});

test('nothing is awarded during the finale; after it the board resets for another round', () => {
  const w = new QuestWorld({ laddu: 1 });
  w.give('laddu');
  assert.deepEqual(w.give('laddu'), []);
  assert.equal(w.update(FINALE_S - 1), false);
  assert.equal(w.update(2), true);
  assert.equal(w.phase, 'playing'); assert.equal(w.total, 0); assert.equal(w.give('laddu')[0].n, 1);
});

test('bad or empty targets fall back to the defaults', () => {
  const w = new QuestWorld({ laddu: -3, x: 'many' });
  assert.deepEqual(w.targets, { laddu: 10, fuljhadi: 5 });
  w.setTargets({ laddu: 4 }); assert.deepEqual(w.targets, { laddu: 4 });
});
