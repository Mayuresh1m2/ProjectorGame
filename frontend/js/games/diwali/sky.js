import { Game } from '../../core/game.js';
import { Fireworks, nightSky, drawStars } from './fx.js';

/** Ambient fireworks sky: launches by itself; hands and taps launch more; cues can trigger a big show. */
export class SkyGame extends Game {
  static meta = { id: 'sky', name: 'Fireworks sky', icon: '🎆', description: 'Wave to launch fireworks – no smoke, no noise.' };
  constructor(ctx, rng = Math.random) { super(ctx); this.rng = rng; this.fx = new Fireworks(rng); this.t = 0; this.next = 1; this.handCool = new Map(); this._status = 'playing'; this._score = 0; }
  show(n = 8) { for (let k = 0; k < n; k++) setTimeout(() => this.launchAt(this.w * (0.1 + 0.8 * this.rng())), k * 280); }
  launchAt(x) { this.fx.launch(Math.min(this.w - 20, Math.max(20, x)), this.h * (0.12 + 0.3 * this.rng()), this.h); this._score++; this.ctx.audio?.pop?.(); }
  onEvent(ev) {
    if (ev.type === 'tap') this.launchAt(ev.x);
    else if (ev.type === 'cue' && (ev.name === 'clap' || ev.name === 'keyword' || ev.name === 'gesture-fist-open')) this.show(8);
  }
  update(dt, hands) {
    this.t += dt; this.next -= dt;
    if (this.next <= 0) { this.next = 1.4 + this.rng() * 2.2; this.launchAt(this.w * (0.1 + 0.8 * this.rng())); }
    for (const h of hands) { // a fast upward flick launches one, with a cooldown per hand
      const cd = (this.handCool.get(h.id) || 0) - dt; this.handCool.set(h.id, cd);
      if (cd <= 0 && (h.vy ?? 0) < -this.h * 0.8) { this.launchAt(h.x); this.handCool.set(h.id, 0.8); }
    }
    this.fx.update(dt);
  }
  render(g) { const { w, h } = this; nightSky(g, w, h); drawStars(g, w, h, this.t, 90); this.fx.draw(g); }
}
