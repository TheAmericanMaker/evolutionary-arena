// App bootstrap: fixed-timestep loop wiring world + render + UI.
// Owns only the app state { world, paused }; all DOM wiring lives in ui.js.
// Decision (M5): the app starts paused under the intro splash (spec §5:
// "paused — press space"); space or Resume starts it.

import { createWorld, tick } from './world.js';
import { render, SPAWN_FX_TICKS } from './render.js';
import { createUI } from './ui.js';

const canvas = document.getElementById('world');
const ctx = canvas.getContext('2d');

// app.fx: transient spawn markers {x, y, t, hue}; ui.js pushes, engine prunes.
export const app = { world: createWorld(1), paused: true, fx: [] };
window.__arena = app; // console/debug handle (browser smoke tests use it)
const ui = createUI(app);

function frame() {
  if (!app.paused) {
    const n = ui.speed();
    for (let i = 0; i < n; i++) tick(app.world);
  }
  const t = app.world.tick;
  if (app.fx.length) app.fx = app.fx.filter((f) => t - f.t < SPAWN_FX_TICKS);
  render(ctx, app.world, app.fx);
  ui.hud();
  requestAnimationFrame(frame);
}

window.__arenaBooted = true;
requestAnimationFrame(frame);
