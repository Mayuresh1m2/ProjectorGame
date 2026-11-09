// Animal park: pure logic (no canvas). Players come from hands, each gets an animal with its own gait, and the
// scenery reacts to two coarse things only: how long someone stands still near it, and how fast they move.

export const ANIMALS = ['rabbit', 'kangaroo', 'elephant', 'cat', 'frog', 'bird'];
/** mode: hop = discrete leaps, walk = steady steps, glide = smooth flight. Lengths/speeds are in screen heights. */
export const GAIT = {
  rabbit: { mode: 'hop', hop: 0.13, dur: 0.42, arc: 0.05, size: 0.11 },
  kangaroo: { mode: 'hop', hop: 0.24, dur: 0.62, arc: 0.13, size: 0.17 },
  frog: { mode: 'hop', hop: 0.09, dur: 0.3, arc: 0.04, size: 0.09 },
  elephant: { mode: 'walk', speed: 0.26, size: 0.19 },
  cat: { mode: 'walk', speed: 0.5, size: 0.1 },
  bird: { mode: 'glide', speed: 0.7, size: 0.09 },
};
const MAX_PLAYERS = 6;

/** Groups hands into players (hands near each other are one person) and follows them from frame to frame. */
export class PlayerTracker {
  constructor(opts = {}) {
    this.joinDist = opts.joinDist ?? 0.4;     // hands closer than this (screen heights) are the same person
    this.matchDist = opts.matchDist ?? 0.35;  // a group this near a known player is that player
    this.keep = opts.keep ?? 1.5;             // seconds a player is remembered after their hands vanish
    this.stillSpeed = opts.stillSpeed ?? 0.12;
    this.players = []; this.nextId = 1;
  }
  update(dt, hands, h) {
    const n = hands.length, group = hands.map((_, i) => i);
    const find = (i) => { while (group[i] !== i) i = group[i] = group[group[i]]; return i; };
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
      if (Math.hypot(hands[i].x - hands[j].x, hands[i].y - hands[j].y) < this.joinDist * h) group[find(i)] = find(j);
    }
    const byRoot = new Map();
    hands.forEach((hd, i) => { const r = find(i); (byRoot.get(r) || byRoot.set(r, []).get(r)).push(hd); });
    const clusters = [...byRoot.values()].map((g) => ({ x: g.reduce((a, q) => a + q.x, 0) / g.length, y: g.reduce((a, q) => a + q.y, 0) / g.length, n: g.length }));
    const free = new Set(this.players.map((_, i) => i));
    const pairs = [];
    clusters.forEach((c, ci) => this.players.forEach((p, pi) => pairs.push([Math.hypot(c.x - p.x, c.y - p.y), ci, pi])));
    pairs.sort((a, b) => a[0] - b[0]);
    const taken = new Set();
    for (const [d, ci, pi] of pairs) {
      if (d > this.matchDist * h || taken.has(ci) || !free.has(pi)) continue;
      taken.add(ci); free.delete(pi);
      const p = this.players[pi], c = clusters[ci], ox = p.x, oy = p.y, k = Math.min(1, dt * 10);
      p.x += (c.x - p.x) * k; p.y += (c.y - p.y) * k; p.n = c.n; p.lost = 0;
      this._motion(p, dt, ox, oy, h);
    }
    for (const pi of free) { const p = this.players[pi]; p.lost += dt; p.vx = p.vy = p.speed = 0; p.still += dt; }
    clusters.forEach((c, ci) => {
      if (taken.has(ci) || this.players.length >= MAX_PLAYERS) return;
      this.players.push({ id: this.nextId++, x: c.x, y: c.y, vx: 0, vy: 0, speed: 0, still: 0, lost: 0, n: c.n, age: 0 });
    });
    this.players = this.players.filter((p) => p.lost < this.keep);
    for (const p of this.players) p.age += dt;
    return this.players;
  }
  _motion(p, dt, ox, oy, h) {
    p.vx = dt > 0 ? (p.x - ox) / dt : 0; p.vy = dt > 0 ? (p.y - oy) / dt : 0;
    p.speed = Math.hypot(p.vx, p.vy) / h;
    p.still = p.speed < this.stillSpeed ? p.still + dt : 0;
  }
}

export class ParkWorld {
  constructor(opts = {}, rng = Math.random) {
    this.rng = rng; this.w = 1280; this.h = 720;
    this.fastSpeed = opts.fastSpeed ?? 0.9;      // a quick movement (screen heights/s) that startles trees and splashes the pond
    this.dwell = opts.dwell ?? { flower: 2.0, tree: 2.5, pond: 2.0, friends: 1.5 };
    this.tracker = new PlayerTracker(opts.tracker);
    this.animals = []; this.particles = []; this.prints = []; this.bag = []; this.hueNext = rng() * 360; this.clock = 0;
    this.scenery(); this.events = [];
  }
  resize(w, h) { this.w = w; this.h = h; }
  scenery() {
    const r = this.rng;
    this.pond = { x: 0.18, y: 0.78, rx: 0.14, ry: 0.07, lilies: 0, ripple: 0 };
    this.trees = [{ x: 0.62, y: 0.55, glow: 0, until: 0 }, { x: 0.82, y: 0.5, glow: 0, until: 0 }, { x: 0.45, y: 0.5, glow: 0, until: 0 }];
    this.flowers = Array.from({ length: 8 }, (_, i) => ({ x: 0.08 + 0.84 * ((i + 0.5 + (r() - 0.5) * 0.4) / 8), y: 0.82 + r() * 0.1, hue: 300 + r() * 80, bloom: 0, until: 0, want: 0 }));
    this.stars = Array.from({ length: 40 }, () => ({ x: r(), y: r() * 0.55, s: 0.4 + r() * 1.2, p: r() * 6.28 }));
    this.flies = Array.from({ length: 14 }, () => ({ x: r(), y: 0.3 + r() * 0.6, p: r() * 6.28, q: 0.2 + r() * 0.5 }));
  }
  nextKind() {
    if (!this.bag.length) { this.bag = [...ANIMALS]; for (let i = this.bag.length - 1; i > 0; i--) { const j = Math.floor(this.rng() * (i + 1)); [this.bag[i], this.bag[j]] = [this.bag[j], this.bag[i]]; } }
    return this.bag.pop();
  }
  emit(type, x, y, extra = {}) { this.events.push({ type, x, y, ...extra }); }
  burst(x, y, n, hue, { speed = 0.25, life = 1.2, up = 0.2 } = {}) {
    for (let i = 0; i < n && this.particles.length < 160; i++) {
      const a = this.rng() * 6.283, s = (0.4 + this.rng() * 0.6) * speed * this.h;
      this.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - up * this.h, life: life * (0.6 + this.rng() * 0.6), max: life, hue: hue + (this.rng() - 0.5) * 40 });
    }
  }
  update(dt, hands) {
    this.events = []; this.clock += dt; const h = this.h, w = this.w;
    const players = this.tracker.update(dt, hands, h);
    this.syncAnimals(players, dt);
    for (const p of players) if (p.lost === 0) this.interact(p, players, dt);
    for (const a of this.animals) this.move(a, dt);
    this.separate();
    this.scene(dt);
    for (const q of this.particles) { q.life -= dt; q.x += q.vx * dt; q.y += q.vy * dt; q.vy += this.h * 0.25 * dt; }
    this.particles = this.particles.filter((q) => q.life > 0);
    for (const f of this.prints) f.age += dt;
    this.prints = this.prints.filter((f) => f.age < 5);
    return this.events;
  }
  syncAnimals(players, dt) {
    for (const p of players) {
      let a = this.animals.find((q) => q.pid === p.id);
      if (!a) {
        const kind = this.nextKind(); this.hueNext = (this.hueNext + 137.5) % 360;
        a = { pid: p.id, kind, hue: this.hueNext, x: p.x, y: p.y, z: 0, face: 1, hop: -1, rest: 0, phase: this.rng() * 6.28, born: 0, alpha: 0, joy: 0, hopFrom: null, hopTo: null };
        this.animals.push(a); this.emit('arrive', p.x, p.y, { kind });
      }
      a.player = p; a.alpha = Math.min(1, a.alpha + dt * 2); a.born += dt;
      if (p.lost > 0.6) a.alpha = Math.max(0.35, 1 - (p.lost - 0.6) * 1.2);   // fading: goes to sleep if nobody comes back
    }
    this.animals = this.animals.filter((a) => players.some((p) => p.id === a.pid));
  }
  /** Standing still near something wakes it; moving fast near it startles it. */
  interact(p, players, dt) {
    const h = this.h, w = this.w, near = (ox, oy, r) => Math.hypot(p.x - ox * w, p.y - oy * h) < r * h;
    const still = p.still > 0.4;
    p.d ||= {};
    const tick = (key, ok, need, fire) => {
      p.d[key] = ok ? (p.d[key] || 0) + dt : Math.max(0, (p.d[key] || 0) - dt * 2);
      if (p.d[key] >= need) { p.d[key] = 0; fire(); }
    };
    this.flowers.forEach((f, i) => tick('f' + i, still && near(f.x, f.y, 0.11) && f.bloom < 0.5, this.dwell.flower, () => { f.want = 1; f.until = this.clock + 22; this.emit('bloom', f.x * w, f.y * h, { i }); this.burst(f.x * w, f.y * h, 10, f.hue, { speed: 0.12, up: 0.1 }); }));
    this.trees.forEach((t, i) => tick('t' + i, still && near(t.x, t.y + 0.18, 0.2) && t.glow < 0.5, this.dwell.tree, () => { t.glow = 0.01; t.until = this.clock + 20; this.emit('lantern', t.x * w, t.y * h, { i }); this.burst(t.x * w, t.y * h, 12, 40, { speed: 0.1 }); }));
    tick('pond', still && near(this.pond.x, this.pond.y, this.pond.rx + 0.06) && this.pond.lilies < 4, this.dwell.pond, () => { this.pond.lilies++; this.pond.lilyT = 15; this.pond.ripple = 1.5; this.emit('lily', this.pond.x * w, this.pond.y * h); });
    for (const q of players) {
      if (q.id <= p.id || q.lost > 0) continue;
      const key = 'friend' + q.id, close = Math.hypot(p.x - q.x, p.y - q.y) < 0.6 * h && still && q.still > 0.4;
      tick(key, close, this.dwell.friends, () => {
        for (const a of this.animals) if (a.pid === p.id || a.pid === q.id) a.joy = 1.5;
        this.emit('friends', (p.x + q.x) / 2, (p.y + q.y) / 2); this.burst((p.x + q.x) / 2, (p.y + q.y) / 2 - 0.1 * h, 12, 340, { speed: 0.12, up: 0.3 });
      });
    }
    p.cool = Math.max(0, (p.cool || 0) - dt);
    if (p.speed > this.fastSpeed && p.cool === 0) {      // a quick wave or a big step
      p.cool = 1.2;
      const tree = this.trees.find((t) => near(t.x, t.y + 0.1, 0.25)), inPond = near(this.pond.x, this.pond.y, this.pond.rx + 0.08);
      if (inPond) { this.pond.ripple = 1.5; this.emit('splash', p.x, p.y); this.burst(p.x, p.y, 16, 200, { speed: 0.3, up: 0.35 }); }
      else if (tree) { this.emit('leaves', tree.x * w, tree.y * h); this.burst(tree.x * w, tree.y * h * 0.9, 14, 100, { speed: 0.15, life: 2.2, up: -0.05 }); }
      else { this.emit('sparkle', p.x, p.y); this.burst(p.x, p.y, 10, 50 + this.rng() * 200, { speed: 0.22 }); }
    }
    if (p.speed > 0.25 && this.clock - (p.printAt || 0) > 0.4) { p.printAt = this.clock; this.prints.push({ x: p.x, y: p.y + 0.02 * h, age: 0 }); }
  }
  move(a, dt) {
    const h = this.h, w = this.w, g = GAIT[a.kind], p = a.player, tx = p.x, ty = p.y;
    const dx = tx - a.x, dy = ty - a.y, d = Math.hypot(dx, dy);
    a.joy = Math.max(0, a.joy - dt);
    if (Math.abs(dx) > 0.01 * h) a.face = dx > 0 ? 1 : -1;
    a.phase += dt * 6;
    if (g.mode === 'hop') {
      if (a.hop >= 0) {
        a.hop += dt / g.dur;
        const k = Math.min(1, a.hop), e = k * k * (3 - 2 * k);
        a.x = a.hopFrom.x + (a.hopTo.x - a.hopFrom.x) * e; a.y = a.hopFrom.y + (a.hopTo.y - a.hopFrom.y) * e;
        a.z = Math.sin(Math.PI * k) * g.arc * h;
        if (k >= 1) { a.hop = -1; a.z = 0; a.rest = 0.1 + this.rng() * 0.25; }
      } else {
        a.rest -= dt;
        if (a.joy > 0 && a.rest <= 0) { a.hop = 0; a.hopFrom = { x: a.x, y: a.y }; a.hopTo = { x: a.x, y: a.y }; a.rest = 0; }   // a happy hop on the spot
        else if (d > 0.06 * h && a.rest <= 0) {
          const len = Math.min(d, g.hop * h);
          a.hop = 0; a.hopFrom = { x: a.x, y: a.y }; a.hopTo = { x: a.x + dx / d * len, y: a.y + dy / d * len };
        }
      }
    } else if (g.mode === 'walk') {
      const sp = d > 0.05 * h ? Math.min(g.speed * h, d * 3) : 0;
      if (d > 0) { a.x += dx / d * sp * dt; a.y += dy / d * sp * dt; }
      a.z = sp > 0 ? Math.abs(Math.sin(a.phase * (g.speed > 0.4 ? 1.4 : 0.8))) * 0.012 * h : (a.joy > 0 ? Math.abs(Math.sin(a.phase * 2)) * 0.03 * h : 0);
      a.moving = sp > 0;
    } else {  // glide: inertia, never stops dead
      a.vx = (a.vx || 0) + (dx / (d || 1) * Math.min(g.speed * h, d * 2.5) - (a.vx || 0)) * Math.min(1, 3 * dt);
      a.vy = (a.vy || 0) + (dy / (d || 1) * Math.min(g.speed * h, d * 2.5) - (a.vy || 0)) * Math.min(1, 3 * dt);
      a.x += a.vx * dt; a.y += a.vy * dt;
      a.z = (0.07 + 0.015 * Math.sin(a.phase * 0.7)) * h + (a.joy > 0 ? Math.sin(a.phase * 2) * 0.03 * h : 0);
      if (Math.abs(a.vx) > 0.02 * h) a.face = a.vx > 0 ? 1 : -1;
    }
    const m = g.size * h * 0.5;
    a.x = Math.min(w - m, Math.max(m, a.x)); a.y = Math.min(h - 0.02 * h, Math.max(0.15 * h, a.y));
  }
  separate() {
    const min = 0.1 * this.h;
    for (let i = 0; i < this.animals.length; i++) for (let j = i + 1; j < this.animals.length; j++) {
      const a = this.animals[i], b = this.animals[j], dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy);
      if (d < min && d > 0.001) { const push = (min - d) / 2; a.x -= dx / d * push * 0.3; a.y -= dy / d * push * 0.3; b.x += dx / d * push * 0.3; b.y += dy / d * push * 0.3; }
    }
  }
  scene(dt) {
    for (const f of this.flowers) {
      if (f.want && this.clock > f.until) f.want = 0;
      f.bloom += (f.want - f.bloom) * Math.min(1, dt * (f.want ? 1.6 : 0.7));
    }
    for (const t of this.trees) {
      if (t.until && this.clock > t.until) { t.until = 0; }
      t.glow += ((t.until ? 1 : 0) - t.glow) * Math.min(1, dt * (t.until ? 1.2 : 0.5));
    }
    this.pond.ripple = Math.max(0, this.pond.ripple - dt);
    if (this.pond.lilies > 0 && (this.pond.lilyT -= dt) <= 0) { this.pond.lilies--; this.pond.lilyT = 15; }   // lilies drift away, so the pond can be woken again
    for (const f of this.flies) { f.p += dt * f.q; f.x += Math.cos(f.p * 1.7) * dt * 0.02; f.y += Math.sin(f.p * 2.3) * dt * 0.02; f.x = (f.x + 1) % 1; f.y = Math.min(0.95, Math.max(0.25, f.y)); }
  }
}
