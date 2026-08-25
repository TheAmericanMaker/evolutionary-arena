// M4 predation & flee tests. Each behavioral test isolates hand-built
// creatures (plantRate 0, no plants) so outcomes are fully deterministic.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, tick, W, H, PLANT_POOL_MAX } from '../src/world.js';
import { createCreature, MAX_ENERGY } from '../src/entity.js';

function makeCreature(overrides = {}) {
  return createCreature({
    id: 1, x: 100, y: 100, heading: 0,
    dna: { speed: 1, vision: 60, metabolism: 0.1, aggression: 0.1, size: 2 },
    energy: 50, lineageId: 'L1', generation: 1, bornTick: 0,
    ...overrides,
  });
}

// Empty world holding exactly the given creatures and no food.
function isolate(world, ...creatures) {
  world.settings.plantRate = 0;
  world.plants = [];
  world.creatures = creatures;
}

test('carnivore hunts, bites, and kills smaller prey; predator nets energy', () => {
  const world = createWorld(1);
  const pred = makeCreature({
    x: 100, y: 100, heading: 0, energy: 50,
    dna: { speed: 2, vision: 100, metabolism: 0, aggression: 0.9, size: 5 },
  });
  const prey = makeCreature({
    id: 2, x: 130, y: 100, heading: Math.PI, energy: 40,
    dna: { speed: 1, vision: 10, metabolism: 0, aggression: 0.1, size: 2 },
  });
  isolate(world, pred, prey);
  let t = 0;
  for (; t < 300 && !prey.dead; t++) tick(world);
  assert.ok(prey.dead, `prey should be killed by ${t} ticks`);
  assert.ok(t < 150, `predation should be prompt, took ${t} ticks`);
  assert.ok(pred.energy > 50, `predator should net energy, got ${pred.energy}`);
  assert.ok(pred.gain > 0, 'predator should have recorded prey energy gain');
  assert.equal(world.creatures.length, 1, 'dead prey is removed from the world');
  assert.equal(world.creatures[0], pred);
});

test('predation rule: size + 1 must exceed prey size, else no hunting', () => {
  const world = createWorld(2);
  const small = makeCreature({
    x: 100, y: 100, heading: 0, energy: 50,
    dna: { speed: 2, vision: 100, metabolism: 0, aggression: 0.9, size: 2 }, // 2+1=3
  });
  const big = makeCreature({
    id: 2, x: 130, y: 100, heading: Math.PI, energy: 40,
    dna: { speed: 1, vision: 10, metabolism: 0, aggression: 0.1, size: 3.5 }, // 3 > 3.5 is false
  });
  isolate(world, small, big);
  for (let i = 0; i < 100; i++) tick(world);
  assert.equal(small.state, 'WANDER', 'no edible target -> no HUNT state');
  assert.equal(big.energy, 40, 'uneatable prey loses nothing');
  assert.ok(!big.dead, 'too-big prey must survive');
});

test('flee: creature turns and moves directly away from a visible higher-aggression creature', () => {
  const world = createWorld(3);
  const prey = makeCreature({
    x: 100, y: 100, heading: 0, energy: 50,
    dna: { speed: 2, vision: 60, metabolism: 0, aggression: 0.1, size: 2 },
  });
  const pred = makeCreature({
    id: 2, x: 130, y: 100, heading: Math.PI, energy: 50,
    dna: { speed: 1, vision: 100, metabolism: 0, aggression: 0.9, size: 5 },
  });
  isolate(world, prey, pred);
  tick(world);
  assert.equal(prey.state, 'FLEE', 'prey must flee a visible higher-aggression creature');
  // Prey started heading 0 (facing the predator on its +x side); it must be
  // turning toward PI (straight away), not toward it.
  assert.ok(prey.heading > 0.3 && prey.heading < Math.PI, `heading ${prey.heading}`);
  for (let i = 1; i < 12; i++) tick(world);
  assert.ok(prey.x < 95, `prey should have moved away (-x), x=${prey.x}`);
});

test('hunt disengages out of vision range, re-engages in range', () => {
  const world = createWorld(4);
  const pred = makeCreature({
    x: 100, y: 100, heading: 0, energy: 50,
    dna: { speed: 1, vision: 30, metabolism: 0, aggression: 0.9, size: 5 },
  });
  const prey = makeCreature({
    id: 2, x: 160, y: 100, heading: Math.PI, energy: 40,
    dna: { speed: 1, vision: 10, metabolism: 0, aggression: 0.1, size: 2 },
  });
  isolate(world, pred, prey);
  tick(world);
  assert.equal(pred.state, 'WANDER', 'prey out of vision (60px > 30) -> no HUNT');
  prey.x = 120; // now 20px away, inside vision 30 (bite range is 7, so no bite)
  tick(world);
  assert.equal(pred.state, 'HUNT', 'prey in vision -> HUNT');
  assert.equal(prey.energy, 40, 'no bite at 20px');
});

test('flee disengages when the predator leaves vision range', () => {
  const world = createWorld(5);
  const prey = makeCreature({
    x: 100, y: 100, heading: 0, energy: 50,
    dna: { speed: 2, vision: 40, metabolism: 0, aggression: 0.1, size: 2 },
  });
  const pred = makeCreature({
    id: 2, x: 120, y: 100, heading: Math.PI, energy: 50,
    dna: { speed: 1, vision: 100, metabolism: 0, aggression: 0.9, size: 5 },
  });
  isolate(world, prey, pred);
  tick(world);
  assert.equal(prey.state, 'FLEE');
  pred.x = 600; // now ~625px toroidally away, far beyond vision 40
  pred.y = 500;
  tick(world);
  assert.equal(prey.state, 'WANDER', 'predator out of vision -> flee ends');
});

test('FLEE beats HUNT: a carnivore flees a stronger predator even when prey is visible', () => {
  const world = createWorld(6);
  const c = makeCreature({
    x: 100, y: 100, heading: 0, energy: 50,
    dna: { speed: 2, vision: 80, metabolism: 0, aggression: 0.7, size: 5 },
  });
  const snack = makeCreature({
    id: 2, x: 130, y: 100, heading: Math.PI, energy: 40,
    dna: { speed: 1, vision: 10, metabolism: 0, aggression: 0.1, size: 2 },
  });
  const apex = makeCreature({
    id: 3, x: 60, y: 100, heading: 0, energy: 50,
    dna: { speed: 1, vision: 80, metabolism: 0, aggression: 0.95, size: 6 },
  });
  isolate(world, c, snack, apex);
  tick(world);
  assert.equal(c.state, 'FLEE', 'a stronger predator in vision outranks the hunt');
  assert.ok(!snack.dead, 'c must not have bitten while fleeing');
});

test('kitchen sink: 3000-tick seeded run keeps all energy/position invariants', () => {
  const world = createWorld(1);
  let maxPop = 0;
  for (let i = 0; i < 3000; i++) {
    tick(world);
    maxPop = Math.max(maxPop, world.creatures.length);
    assert.ok(world.plantPool >= 0 && world.plantPool <= PLANT_POOL_MAX,
      `tick ${world.tick}: plant pool out of bounds: ${world.plantPool}`);
    for (const c of world.creatures) {
      assert.ok(Number.isFinite(c.x) && c.x >= 0 && c.x < W,
        `tick ${world.tick}: bad x ${c.x}`);
      assert.ok(Number.isFinite(c.y) && c.y >= 0 && c.y < H,
        `tick ${world.tick}: bad y ${c.y}`);
      assert.ok(Number.isFinite(c.energy) && c.energy >= 0 && c.energy <= MAX_ENERGY,
        `tick ${world.tick}: bad energy ${c.energy}`);
    }
  }
  assert.ok(maxPop <= 500, `population blew up: max ${maxPop}`);
  console.log(`  e2e: 3000 ticks, final pop ${world.creatures.length}, max pop ${maxPop}`);
});
