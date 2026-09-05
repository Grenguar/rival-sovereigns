/**
 * Seeded xoshiro128** — the world's only source of randomness.
 *
 * docs/03-determinism.md §4.4: never instantiate a second generator, never call
 * Math.random. Every arithmetic step here is 32-bit integer work via Math.imul and
 * bitwise operators, which are exactly specified in ECMAScript and therefore
 * bit-identical on every engine.
 */

const rotl = (x: number, k: number): number => ((x << k) | (x >>> (32 - k))) >>> 0;

/** splitmix32 — expands a single seed word into well-distributed state. */
function splitmix32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x9e3779b9) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 16), 0x21f0aaad) >>> 0;
    t = Math.imul(t ^ (t >>> 15), 0x735a2d97) >>> 0;
    return (t ^ (t >>> 15)) >>> 0;
  };
}

export class Rng {
  private s0: number;
  private s1: number;
  private s2: number;
  private s3: number;

  constructor(seed: number) {
    const mix = splitmix32(seed);
    this.s0 = mix();
    this.s1 = mix();
    this.s2 = mix();
    this.s3 = mix();
    // An all-zero state is a fixed point of xoshiro and would emit only zeros.
    if ((this.s0 | this.s1 | this.s2 | this.s3) === 0) this.s0 = 1;
  }

  nextU32(): number {
    const result = Math.imul(rotl(Math.imul(this.s1, 5) >>> 0, 7), 9) >>> 0;

    const t = (this.s1 << 9) >>> 0;
    this.s2 = (this.s2 ^ this.s0) >>> 0;
    this.s3 = (this.s3 ^ this.s1) >>> 0;
    this.s1 = (this.s1 ^ this.s2) >>> 0;
    this.s0 = (this.s0 ^ this.s3) >>> 0;
    this.s2 = (this.s2 ^ t) >>> 0;
    this.s3 = rotl(this.s3, 11);

    return result;
  }

  /** Uniform in [0, 1). */
  nextFloat(): number {
    return this.nextU32() / 4294967296;
  }

  /** Uniform integer in [min, max). Returns min when the range is empty. */
  nextInt(min: number, max: number): number {
    const span = max - min;
    if (span <= 0) return min;
    // Modulo bias is negligible for the small spans this game uses, and using it
    // keeps the result a pure integer operation.
    return min + (this.nextU32() % span);
  }

  /** Uniform in [min, max). */
  nextRange(min: number, max: number): number {
    return min + this.nextFloat() * (max - min);
  }

  /** Uniform in [-jitter, +jitter] applied multiplicatively: base * (1 ± jitter). */
  jitter(base: number, fraction: number): number {
    return base * (1 - fraction + this.nextFloat() * fraction * 2);
  }

  pick<T>(items: readonly T[]): T {
    return items[this.nextInt(0, items.length)] as T;
  }

  /** Fisher-Yates, in place. Order depends only on the stream. */
  shuffle<T>(items: T[]): T[] {
    for (let i = items.length - 1; i > 0; i--) {
      const j = this.nextInt(0, i + 1);
      const tmp = items[i] as T;
      items[i] = items[j] as T;
      items[j] = tmp;
    }
    return items;
  }

  /** Single-word digest of the generator state, for the world hash. */
  snapshot(): number {
    let h = 0x811c9dc5;
    h = Math.imul(h ^ this.s0, 0x01000193);
    h = Math.imul(h ^ this.s1, 0x01000193);
    h = Math.imul(h ^ this.s2, 0x01000193);
    h = Math.imul(h ^ this.s3, 0x01000193);
    return h >>> 0;
  }

  /** Full state, for save/replay. */
  saveState(): [number, number, number, number] {
    return [this.s0, this.s1, this.s2, this.s3];
  }

  loadState(state: readonly [number, number, number, number]): void {
    this.s0 = state[0] >>> 0;
    this.s1 = state[1] >>> 0;
    this.s2 = state[2] >>> 0;
    this.s3 = state[3] >>> 0;
  }
}
