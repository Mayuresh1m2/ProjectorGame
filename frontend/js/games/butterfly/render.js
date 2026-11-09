// Canvas drawing for the butterfly game: background, butterflies, particles. No game rules in here.
import { State } from './logic.js';

/** Pre-render the static meadow once per resize (cheap per-frame cost). */
export function makeBackground(w, h, rng = Math.random) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d');
  const sky = g.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, '#9fd8f5'); sky.addColorStop(0.55, '#d8f1fb'); sky.addColorStop(1, '#fff6dc');
  g.fillStyle = sky; g.fillRect(0, 0, w, h);
  const sun = g.createRadialGradient(w * 0.82, h * 0.16, 0, w * 0.82, h * 0.16, h * 0.35);
  sun.addColorStop(0, 'rgba(255,248,200,0.95)'); sun.addColorStop(0.25, 'rgba(255,240,170,0.5)'); sun.addColorStop(1, 'rgba(255,240,170,0)');
  g.fillStyle = sun; g.fillRect(0, 0, w, h);
  const hill = (base, amp, color, phase) => {
    g.fillStyle = color; g.beginPath(); g.moveTo(0, h);
    for (let x = 0; x <= w; x += 8) g.lineTo(x, h * base + Math.sin(x / w * Math.PI * 2 + phase) * amp * h + Math.sin(x / w * 9 + phase) * amp * h * 0.25);
    g.lineTo(w, h); g.closePath(); g.fill();
  };
  hill(0.72, 0.04, '#b9e3a4', 0); hill(0.8, 0.035, '#9bd48b', 2); hill(0.9, 0.025, '#7ec47a', 4);
  const petals = ['#ff9ec4', '#ffd36e', '#ffffff', '#c7a6ff', '#ff8f7a'];
  for (let i = 0; i < Math.round(w / 22); i++) { // flowers in the foreground meadow
    const x = rng() * w, y = h * (0.82 + rng() * 0.17), r = h * (0.008 + rng() * 0.012);
    g.strokeStyle = '#5da86a'; g.lineWidth = Math.max(1, r * 0.3);
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + (rng() - 0.5) * r, y + r * 3.5); g.stroke();
    g.fillStyle = petals[Math.floor(rng() * petals.length)];
    for (let p = 0; p < 5; p++) { const a = (p / 5) * Math.PI * 2; g.beginPath(); g.arc(x + Math.cos(a) * r, y + Math.sin(a) * r, r * 0.7, 0, Math.PI * 2); g.fill(); }
    g.fillStyle = '#ffe27a'; g.beginPath(); g.arc(x, y, r * 0.6, 0, Math.PI * 2); g.fill();
  }
  return c;
}

export function drawClouds(g, w, h, t, count) {
  g.save(); g.fillStyle = 'rgba(255,255,255,0.8)';
  for (let i = 0; i < count; i++) {
    const sp = 6 + i * 3, x = ((t * sp + i * w * 0.37) % (w + 400)) - 200, y = h * (0.1 + 0.11 * ((i * 53) % 4)), s = h * (0.045 + 0.012 * (i % 3));
    for (const [dx, dy, r] of [[0, 0, 1], [1.1, 0.2, 0.8], [-1.1, 0.25, 0.75], [0.4, -0.5, 0.8]]) { g.beginPath(); g.arc(x + dx * s, y + dy * s, r * s, 0, Math.PI * 2); g.fill(); }
  }
  g.restore();
}

function wingPaths(g, side, f, fore, hind) {
  // side: +1 right, -1 left; f: flap openness 0.12..1 (scales width, giving a front-view flap)
  g.save(); g.scale(side * f, 1);
  g.fillStyle = fore;
  g.beginPath(); g.moveTo(0, -0.04);
  g.bezierCurveTo(0.25, -0.62, 0.98, -0.66, 0.94, -0.2); g.bezierCurveTo(0.92, 0.0, 0.5, 0.1, 0, 0.04);
  g.closePath(); g.fill();
  g.fillStyle = hind;
  g.beginPath(); g.moveTo(0, 0.02);
  g.bezierCurveTo(0.55, 0.0, 0.86, 0.26, 0.6, 0.56); g.bezierCurveTo(0.36, 0.72, 0.08, 0.44, 0, 0.12);
  g.closePath(); g.fill();
  g.fillStyle = 'rgba(255,255,255,0.75)'; // wing spots
  for (const [x, y, r] of [[0.66, -0.3, 0.075], [0.82, -0.14, 0.05], [0.52, 0.34, 0.06]]) { g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); }
  g.strokeStyle = 'rgba(80,40,90,0.35)'; g.lineWidth = 0.018;
  g.beginPath(); g.moveTo(0, -0.04); g.bezierCurveTo(0.25, -0.62, 0.98, -0.66, 0.94, -0.2); g.stroke();
  g.restore();
}

export function drawButterfly(g, b, animSpeed = 1) {
  const resting = b.state === State.RESTING;
  // openness: |cos| flap for flying; slow gentle open/close while resting
  const raw = resting ? 0.6 + 0.4 * Math.sin(b.flap) : Math.abs(Math.cos(b.flap));
  const f = 0.14 + 0.86 * raw;
  const sat = b.sat ?? 85, lit = b.lit ?? 66; // games may recolour (e.g. pale glowing butterflies)
  const fore = `hsl(${b.hue}, ${sat}%, ${lit}%)`, hind = `hsl(${(b.hue + 28) % 360}, ${b.sat === undefined ? 90 : sat}%, ${Math.min(96, lit + 8)}%)`;
  g.save();
  g.globalAlpha = b.alpha;
  g.translate(b.x, b.y); g.rotate(b.rotation); g.scale(b.size * b.grow, b.size * b.grow);
  g.fillStyle = 'rgba(0,0,0,0.07)'; // soft shadow
  g.beginPath(); g.ellipse(0.04, 0.12, 0.5 * f + 0.05, 0.4, 0, 0, Math.PI * 2); g.fill();
  wingPaths(g, -1, f, fore, hind); wingPaths(g, 1, f, fore, hind);
  g.fillStyle = '#4a3057'; // body
  g.beginPath(); g.ellipse(0, 0.04, 0.045, 0.3, 0, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.arc(0, -0.27, 0.052, 0, Math.PI * 2); g.fill();
  g.strokeStyle = '#4a3057'; g.lineWidth = 0.014; g.lineCap = 'round'; // antennae
  g.beginPath(); g.moveTo(-0.02, -0.31); g.quadraticCurveTo(-0.1, -0.45, -0.17, -0.44); g.moveTo(0.02, -0.31); g.quadraticCurveTo(0.1, -0.45, 0.17, -0.44); g.stroke();
  g.restore();
}

export class Particles {
  constructor() { this.list = []; }
  burst(x, y, hue, n, size) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, sp = (0.1 + Math.random() * 0.25) * size * 4;
      this.list.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - size * 0.6, life: 0, max: 1.1 + Math.random() * 0.6, hue: hue + (Math.random() - 0.5) * 40, r: size * (0.07 + Math.random() * 0.08), kind: i % 3 === 0 ? 'heart' : 'star' });
    }
  }
  ring(x, y, size) { this.list.push({ x, y, vx: 0, vy: 0, life: 0, max: 0.9, r: size, kind: 'ring' }); }
  text(x, y, str, size) { this.list.push({ x, y, vx: 0, vy: -size * 0.9, life: 0, max: 1.4, r: size, kind: 'text', str }); }
  update(dt) {
    for (const p of this.list) { p.life += dt; p.x += p.vx * dt; p.y += p.vy * dt; if (p.kind !== 'text' && p.kind !== 'ring') p.vy += 0.15 * (p.r * 14) * dt; }
    this.list = this.list.filter((p) => p.life < p.max);
  }
  draw(g) {
    for (const p of this.list) {
      const t = p.life / p.max; g.save(); g.globalAlpha = (1 - t) * 0.9;
      if (p.kind === 'ring') { g.strokeStyle = 'rgba(255,255,255,0.9)'; g.lineWidth = p.r * 0.08 * (1 - t); g.beginPath(); g.arc(p.x, p.y, p.r * (0.6 + t * 1.6), 0, Math.PI * 2); g.stroke(); }
      else if (p.kind === 'text') { g.font = `800 ${p.r}px "Nunito", system-ui, sans-serif`; g.textAlign = 'center'; g.fillStyle = '#fff'; g.strokeStyle = '#8e5bd6'; g.lineWidth = p.r * 0.12; g.strokeText(p.str, p.x, p.y); g.fillText(p.str, p.x, p.y); }
      else if (p.kind === 'heart') { g.fillStyle = `hsl(${p.hue},90%,70%)`; heart(g, p.x, p.y, p.r * 1.3); }
      else { g.fillStyle = `hsl(${p.hue},95%,78%)`; star(g, p.x, p.y, p.r); }
      g.restore();
    }
  }
}
function heart(g, x, y, s) { g.beginPath(); g.moveTo(x, y + s * 0.4); g.bezierCurveTo(x - s, y - s * 0.3, x - s * 0.4, y - s, x, y - s * 0.4); g.bezierCurveTo(x + s * 0.4, y - s, x + s, y - s * 0.3, x, y + s * 0.4); g.fill(); }
function star(g, x, y, r) { g.beginPath(); for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2, rr = i % 2 ? r * 0.4 : r; g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); } g.closePath(); g.fill(); }
