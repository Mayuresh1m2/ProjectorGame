import { app } from './app.js';

/** Draw an image (optionally rotated/mirrored like the calibration says) + hand dots onto a canvas. */
export function drawPreview(canvas, { rotation = 0, mirror = false, hands = true } = {}) {
  const img = app.preview; const g = canvas.getContext('2d');
  const swap = rotation % 180 !== 0;
  const iw = img ? img.width : 4, ih = img ? img.height : 3;
  const ar = (swap ? ih / iw : iw / ih);
  canvas.height = Math.round(canvas.width / ar);
  g.fillStyle = '#111'; g.fillRect(0, 0, canvas.width, canvas.height);
  if (!img) { g.fillStyle = '#777'; g.font = '16px sans-serif'; g.textAlign = 'center'; g.fillText('no camera image', canvas.width / 2, canvas.height / 2); return; }
  const W = canvas.width, H = canvas.height;
  g.save(); g.translate(W / 2, H / 2); if (mirror) g.scale(-1, 1); g.rotate((rotation * Math.PI) / 180);
  const dw = swap ? H : W, dh = swap ? W : H; g.drawImage(img, -dw / 2, -dh / 2, dw, dh); g.restore();
  if (hands) for (const h of app.hands) {
    if (h.lost || !h.cam) continue;
    g.strokeStyle = '#00e0ff'; g.fillStyle = '#00e0ff'; g.lineWidth = 2;
    for (const [x, y] of h.camTips || []) { g.beginPath(); g.arc(x * W, y * H, 5, 0, 7); g.fill(); }
    g.beginPath(); g.arc(h.cam[0] * W, h.cam[1] * H, 11, 0, 7); g.stroke();
  }
}
