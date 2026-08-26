// Side stats panel (M9): live breakdown of population, ecosystem, and
// evolution, refreshed each frame by ui.hud(). Pure DOM writing from world
// state; ids are collected by ui.js and passed in (no second DOM scan).
// Decisions:
// - Population: live counts (veg/carn via isCarnivore), all-time peak,
//   births (buds only — user spawns are not offspring), deaths by cause
//   (starve / predation / hazard / user kill button).
// - Ecosystem: plant count, biomass = total plant energy, regen pool,
//   average creature energy.
// - Evolution: lineages = distinct lineageIds alive, max generation (the
//   all-time longest lineage from records), best fitness (all-time), and
//   the LIVE average of each DNA trait across living creatures — the
//   "what is the population becoming" readout.

import { isCarnivore } from './dna.js';

const F2 = (v) => v.toFixed(2);

export function panelIds() {
  const ids = [
    'stCreatures', 'stVeg', 'stCarn', 'stPeak', 'stBorn', 'stDeaths',
    'stStarve', 'stPred', 'stHazard', 'stPlants', 'stBiomass', 'stPool',
    'stAvgE', 'stLineages', 'stGen', 'stBest',
    'stAvgSpd', 'stAvgVis', 'stAvgMet', 'stAvgAgg', 'stAvgSize',
  ];
  return Object.fromEntries(ids.map((id) => [id, document.getElementById(id)]));
}

export function updatePanel(els, world) {
  let veg = 0;
  let carn = 0;
  const sum = { e: 0, spd: 0, vis: 0, met: 0, agg: 0, sz: 0 };
  const lineages = new Set();
  for (const c of world.creatures) {
    if (c.dead) continue;
    lineages.add(c.lineageId);
    if (isCarnivore(c.dna)) carn += 1;
    else veg += 1;
    sum.e += c.energy;
    sum.spd += c.dna.speed;
    sum.vis += c.dna.vision;
    sum.met += c.dna.metabolism;
    sum.agg += c.dna.aggression;
    sum.sz += c.dna.size;
  }
  const n = veg + carn;
  let biomass = 0;
  for (const p of world.plants) if (!p.dead) biomass += p.energy;

  const d = world.deaths;
  const rec = world.records.data;
  els.stCreatures.textContent = String(n);
  els.stVeg.textContent = String(veg);
  els.stCarn.textContent = String(carn);
  els.stPeak.textContent = String(rec.peakPopulation.pop);
  els.stBorn.textContent = String(world.births);
  els.stDeaths.textContent = String(d.starve + d.predation + d.hazard + d.user);
  els.stStarve.textContent = String(d.starve);
  els.stPred.textContent = String(d.predation);
  els.stHazard.textContent = String(d.hazard);
  els.stPlants.textContent = String(world.plants.length);
  els.stBiomass.textContent = String(Math.round(biomass));
  els.stPool.textContent = String(Math.round(world.plantPool));
  els.stAvgE.textContent = n ? (sum.e / n).toFixed(1) : '0';
  els.stLineages.textContent = String(lineages.size);
  els.stGen.textContent = rec.longestLineage ? `g${rec.longestLineage.gen} (${rec.longestLineage.lineageId})` : '—';
  els.stBest.textContent = rec.bestFitness ? `${Math.round(rec.bestFitness.value)} (${rec.bestFitness.lineageId})` : '—';
  if (n) {
    els.stAvgSpd.textContent = F2(sum.spd / n);
    els.stAvgVis.textContent = F2(sum.vis / n);
    els.stAvgMet.textContent = (sum.met / n).toFixed(3);
    els.stAvgAgg.textContent = F2(sum.agg / n);
    els.stAvgSize.textContent = F2(sum.sz / n);
  }
}
