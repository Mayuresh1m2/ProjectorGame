import { Game, drawPill } from '../../core/game.js';
import { GOLD, SAFFRON, MAGENTA } from './fx.js';

const PALETTE = [GOLD, SAFFRON, MAGENTA, '#ffffff', '#4de3ff', '#8dff6b', '#ff4d4d'];

/** Stable colour per hand: ids are numbers for camera hands but strings like 'mouse' for pointer input. */
export function colorFor(id) {
  const n = typeof id === 'number' ? Math.abs(Math.floor(id)) : [...String(id)].reduce((a, c) => a + c.charCodeAt(0), 0);
  return PALETTE[n % PALETTE.length];
}

/** Points where one touch is repeated: n rotations, optionally mirrored, about (cx, cy). */
export function symmetricPoints(x, y, cx, cy, n = 8, mirror = true) {
  const dx = x - cx, dy = y - cy, out = [];
  for (let k = 0; k < n; k++) {
    const a = (k * 2 * Math.PI) / n, c = Math.cos(a), s = Math.sin(a);
    out.push([cx + dx * c - dy * s, cy + dx * s + dy * c]);
    if (mirror) out.push([cx + dx * c + dy * s, cy + dx * s - dy * c]);
  }
  return out;
}

export class RangoliGame extends Game {
  static meta = { id: 'rangoli', name: 'Rangoli', icon: '🌸', description: 'Draw with your hand – every touch is repeated into a pattern!' };
  constructor(ctx) { super(ctx); this.t = 0; this.last = new Map(); this.canvas = null; this.idle = 0; this.n = 8; this.autoAngle = 0; }
  resize(w, h) { super.resize(w, h); this.canvas = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(w, h) : Object.assign(document.createElement('canvas'), { width: w, height: h }); this.g = this.canvas.getContext('2d'); this._clear(); }
  _clear() { if (!this.g) return; this.g.clearRect(0, 0, this.w, this.h); this.idle = 0; }
  restart() { this._clear(); this.start(); }
  _dot(x, y, color, r) {
    const g = this.g, cx = this.w / 2, cy = this.h / 2;
    g.fillStyle = color;
    for (const [px, py] of symmetricPoints(x, y, cx, cy, this.n, true)) { g.beginPath(); g.arc(px, py, r, 0, 7); g.fill(); }
  }
  update(dt, hands) {
    this.t += dt;
    if (!this.g) return;
    const r = Math.max(3, Math.min(this.w, this.h) * 0.007);
    let touched = false;
    for (const h of hands) {
      const prev = this.last.get(h.id), color = colorFor(h.id);
      if (prev) { const d = Math.hypot(h.x - prev.x, h.y - prev.y), steps = Math.min(30, Math.ceil(d / (r * 1.5))); for (let s = 1; s <= steps; s++) this._dot(prev.x + (h.x - prev.x) * s / steps, prev.y + (h.y - prev.y) * s / steps, color, r); }
      else this._dot(h.x, h.y, color, r);
      this.last.set(h.id, { x: h.x, y: h.y }); touched = true;
    }
    for (const id of [...this.last.keys()]) if (!hands.some((h) => h.id === id)) this.last.delete(id);
    this.idle = touched ? 0 : this.idle + dt;
    if (this.idle > 4) { // nobody drawing: a slow self-drawing flower keeps the wall alive
      this.autoAngle += dt * 0.9;
      const rad = Math.min(this.w, this.h) * (0.12 + 0.28 * (0.5 + 0.5 * Math.sin(this.autoAngle * 0.7)));
      this._dot(this.w / 2 + Math.cos(this.autoAngle) * rad, this.h / 2 + Math.sin(this.autoAngle) * rad, PALETTE[Math.floor(this.autoAngle * 0.4) % PALETTE.length], r * 0.8);
    }
    if (this.idle > 90) this._clear();
  }
  render(g) {
    const { w, h } = this;
    const bg = g.createRadialGradient(w / 2, h / 2, 10, w / 2, h / 2, Math.max(w, h) * 0.7); bg.addColorStop(0, '#2a0f3a'); bg.addColorStop(1, '#0b0620');
    g.fillStyle = bg; g.fillRect(0, 0, w, h);
    if (this.canvas) { g.save(); g.shadowColor = 'rgba(255,200,80,.6)'; g.shadowBlur = 12; g.drawImage(this.canvas, 0, 0); g.restore(); }
    drawPill(g, '🌸 Rangoli', w / 2, h * 0.025, { size: Math.max(18, h * 0.04) });
  }
}
