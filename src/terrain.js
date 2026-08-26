// Terrain: static per-tile biome layer under the simulation (M8).
// Decisions:
// - TILE=32px tiles (32x20 on the 1024x640 world). Tile ids 0..5 in a
//   Uint8Array; biome data in BIOMES (index = id).
// - Biomes: open (default), water/rock (impassable, no plants), forest
//   (plant growth x2 — "trees" as a dense biome, not individual entities),
//   tundra (plant growth x0.5, creature metabolism x1.25 — the "climate"
//   hook: per-tile plantMult/metaMult), scorched (M9: passable dead ground —
//   no plants, metabolism x1.1; the scar left by big impacts, paintable).
// - Generation = seeded blob fields: a few random centers per type, toroidal
//   distance, per-tile edge jitter (0.8..1.2 x radius) for organic borders.
//   Forest is drawn last so it trims water shores. Open stays dominant.
// - Paintable: paint(x, y, id) for the ui.js Terrain tool; version bumps on
//   real change so render.js can invalidate its offscreen bake.
// - All lookups are toroidal (the world wraps), matching wrap() semantics.

import { W, H } from './world.js';

export const TILE = 32;

export const BIOMES = [
  { name: 'open',   passable: true,  plantable: true,  plantMult: 1,    metaMult: 1,    color: null },
  { name: 'water',  passable: false, plantable: false, plantMult: 0,    metaMult: 1,    color: '#0c2038' },
  { name: 'rock',   passable: false, plantable: false, plantMult: 0,    metaMult: 1,    color: '#262b36' },
  { name: 'forest', passable: true,  plantable: true,  plantMult: 2,    metaMult: 1,    color: '#0f2018' },
  { name: 'tundra', passable: true,  plantable: true,  plantMult: 0.5,  metaMult: 1.25, color: '#182230' },
  { name: 'scorched', passable: true, plantable: false, plantMult: 0,   metaMult: 1.1,  color: '#171210' },
];

// Draw order = overwrite order: big soft biomes first, forest last.
const BLOB_DEFS = [
  { id: 1, count: 3, rMin: 2.2, rMax: 4.5 },
  { id: 2, count: 3, rMin: 1.0, rMax: 2.5 },
  { id: 4, count: 2, rMin: 1.5, rMax: 3.5 },
  { id: 3, count: 4, rMin: 2.0, rMax: 4.0 },
];

export function createTerrain(rng) {
  const cols = W / TILE;
  const rows = H / TILE;
  const tiles = new Uint8Array(cols * rows);
  for (const b of BLOB_DEFS) {
    for (let i = 0; i < b.count; i++) {
      const cx = rng.next() * cols;
      const cy = rng.next() * rows;
      const r = b.rMin + rng.next() * (b.rMax - b.rMin);
      for (let ty = 0; ty < rows; ty++) {
        for (let tx = 0; tx < cols; tx++) {
          const dx = Math.abs(tx - cx);
          const dy = Math.abs(ty - cy);
          const d = Math.hypot(Math.min(dx, cols - dx), Math.min(dy, rows - dy));
          if (d < r * (0.8 + 0.4 * rng.next())) tiles[ty * cols + tx] = b.id;
        }
      }
    }
  }
  const cellIndex = (x, y) => {
    const cx = ((Math.floor(x / TILE) % cols) + cols) % cols;
    const cy = ((Math.floor(y / TILE) % rows) + rows) % rows;
    return cy * cols + cx;
  };
  const typeAt = (x, y) => tiles[cellIndex(x, y)];
  const terrain = {
    cols, rows, tiles, version: 1, typeAt,
    biomeAt: (x, y) => BIOMES[typeAt(x, y)],
    isPassable: (x, y) => BIOMES[typeAt(x, y)].passable,
    plantMultAt: (x, y) => BIOMES[typeAt(x, y)].plantMult,
    metaMultAt: (x, y) => BIOMES[typeAt(x, y)].metaMult,
  };
  terrain.paint = (x, y, id) => {
    const i = cellIndex(x, y);
    if (tiles[i] !== id) { tiles[i] = id; terrain.version++; }
  };
  return terrain;
}

// Reset a terrain to fully open (tests, and a future "clear terrain" action).
export function clearTerrain(terrain) {
  terrain.tiles.fill(0);
  terrain.version++;
}
