// Seedable PRNG (xorshift32). All simulation randomness flows through this.
// next() returns a float in [0, 1). Deterministic given a seed.

export function createRng(seed) {
  let s = (seed >>> 0) || 0x9e3779b9; // xorshift state must be nonzero
  return {
    next() {
      s ^= s << 13; s >>>= 0;
      s ^= s >> 17;
      s ^= s << 5; s >>>= 0;
      return s / 4294967296;
    },
    state() { return s; },
  };
}
