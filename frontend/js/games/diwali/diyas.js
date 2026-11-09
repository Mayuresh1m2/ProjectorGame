import { Game, drawPill } from '../../core/game.js';
import { Fireworks, nightSky, drawStars, drawDiya } from './fx.js';

/** Pure game logic: a grid of unlit diyas; a hand held near one warms it until it lights. */
export class DiyaWorld {
  constructor(opts = {}, rng = Math.random) { this.rng = rng; this.cols = opts.cols || 6; this.rows = opts.rows || 3; this.warmTime = opts.warmTime || 0.35; this.w = 1280; this.h = 720; this.diyas = []; this.score = 0; this.celebrate = 0; this.resetGrid(); }
  resize(w, h) { this.w = w; this.h = h; this.resetGrid(true); }
  get radius() { return Math.min(this.w / (this.cols * 3.1), this.h / (this.rows * 3.6)); }
  resetGrid(keepLit = false) {
    const old = this.diyas, { cols, rows } = this;
    this.diyas = [];
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
      this.diyas.push({ i, j, x: this.w * (i + 0.5) / cols, y: this.h * (0.38 + (j + 0.5) * 0.6 / rows), warm: 0, lit: keepLit ? !!old[j * cols + i]?.lit : false });
    }
  }
  reset() { this.score = 0; this.celebrate = 0; this.resetGrid(); }
  /** Returns events: {type:'light',x,y} per newly lit diya, {type:'all'} once when the last one lights. */
  update(dt, hands) {
    const ev = [], reach = this.radius * 1.9;
    if (this.celebrate > 0) { this.celebrate -= dt; if (this.celebrate <= 0) this.resetGrid(); return ev; }
    for (const d of this.diyas) {
      if (d.lit) continue;
      const near = hands.some((h) => Math.hypot(h.x - d.x, h.y - (d.y - this.radius * 0.6)) < reach);
      d.warm = Math.max(0, Math.min(1, d.warm + (near ? dt / this.warmTime : -dt * 1.5)));
      if (d.warm >= 1) { d.lit = true; this.score++; ev.push({ type: 'light', x: d.x, y: d.y - this.radius }); }
    }
    if (this.diyas.every((d) => d.lit)) { this.celebrate = 6; ev.push({ type: 'all' }); }
    return ev;
  }
  /** A welcome: light up to n random unlit diyas (used when someone arrives). */
  lightRandom(n = 2) {
    const ev = [], dark = this.diyas.filter((d) => !d.lit);
    for (let k = 0; k < n && dark.length; k++) {
      const d = dark.splice(Math.floor(this.rng() * dark.length), 1)[0];
      d.lit = true; this.score++; ev.push({ type: 'light', x: d.x, y: d.y - this.radius });
    }
    if (this.diyas.every((d) => d.lit) && this.celebrate <= 0) { this.celebrate = 6; ev.push({ type: 'all' }); }
    return ev;
  }
  get litCount() { return this.diyas.filter((d) => d.lit).length; }
}

export class DiyaGame extends Game {
  static meta = { id: 'diyas', name: 'Light the diyas', icon: '🪔', description: 'Hold your hand near a diya to light it.' };
  constructor(ctx) { super(ctx); this.world = new DiyaWorld(); this.fx = new Fireworks(); this.t = 0; }
  get score() { return this.world.score; }
  resize(w, h) { super.resize(w, h); this.world.resize(w, h); }
  restart() { this.world.reset(); this.start(); }
  onEvent(ev) {
    if (ev.type !== 'cue') return;
    if (ev.name === 'presence') this.react(this.world.lightRandom(2));   // someone walked in: a small welcome
    else if (ev.name === 'clap' || ev.name === 'gesture-fist-open') for (let k = 0; k < 4; k++) setTimeout(() => this.fx.launch(this.w * (0.15 + 0.7 * Math.random()), this.h * 0.2, this.h), k * 250);
  }
  react(events) {
    for (const e of events) {
      if (e.type === 'light') { this.fx.burst(e.x, e.y, 40, this.ctx.quality ? 22 : 8, 120); this.ctx.audio.chime(this.world.litCount % 5); }
      else if (e.type === 'all') for (let k = 0; k < 7; k++) setTimeout(() => this.fx.launch(this.w * (0.15 + 0.7 * Math.random()), this.h * (0.1 + 0.3 * Math.random()), this.h), k * 350);
    }
  }
  update(dt, hands) {
    this.t += dt;
    const ev = this.world.update(dt, this._status === 'playing' ? hands : []);
    this.react(ev);
    this.fx.update(dt);
  }
  render(g) {
    const { w, h } = this;
    nightSky(g, w, h); drawStars(g, w, h, this.t);
    for (const d of this.world.diyas) drawDiya(g, d.x, d.y, this.world.radius, { lit: d.lit, warm: d.warm, t: this.t, seed: d.i * 3 + d.j });
    this.fx.draw(g);
    drawPill(g, `🪔 ${this.world.litCount} / ${this.world.diyas.length}`, w / 2, h * 0.025, { size: Math.max(18, h * 0.045) });
    if (this.world.celebrate > 0) {
      g.save(); g.fillStyle = '#ffe9a8'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = `800 ${h * 0.12}px "Nunito", system-ui, sans-serif`;
      g.shadowColor = '#ff9a1a'; g.shadowBlur = 30; g.fillText('Happy Diwali!', w / 2, h * 0.25); g.restore();
    }
  }
}
