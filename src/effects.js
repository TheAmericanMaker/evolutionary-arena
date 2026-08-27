// Hazard + boon zones, Impact (M9), tornado + boons (M10). Zones are
// circular effects with a power and a ttl, owned by the world
// (world.effects) and ticked inside world.tick().
// Decisions:
// - Kinds: scorch (from every impact: continuous energy drain x power with
//   distance falloff, blocks sprouting and plant growth), rad (severity
//   4 only: long-lived mutagenic cloud — offspring mutation rate x up to 10
//   at the core, decaying with ttl — plus a slow drain), feast (M10 boon:
//   grants energy x falloff) and fert (M10 boon: lowers the bud threshold —
//   entity.js multiplies REPRO_THRESHOLD by fertMultAt).
// - Impact severity s in 1..4: radius R = 40s + 20 (60/100/140/180 px).
//   Instant blast: everything within 0.5R is killed outright; 0.5R..R takes
//   25s x (1 - d/R) energy damage (creatures and plants alike).
// - Terrain scars (user request: the big ones change terrain):
//   s1-2 leave no scar; s3 scorches the crater (tiles within 0.6R -> scorched);
//   s4 turns the core (0.45R) to rock — impassable — with a scorched rim out
//   to 0.75R, and adds the rad cloud.
// - M10 boons: feast(world, x, y) drops FEAST_PLANTS mature plants (energy
//   PLANT_MAX_ENERGY) in a disc of radius FEAST_CLUSTER around the drop
//   point — a user action, so it bypasses the plant pool and MAX_PLANTS the
//   same way brush plants do — plus a 'feast' zone (r=FEAST_R, ttl=FEAST_TTL)
//   granting FEAST_GAIN energy/tick x power x falloff (world.tick applies
//   the gain, capped at MAX_ENERGY). perk(world, x, y) adds a 'fert' zone
//   (r=FERT_R, ttl=FERT_TTL) that lowers the bud threshold: 1 - FERT_STRENGTH
//   x power x falloff, i.e. 0.5 at a fresh core -> 60 energy instead of 120.
// - M10 tornado: startTornado(world, pts) stores a polyline on the world
//   (world.tornado); tickTornado(world) — called from world.tick — advances
//   the head TORNADO_SPEED px/tick along the path. A corridor of
//   TORNADO_RADIUS around the head clears plants and deals TORNADO_DMG
//   energy/tick to creatures (deathCause 'hazard'). A full corridor pass is
//   ~7 ticks, so a full-energy creature (120) dies to a clean sweep while a
//   graze (1-3 ticks) only wounds — the tornado "catches" things it crosses.
//   At the path end the head lingers TORNADO_LINGER ticks, then
//   world.tornado = null. A path shorter than MIN_TORNADO px (a plain click,
//   no drag) releases nothing. Corridor geometry is toroidal; the path itself
//   is screen space (a drag across the seam draws one long chord).
// - All other geometry is toroidal (the world wraps).

import { W, H, wrap, PLANT_MAX_ENERGY } from './world.js';
import { toroidDist } from './spatial.js';
import { TILE } from './terrain.js';

export const impactRadius = (s) => 40 * s + 20;

const SCORCH_DRAIN = 1.5;  // energy/tick at the core, x power, x falloff
const SCORCH_TTL = 150;    // ticks, x severity
const RAD_DRAIN = 0.03;    // slow constant background drain inside the cloud
const RAD_TTL = 900;
const RAD_MULT = 9;        // mutation-rate multiplier at a fresh core: 1+9 = 10

// M10 boons.
const FEAST_GAIN = 1;      // energy/tick at a fresh feast core, x power, x falloff
export const FEAST_R = 80;
const FEAST_TTL = 300;
const FEAST_PLANTS = 8;
const FEAST_CLUSTER = 40;  // disc radius of the dropped plant cluster
export const FERT_R = 90;
const FERT_TTL = 240;
const FERT_STRENGTH = 0.5; // fresh core: bud threshold x (1 - 0.5) = 60 energy
// M10 tornado.
export const TORNADO_SPEED = 6;   // px/tick along the drawn path
export const TORNADO_RADIUS = 20; // corridor half-width
const TORNADO_DMG = 20;           // creature energy/tick inside the corridor
export const TORNADO_LINGER = 40; // ticks the head dwells at the path end
const MIN_TORNADO = 24;           // px of path needed to release (else a click cancels)

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
    // M10: energy grant at a point (feast zones only), x power x falloff.
    gainAt(x, y) {
      let g = 0;
      for (const z of zones) {
        if (z.kind !== 'feast') continue;
        const dist = toroidDist(x, y, z.x, z.y, W, H);
        if (dist >= z.r) continue;
        g += FEAST_GAIN * z.power * (1 - dist / z.r);
      }
      return g;
    },
    // M10: bud-threshold multiplier at a point (fert zones only):
    // 1 - FERT_STRENGTH x power x falloff; the deepest zone wins; 1 outside.
    fertMultAt(x, y) {
      let m = 1;
      for (const z of zones) {
        if (z.kind !== 'fert') continue;
        const dist = toroidDist(x, y, z.x, z.y, W, H);
        if (dist >= z.r) continue;
        m = Math.min(m, 1 - FERT_STRENGTH * z.power * (1 - dist / z.r));
      }
      return m;
    },
  };
}

// M10: drop a feast — a cluster of mature plants plus the grant zone.
// Returns the number of plants dropped.
export function feast(world, x, y) {
  const { rng } = world;
  for (let i = 0; i < FEAST_PLANTS; i++) {
    const a = rng.next() * Math.PI * 2;
    const r = Math.sqrt(rng.next()) * FEAST_CLUSTER;
    world.plants.push({
      x: wrap(x + Math.cos(a) * r, W),
      y: wrap(y + Math.sin(a) * r, H),
      energy: PLANT_MAX_ENERGY,
    });
  }
  world.effects.add('feast', x, y, FEAST_R, 1, FEAST_TTL);
  return FEAST_PLANTS;
}

// M10: drop a fertility boon — creatures inside bud at 60 energy in the core.
export function perk(world, x, y) {
  world.effects.add('fert', x, y, FERT_R, 1, FERT_TTL);
  return FERT_R;
}

// M10: store the drawn tornado path on the world. Returns the tornado state,
// or null when the path is too short to release (a plain click cancels).
export function startTornado(world, pts) {
  const p = [];
  for (const pt of pts) {
    const last = p[p.length - 1];
    if (!last || (pt.x - last.x) ** 2 + (pt.y - last.y) ** 2 >= 1) p.push({ x: pt.x, y: pt.y });
  }
  let total = 0;
  for (let i = 1; i < p.length; i++) total += Math.hypot(p[i].x - p[i - 1].x, p[i].y - p[i - 1].y);
  if (p.length < 2 || total < MIN_TORNADO) return null;
  const cum = [0];
  for (let i = 1; i < p.length; i++) cum.push(cum[i - 1] + Math.hypot(p[i].x - p[i - 1].x, p[i].y - p[i - 1].y));
  world.tornado = { pts: p, cum, total, dist: 0, linger: TORNADO_LINGER, x: p[0].x, y: p[0].y };
  return world.tornado;
}

// Point at distance s (clamped to [0, total]) along a tornado path.
export function tornadoPoint(t, s) {
  const q = Math.max(0, Math.min(t.total, s));
  let i = 1;
  while (i < t.cum.length && t.cum[i] < q) i++;
  if (i >= t.pts.length) {
    const e = t.pts[t.pts.length - 1];
    return { x: e.x, y: e.y };
  }
  const a = t.pts[i - 1];
  const b = t.pts[i];
  const f = (q - t.cum[i - 1]) / (t.cum[i] - t.cum[i - 1]);
  return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f };
}

// Advance the tornado one tick: move the head, clear plants in the corridor,
// damage creatures in it. When the head reaches the path end it lingers, then
// world.tornado is cleared.
export function tickTornado(world) {
  const t = world.tornado;
  if (!t) return;
  if (t.dist < t.total) {
    t.dist = Math.min(t.total, t.dist + TORNADO_SPEED);
  } else if (--t.linger <= 0) {
    world.tornado = null;
    return;
  }
  const { x, y } = tornadoPoint(t, t.dist);
  t.x = x;
  t.y = y;
  for (const p of world.plants) {
    if (!p.dead && toroidDist(x, y, p.x, p.y, W, H) <= TORNADO_RADIUS) p.dead = true;
  }
  for (const c of world.creatures) {
    if (c.dead) continue;
    if (toroidDist(x, y, c.x, c.y, W, H) <= TORNADO_RADIUS) {
      c.energy = Math.max(0, c.energy - TORNADO_DMG);
      if (c.energy <= 0) { c.dead = true; c.deathCause = 'hazard'; }
    }
  }
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
