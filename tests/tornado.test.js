// M10: tornado hazard + feast/perk boons.
// The tornado is a pure function of the world (effects.tickTornado), so the
// corridor/expiry tests drive it directly; the boon tests use full world
// ticks where the interesting behavior (energy gain, bud threshold) lives.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  startTornado, tickTornado, feast, perk,
  TORNADO_SPEED, TORNADO_RADIUS, TORNADO_LINGER, FEAST_R, FERT_R,
} from '../src/effects.js';
import { createWorld, tick } from '../src/world.js';
import { clearTerrain } from '../src/terrain.js';
import { createCreature, updateCreature } from '../src/entity.js';
import { HERBIVORE_DNA } from '../src/dna.js';

// A world with the user's terrain edits undone and the population emptied,
// so tests can place exactly one plant/creature each (mirrors
// tests/effects.test.js).
function fresh(seed = 11) {
  const w = createWorld(seed);
  clearTerrain(w.terrain);
  w.creatures.length = 0;
  w.plants.length = 0;
  return w;
}

function put(w, x, y, energy = 60, dna = HERBIVORE_DNA) {
  const c = createCreature({
    id: w.creatureSeq++, x, y, heading: 0, dna: { ...dna },
    energy, lineageId: 'T', generation: 1, bornTick: 0,
  });
  w.creatures.push(c);
  return c;
}

test('a click (no drag) releases no tornado', () => {
  const w = fresh();
  assert.equal(startTornado(w, [{ x: 200, y: 200 }]), null, 'single point');
  assert.equal(startTornado(w, [{ x: 200, y: 200 }, { x: 201, y: 200 }]), null, '2px path');
  assert.equal(w.tornado, null);
});

test('the tornado head travels the path at TORNADO_SPEED px/tick', () => {
  const w = fresh();
  startTornado(w, [{ x: 100, y: 320 }, { x: 300, y: 320 }]);
  assert.equal(w.tornado.total, 200);
  tickTornado(w);
  assert.equal(w.tornado.x, 106, 'one tick -> 6 px along');
  assert.equal(w.tornado.y, 320);
  for (let i = 0; i < 33; i++) tickTornado(w); // 34 ticks total = 204 px clamped
  assert.equal(w.tornado.x, 300, 'head clamps at the path end');
  assert.ok(w.tornado.linger > 0, 'it lingers at the end before expiring');
});

test('the corridor clears plants and damages creatures', () => {
  const w = fresh();
  startTornado(w, [{ x: 100, y: 320 }, { x: 400, y: 320 }]);
  w.plants.push({ x: 200, y: 320, energy: 20 }); // in the corridor
  w.plants.push({ x: 200, y: 200, energy: 20 }); // 120px off the path
  const victim = put(w, 150, 320, 5);
  const full = put(w, 300, 320, 120);
  const safe = put(w, 250, 200, 60);
  for (let i = 0; i < 100; i++) tickTornado(w); // 50 travel + 40 linger + slack
  assert.equal(w.tornado, null, 'the tornado is over');
  assert.equal(w.plants[0].dead, true, 'corridor plant cleared');
  assert.ok(!w.plants[1].dead, 'off-path plant untouched');
  assert.equal(victim.dead, true, 'low-energy creature in the corridor died');
  assert.equal(victim.deathCause, 'hazard');
  assert.equal(full.dead, true, 'a full-energy creature dies to a clean pass');
  assert.equal(full.deathCause, 'hazard');
  assert.equal(safe.dead, false);
  assert.equal(safe.energy, 60, 'creature outside the corridor unharmed');
});

test('the tornado expires after the path end plus its linger', () => {
  const w = fresh();
  startTornado(w, [{ x: 100, y: 320 }, { x: 220, y: 320 }]);
  assert.equal(w.tornado.total, 120, '20 ticks of travel');
  assert.equal(w.tornado.linger, TORNADO_LINGER);
  for (let i = 0; i < 60; i++) tickTornado(w); // 20 travel + 40 linger
  assert.equal(w.tornado, null, 'expired');
  for (let i = 0; i < 3; i++) tickTornado(w); // no-ops once null
  assert.equal(w.tornado, null);
});

test('feast drops a mature plant cluster and a gain zone', () => {
  const w = fresh();
  const n = feast(w, 300, 300);
  assert.equal(n, 8);
  assert.equal(w.plants.length, 8);
  for (const p of w.plants) assert.equal(p.energy, 20, 'mature plants');
  assert.ok(w.effects.zones.some((z) => z.kind === 'feast' && z.r === FEAST_R), 'feast zone');
  assert.ok(Math.abs(w.effects.gainAt(300, 300) - 1) < 0.01, 'full gain at the core');
  assert.equal(w.effects.gainAt(400, 300), 0, 'no gain outside the zone');
});

test('world.tick grants feast-zone energy', () => {
  const a = fresh();
  const b = fresh();
  const ca = put(a, 355, 300);
  put(b, 355, 300);
  feast(a, 300, 300);
  tick(a);
  tick(b);
  assert.ok(ca.energy > 60, 'inside the feast the creature net-gained');
  assert.ok(ca.energy > b.creatures[0].energy + 0.2, 'feast world gained more than the control');
});

test('perk halves the bud threshold at the core and falls off to 1', () => {
  const w = fresh();
  perk(w, 300, 300);
  assert.ok(Math.abs(w.effects.fertMultAt(300, 300) - 0.5) < 0.01, '0.5 at the core');
  const edge = 1 - 0.5 * (1 - 89 / FERT_R);
  assert.ok(Math.abs(w.effects.fertMultAt(389, 300) - edge) < 0.01, 'falloff near the rim');
  assert.equal(w.effects.fertMultAt(390, 300), 1, '1 at the rim');
  assert.equal(w.effects.fertMultAt(450, 300), 1, '1 outside');
});

test('a 70-energy creature buds in the fert core but not outside', () => {
  const wIn = fresh();
  perk(wIn, 300, 300);
  const pIn = put(wIn, 300, 300, 70);
  const child = updateCreature(pIn, wIn);
  assert.ok(child, 'buds at 70 inside the core (threshold 60)');
  assert.equal(child.generation, 2);
  // Reproduction returns before the metabolism drain, so the parent is
  // exactly 70 - BIRTH_COST.
  assert.equal(pIn.energy, 30, 'parent paid the 40 birth cost');
  const wOut = fresh();
  perk(wOut, 300, 300);
  const pOut = put(wOut, 100, 300, 70);
  assert.equal(updateCreature(pOut, wOut), null, '70 < 120 outside the zone');
});

test('boon zones expire on their ttls (feast outlives perk)', () => {
  const w = fresh();
  feast(w, 300, 300);
  perk(w, 500, 300);
  for (let i = 0; i < 240; i++) tick(w);
  assert.ok(w.effects.zones.some((z) => z.kind === 'feast'), 'feast survives 300 ticks');
  assert.equal(w.effects.zones.some((z) => z.kind === 'fert'), false, 'perk expired at 240');
  for (let i = 0; i < 60; i++) tick(w);
  assert.equal(w.effects.zones.length, 0, 'feast expired at 300');
});
