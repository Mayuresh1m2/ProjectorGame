import { Game, drawPill } from '../../core/game.js';
import { ButterflyWorld } from './logic.js';
import { makeBackground, drawClouds, drawButterfly, Particles } from './render.js';

export class ButterflyGame extends Game {
  static meta = { id: 'butterfly', name: 'Butterflies', icon: '🦋', description: 'Hold out your hand and let the butterflies land on it.' };

  constructor(ctx) {
    super(ctx);
    this.world = new ButterflyWorld(ctx.settings.game);
    this.fx = new Particles();
    this.bg = null;
    this.t = 0;
    this.elapsed = 0;
    this.note = 0;
    this.world.reset(); // butterflies are flying already behind the start screen
  }

  get score() { return this.world.score; }
  get timeLeft() { const d = this.world.settings.duration; return d > 0 ? Math.max(0, d - this.elapsed) : null; }

  resize(w, h) { super.resize(w, h); this.world.resize(w, h); this.bg = null; }
  setSettings(s) { this.world.setSettings(s.game); } // population adjusts through the spawn logic

  start() { this._status = 'playing'; this.elapsed = 0; this.world.score = 0; this.note = 0; }
  restart() { this.world.reset(); this.start(); }

  update(dt, hands) {
    this.t += dt;
    if (this._status === 'playing') {
      this.elapsed += dt;
      if (this.timeLeft === 0) { this._status = 'over'; this.ctx.audio.fanfare(); }
    }
    // While waiting on the start/game-over screen, butterflies still drift but cannot score.
    const live = this._status === 'playing' ? hands : [];
    const events = this.world.update(dt, live.map((h) => ({ id: h.id, x: h.x, y: h.y })));
    for (const e of events) {
      if (e.type !== 'landed') continue;
      const s = this.world.scale, q = this.ctx.quality;
      this.fx.ring(e.x, e.y, 0.09 * s);
      if (q > 0) this.fx.burst(e.x, e.y - 0.02 * s, e.hue, q === 2 ? 12 : 5, 0.045 * s);
      this.fx.text(e.x, e.y - 0.09 * s, '+1', 0.05 * s);
      this.ctx.audio.chime(this.note++);
    }
    this.fx.update(dt);
  }

  render(g) {
    const { w, h } = this;
    if (!this.bg) this.bg = makeBackground(w, h);
    g.drawImage(this.bg, 0, 0);
    if (this.ctx.quality > 0) drawClouds(g, w, h, this.t, this.ctx.quality === 2 ? 5 : 2);
    const list = [...this.world.butterflies].sort((a, b) => a.size - b.size);
    for (const b of list) drawButterfly(g, b, this.world.settings.animationSpeed);
    this.fx.draw(g);
    const fs = Math.max(18, h * 0.04);
    drawPill(g, `🦋 ${this.world.score}`, w / 2, h * 0.025, { size: fs });
    const tl = this.timeLeft;
    if (tl !== null) drawPill(g, `⏱ ${Math.ceil(tl)}`, w - h * 0.03, h * 0.025, { size: fs * 0.8, align: 'right' });
  }
}
