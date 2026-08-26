// M9 hazard layer: impact blast, terrain scars, scorch drain/growth-freeze,
// rad cloud mutation multiplier, death/birth accounting in world.tick().
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createWorld, tick } from '../src/world.js';
import { clearTerrain, BIOMES } from '../src/terrain.js';
import { impact, impactRadius } from '../src/effects.js';
import { createCreature, updateCreature } from '../src/entity.js';
import { HERBIVORE_DNA, CARNIVORE_DNA } from '../src/dna.js';

// Controlled-creature helper: createWorld's 20 random spawns make blast
// geometry tests flaky, so we clear and place exactly what we need.
function fresh(seed = 7) {
  const w = createWorld(seed);
  clearTerrain(w.terrain);
  w.creatures.length = 0;
  w.plants.length = 0;
  return w;
}

function put(w, x, y, dna = HERBIVORE_DNA, energy = 60, lineage = 'T') {
  const c = createCreature({
    id: w.creatureSeq++, x, y, heading: 0, dna: { ...dna },
    energy, lineageId: lineage, generation: 1, bornTick: 0,
  });
  w.creatures.push(c);
  return c;
}

const near = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;

test('impact radius scales with severity', () => {
  assert.equal(impactRadius(1), 60);
  assert.equal(impactRadius(2), 100);
  assert.equal(impactRadius(3), 140);
  assert.equal(impactRadius(4), 180);
});

test('s2: kills within 0.5R, damage falls off to R, outside is untouched', () => {
  const w = fresh();
  const A = put(w, 482, 320);            // d=30  < 0.5R=50  -> killed
  const B = put(w, 592, 320);            // d=80  in 50..100 -> 25*2*(1-0.8)=10 dmg
  const C = put(w, 652, 320);            // d=140 > R=100    -> untouched
  impact(w, 512, 320, 2);
  assert.equal(A.dead, true, 'core kill');
  assert.equal(A.deathCause, 'hazard');
  assert.equal(B.dead, false, 'ring damages, does not kill');
  assert.ok(near(B.energy, 50), `ring damage ${B.energy} ~= 50`);
  assert.equal(C.energy, 60, 'outside blast radius untouched');

  tick(w); // deaths tally on the next tick
  assert.equal(w.deaths.hazard, 1, 'hazard death tallied');
  assert.equal(w.creatures.length, 2, 'killed creature filtered out');
});

test('s2 blast leaves a scorch zone that drains and blocks growth', () => {
  const w = fresh();
  impact(w, 512, 320, 2);
  const z = w.effects.zones[0];
  assert.equal(z.kind, 'scorch');
  assert.equal(z.r, 100);
  assert.equal(z.power, 2);
  assert.equal(z.ttl, 300);

  // Core drain = SCORCH_DRAIN * power * 1 = 3; falloff hits 0 at the rim.
  assert.ok(near(w.effects.drainAt(512, 320), 3), 'core drain 3/tick');
  assert.ok(near(w.effects.drainAt(607, 320), 0.15), 'near-rim drain falls off (d=95)');
  assert.equal(w.effects.drainAt(612, 320), 0, 'at the rim: no drain');
  assert.equal(w.effects.drainAt(700, 320), 0, 'outside the zone: no drain');

  // A creature with 5 energy dies to the drain within two ticks, cause hazard.
  const victim = put(w, 512, 320, HERBIVORE_DNA, 5);
  tick(w);
  tick(w);
  assert.equal(victim.dead, true, 'drained to death');
  assert.equal(victim.deathCause, 'hazard', 'died to the hazard, not metabolism');

  // Hazard ground freezes plant growth; open ground a tile away still grows.
  const burned = { x: 512, y: 320, energy: 10 };
  const fresh2 = { x: 700, y: 320, energy: 10 };
  w.plants.push(burned, fresh2);
  tick(w);
  assert.equal(burned.energy, 10, 'plant growth frozen on scorch');
  assert.equal(fresh2.energy, 11, 'plant grows on open ground');
  assert.equal(w.effects.blocksSprout(512, 320), true);
  assert.equal(w.effects.blocksSprout(700, 320), false);
});

test('scorch zone expires when its ttl runs out', () => {
  const w = fresh();
  impact(w, 512, 320, 1); // R=60, ttl=150
  assert.equal(w.effects.zones.length, 1);
  for (let i = 0; i < 149; i++) tick(w);
  assert.equal(w.effects.zones.length, 1, 'zone alive until ttl expires');
  tick(w);
  assert.equal(w.effects.zones.length, 0, 'zone pruned at ttl 0');
  assert.equal(w.effects.blocksSprout(512, 320), false, 'ground recovered');
});

test('s3 scars the crater to scorched (passable, unplantable) dead ground', () => {
  const w = fresh();
  impact(w, 512, 320, 3); // R=140, scorch band 0.6R=84
  assert.equal(w.terrain.typeAt(512, 320), 5, 'crater floor scorched');
  assert.equal(w.terrain.typeAt(584, 320), 5, 'inside 0.6R scorched');
  assert.equal(w.terrain.typeAt(624, 320), 0, 'beyond 0.6R untouched');
  assert.equal(w.terrain.typeAt(200, 320), 0, 'far tile untouched');
  const b = BIOMES[5];
  assert.equal(b.passable, true, 'scorched is passable');
  assert.equal(b.plantMult, 0, 'scorched is unplantable');
  assert.ok(w.terrain.tiles.filter((t) => t === 5).length > 10, 'a real crater, not one tile');
});

test('s4: rock core, scorched rim, rad cloud', () => {
  const w = fresh();
  impact(w, 512, 320, 4); // R=180, core 0.45R=81, rim to 0.75R=135
  assert.equal(w.terrain.typeAt(512, 320), 2, 'core is rock');
  assert.equal(w.terrain.isPassable(512, 320), false, 'core is impassable');
  assert.equal(w.terrain.typeAt(624, 320), 5, 'rim is scorched');
  assert.equal(w.terrain.typeAt(688, 320), 0, 'beyond the rim untouched');
  const kinds = w.effects.zones.map((z) => z.kind).sort();
  assert.deepEqual(kinds, ['rad', 'scorch'], 's4 adds the rad cloud');
  const rad = w.effects.zones.find((z) => z.kind === 'rad');
  assert.equal(rad.r, 225);
  assert.equal(rad.ttl, 900);

  // A creature in the core is killed by the blast before the terrain matters.
  const victim = put(w, 512, 320);
  impact(w, 512, 320, 4);
  assert.equal(victim.dead, true);
  assert.equal(victim.deathCause, 'hazard');
});

test('rad cloud amplifies mutation at the core and decays with ttl', () => {
  const w = fresh();
  w.effects.add('rad', 512, 320, 225, 1, 900);
  assert.ok(near(w.effects.radMultAt(512, 320), 10), 'fresh core: x10');
  assert.ok(w.effects.radMultAt(624, 320) > 4, 'mid cloud: strongly amplified');
  assert.ok(near(w.effects.radMultAt(800, 320), 1), 'outside the cloud: x1');
  for (let i = 0; i < 450; i++) tick(w);
  // 1 + 9 * (1 - 0) * (450/900) = 5.5 at half ttl.
  assert.ok(near(w.effects.radMultAt(512, 320), 5.5), 'half ttl: ~x5.5');
  assert.ok(near(w.effects.drainAt(512, 320), 0.03), 'rad adds a slow constant drain');
});

test('offspring bred inside a rad cloud mutate ~10x more than control', () => {
  const wRad = fresh();
  const wCtl = fresh();
  wRad.settings.mutationRate = 0.1;
  wCtl.settings.mutationRate = 0.1;
  wRad.effects.add('rad', 512, 320, 225, 1, 900);

  const pRad = put(wRad, 512, 320, HERBIVORE_DNA, 120, 'R');
  const pCtl = put(wCtl, 100, 100, HERBIVORE_DNA, 120, 'C');
  // Both worlds share the seed and the same ops, so the rng draws line up.
  wRad.creatureGrid.clear(); wRad.creatureGrid.insert(pRad);
  wCtl.creatureGrid.clear(); wCtl.creatureGrid.insert(pCtl);
  const childRad = updateCreature(pRad, wRad);
  const childCtl = updateCreature(pCtl, wCtl);
  assert.ok(childRad, 'rad parent budded');
  assert.ok(childCtl, 'control parent budded');

  const delta = (child, parent) =>
    Object.keys(parent).reduce((m, k) => Math.max(m, Math.abs(child[k] - parent[k])), 0);
  const dRad = delta(childRad.dna, pRad.dna);
  const dCtl = delta(childCtl.dna, pCtl.dna);
  assert.ok(dRad > 3 * dCtl, `rad delta ${dRad} >> control delta ${dCtl}`);
});

test('tick() tallies deaths by cause and births by budding', () => {
  const w = fresh();
  const starved = put(w, 50, 50, HERBIVORE_DNA, 0.05, 'S'); // metabolism finishes it
  const predator = put(w, 100, 100, CARNIVORE_DNA, 60, 'P');
  const prey = put(w, 100, 100, HERBIVORE_DNA, 25, 'Q');    // one bite = 25 loss
  const scorched = put(w, 512, 320, HERBIVORE_DNA, 1, 'H');
  const breeder = put(w, 900, 500, HERBIVORE_DNA, 120, 'B'); // buds this tick

  w.effects.add('scorch', 512, 320, 100, 2, 300);

  tick(w);
  assert.equal(starved.dead, true, 'starved');
  assert.equal(starved.deathCause, 'starve');
  assert.equal(prey.dead, true, 'prey finished off by the bite');
  assert.equal(prey.deathCause, 'predation');
  assert.equal(scorched.dead, true, 'scorch drained it');
  assert.equal(scorched.deathCause, 'hazard');
  assert.equal(w.deaths.starve, 1);
  assert.equal(w.deaths.predation, 1);
  assert.equal(w.deaths.hazard, 1);
  assert.equal(w.deaths.user, 0);
  assert.equal(w.births, 1, 'breeder produced one offspring');
  assert.ok(w.creatures.some((c) => c.lineageId === 'B' && c.generation === 2), 'offspring present');
});
