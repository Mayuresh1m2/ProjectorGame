import { Game } from '../../core/game.js';
import { QuestWorld, FINALE_S } from './logic.js';
import { Fireworks, nightSky, drawStars, drawLaddu, drawJalebi, drawDiya, drawFuljhadi } from '../diwali/fx.js';
import { SweetsWorld } from '../diwali/sweets.js';

const ICON = {
  laddu: (g, x, y, r) => drawLaddu(g, x, y, r),
  jalebi: (g, x, y, r, t) => drawJalebi(g, x, y, r, t),
  diya: (g, x, y, r, t) => drawDiya(g, x, y + r * 0.3, r * 0.8, { lit: true, t }),
  fuljhadi: (g, x, y, r, t) => drawFuljhadi(g, x - r * 0.2, y - r * 0.2, r * 2.2, t),
};
const LABEL = { laddu: 'Laddu', fuljhadi: 'Fuljhadi', jalebi: 'Jalebi', diya: 'Diya' };

/** Scoreboard + finale. The room itself is the controller: rewards come from zone events (see backend/app/quest). */
export class QuestGame extends Game {
  static meta = { id: 'quest', name: 'Playroom Quest', icon: '🏆', description: 'Jump on the stairs, climb the wall, earn sweets and sparklers!' };
  constructor(ctx) {
    super(ctx);
    this.world = new QuestWorld(ctx.quest?.()?.targets);
    this.fx = new Fireworks(); this.sweets = new SweetsWorld({ rate: 9, max: 40 }); this.t = 0; this.popAt = {}; this._status = 'playing';
  }
  get score() { return this.world.total; }
  resize(w, h) { super.resize(w, h); this.sweets.resize(w, h); }
  restart() { this.world.reset(); this.fx = new Fireworks(); this.sweets.reset(); }
  onEvent(ev) {
    if (ev.type === 'quest-config') { this.world.setTargets(ev.quest?.targets); return; }
    if (ev.type !== 'zone' && ev.type !== 'reward-test') return;
    for (const e of this.world.give(ev.reward)) {
      if (e.type === 'reward') {
        this.popAt[e.reward] = this.t;
        const { x, y } = this.slot(e.reward, Math.max(0, e.n - 1));
        if (e.reward === 'fuljhadi') for (let k = 0; k < 18; k++) this.fx.shower(x, y, 40, 4);
        this.fx.burst(x, y, 40, this.ctx.quality ? 30 : 10, 170);
        this.ctx.audio.chime(e.n % 5);
      } else if (e.type === 'finale') this.startFinale();
    }
  }
  startFinale() {
    for (let k = 0; k < 14; k++) setTimeout(() => this.fx.launch(this.w * (0.08 + 0.84 * Math.random()), this.h * (0.08 + 0.35 * Math.random()), this.h), k * 450);
    this.ctx.audio.chime(4);
  }
  rows() { return Object.keys(this.world.targets); }
  slot(reward, i) {
    const rows = this.rows(), r = rows.indexOf(reward), n = this.world.targets[reward];
    const size = this.slotSize(n), rowH = this.h * 0.22, top = this.h * 0.18;
    return { x: this.w * 0.06 + size * (i + 0.5), y: top + rowH * r + rowH * 0.5, size };
  }
  slotSize(n) { return Math.min(this.h * 0.11, (this.w * 0.88) / Math.max(n, 6)); }
  update(dt, _hands) {
    this.t += dt;
    if (this.world.phase === 'finale') {
      for (const e of this.sweets.update(dt, [])) void e;
      if (Math.random() < dt * 1.5) this.fx.launch(this.w * (0.1 + 0.8 * Math.random()), this.h * (0.1 + 0.3 * Math.random()), this.h);
    }
    if (this.world.update(dt)) { this.sweets.reset(); }
    this.fx.update(dt);
  }
  render(g) {
    const { w, h } = this, wd = this.world;
    nightSky(g, w, h); drawStars(g, w, h, this.t);
    g.fillStyle = '#ffe9a8'; g.textAlign = 'left'; g.textBaseline = 'middle'; g.font = `800 ${h * 0.07}px "Nunito", system-ui, sans-serif`;
    g.fillText('Playroom Quest', w * 0.06, h * 0.08);
    this.rows().forEach((rw, r) => {
      const n = wd.targets[rw], size = this.slotSize(n), { y } = this.slot(rw, 0);
      g.fillStyle = 'rgba(255,255,255,.75)'; g.font = `700 ${h * 0.035}px "Nunito", system-ui, sans-serif`; g.textAlign = 'left';
      g.fillText(`${LABEL[rw] || rw}  ${wd.counts[rw]} / ${n}`, w * 0.06, y - size * 0.72);
      for (let i = 0; i < n; i++) {
        const { x } = this.slot(rw, i);
        if (i < wd.counts[rw]) {
          const pop = i === wd.counts[rw] - 1 ? Math.max(0, 1 - (this.t - (this.popAt[rw] || -9)) * 3) : 0;
          ICON[rw]?.(g, x, y, size * (0.36 + 0.18 * pop), this.t);
        } else { g.strokeStyle = 'rgba(255,255,255,.25)'; g.lineWidth = 3; g.setLineDash([6, 8]); g.beginPath(); g.arc(x, y, size * 0.34, 0, 7); g.stroke(); g.setLineDash([]); }
      }
    });
    if (wd.phase === 'finale') {
      for (const it of this.sweets.items) it.kind === 'laddu' ? drawLaddu(g, it.x, it.y, this.sweets.r) : drawJalebi(g, it.x, it.y, this.sweets.r, this.t);
    }
    this.fx.draw(g);
    if (wd.phase === 'finale') {
      const k = Math.min(1, wd.finaleT / 0.6), fade = Math.min(1, (FINALE_S - wd.finaleT) / 1.5);
      g.save(); g.globalAlpha = Math.max(0, Math.min(k, fade)); g.fillStyle = '#ffe9a8'; g.textAlign = 'center'; g.font = `800 ${h * 0.13}px "Nunito", system-ui, sans-serif`;
      g.shadowColor = '#ff9a1a'; g.shadowBlur = 30; g.fillText('Happy Diwali!', w / 2, h * 0.62); g.font = `700 ${h * 0.05}px "Nunito", system-ui, sans-serif`; g.fillText('You did it together!', w / 2, h * 0.74); g.restore();
    }
  }
}
