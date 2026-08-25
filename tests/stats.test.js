// M4 stats tests: veg/carn split, energy sum, rolling window cap.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStats, createRecords, fitness, WINDOW } from '../src/stats.js';
import { createWorld, tick } from '../src/world.js';
import { createCreature } from '../src/entity.js';

function c(energy, aggression) {
  return createCreature({
    id: 1, x: 0, y: 0, heading: 0,
    dna: { speed: 1, vision: 10, metabolism: 0.1, aggression, size: 2 },
    energy, lineageId: 'L1', generation: 1, bornTick: 0,
  });
}

test('record splits veg/carn at the 0.55 aggression threshold and sums energy', () => {
  const world = { tick: 5, creatures: [
    c(30, 0.2),   // veg
    c(20, 0.55),  // boundary: carnivore
    c(10, 0.9),   // carn
  ] };
  const stats = createStats();
  stats.record(world);
  assert.deepEqual(stats.samples[0], { tick: 5, veg: 1, carn: 2, energy: 60 });
});

test('window keeps only the last WINDOW samples, evicting the oldest', () => {
  const world = { tick: 0, creatures: [c(10, 0)] };
  const stats = createStats();
  for (let i = 0; i < WINDOW + 5; i++) {
    world.tick += 1;
    stats.record(world);
  }
  assert.equal(stats.samples.length, WINDOW);
  assert.equal(stats.samples[0].tick, 6);
  assert.equal(stats.samples[WINDOW - 1].tick, WINDOW + 5);
});

test('world.tick feeds the stats window one sample per tick', () => {
  const world = createWorld(11);
  for (let i = 0; i < 10; i++) tick(world);
  assert.equal(world.stats.samples.length, 10);
  const last = world.stats.samples[9];
  assert.equal(last.tick, 10);
  const { veg, carn } = world.creatures.reduce(
    (a, cr) => { if (cr.dna.aggression >= 0.55) a.carn += 1; else a.veg += 1; return a; },
    { veg: 0, carn: 0 },
  );
  assert.equal(last.veg, veg);
  assert.equal(last.carn, carn);
  assert.ok(last.energy >= 0);
});

test('fitness = gain - spent + offspring', () => {
  assert.equal(fitness({ gain: 50, spent: 20, offspring: 2 }), 32);
});

test('records track best fitness, longest lineage, peak population', () => {
  const rec = createRecords();
  rec.note({ tick: 1, creatures: [{ gain: 10, spent: 4, offspring: 0, generation: 3, lineageId: 'L1', dna: { speed: 1, vision: 10, metabolism: 0.1, aggression: 0.5, size: 2 } }] });
  assert.equal(rec.data.bestFitness.value, 6);
  assert.equal(rec.data.bestFitness.dna.speed, 1, 'best fitness keeps a DNA snapshot');
  assert.equal(rec.data.longestLineage.gen, 3);
  assert.deepEqual(rec.data.peakPopulation, { pop: 1, tick: 1 });
  rec.note({ tick: 2, creatures: [{ gain: 10, spent: 4, offspring: 0, generation: 5, lineageId: 'L9' }] });
  assert.equal(rec.data.bestFitness.value, 6, 'equal fitness does not replace the record');
  assert.equal(rec.data.longestLineage.gen, 5);
  assert.equal(rec.data.longestLineage.lineageId, 'L9');
  assert.deepEqual(rec.data.peakPopulation, { pop: 1, tick: 1 }, 'pop never grew');
});

test('records.load merges a stored snapshot, keeping the better per field', () => {
  const rec = createRecords();
  rec.load({
    bestFitness: { value: 99, dna: { speed: 2 }, lineageId: 'L5', tick: 10 },
    longestLineage: { gen: 12, lineageId: 'L2', tick: 9 },
    peakPopulation: { pop: 40, tick: 8 },
  });
  assert.equal(rec.data.bestFitness.value, 99);
  assert.equal(rec.data.longestLineage.gen, 12);
  assert.equal(rec.data.peakPopulation.pop, 40);
  rec.note({ tick: 1, creatures: [{ gain: 200, spent: 0, offspring: 0, generation: 2, lineageId: 'L1' }] });
  assert.equal(rec.data.bestFitness.value, 200, 'newer better fitness wins');
  assert.equal(rec.data.longestLineage.gen, 12, 'stored longer lineage kept');
  assert.equal(rec.data.peakPopulation.pop, 40, 'stored peak kept');
  rec.load(null); // must not throw
  rec.reset();
  assert.equal(rec.data.bestFitness, null);
  assert.equal(rec.data.longestLineage, null);
  assert.deepEqual(rec.data.peakPopulation, { pop: 0, tick: 0 });
});
