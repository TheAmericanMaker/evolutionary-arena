// Rolling-window population stats (pure).
// Decision (M4): one sample per tick = { tick, veg, carn, energy }. veg/carn
// split living creatures by isCarnivore (aggression >= 0.55, spec §4.2/§4.5);
// energy is the sum over all living creatures. The window keeps the last
// WINDOW samples; record() evicts the oldest. Best-fitness/lineage records
// and localStorage persistence land in M5/M6.

import { isCarnivore } from './dna.js';

export const WINDOW = 200;

// Decision (M5): fitness per spec §4.5 = lifetime energy gain (plants +
// prey eaten) - metabolism spent + offspring count. Records keep all-time
// bests, updated each tick by note(world). load() merges a stored snapshot
// taking the better value per field (so localStorage carries across
// sessions). "Longest lineage" = highest generation observed (generation is
// the genealogy chain depth: parent + 1 per bud, spec §4.5). "Oldest
// population" is read as the peak population ever observed.

export function createStats() {
  const samples = [];
  return {
    samples,
    record(world) {
      let veg = 0;
      let carn = 0;
      let energy = 0;
      for (const c of world.creatures) {
        if (c.dead) continue;
        energy += c.energy;
        if (isCarnivore(c.dna)) carn += 1;
        else veg += 1;
      }
      samples.push({ tick: world.tick, veg, carn, energy });
      if (samples.length > WINDOW) samples.shift();
    },
  };
}

export function fitness(c) {
  return c.gain - c.spent + c.offspring;
}

export function createRecords() {
  const data = {
    bestFitness: null,    // { value, dna, lineageId, tick }
    longestLineage: null, // { gen, lineageId, tick }
    peakPopulation: { pop: 0, tick: 0 },
  };
  return {
    data,
    note(world) {
      for (const c of world.creatures) {
        const f = fitness(c);
        if (!data.bestFitness || f > data.bestFitness.value) {
          data.bestFitness = { value: f, dna: { ...c.dna }, lineageId: c.lineageId, tick: world.tick };
        }
        if (!data.longestLineage || c.generation > data.longestLineage.gen) {
          data.longestLineage = { gen: c.generation, lineageId: c.lineageId, tick: world.tick };
        }
      }
      if (world.creatures.length > data.peakPopulation.pop) {
        data.peakPopulation = { pop: world.creatures.length, tick: world.tick };
      }
    },
    load(stored) {
      if (!stored || typeof stored !== 'object') return;
      const better = [
        ['bestFitness', (inc, cur) => !cur || inc.value > cur.value],
        ['longestLineage', (inc, cur) => !cur || inc.gen > cur.gen],
        ['peakPopulation', (inc, cur) => !cur || inc.pop > cur.pop],
      ];
      for (const [key, isBetter] of better) {
        const inc = stored[key];
        if (inc && typeof inc === 'object' && isBetter(inc, data[key])) data[key] = inc;
      }
    },
    reset() {
      data.bestFitness = null;
      data.longestLineage = null;
      data.peakPopulation = { pop: 0, tick: 0 };
    },
  };
}
