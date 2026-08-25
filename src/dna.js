// DNA model, mutation, bounds/clamp (pure).
// Decision: per-trait sigma = 0.4 * traitRange * mutationRate (spec §4.2:
// base sigma ~0.4 of the trait range; the slider scales it; 0 = no mutation).
// Gaussian via Box-Muller on two seeded uniforms; u1 = 1 - next() keeps it in
// (0, 1] so log never sees 0. No Math.random anywhere in this module.

export const TRAITS = {
  speed: [0.5, 3.0],
  vision: [20, 160],
  metabolism: [0.02, 0.25],
  aggression: [0.0, 1.0],
  size: [1.5, 6],
};

export const CARNIVORE_AGGRESSION = 0.55;

export function clamp(v, min, max) {
  return Math.min(max, Math.max(min, v));
}

export function gauss(rng) {
  const u1 = 1 - rng.next();
  const u2 = rng.next();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

export function randomDna(rng) {
  const dna = {};
  for (const [key, [min, max]] of Object.entries(TRAITS)) {
    dna[key] = min + rng.next() * (max - min);
  }
  return dna;
}

export function mutateDna(dna, mutationRate, rng) {
  const out = {};
  for (const [key, [min, max]] of Object.entries(TRAITS)) {
    if (mutationRate <= 0) {
      out[key] = dna[key];
      continue;
    }
    const sigma = 0.4 * (max - min) * mutationRate;
    out[key] = clamp(dna[key] + gauss(rng) * sigma, min, max);
  }
  return out;
}

export function isCarnivore(dna) {
  return dna.aggression >= CARNIVORE_AGGRESSION;
}

// Decision (M5): standardized genomes for the Spawn buttons (spec §4.7).
// Herbivore: docile plant-eater (below the carnivore threshold). Carnivore:
// aggressive enough to hunt and large enough to eat the standard herbivore
// (size + 1 > 2.5, the predation rule from entity.js).
export const HERBIVORE_DNA = { speed: 2.0, vision: 80, metabolism: 0.06, aggression: 0.2, size: 2.5 };
export const CARNIVORE_DNA = { speed: 2.5, vision: 100, metabolism: 0.08, aggression: 0.8, size: 4.5 };
