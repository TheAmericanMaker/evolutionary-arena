// App bootstrap: fixed-timestep loop wiring world + render + UI.
// Owns only the app state { world, paused }; all DOM wiring lives in ui.js.
// Decision (M5): the app starts paused under the intro splash (spec §5:
// "paused — press space"); space or Resume starts it.

import { createWorld, tick } from './world.js';
import { render } from './render.js';
import { createUI } from './ui.js';

const canvas = document.getElementById('world');
const ctx = canvas.getContext('2d');

export const app = { world: createWorld(1), paused: true };
const ui = createUI(app);

function frame() {
  if (!app.paused) {
    const n = ui.speed();
    for (let i = 0; i < n; i++) tick(app.world);
  }
  render(ctx, app.world);
  ui.hud();
window.__arenaBooted = true;
requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
