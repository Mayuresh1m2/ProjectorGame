// Reconnecting WebSocket to the local server.
export class Link {
  constructor(onMessage, onStatus) {
    this.onMessage = onMessage; this.onStatus = onStatus || (() => {});
    this.ws = null; this.open = false; this.everUp = false; this.closed = false; this.retry = 0;
    this._connect();
  }
  _connect() {
    if (this.closed) return;
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    let ws;
    try { ws = new WebSocket(`${proto}://${location.host}/ws`); } catch { return this._later(); }
    this.ws = ws;
    ws.onopen = () => { this.open = true; this.everUp = true; this.retry = 0; this.onStatus(true); };
    ws.onmessage = (e) => { try { this.onMessage(JSON.parse(e.data)); } catch { /* ignore malformed */ } };
    ws.onclose = () => { const was = this.open; this.open = false; if (was) this.onStatus(false); this._later(); };
    ws.onerror = () => ws.close();
  }
  _later() { if (!this.closed) setTimeout(() => this._connect(), Math.min(5000, 400 * 2 ** this.retry++)); }
  send(msg) { if (this.open) this.ws.send(JSON.stringify(msg)); }
  close() { this.closed = true; this.ws?.close(); }
}

export async function api(path, method = 'GET', body) {
  const r = await fetch(path, { method, headers: body ? { 'Content-Type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined });
  if (!r.ok) { let m = r.statusText; try { m = (await r.json()).detail || m; } catch { /* keep statusText */ } throw new Error(m); }
  return r.status === 204 ? null : r.json();
}
