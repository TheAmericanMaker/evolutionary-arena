// Canvas drawing only. Dumb and thin; not unit tested.

import { W, H } from './world.js';
import { plantRadius, MAX_ENERGY } from './entity.js';
import { BIOMES, TILE } from './terrain.js';

// Lifetime of a spawn marker ring, in ticks (~1.5s at 1x). Exported so the
// engine can prune app.fx with the same horizon the renderer fades over.
export const SPAWN_FX_TICKS = 90;

export function render(ctx, world, fx = []) {
  ctx.fillStyle = '#0b0e14';
  ctx.fillRect(0, 0, W, H);
  ctx.drawImage(terrainLayer(world), 0, 0);
  drawGrid(ctx);
  ctx.fillStyle = '#4ade80';
  for (const p of world.plants) {
    ctx.beginPath();
    ctx.arc(p.x, p.y, plantRadius(p.energy), 0, Math.PI * 2);
    ctx.fill();
  }
  for (const c of world.creatures) drawCreature(ctx, c);
  drawSpawnFx(ctx, fx, world.tick);
}

// M8: the biome layer, baked once to an offscreen canvas and re-baked only
// when terrain.version changes (paint or world reset). Flat fills plus a
// deterministic per-tile speckle so biomes don't read as flat rectangles.
let terrainCache = null;
function terrainLayer(world) {
  const t = world.terrain;
  if (!terrainCache || terrainCache.version !== t.version) {
    const cv = document.createElement('canvas');
    cv.width = W;
    cv.height = H;
    const c2 = cv.getContext('2d');
    for (let ty = 0; ty < t.rows; ty++) {
      for (let tx = 0; tx < t.cols; tx++) {
        const b = BIOMES[t.tiles[ty * t.cols + tx]];
        if (!b.color) continue;
        c2.fillStyle = b.color;
        c2.fillRect(tx * TILE, ty * TILE, TILE, TILE);
        if (b.name === 'forest') {
          c2.fillStyle = '#1d3b2a';
          for (let k = 0; k < 3; k++) {
            c2.fillRect(tx * TILE + ((tx * 53 + ty * 97 + k * 37) % 24) + 4, ty * TILE + ((tx * 31 + ty * 71 + k * 59) % 24) + 4, 3, 3);
          }
        } else if (b.name === 'tundra') {
          c2.fillStyle = '#24344d';
          c2.fillRect(tx * TILE + ((tx * 37 + ty * 61) % 20) + 5, ty * TILE + ((tx * 13 + ty * 29) % 20) + 5, 4, 2);
        } else if (b.name === 'rock') {
          c2.fillStyle = '#1c2028';
          c2.fillRect(tx * TILE + 5, ty * TILE + 5, TILE - 10, TILE - 10);
        }
      }
    }
    terrainCache = { version: t.version, canvas: cv };
  }
  return terrainCache.canvas;
}

// M7: expanding fading ring where the user spawned a creature (spawn goes to
// a random toroidal spot, so without a marker the button looks dead).
function drawSpawnFx(ctx, fx, tick) {
  for (const f of fx) {
    const t = Math.min(1, (tick - f.t) / SPAWN_FX_TICKS);
    if (t < 0) continue;
    ctx.globalAlpha = 0.9 * (1 - t);
    ctx.strokeStyle = `hsl(${f.hue}, 80%, 60%)`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(f.x, f.y, 4 + t * 26, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

function drawCreature(ctx, c) {
  const hue = 130 - c.dna.aggression * 130; // green (docile) -> red (aggressive)
  const light = 35 + (c.energy / MAX_ENERGY) * 30;
  const r = Math.max(2, c.dna.size);
  ctx.save();
  ctx.shadowColor = `hsl(${hue}, 80%, 60%)`;
  ctx.shadowBlur = 8;
  ctx.fillStyle = `hsl(${hue}, 75%, ${light}%)`;
  ctx.beginPath();
  ctx.arc(c.x, c.y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(c.x + Math.cos(c.heading) * r * 0.5, c.y + Math.sin(c.heading) * r * 0.5);
  ctx.lineTo(c.x + Math.cos(c.heading) * (r + 3), c.y + Math.sin(c.heading) * (r + 3));
  ctx.stroke();
  ctx.restore();
}

// M6: HUD sparkline of the rolling population window (last 200 ticks,
// stats.js samples {tick, veg, carn, energy}). Total = veg + carn. Scales to
// the window max (floor 10) so early low-pop windows stay legible. Total is
// a filled area + grey line; the veg/carn split rides as green/red lines.
export function drawSparkline(ctx, samples, width, height) {
  ctx.clearRect(0, 0, width, height);
  if (!samples.length) return;
  const total = samples.map((s) => s.veg + s.carn);
  const max = Math.max(10, ...total);
  const n = samples.length;
  const x = (i) => (n === 1 ? width - 1 : (i / (n - 1)) * (width - 2) + 1);
  const y = (v) => height - 2 - (v / max) * (height - 6);
  ctx.beginPath();
  ctx.moveTo(x(0), y(0));
  for (let i = 1; i < n; i++) ctx.lineTo(x(i), y(total[i]));
  ctx.lineTo(x(n - 1), y(0));
  ctx.closePath();
  ctx.fillStyle = 'rgba(56, 189, 248, 0.12)';
  ctx.fill();
  const line = (get, color) => {
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x(0), y(get(0)));
    for (let i = 1; i < n; i++) ctx.lineTo(x(i), y(get(i)));
    ctx.stroke();
  };
  line((i) => total[i], '#94a3b8');
  line((i) => samples[i].veg, '#4ade80');
  line((i) => samples[i].carn, '#f87171');
}

function drawGrid(ctx) {
  ctx.strokeStyle = 'rgba(148, 163, 184, 0.08)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = 0; x <= W; x += 64) {
    ctx.moveTo(x + 0.5, 0);
    ctx.lineTo(x + 0.5, H);
  }
  for (let y = 0; y <= H; y += 64) {
    ctx.moveTo(0, y + 0.5);
    ctx.lineTo(W, y + 0.5);
  }
  ctx.stroke();
}
