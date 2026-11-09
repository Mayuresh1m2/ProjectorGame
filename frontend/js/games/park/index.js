import { Game } from '../../core/game.js';
import { ParkWorld } from './world.js';
import { drawAnimal } from './animals.js';

/** Animal park: an ambient night garden. Each person (or group of hands) becomes an animal that follows them with its own
 *  gait. Standing still near flowers, trees, the pond or another animal wakes them up; quick movements shake the trees and
 *  splash the pond. No score, no start screen. */
export class ParkGame extends Game {
  static meta = { id: 'park', name: 'Animal park', icon: '🦘', description: 'You become an animal in a night garden. Stand still by flowers, trees and the pond to wake them; move fast to shake and splash.' };
  constructor(ctx) { super(ctx); this.world = new ParkWorld(); this.t = 0; this._status = 'playing'; }
  resize(w, h) { super.resize(w, h); this.world.resize(w, h); }
  restart() { this.world = new ParkWorld(); this.world.resize(this.w, this.h); this.start(); }
  update(dt, hands) {
    this.t += dt;
    this.world.update(dt, hands.filter((h) => !h.lost));
  }
  render(g) {
    const { w, h } = this, W = this.world, q = this.ctx.quality ?? 2, t = this.t;
    const sky = g.createLinearGradient(0, 0, 0, h); sky.addColorStop(0, '#050a1c'); sky.addColorStop(0.7, '#0b1a2a'); sky.addColorStop(1, '#0a1c14');
    g.fillStyle = sky; g.fillRect(0, 0, w, h);
    for (const s of W.stars) { g.fillStyle = `rgba(255,255,240,${0.35 + 0.35 * Math.sin(t * 1.5 + s.p)})`; g.fillRect(s.x * w, s.y * h, s.s * 1.6, s.s * 1.6); }
    g.fillStyle = '#f4efd2'; g.beginPath(); g.arc(w * 0.88, h * 0.14, h * 0.045, 0, 7); g.fill();
    const mg = g.createRadialGradient(w * 0.88, h * 0.14, 0, w * 0.88, h * 0.14, h * 0.2); mg.addColorStop(0, 'rgba(244,239,210,0.2)'); mg.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = mg; g.fillRect(w * 0.6, 0, w * 0.4, h * 0.45);
    g.fillStyle = '#0a2216'; g.beginPath(); g.moveTo(0, h * 0.7); g.quadraticCurveTo(w * 0.3, h * 0.64, w * 0.6, h * 0.7); g.quadraticCurveTo(w * 0.85, h * 0.74, w, h * 0.68); g.lineTo(w, h); g.lineTo(0, h); g.fill();
    this.pond(g, W, t); for (const tr of W.trees) this.tree(g, tr, t); for (const f of W.flowers) this.flower(g, f);
    for (const f of W.prints) { g.fillStyle = `rgba(160,220,180,${0.2 * (1 - f.age / 5)})`; g.beginPath(); g.ellipse(f.x, f.y, h * 0.012, h * 0.007, 0, 0, 7); g.fill(); }
    g.save(); g.globalCompositeOperation = 'lighter';
    for (const f of W.flies.slice(0, q === 0 ? 5 : 14)) { const a = 0.4 + 0.4 * Math.sin(t * 2 + f.p * 5), R = h * 0.02; const gr = g.createRadialGradient(f.x * w, f.y * h, 0, f.x * w, f.y * h, R); gr.addColorStop(0, `rgba(230,255,140,${a})`); gr.addColorStop(1, 'rgba(230,255,140,0)'); g.fillStyle = gr; g.fillRect(f.x * w - R, f.y * h - R, R * 2, R * 2); }
    g.restore();
    for (const a of [...W.animals].sort((p, r) => p.y - r.y)) drawAnimal(g, a, h, q);
    g.save(); g.globalCompositeOperation = 'lighter';
    for (const p of W.particles) { const k = Math.max(0, p.life / p.max); g.fillStyle = `hsla(${p.hue}, 85%, 70%, ${0.8 * k})`; g.beginPath(); g.arc(p.x, p.y, h * 0.007 * (0.5 + k), 0, 7); g.fill(); }
    g.restore();
  }
  pond(g, W, t) {
    const { w, h } = this, p = W.pond, x = p.x * w, y = p.y * h, rx = p.rx * w, ry = p.ry * h;
    const gr = g.createRadialGradient(x, y, 0, x, y, rx); gr.addColorStop(0, '#16456a'); gr.addColorStop(1, '#0a2438');
    g.fillStyle = gr; g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, 7); g.fill();
    g.strokeStyle = 'rgba(140,200,240,0.25)'; g.lineWidth = 2;
    const r1 = (t * 0.25) % 1; g.beginPath(); g.ellipse(x, y, rx * (0.3 + r1 * 0.6), ry * (0.3 + r1 * 0.6), 0, 0, 7); g.stroke();
    if (p.ripple > 0) for (let i = 0; i < 3; i++) { const k = 1 - p.ripple / 1.5 + i * 0.15; if (k < 1) { g.strokeStyle = `rgba(200,235,255,${0.5 * (1 - k)})`; g.beginPath(); g.ellipse(x, y, rx * k, ry * k, 0, 0, 7); g.stroke(); } }
    for (let i = 0; i < p.lilies; i++) { const lx = x + (i - 1.5) * rx * 0.4, ly = y + Math.sin(i * 2.1) * ry * 0.4; g.fillStyle = '#2f8f5a'; g.beginPath(); g.ellipse(lx, ly, rx * 0.14, ry * 0.2, 0, 0, 7); g.fill(); g.fillStyle = '#ffb3d9'; g.beginPath(); g.arc(lx, ly - ry * 0.12, ry * 0.2, 0, 7); g.fill(); }
  }
  tree(g, t, tm) {
    const { w, h } = this, x = t.x * w, y = t.y * h, s = h * 0.1;
    g.fillStyle = '#2b1d12'; g.fillRect(x - s * 0.18, y, s * 0.36, s * 1.6);
    g.fillStyle = '#0d3320'; for (const [dx, dy, r] of [[0, -0.2, 0.9], [-0.7, 0.1, 0.65], [0.7, 0.1, 0.65], [0, -0.8, 0.6]]) { g.beginPath(); g.arc(x + dx * s, y + dy * s, r * s, 0, 7); g.fill(); }
    if (t.glow > 0.02) {
      g.save(); g.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 7; i++) { const lx = x + Math.cos(i * 2.4) * s * 1.1, ly = y + Math.sin(i * 1.7) * s * 0.7 - s * 0.2 + Math.sin(tm * 2 + i) * 2, R = s * 0.28 * t.glow; const gr = g.createRadialGradient(lx, ly, 0, lx, ly, R); gr.addColorStop(0, `rgba(255,190,90,${0.9 * t.glow})`); gr.addColorStop(1, 'rgba(255,150,40,0)'); g.fillStyle = gr; g.fillRect(lx - R, ly - R, R * 2, R * 2); }
      g.restore();
    }
  }
  flower(g, f) {
    const { w, h } = this, x = f.x * w, y = f.y * h, s = h * 0.04;
    g.strokeStyle = '#1d5a35'; g.lineWidth = 3; g.beginPath(); g.moveTo(x, y + s * 1.2); g.lineTo(x, y); g.stroke();
    const r = s * (0.25 + 0.75 * f.bloom);
    g.fillStyle = `hsl(${f.hue}, ${40 + 40 * f.bloom}%, ${40 + 25 * f.bloom}%)`;
    for (let i = 0; i < 5; i++) { const a = i * 1.2566; g.beginPath(); g.arc(x + Math.cos(a) * r * 0.8, y + Math.sin(a) * r * 0.8, r * 0.6, 0, 7); g.fill(); }
    g.fillStyle = '#ffe27a'; g.beginPath(); g.arc(x, y, r * 0.4, 0, 7); g.fill();
    if (f.bloom > 0.3) { g.save(); g.globalCompositeOperation = 'lighter'; const R = s * 2.2 * f.bloom, gr = g.createRadialGradient(x, y, 0, x, y, R); gr.addColorStop(0, `hsla(${f.hue}, 90%, 70%, ${0.35 * f.bloom})`); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(x - R, y - R, R * 2, R * 2); g.restore(); }
  }
}
