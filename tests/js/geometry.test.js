import test from 'node:test';
import assert from 'node:assert/strict';
import { solveHomography, applyH, invert3, rectToQuad, cssMatrix3d, quadFromRect, rectFromQuad, quadSize, pointInPolygon } from '../../frontend/js/core/geometry.js';

const near = (a, b, e = 1e-6) => assert.ok(Math.abs(a - b) < e, `${a} !~ ${b}`);

test('homography maps source corners to destination corners', () => {
  const src = [[0, 0], [1, 0], [1, 1], [0, 1]], dst = [[0.1, 0.2], [0.9, 0.1], [0.8, 0.9], [0.2, 0.8]];
  const H = solveHomography(src, dst);
  src.forEach((p, i) => { const [x, y] = applyH(H, ...p); near(x, dst[i][0]); near(y, dst[i][1]); });
});

test('inverse homography round-trips', () => {
  const H = rectToQuad(400, 300, [[100, 50], [700, 80], [650, 500], [60, 420]]);
  const inv = invert3(H);
  const [x, y] = applyH(inv, ...applyH(H, 123, 77));
  near(x, 123, 1e-6); near(y, 77, 1e-6);
});

test('rect quad is an affine (no perspective) matrix3d', () => {
  const H = rectToQuad(100, 50, [[10, 10], [110, 10], [110, 60], [10, 60]]);
  near(H[6], 0); near(H[7], 0);
  assert.match(cssMatrix3d(H), /^matrix3d\(/);
  assert.equal(cssMatrix3d(H).split(',').length, 16);
});

test('quadFromRect <-> rectFromQuad round trip including rotation and aspect', () => {
  const r = { cx: 0.4, cy: 0.55, w: 0.3, h: 0.2, rot: 25 };
  const out = rectFromQuad(quadFromRect(r, 16 / 9), 16 / 9);
  for (const k of Object.keys(r)) near(out[k], r[k], 1e-9);
});

test('rotated rectangles stay rectangular in pixel space', () => {
  const a = 16 / 9, q = quadFromRect({ cx: 0.5, cy: 0.5, w: 0.4, h: 0.3, rot: 37 }, a).map(([x, y]) => [x * a, y]);
  const d = (p, r) => Math.hypot(p[0] - r[0], p[1] - r[1]);
  near(d(q[0], q[1]), d(q[3], q[2])); near(d(q[0], q[3]), d(q[1], q[2]));
  const dot = (q[1][0] - q[0][0]) * (q[3][0] - q[0][0]) + (q[1][1] - q[0][1]) * (q[3][1] - q[0][1]);
  near(dot, 0, 1e-9);
});

test('quadSize uses mean opposite edge lengths', () => {
  assert.deepEqual(quadSize([[0, 0], [200, 0], [200, 100], [0, 100]]), { w: 200, h: 100 });
});

test('pointInPolygon', () => {
  const tri = [[0, 0], [1, 0], [0.5, 1]];
  assert.ok(pointInPolygon([0.5, 0.3], tri)); assert.ok(!pointInPolygon([0.05, 0.9], tri));
});

test('degenerate quad yields no homography', () => {
  assert.equal(solveHomography([[0, 0], [1, 0], [1, 1], [0, 1]], [[0, 0], [0, 0], [0, 0], [0, 0]]), null);
});
