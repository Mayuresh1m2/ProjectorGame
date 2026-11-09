// Projector coverage maths for the setup page. Pure functions, unit-tested in tests/js/projector.test.js.
export const ASPECTS = { '16:9': [16, 9], '16:10': [16, 10], '4:3': [4, 3] };

/** Image size from the projector's throw ratio (distance / width) and the distance to the wall (metres). */
export function imageSize(throwRatio, distance, aspect = '16:9') {
  if (!(throwRatio > 0) || !(distance > 0) || !ASPECTS[aspect]) return null;
  const [aw, ah] = ASPECTS[aspect];
  const width = distance / throwRatio, height = width * ah / aw;
  return { width, height, diagonal: Math.hypot(width, height), minIcon: height * 0.1 };
}

/** Distance needed for a wanted image width. */
export function distanceFor(throwRatio, width) {
  return throwRatio > 0 && width > 0 ? throwRatio * width : null;
}

/** Summary of repeated flash trials from /api/latency/analyze: adds the measured laptop-side time. */
export function totalEstimate(result) {
  if (!result || result.medianMs == null) return null;
  const tail = typeof result.trackingMs === 'number' ? result.trackingMs : null;
  return { displayToLaptopMs: result.medianMs, trackingMs: tail, totalMs: tail == null ? null : Math.round(result.medianMs + tail) };
}

/** Plain-language verdict for a total reaction time in ms. */
export function feel(ms) {
  if (ms == null) return '';
  if (ms < 100) return 'feels instant';
  if (ms < 250) return 'feels responsive, slightly behind – fine for rewards and events';
  if (ms < 350) return 'noticeably late – use zones and anticipation effects, avoid precise catching';
  return 'laggy – improve the Wi-Fi/projector settings first';
}
