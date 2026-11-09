// Balloons that float up and pop when touched. Pure logic.
import { clamp, lerp } from '../../core/geometry.js';

export class BalloonWorld {
  constructor(settings = {}, rng = Math.random) {
    this.rng = rng; this.settings = { butterflies: 8, speed: 1, spawnRate: 0.8, ...settings };
    this.w = 1280; this.h = 720; this.balloons = []; this.score = 0; this.credit = 0; this.events = [];
  }
  get scale() { return Math.min(this.w, this.h); }
  setSettings(s) { Object.assign(this.settings, s); }
  resize(w, h) { const sx = w / this.w, sy = h / this.h; for (const b of this.balloons) { b.x *= sx; b.y *= sy; } this.w = w; this.h = h; }
  get target() { return Math.max(3, Math.round(this.settings.butterflies * 0.8)); }
  reset() { this.balloons = []; this.score = 0; this.credit = 0; for (let i = 0; i < this.target; i++) { const b = this.spawn(); b.y = lerp(0.2, 1, this.rng()) * this.h; } }
  spawn() {
    const r = this.rng, s = this.scale;
    const b = { x: lerp(0.08, 0.92, r()) * this.w, y: this.h + 0.1 * s, vy: -lerp(0.05, 0.1, r()) * s, size: lerp(0.07, 0.11, r()) * s, hue: [350, 40, 200, 140, 280, 20][Math.floor(r() * 6)], phase: r() * 6.28, popped: 0 };
    this.balloons.push(b); return b;
  }
  update(dt, hands = []) {
    dt = clamp(dt, 0, 0.1); this.events = [];
    const spd = this.settings.speed;
    for (const b of this.balloons) {
      if (b.popped) { b.popped += dt; continue; }
      b.phase += dt; b.y += b.vy * spd * dt; b.x += Math.sin(b.phase * 1.3) * 0.02 * this.scale * dt;
      for (const h of hands) if (Math.hypot(h.x - b.x, h.y - b.y) < b.size * 1.05) { b.popped = 0.001; this.score++; this.events.push({ type: 'pop', x: b.x, y: b.y, hue: b.hue, score: this.score }); break; }
    }
    this.balloons = this.balloons.filter((b) => b.popped < 0.5 && b.y > -b.size * 2.5);
    this.credit += dt * this.settings.spawnRate;
    const alive = this.balloons.filter((b) => !b.popped).length;
    while (this.credit >= 1 && alive + 0 < this.target + 2 && this.balloons.length < this.target * 2) { this.credit -= 1; this.spawn(); break; }
    if (this.credit > 2) this.credit = 2;
    return this.events;
  }
}
