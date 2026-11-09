// Butterfly simulation: pure logic, no DOM/canvas. Deterministic given an rng, so it is unit-testable.
import { clamp, lerp, easeInOut } from '../../core/geometry.js';

export const State = Object.freeze({
  SPAWNING: 'SPAWNING', FLYING: 'FLYING', CHASING_HAND: 'CHASING_HAND',
  LANDING: 'LANDING', RESTING: 'RESTING', FLYING_AWAY: 'FLYING_AWAY',
});

// speed: movement multiplier; attract: hand attraction radius (x min(w,h)); catch: landing radius multiplier;
// chasers: how many butterflies one hand may attract at once (keeps motion calm with many butterflies).
export const DIFFICULTY = {
  easy: { speed: 0.85, attract: 0.7, catch: 1.5, chasers: 3 },
  normal: { speed: 1.0, attract: 0.5, catch: 1.0, chasers: 2 },
  hard: { speed: 1.3, attract: 0.32, catch: 0.7, chasers: 1 },
};

export const DEFAULTS = {
  butterflies: 8, speed: 1, interactionDistance: 0.07, spawnRate: 0.8,
  animationSpeed: 1, duration: 0, difficulty: 'normal',
};

const HAND_MIN_AGE = 0.12;      // s a hand must be seen before it attracts anything (ignores one-frame ghosts)
const HAND_GRACE = 0.5;         // s a hand may vanish before butterflies give up on it
const LANDING_TIME = 0.7;
const SPAWN_TIME = 0.9;
const STARTLE_SPEED = 0.9;      // hand speed (x min(w,h) per s) that scares a resting butterfly

const HUES = [330, 285, 205, 45, 20, 160, 265, 350];

export class ButterflyWorld {
  constructor(settings = {}, rng = Math.random) {
    this.rng = rng;
    this.settings = { ...DEFAULTS, ...settings };
    this.w = 1280; this.h = 720;
    this.butterflies = [];
    this.hands = new Map(); // id -> {x,y,speed,first,last}
    this.time = 0;
    this.nextId = 1;
    this.spawnCredit = 0;
    this.score = 0;
    this.events = [];
  }

  get scale() { return Math.min(this.w, this.h); }
  get diff() { return DIFFICULTY[this.settings.difficulty] || DIFFICULTY.normal; }
  setSettings(s) { Object.assign(this.settings, s); }
  resize(w, h) {
    const sx = w / this.w, sy = h / this.h;
    for (const b of this.butterflies) { b.x *= sx; b.y *= sy; }
    this.w = w; this.h = h;
  }

  reset() {
    this.butterflies = []; this.hands.clear(); this.score = 0; this.spawnCredit = 0; this.time = 0;
    const n = Math.max(1, Math.round(this.settings.butterflies));
    for (let i = 0; i < n; i++) this.spawn(true);
  }

  /** Free butterflies that count toward the target population (held ones are replaced immediately). */
  get activeCount() {
    return this.butterflies.reduce((n, b) => n + (b.state === State.SPAWNING || b.state === State.FLYING || b.state === State.CHASING_HAND ? 1 : 0), 0);
  }

  spawn(anywhere = false) {
    const r = this.rng, s = this.scale;
    let x, y;
    if (anywhere) { x = lerp(0.1, 0.9, r()) * this.w; y = lerp(0.1, 0.8, r()) * this.h; }
    else { // fade in near an edge, drifting inward
      const edge = Math.floor(r() * 4);
      x = edge === 0 ? -0.03 * s : edge === 1 ? this.w + 0.03 * s : r() * this.w;
      y = edge === 2 ? -0.03 * s : edge === 3 ? this.h + 0.03 * s : r() * this.h;
    }
    const heading = Math.atan2(this.h / 2 - y, this.w / 2 - x) + (r() - 0.5);
    const b = {
      id: this.nextId++, x, y, vx: 0, vy: 0, heading, rotation: 0,
      size: lerp(0.055, 0.085, r()) * s, hue: HUES[Math.floor(r() * HUES.length)] + (r() - 0.5) * 24,
      state: State.SPAWNING, stateTime: 0, target: null, speed: lerp(0.8, 1.2, r()),
      flap: r() * Math.PI * 2, wander: (r() - 0.5) * 2, alpha: 0, grow: 0.3,
      off: { x: 0, y: 0 }, from: { x: 0, y: 0 }, cooldown: 0, restFor: lerp(2.6, 4.2, r()), away: { x: 0, y: -1 },
    };
    b.vx = Math.cos(heading) * 0.05 * s; b.vy = Math.sin(heading) * 0.05 * s;
    this.butterflies.push(b);
    return b;
  }

  _setState(b, st) { b.state = st; b.stateTime = 0; }

  /** hands: [{id, x, y}] in world pixels. Returns events emitted this step: {type:'landed'|'flewAway'|'spawned', ...} */
  update(dt, handList = []) {
    dt = clamp(dt, 0, 0.1); // a stalled tab must not teleport butterflies
    this.time += dt;
    this.events = [];
    this._trackHands(dt, handList);
    this._assignChasers();
    for (const b of this.butterflies) this._step(b, dt);
    this.butterflies = this.butterflies.filter((b) => !b.dead);
    // population: refill free butterflies at spawnRate; cap total to keep the screen calm
    const target = Math.round(this.settings.butterflies);
    this.spawnCredit += dt * this.settings.spawnRate;
    while (this.spawnCredit >= 1 && this.activeCount < target && this.butterflies.length < target * 2 + 4) {
      this.spawnCredit -= 1; this.spawn(); this.events.push({ type: 'spawned' });
    }
    if (this.activeCount >= target) this.spawnCredit = Math.min(this.spawnCredit, 1);
    return this.events;
  }

  _trackHands(dt, list) {
    const seen = new Set();
    for (const h of list) {
      seen.add(h.id);
      const prev = this.hands.get(h.id);
      if (!prev) { this.hands.set(h.id, { x: h.x, y: h.y, speed: 0, first: this.time, last: this.time }); continue; }
      const inst = dt > 0 ? Math.hypot(h.x - prev.x, h.y - prev.y) / dt / this.scale : 0;
      prev.speed += (inst - prev.speed) * clamp(dt * 8, 0, 1);
      prev.x = h.x; prev.y = h.y; prev.last = this.time;
    }
    for (const [id, h] of this.hands) if (!seen.has(id) && this.time - h.last > HAND_GRACE) this.hands.delete(id);
  }

  _handFor(b) {
    if (b.target == null) return null;
    const h = this.hands.get(b.target);
    return h && this.time - h.last <= HAND_GRACE ? h : null;
  }

  _assignChasers() {
    const s = this.scale, radius = this.diff.attract * s;
    for (const [hid, h] of this.hands) {
      if (this.time - h.last > 0.05 || this.time - h.first < HAND_MIN_AGE) continue; // only live, established hands attract
      let engaged = 0, best = null, bestD = radius;
      for (const b of this.butterflies) {
        if (b.target === hid && (b.state === State.CHASING_HAND || b.state === State.LANDING || b.state === State.RESTING)) engaged++;
        else if (b.state === State.FLYING && b.cooldown <= 0 && b.target == null) {
          const d = Math.hypot(b.x - h.x, b.y - h.y);
          if (d < bestD) { bestD = d; best = b; }
        }
      }
      if (best && engaged < this.diff.chasers) { best.target = hid; this._setState(best, State.CHASING_HAND); }
    }
  }

  _steer(b, dt, dx, dy, k) { // exponential approach of velocity to a desired velocity (smooth acceleration)
    const a = 1 - Math.exp(-k * dt);
    b.vx += (dx - b.vx) * a; b.vy += (dy - b.vy) * a;
  }

  _step(b, dt) {
    const s = this.scale, set = this.settings, spd = set.speed * this.diff.speed * b.speed;
    b.stateTime += dt;
    b.cooldown = Math.max(0, b.cooldown - dt);
    const anim = set.animationSpeed;
    let flapHz = 3.4;

    switch (b.state) {
      case State.SPAWNING: {
        const t = clamp(b.stateTime / SPAWN_TIME, 0, 1);
        b.alpha = easeInOut(t); b.grow = lerp(0.3, 1, easeInOut(t));
        this._wander(b, dt, spd, s);
        if (t >= 1) this._setState(b, State.FLYING);
        break;
      }
      case State.FLYING: {
        b.alpha = 1; b.grow = 1;
        this._wander(b, dt, spd, s);
        break;
      }
      case State.CHASING_HAND: {
        const h = this._handFor(b);
        if (!h) { b.target = null; b.cooldown = 1; this._setState(b, State.FLYING); break; }
        flapHz = 5;
        const dx = h.x - b.x, dy = h.y - b.y, d = Math.hypot(dx, dy) || 1e-6;
        const catchR = set.interactionDistance * this.diff.catch * s;
        if (d <= catchR) { this._land(b, h); break; }
        // ease-out speed profile: fast far away, gentle near the hand; slight sideways sway so the path curves
        const sway = Math.sin(this.time * 3 + b.id) * 0.25 * clamp(d / (0.3 * s), 0, 1);
        const sp = Math.min(0.55 * s * spd, 0.06 * s + d * 2.4) ;
        const ux = dx / d, uy = dy / d;
        this._steer(b, dt, (ux - uy * sway) * sp, (uy + ux * sway) * sp, 4.5);
        break;
      }
      case State.LANDING: {
        const h = this._handFor(b);
        if (!h) { this._flyAway(b, null); break; }
        flapHz = lerp(4, 1.2, b.stateTime / LANDING_TIME);
        const t = easeInOut(clamp(b.stateTime / LANDING_TIME, 0, 1));
        const px = b.x, py = b.y;
        b.x = lerp(b.from.x, h.x + b.off.x, t); b.y = lerp(b.from.y, h.y + b.off.y, t);
        b.vx = (b.x - px) / Math.max(dt, 1e-4); b.vy = (b.y - py) / Math.max(dt, 1e-4);
        b.grow = lerp(1, 0.9, t);
        if (b.stateTime >= LANDING_TIME) this._setState(b, State.RESTING);
        break;
      }
      case State.RESTING: {
        const h = this._handFor(b);
        if (!h) { this._flyAway(b, null); break; }
        flapHz = 0.7;
        b.x = h.x + b.off.x; b.y = h.y + b.off.y; b.vx = b.vy = 0;
        if (h.speed > STARTLE_SPEED) this._flyAway(b, h);          // hand swung too fast: startled
        else if (b.stateTime > b.restFor) this._flyAway(b, h);     // rested long enough
        break;
      }
      case State.FLYING_AWAY: {
        flapHz = 5.5;
        const t = b.stateTime;
        const sp = Math.min(0.42 * s * spd, 0.05 * s + t * 0.5 * s);
        this._steer(b, dt, b.away.x * sp, b.away.y * sp - 0.05 * s, 3);
        if (t > 1.4) b.alpha = Math.max(0, 1 - (t - 1.4) / 1.0);
        if (t > 2.4 || b.x < -0.2 * s || b.y < -0.2 * s || b.x > this.w + 0.2 * s || b.y > this.h + 0.2 * s) b.dead = true;
        break;
      }
    }

    if (b.state !== State.LANDING && b.state !== State.RESTING) { b.x += b.vx * dt; b.y += b.vy * dt; }
    b.flap += flapHz * anim * dt * Math.PI * 2;
    const sp2 = Math.hypot(b.vx, b.vy);
    if (sp2 > 0.01 * s) b.heading = lerpAngle(b.heading, Math.atan2(b.vy, b.vx), clamp(dt * 5, 0, 1));
    // visual tilt: lean into horizontal motion; level out when resting
    const tilt = b.state === State.RESTING ? 0 : clamp(b.vx / (0.5 * s), -1, 1) * 0.45;
    b.rotation = lerp(b.rotation, tilt, clamp(dt * 6, 0, 1));
  }

  _wander(b, dt, spd, s) {
    b.wander += (this.rng() - 0.5) * 6 * dt;                 // random walk of the turning rate
    b.wander = clamp(b.wander, -1.6, 1.6) * (1 - 0.6 * dt);
    b.heading += b.wander * dt;
    let dx = Math.cos(b.heading), dy = Math.sin(b.heading);
    const m = 0.1 * s, push = 2.2; // soft edge avoidance: steer back toward the middle
    if (b.x < m) dx += ((m - b.x) / m) * push; else if (b.x > this.w - m) dx -= ((b.x - (this.w - m)) / m) * push;
    if (b.y < m) dy += ((m - b.y) / m) * push; else if (b.y > this.h - m) dy -= ((b.y - (this.h - m)) / m) * push;
    const l = Math.hypot(dx, dy) || 1;
    const bob = Math.sin(this.time * 2.1 + b.id * 1.7) * 0.03 * s;
    this._steer(b, dt, (dx / l) * 0.13 * s * spd, (dy / l) * 0.13 * s * spd + bob, 2.2);
    if (Math.abs(Math.atan2(dy, dx) - b.heading) > 0.01 && (b.x < m || b.x > this.w - m || b.y < m || b.y > this.h - m)) {
      b.heading = lerpAngle(b.heading, Math.atan2(dy, dx), clamp(dt * 2, 0, 1));
    }
  }

  _land(b, h) {
    b.from = { x: b.x, y: b.y };
    const s = this.scale;
    b.off = { x: (this.rng() - 0.5) * 0.03 * s, y: -0.012 * s + (this.rng() - 0.5) * 0.015 * s };
    b.restFor = lerp(2.6, 4.2, this.rng());
    this._setState(b, State.LANDING);
    this.score += 1;
    this.spawnCredit = Math.max(this.spawnCredit, 1); // replacement butterfly appears right away
    this.events.push({ type: 'landed', id: b.id, x: h.x, y: h.y, hue: b.hue, score: this.score });
  }

  _flyAway(b, h) {
    let ax = this.rng() - 0.5, ay = -0.6 - this.rng() * 0.4;
    if (h) { const dx = b.x - h.x, dy = b.y - h.y, l = Math.hypot(dx, dy); if (l > 1e-3) { ax = ax * 0.4 + dx / l; ay = ay * 0.5 + dy / l - 0.4; } }
    const l = Math.hypot(ax, ay) || 1;
    b.away = { x: ax / l, y: ay / l };
    b.cooldown = 3; b.target = null; b.vx = b.vx || 0;
    this._setState(b, State.FLYING_AWAY);
    this.events.push({ type: 'flewAway', id: b.id });
  }
}

function lerpAngle(a, b, t) {
  let d = ((b - a + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
  return a + d * t;
}
