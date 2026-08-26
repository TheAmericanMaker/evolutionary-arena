// Hazard zones + Impact (M9). Zones are circular effects with a power and a
// ttl, owned by the world (world.effects) and ticked inside world.tick().
// Decisions:
// - Kinds: scorch (from every impact: continuous energy drain x power with
//   distance falloff, blocks sprouting and plant growth) and rad (severity
//   4 only: long-lived mutagenic cloud — offspring mutation rate x up to 10
//   at the core, decaying with ttl — plus a slow drain). M10 will add
//   feast/shield/fertility boons to the same layer.
// - Impact severity s in 1..4: radius R = 40s + 20 (60/100/140/180 px).
//   Instant blast: everything within 0.5R is killed outright; 0.5R..R takes
//   25s x (1 - d/R) energy damage (creatures and plants alike).
// - Terrain scars (user request: the big ones change terrain):
//   s1-2 leave no scar; s3 scorches the crater (tiles within 0.6R -> scorched);
//   s4 turns the core (0.45R) to rock — impassable — with a scorched rim out
//   to 0.75R, and adds the rad cloud.
// - All geometry is toroidal (the world wraps).

import { W, H } from './world.js';
import { toroidDist } from './spatial.js';
import { TILE } from './terrain.js';

export const impactRadius = (s) => 40 * s + 20;

const SCORCH_DRAIN = 1.5;  // energy/tick at the core, x power, x falloff
const SCORCH_TTL = 150;    // ticks, x severity
const RAD_DRAIN = 0.03;    // slow constant background drain inside the cloud
const RAD_TTL = 900;
const RAD_MULT = 9;        // mutation-rate multiplier at a fresh core: 1+9 = 10

export function createEffects() {
  const zones = [];
  return {
    zones,
    add(kind, x, y, r, power, ttl) {
      zones.push({ kind, x, y, r, power, ttl, maxTtl: ttl });
    },
    // Called once per world tick: age and prune.
    tick() {
      for (const z of zones) z.ttl -= 1;
      for (let i = zones.length - 1; i >= 0; i--) {
        if (zones[i].ttl <= 0) zones.splice(i, 1);
      }
    },
    // Continuous energy drain at a point (scorch + rad).
    drainAt(x, y) {
      let d = 0;
      for (const z of zones) {
        const dist = toroidDist(x, y, z.x, z.y, W, H);
        if (dist >= z.r) continue;
        const fall = 1 - dist / z.r;
        if (z.kind === 'scorch') d += SCORCH_DRAIN * z.power * fall;
        else if (z.kind === 'rad') d += RAD_DRAIN * z.power * fall;
      }
      return d;
    },
    // Mutation-rate multiplier at a point (rad clouds only, decaying with ttl).
    radMultAt(x, y) {
      let m = 1;
      for (const z of zones) {
        if (z.kind !== 'rad') continue;
        const dist = toroidDist(x, y, z.x, z.y, W, H);
        if (dist >= z.r) continue;
        m = Math.max(m, 1 + RAD_MULT * z.power * (1 - dist / z.r) * (z.ttl / z.maxTtl));
      }
      return m;
    },
    // Hazard ground blocks sprouting and freezes plant growth.
    blocksSprout(x, y) {
      for (const z of zones) {
        if (z.kind !== 'scorch' && z.kind !== 'rad') continue;
        if (toroidDist(x, y, z.x, z.y, W, H) < z.r) return true;
      }
      return false;
    },
  };
}

export function impact(world, x, y, severity) {
  const s = Math.max(1, Math.min(4, Math.round(severity)));
  const R = impactRadius(s);
  const w = world;
  for (const c of w.creatures) {
    if (c.dead) continue;
    const d = toroidDist(x, y, c.x, c.y, W, H);
    if (d >= R) continue;
    if (d < R * 0.5) { c.dead = true; c.deathCause = 'hazard'; }
    else {
      c.energy = Math.max(0, c.energy - 25 * s * (1 - d / R));
      if (c.energy <= 0) { c.dead = true; c.deathCause = 'hazard'; }
    }
  }
  for (const p of w.plants) {
    if (p.dead) continue;
    const d = toroidDist(x, y, p.x, p.y, W, H);
    if (d < R) {
      p.energy -= 25 * s * (1 - d / R);
      if (p.energy <= 0) p.dead = true;
    }
  }
  w.effects.add('scorch', x, y, R, s, SCORCH_TTL * s);
  if (s >= 4) w.effects.add('rad', x, y, R * 1.25, 1, RAD_TTL);
  scarTerrain(w, x, y, s, R);
  return s;
}

// s3: scorch the crater. s4: rock core + scorched rim. Tiles are hit-tested
// at their centers with toroidal distance.
function scarTerrain(w, x, y, s, R) {
  if (s < 3) return;
  const t = w.terrain;
  for (let ty = 0; ty < t.rows; ty++) {
    for (let tx = 0; tx < t.cols; tx++) {
      const px = (tx + 0.5) * TILE;
      const py = (ty + 0.5) * TILE;
      const d = toroidDist(x, y, px, py, W, H);
      if (s === 3) {
        if (d < R * 0.6) t.paint(px, py, 5);
      } else if (d < R * 0.45) {
        t.paint(px, py, 2);
      } else if (d < R * 0.75) {
        t.paint(px, py, 5);
      }
    }
  }
}
