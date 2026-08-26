// World state + tick. Pure (no DOM/canvas). Deterministic given a seed.
// Decision: M1's test "marker" sprite is gone; the world now owns the
// creature population (M3) plus the plant bank/pool (M2). Initial population
// = INITIAL_CREATURES random-DNA creatures, each its own lineage L<n>.
// M4: the world also owns the creature spatial grid (mirrors plantGrid) and
// the rolling stats window; tick() records one stats sample after filtering.
// M5: the world owns the all-time records too (world.records, pure);
// tick() notes them after the dead-filter, and spawn() supports the user
// Spawn buttons (random toroidal position via world.rng).

import { createRng } from './rng.js';
import { randomDna } from './dna.js';
import { createSpatial } from './spatial.js';
import { createCreature, updateCreature, OFFSPRING_ENERGY } from './entity.js';
import { createStats, createRecords } from './stats.js';
import { createTerrain } from './terrain.js';
import { createEffects } from './effects.js';

export const W = 1024;
export const H = 640;
export const DT = 1;

// Decision (M2): global plant energy pool per PROMPT.md §4.3. The pool
// regens +PLANT_REGEN/tick up to PLANT_POOL_MAX; a sprout costs PLANT_COST
// and is only allowed while pool >= cost and plants < MAX_PLANTS, so the
// pool can never drop below 0. "Random free location" = uniform random
// position (no overlap rejection).
export const PLANT_POOL_START = 200;
export const PLANT_POOL_MAX = 1000;
export const PLANT_REGEN = 2;
export const PLANT_COST = 5;
export const MAX_PLANTS = 400;
export const PLANT_GROWTH = 1;
export const PLANT_MAX_ENERGY = 20;
// Decision (M6): default sprout rate 0.3/tick. Tuning probe (20k-tick, seeds
// 1/2/3/7/42): at the old 0.05 the population hovers 6-12 (stable, boring);
// at 0.3 it booms to ~150-210 and crashes to ~18 on a ~1000-tick period,
// every seed, with no extinction and no blowup. Plant growth/max-energy stay
// at the spec values (1/tick to 20); the sprout rate is the inflow lever.
export const DEFAULT_PLANT_RATE = 0.3;

// Decision (M3): initial population of 20, mid-range energy so the first
// deaths/births happen on ecosystem timescales, not at t=0.
export const INITIAL_CREATURES = 20;
export const INITIAL_ENERGY = 60;
export const DEFAULT_MUTATION_RATE = 0.1;

// Wrap v into [0, limit) for any input: beyond-range, negative, fractional.
export function wrap(v, limit) {
  return ((v % limit) + limit) % limit;
}

export function createWorld(seed = 1) {
  const rng = createRng(seed);
  const world = {
    seed,
    rng,
    tick: 0,
    plantPool: PLANT_POOL_START,
    plants: [],
    creatures: [],
    creatureSeq: 1,
    settings: { plantRate: DEFAULT_PLANT_RATE, mutationRate: DEFAULT_MUTATION_RATE },
  };
  // M8: terrain first — spawn placement consults it.
  world.terrain = createTerrain(rng);
  world.plantGrid = createSpatial(W, H);
  world.creatureGrid = createSpatial(W, H);
  world.stats = createStats();
  world.records = createRecords();
  // M9: hazard zone layer (effects.js) + life accounting for the stats panel.
  world.effects = createEffects();
  world.deaths = { starve: 0, predation: 0, hazard: 0, user: 0 };
  world.births = 0;
  for (let i = 0; i < INITIAL_CREATURES; i++) {
    const spot = freeSpot(world);
    world.creatures.push(createCreature({
      id: world.creatureSeq++,
      x: spot.x,
      y: spot.y,
      heading: rng.next() * Math.PI * 2,
      dna: randomDna(rng),
      energy: INITIAL_ENERGY,
      lineageId: `L${i + 1}`,
      generation: 1,
      bornTick: 0,
    }));
  }
  return world;
}

// M8: a random passable spot. Random tries first (deterministic sequence),
// then a coarse scan, then the world center — so spawn never strands a
// creature inside water/rock, even on a fully painted-in world.
function freeSpot(world) {
  const { rng, terrain } = world;
  for (let i = 0; i < 32; i++) {
    const x = rng.next() * W;
    const y = rng.next() * H;
    if (terrain.isPassable(x, y)) return { x, y };
  }
  for (let y = 16; y < H; y += 32) {
    for (let x = 16; x < W; x += 32) {
      if (terrain.isPassable(x, y)) return { x, y };
    }
  }
  return { x: W / 2, y: H / 2 };
}

export function tick(world) {
  world.tick += 1;
  growPlants(world);
  rebuildPlantGrid(world);
  rebuildCreatureGrid(world);
  const newborns = [];
  for (const c of world.creatures) {
    if (c.dead) continue;
    const child = updateCreature(c, world);
    if (child) { newborns.push(child); world.births += 1; }
    // M9: hazard zones drain energy after the normal tick; a creature that
    // hits 0 here died to the hazard, not to metabolism.
    const drain = world.effects.drainAt(c.x, c.y);
    if (drain > 0 && !c.dead) {
      c.energy = Math.max(0, c.energy - drain);
      if (c.energy <= 0) { c.dead = true; c.deathCause = 'hazard'; }
    }
  }
  world.effects.tick();
  for (const c of world.creatures) {
    if (c.dead) world.deaths[c.deathCause || 'starve'] += 1;
  }
  world.plants = world.plants.filter((p) => !p.dead);
  world.creatures = world.creatures.filter((c) => !c.dead).concat(newborns);
  world.stats.record(world);
  world.records.note(world);
}

// Decision (M5): user spawn (Spawn buttons, spec §4.7) — random toroidal
// position via world.rng (so a fixed input sequence stays deterministic),
// energy OFFSPRING_ENERGY, generation 1, caller-chosen lineage id.
export function spawn(world, dna, lineageId) {
  const spot = freeSpot(world);
  const c = createCreature({
    id: world.creatureSeq++,
    x: spot.x,
    y: spot.y,
    heading: world.rng.next() * Math.PI * 2,
    dna,
    energy: OFFSPRING_ENERGY,
    lineageId,
    generation: 1,
    bornTick: world.tick,
  });
  world.creatures.push(c);
  return c;
}

// Grids are rebuilt at tick start, so sensing sees tick-start positions for
// every creature (consistent within a tick); newborns join the grid next tick.
function rebuildCreatureGrid(world) {
  world.creatureGrid.clear();
  for (const c of world.creatures) {
    if (!c.dead) world.creatureGrid.insert(c);
  }
}

function growPlants(world) {
  const { rng, settings, terrain } = world;
  world.plantPool = Math.min(PLANT_POOL_MAX, world.plantPool + PLANT_REGEN);
  if (world.plants.length < MAX_PLANTS && world.plantPool >= PLANT_COST && rng.next() < settings.plantRate) {
    // M8: sprouts need a plantable tile; M9: never on hazard ground — retry
    // up to 16 times, else the regen is deferred (pool fills toward its cap).
    for (let i = 0; i < 16; i++) {
      const x = rng.next() * W;
      const y = rng.next() * H;
      if (terrain.plantMultAt(x, y) > 0 && !world.effects.blocksSprout(x, y)) {
        world.plantPool -= PLANT_COST;
        world.plants.push({ x, y, energy: 1 });
        break;
      }
    }
  }
  for (const p of world.plants) {
    // M8: biome climate — forest plants grow twice as fast, tundra half.
    // M9: hazard ground freezes growth (ash, radiation).
    if (p.energy < PLANT_MAX_ENERGY && !world.effects.blocksSprout(p.x, p.y)) {
      p.energy = Math.min(PLANT_MAX_ENERGY, p.energy + PLANT_GROWTH * terrain.plantMultAt(p.x, p.y));
    }
  }
}

function rebuildPlantGrid(world) {
  world.plantGrid.clear();
  for (const p of world.plants) {
    if (!p.dead) world.plantGrid.insert(p);
  }
}
