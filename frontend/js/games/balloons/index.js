import { Game, drawPill } from '../../core/game.js';
import { BalloonWorld } from './logic.js';
import { Particles } from '../butterfly/render.js';

export class BalloonGame extends Game {
  static meta = { id: 'balloons', name: 'Balloon pop', icon: '🎈', description: 'Touch the balloons to pop them!' };
  constructor(ctx) { super(ctx); this.world = new BalloonWorld(ctx.settings.game); this.world.reset(); this.fx = new Particles(); this.t = 0; this.elapsed = 0; this.note = 0; }
  get score() { return this.world.score; }
  get timeLeft() { const d = this.ctx.settings.game.duration; return d > 0 ? Math.max(0, d - this.elapsed) : null; }
  resize(w, h) { super.resize(w, h); this.world.resize(w, h); }
  setSettings(s) { this.world.setSettings(s.game); }
  start() { this._status = 'playing'; this.elapsed = 0; this.world.score = 0; }
  restart() { this.world.reset(); this.start(); }
  update(dt, hands) {
    this.t += dt;
    if (this._status === 'playing') { this.elapsed += dt; if (this.timeLeft === 0) this._status = 'over'; }
    const ev = this.world.update(dt, this._status === 'playing' ? hands : []);
    for (const e of ev) { this.fx.burst(e.x, e.y, e.hue, this.ctx.quality ? 12 : 4, 0.05 * this.world.scale); this.fx.text(e.x, e.y - 0.06 * this.world.scale, '+1', 0.05 * this.world.scale); this.ctx.audio.pop(); }
    this.fx.update(dt);
  }
  render(g) {
    const { w, h } = this;
    const bg = g.createLinearGradient(0, 0, 0, h); bg.addColorStop(0, '#ffd9ec'); bg.addColorStop(1, '#c9e8ff'); g.fillStyle = bg; g.fillRect(0, 0, w, h);
    for (const b of this.world.balloons) {
      if (b.popped) continue;
      g.save(); g.translate(b.x, b.y);
      g.strokeStyle = 'rgba(80,80,100,0.6)'; g.lineWidth = 2; g.beginPath(); g.moveTo(0, b.size * 1.1); g.bezierCurveTo(-b.size * 0.2, b.size * 1.6, b.size * 0.2, b.size * 1.9, 0, b.size * 2.4); g.stroke();
      const grad = g.createRadialGradient(-b.size * 0.3, -b.size * 0.4, b.size * 0.1, 0, 0, b.size * 1.1);
      grad.addColorStop(0, `hsl(${b.hue},95%,82%)`); grad.addColorStop(1, `hsl(${b.hue},85%,55%)`);
      g.fillStyle = grad; g.beginPath(); g.ellipse(0, 0, b.size * 0.85, b.size, 0, 0, Math.PI * 2); g.fill();
      g.beginPath(); g.moveTo(-b.size * 0.1, b.size * 0.98); g.lineTo(b.size * 0.1, b.size * 0.98); g.lineTo(0, b.size * 1.12); g.closePath(); g.fillStyle = `hsl(${b.hue},85%,45%)`; g.fill();
      g.fillStyle = 'rgba(255,255,255,0.55)'; g.beginPath(); g.ellipse(-b.size * 0.35, -b.size * 0.45, b.size * 0.14, b.size * 0.25, -0.5, 0, 7); g.fill();
      g.restore();
    }
    this.fx.draw(g);
    drawPill(g, `🎈 ${this.world.score}`, w / 2, h * 0.025, { size: Math.max(18, h * 0.04) });
    const tl = this.timeLeft; if (tl !== null) drawPill(g, `⏱ ${Math.ceil(tl)}`, w - h * 0.03, h * 0.025, { size: h * 0.032, align: 'right' });
  }
}
