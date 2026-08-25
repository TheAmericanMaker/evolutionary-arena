import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRng } from '../src/rng.js';

test('same seed gives identical sequence', () => {
  const a = createRng(1234);
  const b = createRng(1234);
  for (let i = 0; i < 100; i++) assert.equal(a.next(), b.next());
});

test('different seeds diverge', () => {
  const a = createRng(1);
  const b = createRng(2);
  let same = 0;
  for (let i = 0; i < 32; i++) if (a.next() === b.next()) same++;
  assert.ok(same < 32, 'sequences should not match');
});

test('values stay in [0, 1)', () => {
  const rng = createRng(99);
  for (let i = 0; i < 1000; i++) {
    const v = rng.next();
    assert.ok(v >= 0 && v < 1, `out of range: ${v}`);
  }
});

test('zero seed does not stall at zero', () => {
  const rng = createRng(0);
  let nonzero = 0;
  for (let i = 0; i < 32; i++) if (rng.next() !== 0) nonzero++;
  assert.ok(nonzero > 30, 'xorshift state must be reset when seed is 0');
});

test('state() exposes current xorshift state', () => {
  const rng = createRng(7);
  const before = rng.state();
  rng.next();
  assert.notEqual(rng.state(), before);
});
