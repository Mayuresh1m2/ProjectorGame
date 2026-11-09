import test from 'node:test';
import assert from 'node:assert/strict';
import { ClapDetector } from '../../frontend/js/core/cues.js';

const run = (det, levels, dt = 1 / 60) => levels.map((l) => det.feed(l, dt)).filter(Boolean).length;
const quiet = (n, v = 0.01) => Array(n).fill(v);

test('a sharp spike over a quiet room is one clap', () => {
  assert.equal(run(new ClapDetector(), [...quiet(120), 0.4, 0.3, 0.1, ...quiet(60)]), 1);
});
test('steady loud music or talking is not a clap', () => {
  const d = new ClapDetector();
  const ramp = Array.from({ length: 300 }, (_, i) => Math.min(0.25, 0.01 + i * 0.002));  // gradually louder
  assert.equal(run(d, ramp), 0);
});
test('two claps half a second apart are two; a double-hit within the refractory window is one', () => {
  assert.equal(run(new ClapDetector(), [...quiet(60), 0.4, ...quiet(40), 0.4, ...quiet(30)]), 2);
  assert.equal(run(new ClapDetector(), [...quiet(60), 0.4, ...quiet(5), 0.4, ...quiet(30)]), 1);
});
test('small noises below the minimum level are ignored', () => {
  assert.equal(run(new ClapDetector(), [...quiet(120), 0.08, ...quiet(30)]), 0);
});
