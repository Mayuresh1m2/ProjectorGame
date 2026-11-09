import { Game } from '../core/game.js';

const DWELL_S = 1.1; // hold a hand over a tile this long to choose it (no clicking needed on a wall)

/** Game selection screen. Works with mouse/touch (tap) and with hands (dwell). */
export class MenuGame extends Game {
  static meta = { id: 'menu', name: 'Games', icon: '🎮', description: '' };

  constructor(ctx, registry) {
    super(ctx);
    this.registry = registry;
    this.dwell = new Map(); // tile id -> seconds
    this.t = 0;
    this._status = 'playing';
  }

  tiles() {
    const list = Object.values(this.registry).filter((g) => g.meta.id !== 'menu');
    const n = list.length, cols = Math.min(n, this.w > this.h ? 3 : 2), rows = Math.ceil(n / cols);
    const pad = this.h * 0.05, top = this.h * 0.2;
    const tw = Math.min((this.w - pad * (cols + 1)) / cols, this.h * 0.55), th = Math.min((this.h - top - pad * (rows + 1)) / rows, tw * 0.9);
    const gx = (this.w - cols * tw - (cols - 1) * pad) / 2;
    return list.map((G, i) => ({ id: G.meta.id, meta: G.meta, x: gx + (i % cols) * (tw + pad), y: top + Math.floor(i / cols) * (th + pad), w: tw, h: th }));
  }

  hit(t, x, y) { return x >= t.x && x <= t.x + t.w && y >= t.y && y <= t.y + t.h; }

  update(dt, hands) {
    this.t += dt;
    const tiles = this.tiles();
    for (const t of tiles) {
      const over = hands.some((h) => this.hit(t, h.x, h.y));
      const d = Math.max(0, (this.dwell.get(t.id) || 0) + (over ? dt : -dt * 2));
      this.dwell.set(t.id, d);
      if (d >= DWELL_S) { this.dwell.set(t.id, 0); this.ctx.audio.chime(2); this.ctx.emit({ type: 'select', game: t.id }); return; }
    }
  }

  onEvent(ev) {
    if (ev.type !== 'tap') return;
    const t = this.tiles().find((q) => this.hit(q, ev.x, ev.y));
    if (t) { this.ctx.audio.chime(3); this.ctx.emit({ type: 'select', game: t.id }); }
  }

  render(g) {
    const { w, h } = this;
    const bg = g.createLinearGradient(0, 0, w, h); bg.addColorStop(0, '#6c5ce7'); bg.addColorStop(1, '#00b5d8');
    g.fillStyle = bg; g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(255,255,255,0.95)'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = `800 ${h * 0.09}px "Nunito", system-ui, sans-serif`;
    g.fillText('Pick a game!', w / 2, h * 0.11);
    for (const t of this.tiles()) {
      const p = Math.min(1, (this.dwell.get(t.id) || 0) / DWELL_S);
      g.save(); g.translate(t.x + t.w / 2, t.y + t.h / 2); const s = 1 + p * 0.05; g.scale(s, s);
      g.fillStyle = 'rgba(255,255,255,0.92)'; g.beginPath(); g.roundRect(-t.w / 2, -t.h / 2, t.w, t.h, t.h * 0.12); g.fill();
      g.font = `${t.h * 0.42}px system-ui, "Noto Color Emoji", sans-serif`; g.fillStyle = '#000'; g.fillText(t.meta.icon, 0, -t.h * 0.1);
      g.font = `800 ${t.h * 0.12}px "Nunito", system-ui, sans-serif`; g.fillStyle = '#4b3a8f'; g.fillText(t.meta.name, 0, t.h * 0.3);
      if (p > 0) { g.strokeStyle = '#ff7eb6'; g.lineWidth = t.h * 0.035; g.lineCap = 'round'; g.beginPath(); g.arc(0, 0, t.h * 0.48, -Math.PI / 2, -Math.PI / 2 + p * Math.PI * 2); g.stroke(); }
      g.restore();
    }
  }
}
