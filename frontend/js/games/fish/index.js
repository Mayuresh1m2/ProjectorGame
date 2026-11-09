import { Game, drawPill } from '../../core/game.js';
import { FishWorld } from './logic.js';

export class FishGame extends Game {
  static meta = { id: 'fish', name: 'Fish pond', icon: '🐠', description: 'Wave your hand near the fish and watch them swim away!' };
  constructor(ctx) { super(ctx); this.world = new FishWorld(ctx.settings.game); this.world.reset(); this.t = 0; this.rings = []; this.bubbles = Array.from({ length: 26 }, (_, i) => ({ x: (i * 97) % 1000 / 1000, y: (i * 53) % 1000 / 1000, s: 0.3 + ((i * 31) % 10) / 14 })); this.elapsed = 0; }
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
    for (const e of ev) { this.rings.push({ x: e.x, y: e.y, t: 0 }); this.ctx.audio.splash(); }
    for (const h of hands) if (this._status === 'playing' && Math.random() < dt * 3) this.rings.push({ x: h.x, y: h.y, t: 0.6 });
    this.rings.forEach((r) => (r.t += dt)); this.rings = this.rings.filter((r) => r.t < 1.2);
  }
  render(g) {
    const { w, h } = this, s = Math.min(w, h);
    const bg = g.createLinearGradient(0, 0, 0, h); bg.addColorStop(0, '#6fd3ff'); bg.addColorStop(0.6, '#2a8fd6'); bg.addColorStop(1, '#14508f');
    g.fillStyle = bg; g.fillRect(0, 0, w, h);
    if (this.ctx.quality > 0) { g.fillStyle = 'rgba(255,255,255,0.06)'; for (let i = 0; i < 5; i++) { const x = ((i * 0.23 + this.t * 0.01) % 1.2 - 0.1) * w; g.beginPath(); g.moveTo(x, 0); g.lineTo(x + w * 0.08, 0); g.lineTo(x - w * 0.12, h); g.lineTo(x - w * 0.2, h); g.fill(); } }
    for (const b of this.bubbles) { const y = h - ((this.t * 0.04 * b.s + b.y) % 1) * h * 1.1; g.strokeStyle = 'rgba(255,255,255,0.5)'; g.lineWidth = 2; g.beginPath(); g.arc(b.x * w + Math.sin(this.t + b.y * 9) * 8, y, s * 0.01 * (1 + b.s), 0, 7); g.stroke(); }
    g.fillStyle = '#e8cf8f'; g.beginPath(); g.moveTo(0, h); for (let x = 0; x <= w; x += 20) g.lineTo(x, h * 0.93 + Math.sin(x / 90) * h * 0.012); g.lineTo(w, h); g.fill();
    for (const f of [...this.world.fish].sort((a, b) => a.size - b.size)) drawFish(g, f, this.t);
    for (const r of this.rings) { g.strokeStyle = `rgba(255,255,255,${0.7 * (1 - r.t / 1.2)})`; g.lineWidth = 3; g.beginPath(); g.arc(r.x, r.y, s * (0.03 + r.t * 0.14), 0, 7); g.stroke(); }
    drawPill(g, `🐠 ${this.world.score}`, w / 2, h * 0.025, { size: Math.max(18, h * 0.04) });
    const tl = this.timeLeft; if (tl !== null) drawPill(g, `⏱ ${Math.ceil(tl)}`, w - h * 0.03, h * 0.025, { size: h * 0.032, align: 'right' });
  }
}

function drawFish(g, f, t) {
  const sw = Math.sin(t * (5 + f.fear * 14) + f.phase) * (0.25 + f.fear * 0.3);
  g.save(); g.translate(f.x, f.y); g.scale(f.facing * f.size, f.size);
  const body = `hsl(${f.hue},90%,60%)`, fin = `hsl(${(f.hue + 20) % 360},90%,70%)`;
  g.fillStyle = fin; g.beginPath(); g.moveTo(-0.7, 0); g.lineTo(-1.3, -0.45 + sw); g.lineTo(-1.3, 0.45 + sw); g.closePath(); g.fill();
  g.fillStyle = body; g.beginPath(); g.ellipse(0, 0, 0.85, 0.5, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = 'rgba(255,255,255,0.35)'; g.beginPath(); g.ellipse(0.05, -0.2, 0.5, 0.15, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = fin; g.beginPath(); g.moveTo(-0.1, -0.45); g.quadraticCurveTo(0.1, -0.85, 0.35, -0.45); g.fill();
  g.fillStyle = '#fff'; g.beginPath(); g.arc(0.5, -0.1, 0.13, 0, 7); g.fill(); g.fillStyle = '#222'; g.beginPath(); g.arc(0.54, -0.1, 0.065, 0, 7); g.fill();
  g.restore();
}
