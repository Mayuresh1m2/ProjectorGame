// Common game interface. A game only ever sees: hands (already mapped into its own pixel space),
// settings, an audio helper and a quality level. It never touches the camera, tracking, calibration or projector.
//
// hands: [{ id, x, y, vx, vy, speed, source: 'mouse'|'touch'|'sim'|'camera', tips?: [[x,y]...] }]  (px, game space)

export class Game {
  static meta = { id: 'game', name: 'Game', icon: '?', description: '' };

  /** ctx: { settings, audio, quality (0..2, lower = cheaper), emit(event) } */
  constructor(ctx) {
    this.ctx = ctx;
    this.w = 1280; this.h = 720;
    this._status = 'ready'; // 'ready' | 'playing' | 'over'
    this._score = 0;
  }
  get score() { return this._score; }
  get status() { return this._status; }
  get timeLeft() { return null; }          // seconds, or null when the game has no timer
  resize(w, h) { this.w = w; this.h = h; }
  setSettings(_s) {}
  start() { this._status = 'playing'; }
  restart() { this._score = 0; this.start(); }
  update(_dt, _hands) {}
  render(_ctx2d) {}
  /** Generic input from outside, e.g. {type:'pointer-down', x, y} */
  onEvent(_ev) {}
  destroy() {}
}

/** Shared canvas HUD helpers so every game looks consistent. */
export function drawPill(c, text, x, y, { size = 28, align = 'center', pad = 18 } = {}) {
  c.save();
  c.font = `700 ${size}px "Nunito", "Trebuchet MS", system-ui, sans-serif`;
  const w = c.measureText(text).width + pad * 2, h = size + pad;
  const left = align === 'center' ? x - w / 2 : align === 'right' ? x - w : x;
  c.fillStyle = 'rgba(255,255,255,0.72)';
  c.beginPath(); c.roundRect(left, y, w, h, h / 2); c.fill();
  c.fillStyle = '#5b3a8c'; c.textBaseline = 'middle'; c.textAlign = 'left';
  c.fillText(text, left + pad, y + h / 2 + 1);
  c.restore();
}
