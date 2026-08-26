// Canvas drawing only. Dumb and thin; not unit tested.

import { W, H } from './world.js';
import { plantRadius, MAX_ENERGY } from './entity.js';
import { BIOMES, TILE } from './terrain.js';
import { TORNADO_RADIUS } from './effects.js';

// Lifetime of a spawn marker ring, in ticks (~1.5s at 1x). Exported so the
// engine can prune app.fx with the same horizon the renderer fades over.
export const SPAWN_FX_TICKS = 90;

// M9: `shake` (px, decaying in engine.js) jitters the whole frame.
// M10: `draft` — the tornado path being dragged on the canvas (null otherwise).
export function render(ctx, world, fx = [], shake = 0, draft = null) {
  if (shake >= 0.5) ctx.save();
  if (shake >= 0.5) ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
  ctx.fillStyle = '#0b0e14';
  ctx.fillRect(-8, -8, W + 16, H + 16);
  ctx.drawImage(terrainLayer(world), 0, 0);
  drawZones(ctx, world);
  ctx.fillStyle = '#4ade80';
  for (const p of world.plants) {
    ctx.beginPath();
    ctx.arc(p.x, p.y, plantRadius(p.energy), 0, Math.PI * 2);
    ctx.fill();
  }
  for (const c of world.creatures) drawCreature(ctx, c);
  drawTornado(ctx, world);
  drawSpawnFx(ctx, fx, world.tick);
  if (draft) drawTornadoDraft(ctx, draft);
  if (shake >= 0.5) ctx.restore();
}

// M9: hazard zone glows — scorch fades with its ttl, rad is a steady green.
function drawZones(ctx, world) {
  for (const z of world.effects.zones) {
    const fade = z.ttl / z.maxTtl;
    let fill;
    if (z.kind === 'scorch') fill = `rgba(248, 113, 113, ${0.05 + 0.04 * z.power * (0.5 + 0.5 * fade)})`;
    else if (z.kind === 'rad') fill = `rgba(74, 222, 128, ${0.06 + 0.05 * fade})`;
    else if (z.kind === 'feast') fill = `rgba(251, 191, 36, ${0.05 + 0.05 * fade})`;
    else if (z.kind === 'fert') fill = `rgba(244, 114, 182, ${0.05 + 0.05 * fade})`;
    else continue;
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.arc(z.x, z.y, z.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = fill;
    ctx.lineWidth = 1;
    ctx.stroke();
  }
}

// M10: the tornado head — three spinning arcs in the corridor, plus the
// corridor ring so the hazard radius reads at a glance.
function drawTornado(ctx, world) {
  const t = world.tornado;
  if (!t) return;
  const rot = world.tick * 0.35;
  ctx.strokeStyle = 'rgba(203, 213, 225, 0.7)';
  for (let i = 0; i < 3; i++) {
    ctx.lineWidth = 2.5 - i * 0.6;
    ctx.beginPath();
    ctx.arc(t.x, t.y, 7 + i * 6, rot + i, rot + i + Math.PI * 1.4);
    ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(148, 163, 184, 0.25)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(t.x, t.y, TORNADO_RADIUS, 0, Math.PI * 2);
  ctx.stroke();
}

// M10: the dashed path the user is dragging before release.
function drawTornadoDraft(ctx, draft) {
  if (draft.length < 2) return;
  ctx.strokeStyle = 'rgba(148, 163, 184, 0.6)';
  ctx.lineWidth = 2;
  ctx.setLineDash([6, 6]);
  ctx.beginPath();
  ctx.moveTo(draft[0].x, draft[0].y);
  for (let i = 1; i < draft.length; i++) ctx.lineTo(draft[i].x, draft[i].y);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.arc(draft[draft.length - 1].x, draft[draft.length - 1].y, 4, 0, Math.PI * 2);
  ctx.stroke();
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
        } else if (b.name === 'scorched') {
          c2.fillStyle = '#3d2a1a';
          c2.fillRect(tx * TILE + ((tx * 47 + ty * 23) % 24) + 4, ty * TILE + ((tx * 17 + ty * 83) % 24) + 4, 3, 2);
          c2.fillStyle = '#2a1d12';
          c2.fillRect(tx * TILE + ((tx * 71 + ty * 11) % 26) + 3, ty * TILE + ((tx * 41 + ty * 67) % 26) + 3, 2, 2);
        }
      }
    }
    terrainCache = { version: t.version, canvas: cv };
  }
  return terrainCache.canvas;
}

// M7: expanding fading ring where the user spawned a creature (spawn goes to
// a random toroidal spot, so without a marker the button looks dead). M9: an
// fx can carry `ring` (max radius) — impact blasts expand out to their blast
// radius instead of the spawn ring's 30px.
function drawSpawnFx(ctx, fx, tick) {
  for (const f of fx) {
    const t = Math.min(1, (tick - f.t) / SPAWN_FX_TICKS);
    if (t < 0) continue;
    const maxR = f.ring || 30;
    ctx.globalAlpha = 0.9 * (1 - t);
    ctx.strokeStyle = `hsl(${f.hue}, 80%, 60%)`;
    ctx.lineWidth = f.ring ? 3 : 2;
    ctx.beginPath();
    ctx.arc(f.x, f.y, 4 + t * (maxR - 4), 0, Math.PI * 2);
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
