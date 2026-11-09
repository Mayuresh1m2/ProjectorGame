// Pure geometry helpers (no DOM): homographies for surface warping, quad <-> rect conversions.

/** Solve the 3x3 homography H (h33 = 1) mapping each src[i] -> dst[i] (4 point pairs). Returns row-major [9]. */
export function solveHomography(src, dst) {
  const A = [], b = [];
  for (let i = 0; i < 4; i++) {
    const [x, y] = src[i], [u, v] = dst[i];
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]); b.push(u);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y]); b.push(v);
  }
  const h = gauss(A, b);
  if (!h) return null;
  return [...h, 1];
}

function gauss(A, b) {
  const n = b.length;
  const M = A.map((r, i) => [...r, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    if (Math.abs(M[p][c]) < 1e-12) return null;
    [M[c], M[p]] = [M[p], M[c]];
    for (let r = c + 1; r < n; r++) {
      const f = M[r][c] / M[c][c];
      for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k];
    }
  }
  const x = new Array(n).fill(0);
  for (let r = n - 1; r >= 0; r--) {
    let s = M[r][n];
    for (let k = r + 1; k < n; k++) s -= M[r][k] * x[k];
    x[r] = s / M[r][r];
  }
  return x;
}

export function applyH(H, x, y) {
  const w = H[6] * x + H[7] * y + H[8];
  return [(H[0] * x + H[1] * y + H[2]) / w, (H[3] * x + H[4] * y + H[5]) / w];
}

export function invert3(m) {
  const [a, b, c, d, e, f, g, h, i] = m;
  const A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g;
  const det = a * A + b * B + c * C;
  if (Math.abs(det) < 1e-14) return null;
  const s = 1 / det;
  return [A * s, -(b * i - c * h) * s, (b * f - c * e) * s,
          B * s, (a * i - c * g) * s, -(a * f - c * d) * s,
          C * s, -(a * h - b * g) * s, (a * e - b * d) * s];
}

/** Homography mapping the rectangle (0,0)-(w,h) onto quad (TL,TR,BR,BL in px). */
export function rectToQuad(w, h, quad) {
  return solveHomography([[0, 0], [w, 0], [w, h], [0, h]], quad);
}

/** CSS matrix3d() string for an element with transform-origin 0 0 and size w x h. */
export function cssMatrix3d(H) {
  const n = (v) => (Math.abs(v) < 1e-12 ? 0 : +v.toPrecision(12));
  return `matrix3d(${[H[0], H[3], 0, H[6], H[1], H[4], 0, H[7], 0, 0, 1, 0, H[2], H[5], 0, H[8]].map(n).join(',')})`;
}

const len = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

/** Natural content size of a quad (px): mean of opposite edge lengths. */
export function quadSize(quadPx) {
  return {
    w: Math.max(2, Math.round((len(quadPx[0], quadPx[1]) + len(quadPx[3], quadPx[2])) / 2)),
    h: Math.max(2, Math.round((len(quadPx[0], quadPx[3]) + len(quadPx[1], quadPx[2])) / 2)),
  };
}

/**
 * Rect description -> quad. cx, cy, w, h are fractions of the output; rot in degrees.
 * Rotation is done in pixel space (aspect = outW / outH) so rotated rectangles stay rectangular.
 */
export function quadFromRect({ cx, cy, w, h, rot = 0 }, aspect) {
  const r = (rot * Math.PI) / 180, c = Math.cos(r), s = Math.sin(r);
  return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sy]) => {
    const px = (sx * w * aspect) / 2, py = (sy * h) / 2;
    return [cx + (px * c - py * s) / aspect, cy + (px * s + py * c)];
  });
}

export function rectFromQuad(q, aspect) {
  const P = q.map(([x, y]) => [x * aspect, y]);
  const cx = P.reduce((a, p) => a + p[0], 0) / 4, cy = P.reduce((a, p) => a + p[1], 0) / 4;
  const w = (len(P[0], P[1]) + len(P[3], P[2])) / 2, h = (len(P[0], P[3]) + len(P[1], P[2])) / 2;
  const rot = (Math.atan2(P[1][1] - P[0][1], P[1][0] - P[0][0]) * 180) / Math.PI;
  return { cx: cx / aspect, cy, w: w / aspect, h, rot };
}

export function pointInPolygon(p, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > p[1]) !== (yj > p[1]) && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
export const easeOut = (t) => 1 - Math.pow(1 - t, 3);
