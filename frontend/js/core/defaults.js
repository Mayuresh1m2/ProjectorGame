// Fallbacks used when the server is unreachable (the game must work as a plain static page too).
export const DEFAULT_SETTINGS = {
  game: { butterflies: 8, speed: 1, interactionDistance: 0.07, spawnRate: 0.8, animationSpeed: 1, duration: 0, difficulty: 'normal', sound: true, shyCount: 10, shySize: 1 },
  tracking: {}, output: { mode: 'fill', width: 1920, height: 1080, fit: 'contain' },
};
export const DEFAULT_SCENE = {
  version: 1, background: '#000000',
  surfaces: [{ id: 'main', name: 'Main wall', visible: true, content: { type: 'game', game: 'menu' }, quad: [[0, 0], [1, 0], [1, 1], [0, 1]], shape: 'rect', polygon: [], interactive: true }],
};
