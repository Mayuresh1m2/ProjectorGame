// Fish that swim away from hands. Pure logic (testable without a canvas).
import { clamp, lerp } from '../../core/geometry.js';

export class FishWorld {
  constructor(settings = {}, rng = Math.random) {
    this.rng = rng; this.settings = { butterflies: 8, speed: 1, interactionDistance: 0.07, ...settings };
    this.w = 1280; this.h = 720; this.fish = []; this.score = 0; this.time = 0; this.events = [];
  }
  get scale() { return Math.min(this.w, this.h); }
  setSettings(s) { Object.assign(this.settings, s); }
  resize(w, h) { const sx = w / this.w, sy = h / this.h; for (const f of this.fish) { f.x *= sx; f.y *= sy; } this.w = w; this.h = h; }
  get target() { return Math.max(4, Math.round(this.settings.butterflies * 1.5)); }
  reset() { this.fish = []; this.score = 0; for (let i = 0; i < this.target; i++) this.spawn(); }
  spawn() {
    const r = this.rng, s = this.scale;
    this.fish.push({ x: r() * this.w, y: lerp(0.15, 0.85, r()) * this.h, vx: (r() - 0.5) * 0.1 * s, vy: 0, size: lerp(0.04, 0.085, r()) * s,
      hue: [20, 45, 200, 170, 330, 280][Math.floor(r() * 6)], dir: r() < 0.5 ? -1 : 1, phase: r() * 6.28, fear: 0, cool: 0, wob: r() * 6.28 });
  }
  update(dt, hands = []) {
    dt = clamp(dt, 0, 0.1); this.time += dt; this.events = [];
    const s = this.scale, spd = this.settings.speed, danger = 0.16 * s;
    while (this.fish.length < this.target) this.spawn();
    for (const f of this.fish) {
      f.cool = Math.max(0, f.cool - dt); f.fear = Math.max(0, f.fear - dt * 1.2);
      let ax = 0, ay = 0;
      for (const h of hands) {
        const dx = f.x - h.x, dy = f.y - h.y, d = Math.hypot(dx, dy);
        if (d < danger) {
          const k = (1 - d / danger); ax += (dx / (d || 1)) * k * 1.6 * s * spd; ay += (dy / (d || 1)) * k * 1.6 * s * spd; f.fear = Math.min(1, f.fear + dt * 4);
          if (f.cool <= 0 && d < danger * 0.8) { f.cool = 2.5; this.score++; this.events.push({ type: 'scare', x: f.x, y: f.y }); }
        }
      }
      f.wob += dt * (1.2 + f.fear * 6);
      const cruise = 0.09 * s * spd, want = f.dir * cruise;
      ax += (want - f.vx) * 1.2; ay += Math.sin(f.wob * 0.7) * 0.02 * s - f.vy * 1.5 + (this.h / 2 - f.y) * 0.002;
      f.vx += ax * dt; f.vy += ay * dt;
      const maxv = 0.7 * s * spd, v = Math.hypot(f.vx, f.vy); if (v > maxv) { f.vx *= maxv / v; f.vy *= maxv / v; }
      f.x += f.vx * dt; f.y = clamp(f.y + f.vy * dt, 0.06 * this.h, 0.94 * this.h);
      if (Math.abs(f.vx) > 0.02 * s) f.facing = Math.sign(f.vx);
      f.facing ||= f.dir;
      if (f.x < -0.1 * s) { f.x = this.w + 0.08 * s; f.dir = -1; } else if (f.x > this.w + 0.1 * s) { f.x = -0.08 * s; f.dir = 1; }
    }
    return this.events;
  }
}
