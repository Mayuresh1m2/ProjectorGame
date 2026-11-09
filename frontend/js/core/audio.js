// Soft, quiet sound effects via WebAudio (no files). Always gentle: low gain, slow attack, no sudden loud sounds.
export class Audio {
  constructor() { this.ctx = null; this.enabled = true; this.master = null; }
  unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain(); this.master.gain.value = 0.5;
    this.master.connect(this.ctx.destination);
  }
  _tone(freq, { dur = 0.6, gain = 0.05, type = 'sine', delay = 0 } = {}) {
    if (!this.enabled || !this.ctx || this.ctx.state !== 'running') return;
    const t = this.ctx.currentTime + delay, o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.04);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + dur + 0.05);
  }
  /** Pentatonic chime; `n` picks the note so repeated touches form a little tune. */
  chime(n = 0) {
    const scale = [523.25, 587.33, 659.25, 783.99, 880.0, 1046.5];
    this._tone(scale[n % scale.length], { dur: 0.7, gain: 0.045 });
    this._tone(scale[n % scale.length] * 2, { dur: 0.5, gain: 0.015, delay: 0.03 });
  }
  pop() { this._tone(320, { dur: 0.18, gain: 0.05, type: 'triangle' }); this._tone(480, { dur: 0.12, gain: 0.03, delay: 0.02 }); }
  splash() { this._tone(260, { dur: 0.35, gain: 0.03, type: 'triangle' }); }
  fanfare() { [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => this._tone(f, { dur: 0.6, gain: 0.04, delay: i * 0.12 })); }
}
