// M3 entity behavior tests: seek->eat, metabolism->starve, bud at threshold.
// Each test isolates a single hand-built creature (plantRate 0, no other
// entities) so behavior is fully deterministic.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, tick, W, H } from '../src/world.js';
import {
  createCreature, MAX_ENERGY, REPRO_THRESHOLD, BIRTH_COST, OFFSPRING_ENERGY,
} from '../src/entity.js';
import { TILE, clearTerrain } from '../src/terrain.js';

// Drop the world to exactly one creature and no food sources.
function isolate(world, creature, plants = []) {
  world.settings.plantRate = 0;
  world.creatures = [creature];
  world.plants = plants;
  return creature;
}

function makeCreature(overrides = {}) {
  return createCreature({
    id: 1, x: 100, y: 100, heading: 0,
    dna: { speed: 1, vision: 60, metabolism: 0.1, aggression: 0.1, size: 2 },
    energy: 50, lineageId: 'L1', generation: 1, bornTick: 0,
    ...overrides,
  });
}

test('creature steers to the nearest plant and eats it', () => {
  const world = createWorld(1);
  clearTerrain(world.terrain); // M8: this test asserts movement, not terrain
  const c = isolate(world, makeCreature({ dna: { speed: 2, vision: 80, metabolism: 0.05, aggression: 0.1, size: 2 } }));
  world.plants = [{ x: 140, y: 100, energy: 20 }]; // 40px ahead, along heading
  for (let i = 0; i < 30 && world.plants.length > 0; i++) tick(world);
  assert.equal(world.plants.length, 0, 'plant should have been eaten');
  assert.ok(c.energy > 50, `energy should rise after eating, got ${c.energy}`);
});

test('a creature with no food starves and is removed from the world', () => {
  const world = createWorld(2);
  const c = isolate(world, makeCreature({ energy: 10, dna: { speed: 1, vision: 40, metabolism: 0.25, aggression: 0, size: 2 } }));
  for (let i = 0; i < 60 && world.creatures.length > 0; i++) tick(world);
  assert.equal(world.creatures.length, 0, 'starved creature should be removed');
  assert.ok(c.dead, 'creature should be flagged dead');
  assert.ok(c.energy >= 0, `energy must never go negative: ${c.energy}`);
});

test('energy is capped at MAX_ENERGY when eating past it', () => {
  const world = createWorld(3);
  clearTerrain(world.terrain);
  const c = isolate(world, makeCreature({
    energy: 105, // 105 + 20 = 125 -> clamps to 120 -> buds to 80 (85 without clamp)
    dna: { speed: 1, vision: 80, metabolism: 0, aggression: 0, size: 2 },
  }));
  world.plants = [{ x: 104, y: 100, energy: 20 }]; // inside eat radius on tick 1
  tick(world);
  assert.equal(c.energy, REPRO_THRESHOLD - BIRTH_COST, `expected clamped 80, got ${c.energy}`);
  assert.equal(world.creatures.length, 2);
});

test('creature at threshold buds: parent pays, child inherits lineage and DNA', () => {
  const world = createWorld(4);
  const dna = { speed: 1.5, vision: 60, metabolism: 0, aggression: 0.2, size: 3 };
  const c = isolate(world, makeCreature({
    dna, energy: REPRO_THRESHOLD, x: 500, y: 300, lineageId: 'L7', generation: 4,
  }));
  world.settings.mutationRate = 0;
  tick(world);
  assert.equal(world.creatures.length, 2, 'parent + one offspring');
  assert.equal(c.energy, REPRO_THRESHOLD - BIRTH_COST);
  const child = world.creatures.find((k) => k !== c);
  assert.equal(child.energy, OFFSPRING_ENERGY);
  assert.equal(child.lineageId, 'L7');
  assert.equal(child.generation, 5);
  assert.deepEqual(child.dna, dna, 'mutation rate 0 must be an exact clone');
  assert.ok(child.x >= 0 && child.x < W && child.y >= 0 && child.y < H, 'offspring stays in bounds');
});

test('below-threshold creature does not bud', () => {
  const world = createWorld(5);
  isolate(world, makeCreature({ energy: REPRO_THRESHOLD - 0.01, dna: { speed: 1, vision: 40, metabolism: 0, aggression: 0.1, size: 2 } }));
  tick(world);
  assert.equal(world.creatures.length, 1);
});

test('MAX_ENERGY and REPRO_THRESHOLD match the spec value 120', () => {
  assert.equal(MAX_ENERGY, 120);
  assert.equal(REPRO_THRESHOLD, 120);
});

test('M8: a creature heading into water holds at the edge instead of entering', () => {
  const world = createWorld(55);
  const t = world.terrain;
  clearTerrain(t); // fully controlled: open left half, water right half
  const half = Math.ceil(t.cols / 2);
  for (let ty = 0; ty < t.rows; ty++) {
    for (let tx = half; tx < t.cols; tx++) t.paint(tx * TILE + 5, ty * TILE + 5, 1);
  }
  // 1px left of the water line, heading straight into it.
  const c = isolate(world, makeCreature({
    x: half * TILE - 1, y: 100, heading: 0, energy: 100,
    dna: { speed: 2, vision: 20, metabolism: 0.05, aggression: 0.1, size: 2 },
  }));
  assert.equal(t.isPassable(c.x, c.y), true, 'start position must be passable');
  for (let i = 0; i < 10; i++) tick(world);
  assert.ok(t.isPassable(c.x, c.y), `creature entered water at ${c.x}, ${c.y}`);
  assert.ok(c.x < half * TILE, `creature crossed the water line: ${c.x}`);
  assert.ok(c.heading > 0.3, `creature should have turned off the water, heading ${c.heading}`);
});

test('M8: a creature with a water wall ahead skims along it and keeps moving', () => {
  const world = createWorld(66);
  const t = world.terrain;
  clearTerrain(t); // fully controlled: open world plus one water band
  // Water in a 2-tile-wide vertical band at x 512..576, open on both sides.
  for (let ty = 0; ty < t.rows; ty++) {
    for (let tx = 16; tx < 18; tx++) t.paint(tx * TILE + 5, ty * TILE + 5, 1);
  }
  const c = isolate(world, makeCreature({
    x: 496, y: 100, heading: 0, energy: 200,
    dna: { speed: 2, vision: 20, metabolism: 0.01, aggression: 0.1, size: 2 },
  }));
  const x0 = c.x;
  for (let i = 0; i < 40; i++) {
    tick(world);
    assert.ok(t.isPassable(c.x, c.y), `creature in water at ${c.x}, ${c.y} (tick ${i})`);
  }
  // It must not pin itself against the wall: 40 ticks of steering along the
  // band should cover real distance (wander drift may later carry it off).
  const moved = Math.hypot(c.x - x0, c.y - 100);
  assert.ok(moved > 20, `creature pinned against the wall, moved only ${moved}px`);
});
