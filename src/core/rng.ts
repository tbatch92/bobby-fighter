/**
 * Seeded random number generator (mulberry32).
 *
 * The simulation must never call `Math.random()`: identical inputs from the same
 * seed have to produce an identical match, otherwise the determinism test in
 * `tests/` is meaningless and replaying a desync becomes impossible. Purely
 * cosmetic randomness (particles, background sway) may use `Math.random()` freely
 * since it never feeds back into the sim.
 */
export class Rng {
  private state: number

  constructor(seed = 0x9e3779b9) {
    this.state = seed >>> 0
  }

  /** Uniform float in [0, 1). */
  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0
    let t = this.state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }

  /** Uniform float in [lo, hi). */
  range(lo: number, hi: number): number {
    return lo + this.next() * (hi - lo)
  }

  /** Uniform integer in [lo, hi]. */
  int(lo: number, hi: number): number {
    return Math.floor(this.range(lo, hi + 1))
  }

  /** True with probability `p`. */
  chance(p: number): boolean {
    return this.next() < p
  }

  pick<T>(items: readonly T[]): T {
    return items[this.int(0, items.length - 1)]!
  }
}
