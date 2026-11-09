// Scene renderer: puts independent surfaces (games, videos, colors) on the output, each warped onto an
// arbitrary quad with a CSS 3-D matrix (GPU-accelerated, works for <canvas> and <video> alike) and masked.
import { rectToQuad, cssMatrix3d, quadSize, invert3, applyH } from './geometry.js';
import { createGame } from '../games/index.js';

const MAX_CANVAS_SIDE = 2048;
const focusCss = (f) => (Array.isArray(f) ? `${(f[0] * 100).toFixed(0)}% ${(f[1] * 100).toFixed(0)}%` : '50% 50%');

/** Only these fields force a rebuild of a surface; everything else (volume, play/pause, loop...) is applied in place. */
const contentKey = (c) => (c.type === 'game' ? `game:${c.game}` : c.type === 'video' ? `video:${c.src}` : c.type === 'image' ? `image:${c.src}`
  : c.type === 'slideshow' ? `slideshow:${(c.srcs || []).join('|')}:${c.shuffle ? 's' : ''}` : `color:${c.color}`);

export class SceneRenderer {
  constructor(container, deps) {
    this.root = container;
    this.deps = deps; // { settings(): obj, audio, perf, onSelect(surfaceId, gameId), onSoundBlocked() }
    this.w = 1920; this.h = 1080;
    this.surfaces = new Map();
    this.align = false;  // alignment aid: outline, grid and numbered corners on every surface
    this.scene = { surfaces: [], background: '#000' };
  }

  setSize(w, h) { this.w = w; this.h = h; for (const s of this.surfaces.values()) this._layout(s); }

  setScene(scene) {
    this.scene = scene;
    this.root.style.background = scene.background || '#000';
    const keep = new Set();
    scene.surfaces.forEach((def, z) => {
      keep.add(def.id);
      let s = this.surfaces.get(def.id);
      const ckey = contentKey(def.content);
      if (s && s.ckey !== ckey) { this._destroy(s); this.surfaces.delete(def.id); s = null; }
      if (!s) { s = this._create(def); this.surfaces.set(def.id, s); }
      s.def = def; s.el.style.zIndex = z; s.el.style.display = def.visible ? '' : 'none';
      this._layout(s);
      this._applyMask(s);
      this._applyBorder(s);
      if (def.content.type === 'video') this._applyVideo(s);
      if (def.content.type === 'image' || def.content.type === 'slideshow') this._applyPicture(s);
    });
    for (const [id, s] of this.surfaces) if (!keep.has(id)) { this._destroy(s); this.surfaces.delete(id); }
  }

  /** The surface that gets the start/game-over overlay: the first visible game surface (single-surface mode). */
  primary() {
    if (this.scene.surfaces.filter((s) => s.visible).length !== 1) return null;
    const s = [...this.surfaces.values()].find((q) => q.game);
    return s && s.def.visible ? s : null;
  }

  _create(def) {
    const el = document.createElement('div');
    el.className = 'surface'; el.dataset.id = def.id;
    this.root.appendChild(el);
    const s = { def, el, ckey: contentKey(def.content), w: 0, h: 0, H: null, inv: null, game: null, canvas: null, g: null, video: null, touch: new Map(), lastToggle: 0, op: 1, lastSeen: -1e9, touching: false, plIdx: 0 };
    const c = def.content;
    if (c.type === 'game') {
      s.canvas = document.createElement('canvas'); el.appendChild(s.canvas); s.g = s.canvas.getContext('2d');
      s.game = createGame(c.game, {
        settings: this.deps.settings(), audio: this.deps.audio, quality: this.deps.perf.quality, quest: () => this.deps.quest?.(),
        emit: (ev) => { if (ev.type === 'select') this.deps.onSelect(def.id, ev.game); },
      });
      s.autoOverAt = 0;
    } else if (c.type === 'video') {
      const v = document.createElement('video');
      v.playsInline = true; v.preload = 'auto'; v.disablePictureInPicture = true;
      v.addEventListener('error', () => this._videoError(s));
      v.src = c.src; s.video = v; el.appendChild(v);
      s.msg = document.createElement('div'); s.msg.className = 'surface-msg'; el.appendChild(s.msg);
    } else if (c.type === 'image') {
      s.layers = [this._img(el)]; s.layers[0].style.opacity = 1; s.layers[0].src = c.src;
    } else if (c.type === 'slideshow') {
      s.layers = [this._img(el), this._img(el)]; s.front = 0; s.idx = -1;
      s.order = (c.srcs || []).map((_, i) => i);
      if (c.shuffle) for (let i = s.order.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [s.order[i], s.order[j]] = [s.order[j], s.order[i]]; }
      this._nextSlide(s, true);
    } else {
      el.style.background = c.color || '#223';
    }
    if (this.align) this._addAlign(s);
    return s;
  }

  _img(el) {
    const i = document.createElement('img'); i.draggable = false; i.alt = ''; i.style.opacity = 0; el.appendChild(i); return i;
  }

  /** Fit and fade settings are applied in place; the slideshow timer reads its interval from the live definition. */
  _applyPicture(s) {
    const c = s.def.content;
    for (const l of s.layers || []) { l.style.objectFit = c.fit; l.style.objectPosition = focusCss(c.focus); l.style.transitionDuration = `${c.fadeSeconds ?? 1.5}s`; }
  }

  _nextSlide(s, first = false) {
    clearTimeout(s.timer);
    const c = s.def.content, n = s.order.length;
    if (!n) return;
    s.idx = (s.idx + 1) % n;
    const back = s.layers[1 - s.front], front = s.layers[s.front];
    const show = () => { back.style.opacity = 1; front.style.opacity = 0; s.front = 1 - s.front; };
    back.onload = show; back.onerror = () => { back.onerror = null; };  // a missing file just keeps the previous picture
    back.src = c.srcs[s.order[s.idx]];
    s.timer = setTimeout(() => this._nextSlide(s), Math.max(2, s.def.content.seconds || 10) * 1000);
  }

  setAlign(on) {
    this.align = !!on;
    for (const s of this.surfaces.values()) { s.el.querySelector('.align')?.remove(); if (this.align) this._addAlign(s); }
  }

  _addAlign(s) {
    const a = document.createElement('div'); a.className = 'align';
    a.innerHTML = '<svg viewBox="0 0 100 100" preserveAspectRatio="none"><line x1="0" y1="0" x2="100" y2="100"/><line x1="100" y1="0" x2="0" y2="100"/></svg>'
      + ['tl', 'tr', 'br', 'bl'].map((k, i) => `<i class="c ${k}">${i + 1}</i>`).join('') + `<b></b>`;
    a.querySelector('b').textContent = s.def.name;
    s.el.appendChild(a);
  }

  _destroy(s) {
    clearTimeout(s.timer);
    s.game?.destroy();
    if (s.video) { s.video.pause(); s.video.removeAttribute('src'); s.video.load(); }
    s.el.remove();
  }

  _videoError(s) {
    const code = s.video?.error?.code;
    s.msg.textContent = code === 4 ? 'This video format is not supported by the browser (try MP4/H.264 or WebM).' : 'Could not play this video.';
    s.msg.style.display = 'flex';
  }

  _applyVideo(s) {
    const c = s.def.content, v = s.video;
    if (!v) return;
    v.loop = c.loop; v.volume = c.volume; v.muted = c.muted || s.forceMuted === true; v.playbackRate = c.rate || 1;
    v.style.objectFit = c.fit; v.style.objectPosition = focusCss(c.focus);
    if (c.playing) {
      const p = v.play();
      p?.catch((e) => {
        if (e.name === 'NotAllowedError' && !v.muted) { s.forceMuted = true; v.muted = true; v.play().catch(() => {}); this.deps.onSoundBlocked?.(); }
      });
    } else v.pause();
  }

  _layout(s) {
    const q = s.def.quad.map(([x, y]) => [x * this.w, y * this.h]);
    let { w, h } = quadSize(q);
    const k = Math.min(1, MAX_CANVAS_SIDE / Math.max(w, h)); // never allocate absurd canvases
    if (k < 1) { w = Math.round(w * k); h = Math.round(h * k); }
    const H = rectToQuad(w, h, q);
    if (!H) { s.el.style.display = 'none'; return; }
    s.H = H; s.inv = invert3(H);
    if (Math.abs(w - s.w) > 1 || Math.abs(h - s.h) > 1) {
      s.w = w; s.h = h;
      s.el.style.width = w + 'px'; s.el.style.height = h + 'px';
      if (s.canvas) { s.canvas.width = w; s.canvas.height = h; s.game.resize(w, h); }
    }
    s.el.style.transform = cssMatrix3d(H);
  }

  _applyMask(s) {
    const d = s.def;
    let cp = 'none';
    if (d.shape === 'ellipse') cp = 'ellipse(50% 50% at 50% 50%)';
    else if (d.shape === 'rounded') cp = 'inset(0 round 8%)';
    else if (d.shape === 'polygon' && d.polygon.length >= 3) cp = `polygon(${d.polygon.map(([x, y]) => `${(x * 100).toFixed(2)}% ${(y * 100).toFixed(2)}%`).join(',')})`;
    s.el.style.clipPath = cp;
  }

  /** Picture-frame edge: a gold gradient line (plus a soft inner glow) drawn on top of the content, inside the surface so it follows the warp. */
  _applyBorder(s) {
    const b = s.def.border, w = b && b.width > 0 ? b.width : 0;
    if (!w) { if (s.frame) { s.frame.remove(); s.frame = null; } return; }
    if (!s.frame) { s.frame = document.createElement('div'); s.frame.className = 'frame'; s.el.appendChild(s.frame); }
    const f = s.frame.style, col = b.color || '#d4a937';
    f.borderWidth = w + 'px';
    f.borderImage = `linear-gradient(135deg, #fff3b0, ${col} 35%, #8a6a17 55%, ${col} 75%, #fff3b0) 1`;
    f.boxShadow = b.glow ? `inset 0 0 ${w * 2.5}px ${col}cc, 0 0 ${w}px ${col}88` : 'none';
  }

  /** stage px -> surface-local px, or null if the surface cannot take input */
  toLocal(s, px, py) { return s.inv ? applyH(s.inv, px, py) : null; }

  _inside(s, lx, ly, margin = 0) {
    const nx = lx / s.w, ny = ly / s.h;
    if (nx < -margin || nx > 1 + margin || ny < -margin || ny > 1 + margin) return false;
    if (s.def.shape === 'ellipse') return ((nx - 0.5) / 0.5) ** 2 + ((ny - 0.5) / 0.5) ** 2 <= 1.1;
    return true;
  }

  update(dt, hands, now) {
    for (const s of this.surfaces.values()) {
      if (!s.def.visible) continue;
      const local = [];
      if (s.def.interactive) {
        for (const h of hands) {
          const p = this.toLocal(s, h.x * this.w, h.y * this.h);
          if (!p || !this._inside(s, p[0], p[1], 0.04)) continue;
          const q = this.toLocal(s, (h.x + (h.vx || 0) * 0.016) * this.w, (h.y + (h.vy || 0) * 0.016) * this.h);
          local.push({ ...h, x: p[0], y: p[1], vx: (q[0] - p[0]) / 0.016, vy: (q[1] - p[1]) / 0.016 });
        }
      }
      if (s.game) {
        s.game.ctx.quality = this.deps.perf.quality;
        s.game.update(dt, local);
        this._autoplay(s, now);
        s.game.render(s.g);
      } else if (this._reactive(s)) this._react(s, hands, local, dt, now);
      else {
        if (s.el.style.opacity) { s.el.style.opacity = ''; s.op = 1; }  // a reaction was switched off
        if (s.video) this._interactVideo(s, local, now);
      }
    }
  }

  /** A surface with a wake/next reaction configured (not for games, which handle hands themselves). */
  _reactive(s) { const r = s.def.reaction; return !!r && (r.wake || r.next !== 'off') && !s.game; }

  /** Wake: dim until a hand is near, then fade up and (videos) play; fade back after `hold` s. Next: touch or wave steps on. */
  _react(s, hands, local, dt, now) {
    const r = s.def.reaction, here = local.filter((h) => !h.lost);
    // generous margin so a hand reaching toward the section wakes it before it touches
    const near = r.wake && s.def.interactive && hands.some((h) => { if (h.lost) return false; const p = this.toLocal(s, h.x * this.w, h.y * this.h); return p && this._inside(s, p[0], p[1], 0.15); });
    const present = here.length > 0 || near;
    if (present) s.lastSeen = now;
    const awake = !r.wake || present || now - s.lastSeen < r.hold * 1000;
    const target = awake ? 1 : r.dim;
    if (r.wake && target > 0.9 && s.op < 0.5 && !s.waking) { s.waking = true; this.deps.onActivity?.(s.def.name, 'wake'); }
    if (s.op > 0.9) s.waking = false;
    s.op += (target - s.op) * Math.min(1, dt * 3);
    s.el.style.opacity = r.wake ? s.op.toFixed(3) : '';
    if (s.video && r.wake) {
      if (!awake && !s.video.paused) s.video.pause();
      else if (awake && s.video.paused && s.def.content.playing) s.video.play().catch(() => {});
    }
    if (r.next === 'off') return;
    const fast = here.some((h) => Math.hypot(h.vx || 0, h.vy || 0) / s.h > 1.2);  // surface-heights per second
    const trigger = r.next === 'touch' ? here.length > 0 && !s.touching : fast;
    s.touching = here.length > 0;
    if (trigger && s.op > 0.6 && now - s.lastToggle > 1500) { s.lastToggle = now; this._advance(s); }
  }

  /** Step to the next picture / playlist video; anything else just pulses. */
  _advance(s) {
    const c = s.def.content;
    if (c.type === 'slideshow') this._nextSlide(s);
    else if (c.type === 'video') {
      const list = [c.src, ...(c.playlist || [])];
      if (list.length > 1) { s.plIdx = (s.plIdx + 1) % list.length; s.video.src = list[s.plIdx]; s.msg.style.display = 'none'; this._applyVideo(s); }
      else { s.video.currentTime = 0; }
    }
    s.el.classList.add('touched'); setTimeout(() => s.el.classList.remove('touched'), 350);
    this.deps.onActivity?.(s.def.name, 'next');
  }

  _autoplay(s, now) {
    if (this.primary() === s || s.def.content.game === 'menu') return; // single surface uses on-screen buttons
    if (s.game.status === 'ready') s.game.start();
    if (s.game.status === 'over') { s.autoOverAt ||= now; if (now - s.autoOverAt > 6000) { s.autoOverAt = 0; s.game.restart(); } }
  }

  _interactVideo(s, local, now) {
    const touching = local.length > 0;
    if (touching && !s.touching && now - s.lastToggle > 1500) {
      s.lastToggle = now;
      s.video.paused ? s.video.play().catch(() => {}) : s.video.pause();
      s.el.classList.add('touched'); setTimeout(() => s.el.classList.remove('touched'), 350);
    }
    s.touching = touching;
  }

  tap(nx, ny) { // pointer-down on the stage (normalized) -> games that care (menu)
    for (const s of this.surfaces.values()) {
      if (!s.game || !s.def.visible || !s.def.interactive) continue;
      const p = this.toLocal(s, nx * this.w, ny * this.h);
      if (p && this._inside(s, p[0], p[1])) s.game.onEvent({ type: 'tap', x: p[0], y: p[1] });
    }
  }

  /** Send a non-positional event (a cue such as a clap or someone arriving) to every game surface. */
  broadcast(ev) { for (const s of this.surfaces.values()) if (s.game && s.def.visible) s.game.onEvent(ev); }

  setSettings() { for (const s of this.surfaces.values()) s.game?.setSettings(this.deps.settings()); }
}
