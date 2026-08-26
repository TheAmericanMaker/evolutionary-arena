import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createWorld, tick, wrap, spawn, W, H,
  PLANT_POOL_MAX, MAX_PLANTS, PLANT_MAX_ENERGY, INITIAL_CREATURES,
} from '../src/world.js';
import { OFFSPRING_ENERGY } from '../src/entity.js';
import { HERBIVORE_DNA } from '../src/dna.js';
import { TILE, clearTerrain } from '../src/terrain.js';

test('wrap handles offsets beyond range and negatives', () => {
  assert.equal(wrap(0, W), 0);
  assert.equal(wrap(W, W), 0);
  assert.equal(wrap(W + 5, W), 5);
  assert.equal(wrap(2 * W + 7, W), 7);
  assert.equal(wrap(-3, W), W - 3);
  assert.equal(wrap(-W - 1, W), W - 1);
  assert.equal(wrap(H + 0.5, H), 0.5);
});

test('all creatures stay inside bounds after many ticks', () => {
  const world = createWorld(7);
  for (let i = 0; i < 2000; i++) tick(world);
  for (const c of world.creatures) {
    assert.ok(c.x >= 0 && c.x < W, `x out of bounds: ${c.x}`);
    assert.ok(c.y >= 0 && c.y < H, `y out of bounds: ${c.y}`);
  }
});

test('world is deterministic given a seed', () => {
  const a = createWorld(42);
  const b = createWorld(42);
  for (let i = 0; i < 500; i++) { tick(a); tick(b); }
  assert.deepEqual(a.creatures, b.creatures);
  assert.deepEqual(a.plants, b.plants);
  assert.equal(a.tick, b.tick);
});

test('tick counter advances one per tick', () => {
  const world = createWorld(1);
  for (let i = 0; i < 10; i++) tick(world);
  assert.equal(world.tick, 10);
});

test('initial population has unique lineages at generation 1', () => {
  const world = createWorld(9);
  assert.equal(world.creatures.length, INITIAL_CREATURES);
  const ids = new Set(world.creatures.map((c) => c.lineageId));
  assert.equal(ids.size, INITIAL_CREATURES);
  for (const c of world.creatures) assert.equal(c.generation, 1);
});

test('plants grow +1 energy/tick up to max 20', () => {
  const world = createWorld(3);
  clearTerrain(world.terrain); // M8: growth rate under test, not biome climate
  world.settings.plantRate = 0;
  world.creatures = []; // isolate growth from eating
  world.plants.push({ x: 10, y: 10, energy: 1 });
  for (let i = 0; i < PLANT_MAX_ENERGY + 5; i++) tick(world);
  assert.equal(world.plants[0].energy, PLANT_MAX_ENERGY);
});

test('plant pool never drops below 0 and stays under cap', () => {
  const world = createWorld(5);
  world.settings.plantRate = 1; // sprout every tick while affordable
  for (let i = 0; i < 3000; i++) {
    tick(world);
    assert.ok(world.plantPool >= 0, `tick ${world.tick}: pool went negative`);
    assert.ok(world.plantPool <= PLANT_POOL_MAX, `tick ${world.tick}: pool over cap`);
  }
});

test('plant count respects max sprout limit', () => {
  const world = createWorld(6);
  world.settings.plantRate = 1;
  world.plantPool = PLANT_POOL_MAX; // fully funded
  for (let i = 0; i < 2000; i++) {
    tick(world);
    assert.ok(world.plants.length <= MAX_PLANTS, `tick ${world.tick}: too many plants`);
  }
});

test('plant rate slider value of 0 spawns nothing', () => {
  const world = createWorld(8);
  world.settings.plantRate = 0;
  for (let i = 0; i < 500; i++) tick(world);
  assert.equal(world.plants.length, 0);
});

test('spawn adds a user creature in bounds at offspring energy, fresh id', () => {
  const world = createWorld(17);
  const before = world.creatures.length;
  const maxId = Math.max(...world.creatures.map((c) => c.id));
  const c = spawn(world, HERBIVORE_DNA, 'U1');
  assert.equal(world.creatures.length, before + 1);
  assert.ok(c.x >= 0 && c.x < W && c.y >= 0 && c.y < H, `out of bounds: ${c.x}, ${c.y}`);
  assert.equal(c.energy, OFFSPRING_ENERGY);
  assert.equal(c.generation, 1);
  assert.equal(c.lineageId, 'U1');
  assert.equal(c.bornTick, world.tick);
  assert.ok(c.id > maxId, 'ids keep incrementing');
  tick(world);
  assert.ok(world.creatures.includes(c), 'spawned creature participates in the next tick');
});

function paintAll(world, id) {
  const t = world.terrain;
  for (let ty = 0; ty < t.rows; ty++) {
    for (let tx = 0; tx < t.cols; tx++) t.paint(tx * TILE + 5, ty * TILE + 5, id);
  }
}

test('M8: initial creatures and spawn() always land on passable tiles', () => {
  const world = createWorld(99);
  for (const c of world.creatures) {
    assert.equal(world.terrain.isPassable(c.x, c.y), true, `initial creature in ${world.terrain.biomeAt(c.x, c.y).name}`);
  }
  clearTerrain(world.terrain);
  paintAll(world, 1); // seal the whole world in water...
  for (let ty = 5; ty < 7; ty++) {
    for (let tx = 5; tx < 7; tx++) world.terrain.paint(tx * TILE + 5, ty * TILE + 5, 0);
  }
  // ...except a 2x2 bay: every spawn must end up in it.
  for (let i = 0; i < 25; i++) {
    const c = spawn(world, HERBIVORE_DNA, `S${i}`);
    assert.equal(world.terrain.isPassable(c.x, c.y), true, `spawn #${i} in ${world.terrain.biomeAt(c.x, c.y).name}`);
  }
});

test('M8: a fully sealed world sprouts nothing and defers the pool', () => {
  const world = createWorld(13);
  paintAll(world, 2); // rock everywhere: impassable and unplantable
  const pool0 = world.plantPool;
  for (let i = 0; i < 40; i++) tick(world);
  assert.equal(world.plants.length, 0, 'no sprouts in rock');
  assert.equal(world.plantPool, Math.min(PLANT_POOL_MAX, pool0 + 40 * 2), 'regen deferred but pool keeps filling');
});

test('M8: biome climate scales plant growth (forest 2x, open 1x)', () => {
  const world = createWorld(21);
  world.settings.plantRate = 0;
  paintAll(world, 3); // forest
  world.plants.push({ x: 100, y: 100, energy: 10 });
  tick(world);
  assert.equal(world.plants.find((p) => p.x === 100 && p.y === 100).energy, 12, 'forest: +2 per tick');
  paintAll(world, 0); // open
  world.plants.push({ x: 200, y: 200, energy: 10 });
  tick(world);
  assert.equal(world.plants.find((p) => p.x === 200 && p.y === 200).energy, 11, 'open: +1 per tick');
});

test('M8: tundra raises the metabolism cost by 25%', () => {
  const world = createWorld(31);
  world.settings.plantRate = 0;
  paintAll(world, 4); // tundra everywhere
  const c = spawn(world, HERBIVORE_DNA, 'T1');
  world.creatures = [c]; // isolate: no hunters, no food
  c.energy = 60;
  tick(world);
  assert.ok(Math.abs(c.energy - (60 - HERBIVORE_DNA.metabolism * 1.25)) < 1e-9,
    `expected ${60 - HERBIVORE_DNA.metabolism * 1.25}, got ${c.energy}`);
});
