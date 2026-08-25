// M3 entity behavior tests: seek->eat, metabolism->starve, bud at threshold.
// Each test isolates a single hand-built creature (plantRate 0, no other
// entities) so behavior is fully deterministic.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, tick, W, H } from '../src/world.js';
import {
  createCreature, MAX_ENERGY, REPRO_THRESHOLD, BIRTH_COST, OFFSPRING_ENERGY,
} from '../src/entity.js';

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
