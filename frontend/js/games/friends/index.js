import { Game } from '../../core/game.js';
import { drawButterfly } from '../butterfly/render.js';
import { State } from '../butterfly/logic.js';

/**
 * Pure logic: butterflies drift about; when someone stands (or holds a hand) still they come and circle
 * around them; a fast movement or a jump (speed above a threshold, in screen-heights per second) sends
 * them all running away, and they only return once it has been calm for a moment.
 * Hands are the only input: with pose-wrist tracking each wrist is a hand, so "the person" is the centre of the hands.
 */
export class FriendsWorld {
  constructor(opts = {}, rng = Math.random) {
    this.rng = rng; this.w = 1280; this.h = 720; this.count = opts.count || 10; this.sizeScale = opts.sizeScale || 1;
    this.handSpeed = opts.handSpeed ?? 1.1;     // a single hand faster than this (heights/s) startles them
    this.bodySpeed = opts.bodySpeed ?? 0.55;    // the centre of all hands moving this fast (a jump, a big step) too
    this.calmFor = opts.calmFor ?? 1.2;         // seconds of calm before they dare to return
    this.fleeFor = opts.fleeFor ?? 2.5;
    this.list = []; this.scared = 0; this.calm = 0; this.prev = null; this.prevHands = new Map(); this.friends = 0; this.scares = 0;
    this.reset();
  }
  resize(w, h) { this.w = w; this.h = h; }
  get size() { return this.h * 0.085 * this.sizeScale; }
  /** Change how many there are without disturbing the ones already flying. */
  setCount(n) {
    this.count = Math.max(1, Math.round(n));
    while (this.list.length > this.count) this.list.pop();
    while (this.list.length < this.count) this.list.push(this.spawn(this.list.length));
    this.list.forEach((b, i) => { b.slot = i / this.count * 6.283; });
  }
  spawn(i) {
    return { x: this.rng() * this.w, y: this.rng() * this.h, vx: 0, vy: 0, hue: 195 + this.rng() * 25, sat: this.rng() < 0.4 ? 15 : 85, lit: 82 + this.rng() * 12, twinkle: this.rng() * 6.28, phase: this.rng() * 6.28, flap: this.rng() * 6.28, size: 1, grow: 1, alpha: 1, rotation: 0, state: State.FLYING, slot: i / this.count * 6.283, fa: 0, fs: 1 };
  }
  reset() {
    this.list = []; this.scared = 0; this.calm = 0; this.prev = null; this.prevHands.clear(); this.friends = 0; this.scares = 0;
    for (let i = 0; i < this.count; i++) this.list.push(this.spawn(i));
  }
  /** Worst speed this frame in heights/s: [fastest single hand, centre-of-hands]. */
  measure(dt, hands) {
    let fastest = 0, cx = 0, cy = 0;
    const seen = new Map();
    for (const h of hands) {
      const p = this.prevHands.get(h.id);
      if (p && dt > 0) fastest = Math.max(fastest, Math.hypot(h.x - p.x, h.y - p.y) / dt / this.h);
      seen.set(h.id, { x: h.x, y: h.y }); cx += h.x; cy += h.y;
    }
    this.prevHands = seen;
    const c = hands.length ? { x: cx / hands.length, y: cy / hands.length } : null;
    let body = 0;
    if (c && this.prev && dt > 0 && hands.length === this.prevN) body = Math.hypot(c.x - this.prev.x, c.y - this.prev.y) / dt / this.h;
    this.prev = c; this.prevN = hands.length;
    return { fastest, body, centre: c };
  }
  update(dt, hands) {
    const ev = [], m = this.measure(dt, hands), S = this.size;
    this.clock = (this.clock || 0) + dt;
    const startled = m.fastest > this.handSpeed || m.body > this.bodySpeed;
    if (startled && m.centre) {
      if (this.scared <= 0) {
        ev.push({ type: 'scare', x: m.centre.x, y: m.centre.y }); this.scares++;
        for (const b of this.list) {  // random heading, biased away from the person (up to ~125 degrees either side), own speed
          b.fa = Math.atan2(b.y - m.centre.y, b.x - m.centre.x) + (this.rng() - 0.5) * 4.4;
          b.fs = 0.7 + this.rng() * 0.7;
        }
      }
      this.scared = this.fleeFor; this.calm = 0; this.origin = m.centre;
    } else if (this.scared > 0) { this.scared = Math.max(0, this.scared - dt); } else { this.calm += dt; }
    const ready = this.scared <= 0 && this.calm >= Math.min(this.calmFor, 0.3) && m.centre;  // calm long enough, and someone is there
    if (!this.wasReady && ready) ev.push({ type: 'friends' });
    this.wasReady = !!ready;
    let near = 0;
    for (const b of this.list) {
      let tx, ty, speed;
      if (this.scared > 0 && this.origin) {  // each one bolts in its own direction (loosely away from the scare), and keeps roaming
        b.fa += (this.rng() - 0.5) * 3 * dt;  // heading wanders a little so the paths curve
        let dx = Math.cos(b.fa), dy = Math.sin(b.fa);
        const edge = Math.min(this.w, this.h) * 0.18;  // steer back in near an edge instead of piling into a corner
        dx += Math.max(0, 1 - b.x / edge) - Math.max(0, 1 - (this.w - b.x) / edge);
        dy += Math.max(0, 1 - b.y / edge) - Math.max(0, 1 - (this.h - b.y) / edge);
        const dd = Math.hypot(dx, dy) || 1;
        b.fa = Math.atan2(dy, dx);
        tx = dx / dd; ty = dy / dd; speed = this.h * b.fs;
      } else if (ready) {                    // circle around the person at a comfortable distance
        const R = this.h * 0.2, a = b.slot + this.clock * 0.6;
        tx = m.centre.x + Math.cos(a) * R - b.x; ty = m.centre.y + Math.sin(a) * R * 0.8 - b.y; speed = this.h * 0.5;
        if (Math.hypot(b.x - m.centre.x, b.y - m.centre.y) < R * 1.5) near++;
      } else {                               // nobody there / still settling: drift about
        b.phase += dt * (0.6 + b.slot * 0.05);
        tx = Math.cos(b.phase) * this.h * 0.3; ty = Math.sin(b.phase * 1.3) * this.h * 0.3; speed = this.h * 0.18;
      }
      const d = Math.hypot(tx, ty) || 1, k = Math.min(1, 4 * dt);
      b.vx += (tx / d * speed - b.vx) * k; b.vy += (ty / d * speed - b.vy) * k;
      b.x += b.vx * dt; b.y += b.vy * dt;
      const pad = S * 0.6;
      if (b.x < pad) { b.x = pad; b.vx = Math.abs(b.vx); } else if (b.x > this.w - pad) { b.x = this.w - pad; b.vx = -Math.abs(b.vx); }
      if (b.y < pad) { b.y = pad; b.vy = Math.abs(b.vy); } else if (b.y > this.h - pad) { b.y = this.h - pad; b.vy = -Math.abs(b.vy); }
      const v = Math.hypot(b.vx, b.vy);
      if (v > 4) b.rotation = Math.atan2(b.vy, b.vx) + Math.PI / 2;
      b.flap += dt * (9 + v / this.h * 10); b.size = S;
    }
    this.friends = near; this.centre = m.centre; this.calmNow = ready;
    return ev;
  }
}

export class FriendsGame extends Game {
  static meta = { id: 'friends', name: 'Shy butterflies', icon: '🦋', description: 'Stand still and the butterflies come. Move fast or jump and they run away.' };
  constructor(ctx) {
    super(ctx); this.world = new FriendsWorld(); this.setSettings({ game: ctx.settings?.game || {} }); this.t = 0; this.rings = []; this.nextRing = 0;
    this._status = 'playing';  // a calm ambient piece: no start screen, no score
  }
  resize(w, h) { super.resize(w, h); this.world.resize(w, h); }
  setSettings(s) {
    const g = s.game || {};
    this.world.sizeScale = Math.min(3, Math.max(0.3, +g.shySize || 1));
    if (g.shyCount && Math.round(g.shyCount) !== this.world.count) this.world.setCount(g.shyCount);
  }
  restart() { this.world.reset(); this.start(); }
  update(dt, hands) {
    this.t += dt;
    this.world.update(dt, this._status === 'playing' ? hands.filter((h) => !h.lost) : []);
    // a slow beat (~50 per minute); each beat sends a soft ring out from the person, or from the middle when nobody is there
    if (this.t >= this.nextRing) {
      this.nextRing = this.t + 1.2;
      const c = this.world.calmNow && this.world.centre ? this.world.centre : { x: this.w / 2, y: this.h / 2 };
      this.rings.push({ x: c.x, y: c.y, age: 0, hue: 190 + Math.random() * 40 });
    }
    for (const r of this.rings) r.age += dt;
    this.rings = this.rings.filter((r) => r.age < 4);
  }
  render(g) {
    const { w, h } = this;
    g.fillStyle = '#000'; g.fillRect(0, 0, w, h);
    g.save(); g.globalCompositeOperation = 'lighter';
    for (const r of this.rings) {
      const k = r.age / 4, rad = k * h * 0.9;
      g.strokeStyle = `hsla(${r.hue}, 80%, 75%, ${0.3 * (1 - k)})`; g.lineWidth = h * 0.012 * (1 - k * 0.6);
      g.beginPath(); g.arc(r.x, r.y, rad, 0, Math.PI * 2); g.stroke();
    }
    const beat = 0.5 + 0.5 * Math.sin(this.t * Math.PI * 2 / 1.2);  // 0..1, same rhythm as the rings
    for (const b of this.world.list) {
      const tw = 0.55 + 0.45 * Math.sin(this.t * 2.3 + b.twinkle), R = b.size * (1.6 + 0.5 * beat);
      const grad = g.createRadialGradient(b.x, b.y, 0, b.x, b.y, R);
      grad.addColorStop(0, `hsla(${b.hue}, 90%, 85%, ${0.38 * tw})`); grad.addColorStop(1, `hsla(${b.hue}, 90%, 70%, 0)`);
      g.fillStyle = grad; g.fillRect(b.x - R, b.y - R, R * 2, R * 2);
    }
    g.restore();
    for (const b of [...this.world.list].sort((a, c) => a.y - c.y)) {
      b.alpha = 0.55 + 0.45 * (0.5 + 0.5 * Math.sin(this.t * 2.3 + b.twinkle));  // twinkle
      drawButterfly(g, b, 1);
    }
  }
}
