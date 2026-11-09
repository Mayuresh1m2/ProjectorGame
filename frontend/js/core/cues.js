// Client-side cues: clap detection from the microphone level. Audio is analysed in the browser, never recorded
// or sent anywhere; the microphone is off until someone presses the 🎤 button, and a visible indicator stays on while it listens.

/** Detects a clap as a sudden spike above the recent background level. Pure: feed it (rms, seconds) samples. */
export class ClapDetector {
  constructor({ minLevel = 0.12, ratio = 4, refractory = 0.5, attack = 0.05 } = {}) {
    Object.assign(this, { minLevel, ratio, refractory, attack });
    this.avg = 0.01; this.prev = 0; this.last = -Infinity; this.t = 0;
  }
  /** returns true when this sample is a clap */
  feed(rms, dt) {
    this.t += dt;
    const spike = rms > Math.max(this.minLevel, this.avg * this.ratio) && rms - this.prev > this.attack && this.t - this.last > this.refractory;
    this.prev = rms;
    if (spike) { this.last = this.t; return true; }                       // the clap itself does not raise the background estimate
    this.avg += (Math.min(rms, this.avg * 3 + 0.02) - this.avg) * Math.min(1, dt / 1.2); // slow background tracker, ignores big bursts
    return false;
  }
}

export class MicMonitor {
  constructor(onClap, onState) { this.onClap = onClap; this.onState = onState || (() => {}); this.stream = null; this.raf = 0; this.level = 0; }
  get on() { return !!this.stream; }
  async start() {
    if (this.stream) return;
    if (!navigator.mediaDevices?.getUserMedia) throw new Error('Microphone needs a secure page (use http://localhost:8000)');
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false }, video: false });
    const ac = this.ac = new (window.AudioContext || window.webkitAudioContext)();
    const an = ac.createAnalyser(); an.fftSize = 1024; ac.createMediaStreamSource(this.stream).connect(an); // not connected to the speakers
    const buf = new Float32Array(an.fftSize), det = new ClapDetector(); let last = performance.now();
    const tick = (now) => {
      an.getFloatTimeDomainData(buf);
      let s = 0; for (const v of buf) s += v * v;
      this.level = Math.sqrt(s / buf.length);
      if (det.feed(this.level, (now - last) / 1000)) this.onClap();
      last = now; this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
    this.onState(true);
  }
  stop() {
    cancelAnimationFrame(this.raf); this.stream?.getTracks().forEach((t) => t.stop()); this.ac?.close().catch(() => {});
    this.stream = null; this.level = 0; this.onState(false);
  }
}
