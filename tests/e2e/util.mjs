// Shared helper: e2e tests start from a known single-surface scene (earlier tests may have changed the saved layout)
// and put the saved scene back when they finish, so running them never changes what the wall is showing.
let saved = null;
export async function resetScene(base = 'http://localhost:8000') {
  if (!saved) saved = await (await fetch(`${base}/api/scene`)).json();
  const r = await fetch(`${base}/api/scene`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({
    surfaces: [{ id: 'main', name: 'Main wall', content: { type: 'game', game: 'menu' }, quad: [[0, 0], [1, 0], [1, 1], [0, 1]] }] }) });
  if (!r.ok) throw new Error('could not reset scene: ' + r.status);
}
export async function restoreScene(base = 'http://localhost:8000') {
  if (!saved) return;
  const r = await fetch(`${base}/api/scene`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(saved) });
  if (!r.ok) throw new Error('could not restore scene: ' + r.status);
}

// Tests that end normally put the wall back automatically (tests that call process.exit(1) on failure skip this).
let hooked = false;
process.on('beforeExit', async () => { if (hooked || !saved) return; hooked = true; try { await restoreScene(); } catch { /* server gone */ } });
