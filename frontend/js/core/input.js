// Unified hand input for every game: mouse, touch, simulated hands and live camera hands all become
// the same shape. Coordinates are normalized (0..1) over the output stage; the scene maps them per surface.

const MOUSE_IDLE_S = 6; // a still mouse eventually stops counting as a hand (butterflies leave, like a real hand removed)

export class InputManager {
  constructor(stageEl) {
    this.stage = stageEl;
    this.pointers = new Map(); // pointerId -> {x,y,t,type}
    this.camera = [];          // latest hands from the server (screen-normalized)
    this.cameraAt = 0;
    this.sim = { count: 0, t: 0 };
    this.prev = new Map();
    this.useMouse = true;
    this.listeners = [];
    const on = (type, fn) => { stageEl.addEventListener(type, fn); this.listeners.push([type, fn]); };
    const upd = (e) => {
      const r = stageEl.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
      this.pointers.set(e.pointerId, { x, y, t: performance.now(), type: e.pointerType });
    };
    on('pointermove', upd);
    on('pointerdown', (e) => { upd(e); if (e.pointerType !== 'mouse') stageEl.setPointerCapture?.(e.pointerId); });
    on('pointerup', (e) => { if (e.pointerType !== 'mouse') this.pointers.delete(e.pointerId); });
    on('pointercancel', (e) => this.pointers.delete(e.pointerId));
    on('pointerleave', (e) => { if (e.pointerType === 'mouse') this.pointers.delete(e.pointerId); });
  }

  setCameraHands(msg) {
    this.camera = msg.hands || [];
    this.cameraAt = performance.now();
  }
  setSimulated(n) { this.sim.count = n; }

  /** Current hands, normalized to the stage, with velocity (stage-heights/s) computed here. */
  snapshot(now = performance.now()) {
    const out = [];
    for (const [pid, p] of this.pointers) {
      if (p.type === 'mouse' && (!this.useMouse || now - p.t > MOUSE_IDLE_S * 1000)) continue;
      out.push({ id: p.type === 'mouse' ? 'mouse' : `touch${pid}`, x: p.x, y: p.y, source: p.type === 'mouse' ? 'mouse' : 'touch' });
    }
    if (now - this.cameraAt < 600) {
      for (const h of this.camera) {
        if (h.x < -0.1 || h.x > 1.1 || h.y < -0.1 || h.y > 1.1) continue; // outside the calibrated play area
        out.push({ id: `cam${h.id}`, x: h.x, y: h.y, source: 'camera', tips: h.tips, lost: h.lost });
      }
    }
    for (let i = 0; i < this.sim.count; i++) {
      const t = now / 1000 * (0.45 + i * 0.17) + i * 2.3;
      out.push({ id: `sim${i}`, x: 0.5 + 0.36 * Math.sin(t * 1.0 + i), y: 0.5 + 0.3 * Math.sin(t * 1.37 + 1.1 * i), source: 'sim' });
    }
    const seen = new Map();
    for (const h of out) {
      const p = this.prev.get(h.id);
      if (p && now > p.t) { h.vx = (h.x - p.x) / ((now - p.t) / 1000); h.vy = (h.y - p.y) / ((now - p.t) / 1000); } else { h.vx = 0; h.vy = 0; }
      seen.set(h.id, { x: h.x, y: h.y, t: now });
    }
    this.prev = seen;
    return out;
  }

  destroy() { for (const [t, f] of this.listeners) this.stage.removeEventListener(t, f); }
}
