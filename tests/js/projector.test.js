import test from 'node:test';
import assert from 'node:assert/strict';
import { imageSize, distanceFor, totalEstimate, feel } from '../../frontend/js/core/projector.js';

const near = (a, b, e = 0.01) => assert.ok(Math.abs(a - b) < e, `${a} !~ ${b}`);

test('image size follows distance / throw ratio', () => {
  const s = imageSize(1.2, 3);
  near(s.width, 2.5); near(s.height, 1.406); near(s.minIcon, 0.1406);
  near(imageSize(0.5, 1.25).width, 2.5);
  near(imageSize(1.2, 3, '4:3').height, 1.875);
});
test('bad input gives null', () => {
  assert.equal(imageSize(0, 3), null); assert.equal(imageSize(1.2, -1), null); assert.equal(imageSize(1.2, 3, '1:1'), null);
});
test('distance round-trips', () => { near(distanceFor(1.2, imageSize(1.2, 3).width), 3); });
test('total adds the measured laptop-side time', () => {
  assert.deepEqual(totalEstimate({ medianMs: 120, trackingMs: 25 }), { displayToLaptopMs: 120, trackingMs: 25, totalMs: 145 });
  assert.equal(totalEstimate({ medianMs: 120 }).totalMs, null);
  assert.equal(totalEstimate({}), null);
});
test('feel buckets', () => { assert.match(feel(50), /instant/); assert.match(feel(200), /responsive/); assert.match(feel(300), /late/); assert.match(feel(500), /laggy/); });
