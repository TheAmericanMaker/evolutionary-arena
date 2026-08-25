// Creature & plant creation + per-tick behavior (pure-ish, no canvas).
// M4 state machine, precedence FLEE > HUNT > SEEK_FOOD > WANDER
// (spec §4.4): steer -> (bite if hunting in range) -> move -> eat plants on
// contact -> bud at threshold -> pay metabolism -> die at 0 energy.
// Decisions:
// - Reproduction is checked BEFORE the metabolism drain: energy clamps at 120
//   and metabolism always subtracts, so a post-drain ">= 120" check would be
//   unreachable (spec §4.2/§4.4 intent: survive to threshold, then bud).
// - Energy clamps to [0, 120]; death when it reaches 0.
// - Eat radius = plantRadius(plant.energy) + dna.size; one plant per tick.
// - Idle wander wiggle = (rng.next() - 0.5) * WIGGLE rad/tick; steering is
//   clamped to MAX_TURN rad/tick. All randomness via world.rng (deterministic).
// - M4 predation: a bite costs the predator ATTACK_COST energy (it must hold
//   >= ATTACK_COST to bite) and removes a fixed PREY_LOSS chunk from the prey
//   (or all that remains, which kills it). A fixed chunk — not a fraction of
//   current energy — so predation can actually kill: a proportional transfer
//   would asymptote toward 0 and no prey would ever die.
// - Bite range = predator.size + prey.size (bodies touching); predation
//   eligibility follows spec §4.4: predator.size + 1 > prey.size.
// - FLEE target = nearest creature with strictly HIGHER aggression within
//   vision (size irrelevant); desired heading points directly away from it.
// - HUNT target = nearest creature the predator can eat within vision.
// - c.state records this tick's decision ('FLEE'|'HUNT'|'SEEK_FOOD'|'WANDER')
//   so the state machine is observable in tests.

import { mutateDna, isCarnivore } from './dna.js';
import { toroidDist, toroidAngle } from './spatial.js';
import { W, H, DT, wrap, PLANT_MAX_ENERGY } from './world.js';

export const MAX_ENERGY = 120;
export const REPRO_THRESHOLD = 120;
export const BIRTH_COST = 40;
export const OFFSPRING_ENERGY = 40;
export const ATTACK_COST = 10;
export const PREY_LOSS = 30;
const MAX_TURN = 0.35;
const WIGGLE = 0.25;

export function plantRadius(energy) {
  return 1.5 + energy * 0.25;
}

export function createCreature({ id, x, y, heading, dna, energy, lineageId, generation, bornTick }) {
  return {
    id, x, y, heading, dna, energy, lineageId, generation, bornTick,
    gain: 0, spent: 0, offspring: 0, dead: false, state: 'WANDER',
  };
}

function turnToward(heading, desired, maxTurn) {
  let diff = (desired - heading) % (2 * Math.PI);
  if (diff > Math.PI) diff -= 2 * Math.PI;
  if (diff < -Math.PI) diff += 2 * Math.PI;
  return heading + Math.max(-maxTurn, Math.min(maxTurn, diff));
}

function senseNearestPlant(c, plantGrid) {
  let best = null;
  let bestD = Infinity;
  for (const p of plantGrid.queryCircle(c.x, c.y, c.dna.vision)) {
    if (p.dead) continue;
    const d = toroidDist(c.x, c.y, p.x, p.y, W, H);
    if (d < bestD) { bestD = d; best = p; }
  }
  return best;
}

// Nearest creature with strictly higher aggression within vision (spec §4.4:
// size is irrelevant to being preyed upon; fitness/aggression is).
function sensePredator(c, creatureGrid) {
  let best = null;
  let bestD = Infinity;
  for (const o of creatureGrid.queryCircle(c.x, c.y, c.dna.vision)) {
    if (o === c || o.dead || o.dna.aggression <= c.dna.aggression) continue;
    const d = toroidDist(c.x, c.y, o.x, o.y, W, H);
    if (d < bestD) { bestD = d; best = o; }
  }
  return best;
}

// Nearest creature the predator can eat (predator.size + 1 > prey.size,
// spec §4.4) within vision. Null for vegetarians.
function sensePrey(c, creatureGrid) {
  if (!isCarnivore(c.dna)) return null;
  let best = null;
  let bestD = Infinity;
  for (const o of creatureGrid.queryCircle(c.x, c.y, c.dna.vision)) {
    if (o === c || o.dead) continue;
    if (c.dna.size + 1 <= o.dna.size) continue;
    const d = toroidDist(c.x, c.y, o.x, o.y, W, H);
    if (d < bestD) { bestD = d; best = o; }
  }
  return best;
}

export function updateCreature(c, world) {
  const { rng, plantGrid, creatureGrid } = world;
  const predator = sensePredator(c, creatureGrid);
  const prey = predator ? null : sensePrey(c, creatureGrid);
  const target = predator || prey ? null : senseNearestPlant(c, plantGrid);

  let desired = null;
  if (predator) {
    c.state = 'FLEE';
    desired = toroidAngle(predator.x, predator.y, c.x, c.y, W, H);
  } else if (prey) {
    c.state = 'HUNT';
    desired = toroidAngle(c.x, c.y, prey.x, prey.y, W, H);
  } else if (target) {
    c.state = 'SEEK_FOOD';
    desired = toroidAngle(c.x, c.y, target.x, target.y, W, H);
  } else {
    c.state = 'WANDER';
  }

  // Bite: in range and the cost is affordable. The bite replaces movement
  // for this tick (positions are tick-start, matching the grid).
  let bit = false;
  if (prey && c.energy >= ATTACK_COST &&
      toroidDist(c.x, c.y, prey.x, prey.y, W, H) <= c.dna.size + prey.dna.size) {
    bit = true;
    c.energy -= ATTACK_COST;
    const loss = Math.min(PREY_LOSS, prey.energy);
    prey.energy -= loss;
    c.energy = Math.min(MAX_ENERGY, c.energy + loss);
    c.gain += loss;
    if (prey.energy <= 0) prey.dead = true;
  }
  if (!bit) {
    if (desired !== null) {
      c.heading = turnToward(c.heading, desired, MAX_TURN);
    } else {
      c.heading += (rng.next() - 0.5) * WIGGLE;
    }
    c.x = wrap(c.x + Math.cos(c.heading) * c.dna.speed * DT, W);
    c.y = wrap(c.y + Math.sin(c.heading) * c.dna.speed * DT, H);
  }

  for (const p of plantGrid.queryCircle(c.x, c.y, c.dna.size + plantRadius(PLANT_MAX_ENERGY))) {
    if (p.dead) continue;
    if (toroidDist(c.x, c.y, p.x, p.y, W, H) <= plantRadius(p.energy) + c.dna.size) {
      c.energy = Math.min(MAX_ENERGY, c.energy + p.energy);
      c.gain += p.energy;
      p.dead = true;
      break;
    }
  }

  if (c.energy >= REPRO_THRESHOLD) {
    c.energy -= BIRTH_COST;
    c.offspring += 1;
    return createCreature({
      id: world.creatureSeq++,
      x: wrap(c.x + (rng.next() - 0.5) * 24, W),
      y: wrap(c.y + (rng.next() - 0.5) * 24, H),
      heading: rng.next() * Math.PI * 2,
      dna: mutateDna(c.dna, world.settings.mutationRate, rng),
      energy: OFFSPRING_ENERGY,
      lineageId: c.lineageId,
      generation: c.generation + 1,
      bornTick: world.tick,
    });
  }

  c.energy = Math.max(0, c.energy - c.dna.metabolism);
  c.spent += c.dna.metabolism;
  if (c.energy <= 0) c.dead = true;
  return null;
}
