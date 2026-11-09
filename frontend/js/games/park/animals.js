// Canvas drawings for the park animals: simple bold shapes, facing right, feet at (0, 0); the caller flips and scales.
import { GAIT } from './world.js';

const ell = (g, x, y, rx, ry, rot = 0) => { g.beginPath(); g.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2); g.fill(); };
const eye = (g, x, y, r) => { g.fillStyle = '#fff'; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); g.fillStyle = '#111'; g.beginPath(); g.arc(x + r * 0.25, y, r * 0.5, 0, 7); g.fill(); };
const limb = (g, x1, y1, x2, y2, w) => { g.lineWidth = w; g.lineCap = 'round'; g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke(); };

const DRAW = {
  rabbit(g, a, c) {
    ell(g, 0, -0.34, 0.3, 0.26); ell(g, 0.26, -0.62, 0.17, 0.15);
    const tw = Math.sin(a.phase * 0.7) * 0.08;
    ell(g, 0.2, -0.88, 0.05, 0.2, -0.2 + tw); ell(g, 0.32, -0.88, 0.05, 0.2, 0.1 - tw);
    g.fillStyle = c.light; ell(g, -0.3, -0.36, 0.09, 0.09); ell(g, 0.2, -0.88, 0.025, 0.14, -0.2 + tw);
    eye(g, 0.33, -0.65, 0.04);
  },
  kangaroo(g, a, c) {
    ell(g, -0.05, -0.6, 0.26, 0.4, 0.3);
    g.beginPath(); g.moveTo(-0.2, -0.3); g.quadraticCurveTo(-0.6, -0.1, -0.8, 0); g.quadraticCurveTo(-0.5, 0.02, -0.15, -0.15); g.fill();
    ell(g, 0.0, -0.18, 0.12, 0.2, 0.4); g.fillRect(-0.02, -0.04, 0.34, 0.07);
    ell(g, 0.16, -1.05, 0.15, 0.1, 0.4); g.beginPath(); g.moveTo(0.24, -1.07); g.lineTo(0.42, -0.97); g.lineTo(0.3, -0.93); g.fill();
    ell(g, 0.07, -1.25, 0.035, 0.12, -0.2); ell(g, 0.15, -1.26, 0.035, 0.11, 0.1);
    g.strokeStyle = c.base; limb(g, 0.16, -0.72, 0.28, -0.58, 0.07);
    eye(g, 0.2, -1.07, 0.03);
  },
  elephant(g, a, c) {
    const step = a.moving ? Math.sin(a.phase * 0.8) : 0;
    ell(g, -0.05, -0.55, 0.5, 0.36);
    g.strokeStyle = c.base;
    for (const [lx, s] of [[-0.3, 1], [-0.12, -1], [0.18, 1], [0.34, -1]]) limb(g, lx, -0.35, lx + s * step * 0.05, 0, 0.14);
    ell(g, 0.5, -0.72, 0.24, 0.22); g.fillStyle = c.dark; ell(g, 0.36, -0.7, 0.16, 0.2);
    g.fillStyle = c.base; g.strokeStyle = c.base;
    g.lineWidth = 0.1; g.lineCap = 'round'; g.beginPath(); g.moveTo(0.68, -0.62); g.quadraticCurveTo(0.8 + Math.sin(a.phase * 0.5) * 0.04, -0.4, 0.7, -0.22); g.stroke();
    limb(g, -0.55, -0.6, -0.65, -0.35, 0.04);
    eye(g, 0.58, -0.78, 0.035);
  },
  cat(g, a, c) {
    ell(g, -0.05, -0.28, 0.36, 0.2); g.strokeStyle = c.base;
    const w = Math.sin(a.phase * 0.9);
    limb(g, -0.38, -0.3, -0.62, -0.5 + w * 0.08, 0.05); limb(g, -0.62, -0.5 + w * 0.08, -0.55, -0.72 + w * 0.1, 0.05);
    limb(g, -0.2, -0.1, -0.2, 0, 0.07); limb(g, 0.2, -0.1, 0.2, 0, 0.07);
    ell(g, 0.34, -0.45, 0.17, 0.15);
    g.beginPath(); g.moveTo(0.24, -0.56); g.lineTo(0.26, -0.76); g.lineTo(0.37, -0.6); g.fill(); g.beginPath(); g.moveTo(0.42, -0.6); g.lineTo(0.5, -0.76); g.lineTo(0.5, -0.5); g.fill();
    eye(g, 0.4, -0.47, 0.035);
  },
  frog(g, a, c) {
    ell(g, 0, -0.22, 0.4, 0.24); ell(g, 0.28, -0.3, 0.18, 0.15);
    g.strokeStyle = c.base; limb(g, -0.15, -0.12, -0.38, 0, 0.1); limb(g, 0.1, -0.1, 0.34, 0, 0.08);
    eye(g, 0.3, -0.5, 0.075); eye(g, 0.18, -0.48, 0.065);
    g.strokeStyle = c.dark; g.lineWidth = 0.025; g.beginPath(); g.arc(0.33, -0.3, 0.09, 0.2, 2.2); g.stroke();
  },
  bird(g, a, c) {
    ell(g, 0, -0.3, 0.32, 0.2, -0.1); ell(g, 0.3, -0.42, 0.14, 0.13);
    g.beginPath(); g.moveTo(0.42, -0.45); g.lineTo(0.6, -0.4); g.lineTo(0.42, -0.36); g.fillStyle = '#ffb13b'; g.fill(); g.fillStyle = c.base;
    g.beginPath(); g.moveTo(-0.3, -0.3); g.lineTo(-0.62, -0.38); g.lineTo(-0.58, -0.22); g.fill();
    const f = Math.sin(a.phase * 2.2);
    g.fillStyle = c.dark; g.save(); g.translate(-0.02, -0.4); g.rotate(-0.3 - f * 0.7); ell(g, 0, -0.2, 0.1, 0.3); g.restore();
    eye(g, 0.34, -0.45, 0.035);
  },
};

/** Draw one animal at its ground point (a.x, a.y), lifted by a.z, scaled to its kind. */
export function drawAnimal(g, a, h, quality = 2) {
  const gait = GAIT[a.kind], S = gait.size * h;
  const c = { base: `hsl(${a.hue}, 62%, 62%)`, dark: `hsl(${a.hue}, 55%, 40%)`, light: `hsl(${a.hue}, 70%, 85%)` };
  const squash = a.hop >= 0 ? 1 + 0.12 * Math.sin(Math.PI * Math.min(1, a.hop)) : 1;
  g.save(); g.globalAlpha = Math.max(0, Math.min(1, a.alpha));
  // soft shadow on the ground
  g.fillStyle = 'rgba(0,0,0,0.35)'; g.beginPath(); g.ellipse(a.x, a.y, S * 0.42 * (1 - Math.min(0.4, a.z / h * 3)), S * 0.09, 0, 0, 7); g.fill();
  if (quality > 0) { const gl = g.createRadialGradient(a.x, a.y - a.z - S * 0.4, 0, a.x, a.y - a.z - S * 0.4, S * 1.1); gl.addColorStop(0, `hsla(${a.hue}, 80%, 65%, 0.22)`); gl.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gl; g.fillRect(a.x - S * 1.2, a.y - a.z - S * 1.6, S * 2.4, S * 2.4); }
  g.translate(a.x, a.y - a.z); g.scale(a.face * S, S * squash / 1); g.lineWidth = 0.02;
  g.fillStyle = c.base; g.strokeStyle = c.base;
  DRAW[a.kind](g, a, c);
  g.restore();
  if (a.joy > 0) {  // a floating heart while they are happy
    g.save(); g.globalAlpha = Math.min(1, a.joy); g.fillStyle = '#ff7aa8'; g.font = `${S * 0.5}px sans-serif`; g.textAlign = 'center';
    g.fillText('♥', a.x, a.y - a.z - S * 1.5 - (1.5 - a.joy) * S * 0.4); g.restore();
  }
}
