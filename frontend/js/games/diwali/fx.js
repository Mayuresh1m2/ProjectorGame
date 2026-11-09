// Shared Diwali visuals: night backdrop, diya, laddu, fuljhadi (sparkler), fireworks and falling sweets.
// Drawing is separated from logic so the logic modules stay unit-testable in plain node.

export const GOLD = '#ffc94d', SAFFRON = '#ff8c1a', DEEP_RED = '#b3122f', MAGENTA = '#d6338a';

export function nightSky(g, w, h) {
  const bg = g.createLinearGradient(0, 0, 0, h);
  bg.addColorStop(0, '#0b0620'); bg.addColorStop(0.6, '#1d0b3a'); bg.addColorStop(1, '#3a0f2c');
  g.fillStyle = bg; g.fillRect(0, 0, w, h);
}

export function drawStars(g, w, h, t, n = 60) {
  g.save();
  for (let i = 0; i < n; i++) {
    const x = ((i * 9301 + 49297) % 233280) / 233280 * w, y = ((i * 7919 + 1013) % 233280) / 233280 * h * 0.7;
    g.globalAlpha = 0.25 + 0.35 * Math.abs(Math.sin(t * 0.8 + i)); g.fillStyle = '#fff';
    g.fillRect(x, y, 2, 2);
  }
  g.restore();
}

/** A clay diya. `warm` 0..1 shows it warming up before it lights; `lit` draws the flame. */
export function drawDiya(g, x, y, r, { lit = false, warm = 0, t = 0, seed = 0 } = {}) {
  g.save(); g.translate(x, y);
  if (lit) {
    const glow = g.createRadialGradient(0, -r * 0.5, r * 0.1, 0, -r * 0.5, r * 3.2);
    glow.addColorStop(0, 'rgba(255,190,70,0.55)'); glow.addColorStop(1, 'rgba(255,140,30,0)');
    g.fillStyle = glow; g.fillRect(-r * 3.4, -r * 3.8, r * 6.8, r * 6.8);
  }
  const clay = g.createLinearGradient(0, -r * 0.2, 0, r * 0.8);
  clay.addColorStop(0, '#d9692b'); clay.addColorStop(1, '#8c3412');
  g.fillStyle = clay; g.beginPath();
  g.moveTo(-r, -r * 0.1); g.quadraticCurveTo(-r * 0.9, r * 0.85, 0, r * 0.85); g.quadraticCurveTo(r * 0.9, r * 0.85, r, -r * 0.1);
  g.quadraticCurveTo(r * 1.45, -r * 0.35, r * 1.7, -r * 0.45); g.quadraticCurveTo(r * 1.1, -r * 0.4, r * 0.8, -r * 0.2);
  g.lineTo(-r * 0.8, -r * 0.2); g.closePath(); g.fill();
  g.fillStyle = lit ? '#ffcf70' : `rgba(255,200,120,${0.25 + warm * 0.4})`;
  g.beginPath(); g.ellipse(0, -r * 0.12, r * 0.85, r * 0.2, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = GOLD; for (let i = -2; i <= 2; i++) { g.beginPath(); g.arc(i * r * 0.3, r * 0.42, r * 0.06, 0, 7); g.fill(); }
  if (lit) {
    const f = 1 + 0.12 * Math.sin(t * 9 + seed * 3) + 0.06 * Math.sin(t * 23 + seed);
    g.translate(0, -r * 0.2); g.scale(f, f * (1 + 0.1 * Math.sin(t * 7 + seed)));
    const fl = g.createLinearGradient(0, -r * 1.7, 0, 0);
    fl.addColorStop(0, '#fff6c8'); fl.addColorStop(0.5, '#ffb938'); fl.addColorStop(1, '#ff6a00');
    g.fillStyle = fl; g.beginPath(); g.moveTo(0, -r * 1.75); g.quadraticCurveTo(r * 0.55, -r * 0.7, 0, 0); g.quadraticCurveTo(-r * 0.55, -r * 0.7, 0, -r * 1.75); g.fill();
  } else if (warm > 0.05) {
    g.fillStyle = `rgba(255,220,150,${warm * 0.8})`; g.beginPath(); g.arc(0, -r * 0.3, r * 0.12 + warm * r * 0.25, 0, 7); g.fill();
  }
  g.restore();
}

export function drawLaddu(g, x, y, r) {
  g.save(); g.translate(x, y);
  const gr = g.createRadialGradient(-r * 0.3, -r * 0.35, r * 0.1, 0, 0, r);
  gr.addColorStop(0, '#ffc23d'); gr.addColorStop(1, '#d7820c');
  g.fillStyle = gr; g.beginPath(); g.arc(0, 0, r, 0, 7); g.fill();
  g.fillStyle = 'rgba(120,60,0,.35)';
  for (let i = 0; i < 9; i++) { const a = i * 2.4, d = r * (0.2 + (i % 4) * 0.17); g.beginPath(); g.arc(Math.cos(a) * d, Math.sin(a) * d, r * 0.07, 0, 7); g.fill(); }
  g.fillStyle = 'rgba(255,255,255,.35)'; g.beginPath(); g.ellipse(-r * 0.35, -r * 0.4, r * 0.22, r * 0.12, -0.6, 0, 7); g.fill();
  g.restore();
}

export function drawJalebi(g, x, y, r, t = 0) {
  g.save(); g.translate(x, y); g.rotate(Math.sin(t + x) * 0.3);
  g.strokeStyle = '#ff7a00'; g.lineWidth = r * 0.28; g.lineCap = 'round';
  g.beginPath(); for (let a = 0; a < 12; a += 0.2) { const rr = r * (0.15 + a / 14); g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); } g.stroke();
  g.strokeStyle = 'rgba(255,230,150,.6)'; g.lineWidth = r * 0.07; g.stroke();
  g.restore();
}

/** Fuljhadi: a stick with a burning tip that throws sparks. Sparks are kept in `fx` (a Fireworks instance). */
export function drawFuljhadi(g, x, y, len, t = 0) {
  g.save(); g.translate(x, y); g.rotate(-0.5);
  g.strokeStyle = '#6b6b6b'; g.lineWidth = len * 0.045; g.lineCap = 'round'; g.beginPath(); g.moveTo(0, len); g.lineTo(0, 0); g.stroke();
  const glow = g.createRadialGradient(0, 0, 1, 0, 0, len * 0.5);
  glow.addColorStop(0, 'rgba(255,255,230,.95)'); glow.addColorStop(0.3, 'rgba(255,200,80,.6)'); glow.addColorStop(1, 'rgba(255,120,0,0)');
  g.fillStyle = glow; g.beginPath(); g.arc(0, 0, len * (0.45 + 0.05 * Math.sin(t * 30)), 0, 7); g.fill();
  g.restore();
}

/** Particles: rockets that climb then burst, spark showers and trails. */
export class Fireworks {
  constructor(rng = Math.random) { this.rng = rng; this.rockets = []; this.sparks = []; this.t = 0; }
  launch(x, topY, h, hue = null) { this.rockets.push({ x, y: h, vy: -(h - topY) * 1.1, topY, hue: hue ?? this.rng() * 360, age: 0 }); }
  burst(x, y, hue = this.rng() * 360, count = 70, speed = 260) {
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + this.rng() * 0.2, v = speed * (0.45 + this.rng() * 0.6);
      this.sparks.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 1.1 + this.rng() * 0.6, age: 0, hue: hue + (this.rng() - 0.5) * 40, size: 2 + this.rng() * 2 });
    }
  }
  shower(x, y, hue = 40, count = 3) { // fuljhadi sparks: short-lived, gravity, random direction
    for (let i = 0; i < count; i++) {
      const a = this.rng() * Math.PI * 2, v = 80 + this.rng() * 170;
      this.sparks.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 40, life: 0.35 + this.rng() * 0.4, age: 0, hue: hue + this.rng() * 20, size: 1.5 + this.rng() * 1.5 });
    }
  }
  update(dt) {
    this.t += dt;
    for (const r of this.rockets) {
      r.age += dt; r.y += r.vy * dt; r.vy *= 1 - 0.8 * dt; r.x += Math.sin(r.age * 12) * 0.4;
      this.sparks.push({ x: r.x, y: r.y, vx: (this.rng() - 0.5) * 20, vy: 30, life: 0.35, age: 0, hue: 40, size: 1.5 });
      if (r.y <= r.topY || r.vy > -40) { r.done = true; this.burst(r.x, r.y, r.hue); }
    }
    this.rockets = this.rockets.filter((r) => !r.done);
    for (const s of this.sparks) { s.age += dt; s.x += s.vx * dt; s.y += s.vy * dt; s.vy += 160 * dt; s.vx *= 1 - 0.9 * dt; }
    this.sparks = this.sparks.filter((s) => s.age < s.life);
    if (this.sparks.length > 1500) this.sparks.splice(0, this.sparks.length - 1500);
  }
  draw(g) {
    g.save(); g.globalCompositeOperation = 'lighter';
    for (const s of this.sparks) {
      const k = 1 - s.age / s.life;
      g.fillStyle = `hsla(${s.hue},100%,${55 + 25 * k}%,${k})`; g.beginPath(); g.arc(s.x, s.y, s.size * (0.4 + k), 0, 7); g.fill();
    }
    g.restore();
  }
  get busy() { return this.rockets.length > 0 || this.sparks.length > 0; }
}
