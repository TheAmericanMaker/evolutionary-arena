// App bootstrap: fixed-timestep loop wiring world + render + UI.
// Owns only the app state { world, paused }; all DOM wiring lives in ui.js.
// Decision (M5): the app starts paused under the intro splash (spec §5:
// "paused — press space"); space or Resume starts it.

import { createWorld, tick } from './world.js';
import { render, SPAWN_FX_TICKS } from './render.js';
import { createUI } from './ui.js';

const canvas = document.getElementById('world');
const ctx = canvas.getContext('2d');

// app.fx: transient spawn markers {x, y, t, hue} (M9: + optional `ring`
// max radius for impact blasts); ui.js pushes, engine prunes.
// app.shake: M9 screen-shake amplitude in px; ui.js sets it on impact, the
// frame loop decays it.
export const app = { world: createWorld(1), paused: true, fx: [], shake: 0 };
window.__arena = app; // console/debug handle (browser smoke tests use it)
const ui = createUI(app);

function frame() {
  if (!app.paused) {
    const n = ui.speed();
    for (let i = 0; i < n; i++) tick(app.world);
  }
  const t = app.world.tick;
  if (app.fx.length) app.fx = app.fx.filter((f) => t - f.t < SPAWN_FX_TICKS);
  render(ctx, app.world, app.fx, app.shake);
  if (app.shake) app.shake = app.shake > 0.5 ? app.shake * 0.85 : 0;
  ui.hud();
  requestAnimationFrame(frame);
}

window.__arenaBooted = true;
requestAnimationFrame(frame);
