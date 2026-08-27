// M12: determinism regression — same seed, two worlds, identical state
// after N ticks. The sim's shareable-seed claim (W1) depends on it, so this
// is the guard: any nondeterministic source (Math.random, Date.now, unstable
// iteration order) that lets the two runs diverge fails here.
// Note: the only Math.random in the codebase is render.js screen shake —
// visual only, outside the pure world.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, tick } from '../src/world.js';

// Full projection of the state that drives the future: every field that
// feeds the next tick. Floats round-trip through JSON losslessly, so string
// equality is a strict bit-equality check.
function snap(w) {
  return JSON.stringify({
    tick: w.tick,
    plantPool: w.plantPool,
    creatureSeq: w.creatureSeq,
    births: w.births,
    deaths: w.deaths,
    records: w.records.data,
    creatures: w.creatures.map((c) => [
      c.id, c.x, c.y, c.heading, c.energy, c.gain, c.spent, c.offspring,
      c.lineageId, c.generation, c.bornTick, c.state, c.dead, c.dna,
    ]),
    plants: w.plants.map((p) => [p.x, p.y, p.energy]),
    zones: w.effects.zones.map((z) => [z.kind, z.x, z.y, z.r, z.power, z.ttl]),
  });
}

const TICKS = 600;

test(`same seed, two worlds: identical state after ${TICKS} ticks`, () => {
  const a = createWorld(7);
  const b = createWorld(7);
  for (let i = 0; i < TICKS; i++) {
    tick(a);
    tick(b);
  }
  assert.equal(snap(a), snap(b));
  // The run must have actually exercised the sim, not just idled: births,
  // deaths, and plant turnover must all have happened by tick 600.
  assert.ok(a.births > 0, 'expected births in 600 ticks');
  assert.ok(a.deaths.starve + a.deaths.predation > 0, 'expected deaths in 600 ticks');
  assert.ok(a.plants.length > 0, 'expected live plants at tick 600');
  assert.ok(a.creatures.length > 0, 'expected live creatures at tick 600');
});

test('different seeds, same ticks: different state', () => {
  const a = createWorld(7);
  const b = createWorld(8);
  for (let i = 0; i < TICKS; i++) {
    tick(a);
    tick(b);
  }
  assert.notEqual(snap(a), snap(b));
});
