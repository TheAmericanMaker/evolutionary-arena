import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRng } from '../src/rng.js';
import { TRAITS, randomDna, mutateDna, gauss, isCarnivore, HERBIVORE_DNA, CARNIVORE_DNA } from '../src/dna.js';

function assertInRange(dna) {
  for (const [key, [min, max]] of Object.entries(TRAITS)) {
    assert.ok(dna[key] >= min && dna[key] <= max, `${key}=${dna[key]} out of [${min}, ${max}]`);
  }
}

test('randomDna stays within every trait range', () => {
  const rng = createRng(11);
  for (let i = 0; i < 200; i++) assertInRange(randomDna(rng));
});

test('mutateDna with rate 0 is an exact copy', () => {
  const rng = createRng(12);
  const dna = randomDna(rng);
  const out = mutateDna(dna, 0, rng);
  assert.deepEqual(out, dna);
});

test('mutateDna stays in range under heavy mutation (no drift escape)', () => {
  const rng = createRng(13);
  for (let i = 0; i < 500; i++) {
    const dna = randomDna(rng);
    assertInRange(mutateDna(dna, 0.6, rng));
  }
});

test('mutateDna actually moves traits when rate > 0', () => {
  const rng = createRng(14);
  const dna = randomDna(rng);
  let changedAny = false;
  for (let i = 0; i < 50; i++) {
    const out = mutateDna(dna, 0.6, rng);
    if (!assertEqualTraits(out, dna)) changedAny = true;
  }
  assert.ok(changedAny, 'expected at least one trait to change across 50 mutations');
});

function assertEqualTraits(a, b) {
  for (const key of Object.keys(TRAITS)) if (a[key] !== b[key]) return false;
  return true;
}

test('gauss is finite with ~zero mean over many samples', () => {
  const rng = createRng(15);
  let sum = 0;
  for (let i = 0; i < 2000; i++) {
    const g = gauss(rng);
    assert.ok(Number.isFinite(g), 'gauss returned non-finite');
    assert.ok(Math.abs(g) < 8, `gauss tail too large: ${g}`);
    sum += g;
  }
  assert.ok(Math.abs(sum / 2000) < 0.1, `mean drifted: ${sum / 2000}`);
});

test('isCarnivore threshold at aggression 0.55', () => {
  const base = randomDna(createRng(16));
  assert.equal(isCarnivore({ ...base, aggression: 0.549 }), false);
  assert.equal(isCarnivore({ ...base, aggression: 0.55 }), true);
  assert.equal(isCarnivore({ ...base, aggression: 1 }), true);
});

test('standard genomes: in range, herbivore vegetarian, carnivore can hunt it', () => {
  assertInRange(HERBIVORE_DNA);
  assertInRange(CARNIVORE_DNA);
  assert.ok(!isCarnivore(HERBIVORE_DNA), 'herbivore must be vegetarian');
  assert.ok(isCarnivore(CARNIVORE_DNA), 'carnivore must hunt');
  assert.ok(CARNIVORE_DNA.size + 1 > HERBIVORE_DNA.size,
    'carnivore must pass the size+1 predation rule on the standard herbivore');
});
