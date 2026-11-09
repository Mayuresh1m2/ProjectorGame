import { Game, drawPill } from '../../core/game.js';
import { Fireworks, nightSky, drawStars, drawLaddu, drawJalebi } from './fx.js';

/** Pure logic: sweets fall from the top; a hand near one catches it. Forgiving radius because of camera delay. */
export class SweetsWorld {
  constructor(opts = {}, rng = Math.random) { this.rng = rng; this.w = 1280; this.h = 720; this.items = []; this.score = 0; this.spawnT = 0; this.rate = opts.rate || 1.1; this.max = opts.max || 9; }
  resize(w, h) { this.w = w; this.h = h; }
  get r() { return Math.min(this.w, this.h) * 0.045; }
  reset() { this.items = []; this.score = 0; this.spawnT = 0; }
  update(dt, hands) {
    const ev = [], reach = this.r * 2.1;
    this.spawnT += dt;
    if (this.spawnT > 1 / this.rate && this.items.length < this.max) {
      this.spawnT = 0;
      this.items.push({ x: this.r + this.rng() * (this.w - 2 * this.r), y: -this.r, vy: this.h * (0.14 + this.rng() * 0.1), kind: this.rng() < 0.6 ? 'laddu' : 'jalebi', sway: this.rng() * 6 });
    }
    for (const it of this.items) {
      it.y += it.vy * dt; it.x += Math.sin(it.y / 60 + it.sway) * 12 * dt;
      if (hands.some((h) => Math.hypot(h.x - it.x, h.y - it.y) < reach)) { it.caught = true; this.score++; ev.push({ type: 'catch', x: it.x, y: it.y, kind: it.kind }); }
    }
    this.items = this.items.filter((it) => !it.caught && it.y < this.h + this.r * 2);
    return ev;
  }
}

export class SweetsGame extends Game {
  static meta = { id: 'sweets', name: 'Catch the sweets', icon: '🍬', description: 'Catch the falling laddus and jalebis!' };
  constructor(ctx) { super(ctx); this.world = new SweetsWorld(); this.fx = new Fireworks(); this.t = 0; }
  get score() { return this.world.score; }
  resize(w, h) { super.resize(w, h); this.world.resize(w, h); }
  restart() { this.world.reset(); this.start(); }
  update(dt, hands) {
    this.t += dt;
    for (const e of this.world.update(dt, this._status === 'playing' ? hands : [])) { this.fx.burst(e.x, e.y, 40, this.ctx.quality ? 16 : 6, 140); this.ctx.audio.pop(); }
    this.fx.update(dt);
  }
  render(g) {
    const { w, h } = this;
    nightSky(g, w, h); drawStars(g, w, h, this.t);
    for (const it of this.world.items) it.kind === 'laddu' ? drawLaddu(g, it.x, it.y, this.world.r) : drawJalebi(g, it.x, it.y, this.world.r, this.t);
    this.fx.draw(g);
    drawPill(g, `🍬 ${this.world.score}`, w / 2, h * 0.025, { size: Math.max(18, h * 0.045) });
  }
}
