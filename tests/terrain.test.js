import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRng } from '../src/rng.js';
import { createTerrain, BIOMES, TILE } from '../src/terrain.js';
import { W, H } from '../src/world.js';

test('terrain is deterministic given a seed', () => {
  const a = createTerrain(createRng(7));
  const b = createTerrain(createRng(7));
  assert.deepEqual(Array.from(a.tiles), Array.from(b.tiles));
});

test('different seeds give different terrain', () => {
  const a = createTerrain(createRng(1));
  const b = createTerrain(createRng(2));
  assert.notDeepEqual(Array.from(a.tiles), Array.from(b.tiles));
});

test('all tiles hold valid biome ids and open stays dominant', () => {
  const t = createTerrain(createRng(42));
  let open = 0;
  for (const id of t.tiles) {
    assert.ok(id >= 0 && id < BIOMES.length, `bad id ${id}`);
    if (id === 0) open++;
  }
  assert.ok(open / t.tiles.length > 0.35, `open too rare: ${open / t.tiles.length}`);
});

test('lookups are toroidal (match wrap semantics)', () => {
  const t = createTerrain(createRng(3));
  assert.equal(t.typeAt(-5, 5), t.typeAt(W - 5, 5));
  assert.equal(t.typeAt(5, -5), t.typeAt(5, H - 5));
  assert.equal(t.typeAt(W + 5, H + 5), t.typeAt(5, 5));
});

test('biome data drives passability/plantability/climate', () => {
  assert.equal(BIOMES[0].passable, true);
  assert.equal(BIOMES[1].passable, false); // water
  assert.equal(BIOMES[2].passable, false); // rock
  assert.equal(BIOMES[1].plantable, false);
  assert.equal(BIOMES[3].plantMult, 2);
  assert.equal(BIOMES[4].metaMult, 1.25);
});

test('paint changes a tile, bumps version once, toroidally', () => {
  const t = createTerrain(createRng(5));
  const v0 = t.version;
  t.paint(3, 3, 1);
  assert.equal(t.typeAt(3, 3), 1);
  assert.equal(t.version, v0 + 1);
  assert.equal(t.isPassable(3, 3), false);
  t.paint(3, 3, 1); // same id: no bump
  assert.equal(t.version, v0 + 1);
  // W-3 is the same column as -3 on the torus
  t.paint(W - 3, 3, 2);
  assert.equal(t.typeAt(-3, 3), 2);
});

test('tile grid covers the whole world exactly', () => {
  const t = createTerrain(createRng(9));
  assert.equal(t.cols * TILE, W);
  assert.equal(t.rows * TILE, H);
});
