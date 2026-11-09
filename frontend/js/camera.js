// iPhone camera page: getUserMedia -> WebRTC -> laptop. Needs HTTPS (secure context) on iOS Safari.
const $ = (id) => document.getElementById(id);
const q = new URLSearchParams(location.search);
const token = q.get('k') || sessionStorage.getItem('bp.k') || '';
try { if (q.get('k')) sessionStorage.setItem('bp.k', token); } catch { /* private mode */ }

let stream = null, pc = null, facing = 'environment', wantOn = false, retry = 0, retryTimer = 0, wakeLock = null;

try { const s = JSON.parse(localStorage.getItem('bp.cam') || '{}'); if (s.res) $('res').value = s.res; if (s.fps) $('fps').value = s.fps; if (s.facing) facing = s.facing; } catch { /* ignore */ }
const saveSettings = () => { try { localStorage.setItem('bp.cam', JSON.stringify({ res: $('res').value, fps: $('fps').value, facing })); } catch { /* ignore */ } };

function setStatus(text, kind = '', dot = 'off') {
  $('status').textContent = text;
  const m = $('msg'); m.className = 'msg ' + kind; if (kind !== '') m.textContent = text;
  $('rec').className = 'dot ' + dot;
}
const say = (text, kind = '') => { $('msg').textContent = text; $('msg').className = 'msg ' + kind; };

function explain(e) {
  switch (e.name) {
    case 'NotAllowedError': return 'Camera permission was denied. In Safari tap “aA” in the address bar → Website Settings → Camera → Allow, then reload this page.';
    case 'NotFoundError': case 'OverconstrainedError': return 'No suitable camera was found on this device.';
    case 'NotReadableError': return 'The camera is in use by another app. Close it and try again.';
    case 'SecurityError': return 'Camera blocked: this page must be opened over HTTPS.';
    default: return `Could not start the camera (${e.name || e.message}).`;
  }
}

async function openCamera() {
  if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
    throw Object.assign(new Error('insecure'), { name: 'SecurityError' });
  }
  const [w, h] = $('res').value.split('x').map(Number);
  const fps = +$('fps').value;
  stream?.getTracks().forEach((t) => t.stop());
  stream = await navigator.mediaDevices.getUserMedia({
    audio: false,
    video: { facingMode: { ideal: facing }, width: { ideal: w }, height: { ideal: h }, frameRate: { ideal: fps } },
  });
  const vt = stream.getVideoTracks()[0];
  vt.contentHint = 'motion';
  vt.addEventListener('ended', onTrackEnded);
  $('preview').srcObject = stream;
  $('preview').classList.toggle('mirror', vt.getSettings().facingMode === 'user');
  const s = vt.getSettings();
  $('actual').textContent = `Actual: ${s.width}×${s.height} @ ${Math.round(s.frameRate || 0)} fps, ${s.facingMode || facing} camera`;
  $('cam-badge').classList.remove('hidden');
  return vt;
}

function onTrackEnded() {
  if (!wantOn) return;
  closePeer();
  $('cam-badge').classList.add('hidden');
  setStatus('Camera disconnected – retrying…', 'err', 'warn');
  scheduleRetry();
}

function scheduleRetry() {
  clearTimeout(retryTimer);
  retryTimer = setTimeout(() => start(true), Math.min(8000, 1000 * 2 ** retry++));
}

function closePeer() { if (pc) { pc.onconnectionstatechange = null; pc.close(); pc = null; } }

async function connect(track) {
  closePeer();
  pc = new RTCPeerConnection({ iceServers: [] }); // same Wi-Fi: host candidates only, no STUN/cloud relay
  const me = pc;
  const sender = pc.addTrack(track, stream);
  try { // keep the stream light: the laptop only needs hands, not a pretty picture
    const p = sender.getParameters(); p.encodings = p.encodings?.length ? p.encodings : [{}];
    p.encodings[0].maxBitrate = 1_500_000; await sender.setParameters(p);
  } catch { /* optional */ }
  pc.onconnectionstatechange = () => {
    if (me !== pc) return;
    const s = pc.connectionState;
    if (s === 'connected') { retry = 0; setStatus('Streaming to laptop', 'ok', 'on'); }
    else if (s === 'connecting') setStatus('Connecting to laptop…', '', 'warn');
    else if (s === 'failed' || s === 'disconnected') { setStatus('Connection to laptop lost – retrying…', 'err', 'warn'); scheduleReconnect(); }
  };
  await pc.setLocalDescription(await pc.createOffer());
  await new Promise((res) => { // wait for ICE gathering (non-trickle keeps signalling to one request)
    if (pc.iceGatheringState === 'complete') return res();
    const t = setTimeout(res, 2500);
    pc.addEventListener('icegatheringstatechange', () => { if (pc.iceGatheringState === 'complete') { clearTimeout(t); res(); } });
  });
  const r = await fetch('/api/camera/offer', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sdp: pc.localDescription.sdp, type: pc.localDescription.type, token }) });
  if (r.status === 403) throw Object.assign(new Error('token'), { name: 'TokenError' });
  if (!r.ok) throw new Error(`server answered ${r.status}`);
  await pc.setRemoteDescription(await r.json());
}

function scheduleReconnect() {
  clearTimeout(retryTimer);
  retryTimer = setTimeout(async () => {
    if (!wantOn || !stream) return;
    try { await connect(stream.getVideoTracks()[0]); } catch (e) { say(`Cannot reach the laptop (${e.message}). Retrying…`, 'err'); scheduleReconnect(); }
  }, Math.min(8000, 1000 * 2 ** retry++));
}

async function start(isRetry = false) {
  wantOn = true;
  $('start').disabled = true;
  try {
    setStatus('Starting camera…', '', 'warn');
    const track = await openCamera();
    $('stop').disabled = false; $('flip').disabled = false;
    setStatus('Connecting to laptop…', '', 'warn');
    await connect(track);
    keepAwake();
  } catch (e) {
    if (e.name === 'TokenError') { wantOn = false; stopTracks(); setStatus('This link is missing its access key. Scan the QR code or copy the full link from the laptop.', 'err'); $('start').disabled = false; return; }
    if (e.name === 'NotAllowedError' || e.name === 'SecurityError' || e.name === 'NotFoundError' || e.name === 'OverconstrainedError') {
      wantOn = false; setStatus(explain(e), 'err'); $('start').disabled = false; return;
    }
    if (e.name === 'NotReadableError' || isRetry) { setStatus(isRetry ? 'Retrying…' : explain(e), 'err', 'warn'); scheduleRetry(); return; }
    setStatus(`Cannot reach the laptop (${e.message}).`, 'err', 'warn'); scheduleRetry();
  }
}

function stopTracks() { stream?.getTracks().forEach((t) => { t.onended = null; t.stop(); }); stream = null; $('preview').srcObject = null; }

async function stop() {
  wantOn = false; clearTimeout(retryTimer);
  closePeer(); stopTracks();
  try { await fetch('/api/camera/stop', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token }) }); } catch { /* laptop may be off */ }
  $('cam-badge').classList.add('hidden');
  $('start').disabled = false; $('stop').disabled = true; $('flip').disabled = true;
  setStatus('Camera stopped', '', 'off'); $('msg').textContent = 'Camera is off.';
  wakeLock?.release?.().catch(() => {}); wakeLock = null;
}

async function keepAwake() { try { wakeLock = await navigator.wakeLock?.request('screen'); } catch { /* not critical */ } }
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && wantOn) keepAwake(); });

async function applySettings() {
  saveSettings();
  if (!wantOn || !stream) return;
  try { const t = await openCamera(); const s = pc?.getSenders().find((x) => x.track?.kind === 'video'); if (s) await s.replaceTrack(t); } catch (e) { say(explain(e), 'err'); }
}

$('start').onclick = () => { retry = 0; start(); };
$('stop').onclick = stop;
$('flip').onclick = () => { facing = facing === 'environment' ? 'user' : 'environment'; applySettings(); };
$('res').onchange = applySettings; $('fps').onchange = applySettings;
if (!window.isSecureContext) say('This page is not in a secure context. Open the https:// link shown on the laptop.', 'err');
if (!token) say('Open the full link (with ?k=…) shown on the laptop, or scan its QR code.', 'err');
