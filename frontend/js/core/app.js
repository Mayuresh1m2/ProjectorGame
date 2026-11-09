// Shared state + tiny event bus for the control panel modules.
import { Link } from './ws.js';

const handlers = {};
export const app = {
  settings: null, scene: null, calibration: null, stats: null,
  hands: [], camSize: { w: 0, h: 0 }, outputSize: { w: 1920, h: 1080 }, preview: null,
  serverUp: false,
  on(evt, fn) { (handlers[evt] ||= []).push(fn); },
  emit(evt, data) { for (const fn of handlers[evt] || []) fn(data); },
  command(cmd, extra = {}) { link.send({ type: 'command', cmd, ...extra }); },
  get aspect() { const o = this.settings?.output; return o && o.mode === 'fixed' ? o.width / o.height : this.outputSize.w / this.outputSize.h; },
};

export const link = new Link((m) => {
  switch (m.type) {
    case 'settings': app.settings = m.settings; app.emit('settings', m.settings); break;
    case 'scene': app.scene = m.scene; app.emit('scene', m.scene); break;
    case 'calibration': app.calibration = m.calibration; app.emit('calibration', m.calibration); break;
    case 'stats': app.stats = m; app.emit('stats', m); break;
    case 'poses': app.poses = m.poses; app.camSize = m.cam; app.emit('poses', m); break;
    case 'zone': app.emit('zone', m); break;
    case 'quest': app.quest = m.quest; app.emit('quest', m.quest); break;
    case 'health': app.health = m; app.emit('health', m); break;
    case 'hands': app.hands = m.hands; app.camSize = m.cam; app.emit('hands', m); break;
    case 'command': if (m.cmd === 'output-size') { app.outputSize = { w: m.w, h: m.h }; app.emit('output-size', m); } break;
  }
}, (up) => { app.serverUp = up; app.emit('server', up); if (up) app.command('hello'); });
