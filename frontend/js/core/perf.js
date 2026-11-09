// Measured (never assumed) render performance + a simple quality governor for graceful degradation.
export class Perf {
  constructor() { this.frames = []; this.last = 0; this.quality = 2; this._lowSince = 0; this._highSince = 0; this.worst = 0; this.avgMs = 0; }
  frame(now) {
    if (this.last) {
      const dt = now - this.last;
      this.frames.push(dt); if (this.frames.length > 90) this.frames.shift();
      this.worst = Math.max(this.worst * 0.99, dt);
    }
    this.last = now;
    const fps = this.fps;
    if (this.frames.length >= 30) {
      if (fps < 40) { this._highSince = 0; this._lowSince ||= now; if (now - this._lowSince > 2500 && this.quality > 0) { this.quality--; this._lowSince = now; this.frames.length = 0; } }
      else if (fps > 56) { this._lowSince = 0; this._highSince ||= now; if (now - this._highSince > 12000 && this.quality < 2) { this.quality++; this._highSince = now; } }
      else { this._lowSince = 0; this._highSince = 0; }
    }
  }
  get fps() { const n = this.frames.length; if (!n) return 0; return 1000 / (this.frames.reduce((a, b) => a + b, 0) / n); }
}
