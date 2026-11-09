// Playroom Quest rules, kept free of drawing/DOM so they can be unit-tested.
// Rewards arrive as zone events from the server (jump on the stairs -> laddu, climb the wall -> fuljhadi, ...).

export const DEFAULT_TARGETS = { laddu: 10, fuljhadi: 5 };
export const FINALE_S = 14;

export class QuestWorld {
  constructor(targets = DEFAULT_TARGETS) { this.setTargets(targets); this.reset(); }
  setTargets(t) {
    const clean = {};
    for (const [k, v] of Object.entries(t || {})) if (Number.isInteger(v) && v > 0) clean[k] = v;
    this.targets = Object.keys(clean).length ? clean : { ...DEFAULT_TARGETS };
    this.counts = Object.fromEntries(Object.keys(this.targets).map((k) => [k, this.counts?.[k] || 0]));
  }
  reset() { this.counts = Object.fromEntries(Object.keys(this.targets).map((k) => [k, 0])); this.phase = 'playing'; this.finaleT = 0; this.rounds = this.rounds || 0; }
  get total() { return Object.values(this.counts).reduce((a, b) => a + b, 0); }
  get goal() { return Object.values(this.targets).reduce((a, b) => a + b, 0); }
  get complete() { return Object.keys(this.targets).every((k) => this.counts[k] >= this.targets[k]); }
  /** A reward was earned. Returns events: {type:'reward', reward, n, overflow} and {type:'finale'} once when the last target is met. */
  give(reward) {
    if (this.phase !== 'playing') return [];
    if (!(reward in this.targets)) return [{ type: 'ignored', reward }];   // a zone whose reward has no target on this scoreboard
    const overflow = this.counts[reward] >= this.targets[reward];          // more than needed: still celebrated, not counted
    if (!overflow) this.counts[reward]++;
    const ev = [{ type: 'reward', reward, n: this.counts[reward], overflow }];
    if (this.complete) { this.phase = 'finale'; this.finaleT = 0; this.rounds++; ev.push({ type: 'finale' }); }
    return ev;
  }
  /** Advance the finale clock; returns true when the finale is over and the board was reset. */
  update(dt) {
    if (this.phase !== 'finale') return false;
    this.finaleT += dt;
    if (this.finaleT >= FINALE_S) { this.reset(); return true; }
    return false;
  }
}
