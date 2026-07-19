import { describe, expect, it } from 'vitest'
import { CpuController } from '../src/ai/cpu'
import { ATTACK_BUTTONS, type Intent } from '../src/core/input'
import { Rng } from '../src/core/rng'
import { BOBBY, DUCHESS, SHADOW, WHISKERS } from '../src/data/roster'
import { Match } from '../src/sim/match'
import type { CharacterDef } from '../src/sim/types'

/**
 * The simulation must be a pure function of (seed, inputs).
 *
 * This is the test that protects every other guarantee in the project: if the same
 * inputs stop producing the same match, then frame data means nothing, a reported
 * bug can't be reproduced, and any future replay or netcode is impossible. It is
 * also a cheap tripwire for accidental `Math.random()` or `Date.now()` in `sim/`.
 */

/** A fixed, arbitrary-looking input stream derived only from the frame number. */
function scriptedIntent(seed: number) {
  const rng = new Rng(seed)
  return (): Intent => ({
    dirX: rng.int(-1, 1),
    dirY: rng.chance(0.2) ? 1 : rng.chance(0.12) ? -1 : 0,
    attack: rng.chance(0.14) ? rng.pick(ATTACK_BUTTONS) : null,
    special: rng.chance(0.03),
    super: rng.chance(0.01),
    dashForward: rng.chance(0.02),
    dashBack: rng.chance(0.02),
  })
}

function runMatch(a: CharacterDef, b: CharacterDef, seed: number, frames: number): number {
  const match = new Match(a, b, seed)
  const p1 = scriptedIntent(seed + 1)
  const p2 = scriptedIntent(seed + 2)
  for (let i = 0; i < frames; i++) match.step([p1(), p2()])
  return match.hash()
}

describe('determinism', () => {
  it('produces an identical match from identical inputs', () => {
    const a = runMatch(BOBBY, WHISKERS, 1234, 1800)
    const b = runMatch(BOBBY, WHISKERS, 1234, 1800)
    expect(a).toBe(b)
  })

  it('produces a different match from a different seed', () => {
    const a = runMatch(BOBBY, WHISKERS, 1234, 1800)
    const b = runMatch(BOBBY, WHISKERS, 5678, 1800)
    expect(a).not.toBe(b)
  })

  it('stays deterministic for every matchup', () => {
    for (const [a, b] of [
      [BOBBY, DUCHESS],
      [SHADOW, WHISKERS],
      [DUCHESS, SHADOW],
    ] as const) {
      expect(runMatch(a, b, 77, 900)).toBe(runMatch(a, b, 77, 900))
    }
  })

  it('replays a CPU match identically', () => {
    const play = (): number => {
      const m = new Match(BOBBY, SHADOW, 31337)
      const cpuA = new CpuController(0, 'normal', new Rng(5))
      const cpuB = new CpuController(1, 'hard', new Rng(6))
      for (let i = 0; i < 2400; i++) m.step([cpuA.think(m), cpuB.think(m)])
      return m.hash()
    }
    expect(play()).toBe(play())
  })

  it('advances the state rather than sitting still', () => {
    // A hash that never changes would make the tests above pass vacuously.
    const m = new Match(BOBBY, WHISKERS, 9)
    const p1 = scriptedIntent(10)
    const p2 = scriptedIntent(11)
    const seen = new Set<number>()
    for (let i = 0; i < 600; i++) {
      m.step([p1(), p2()])
      seen.add(m.hash())
    }
    expect(seen.size).toBeGreaterThan(200)
  })
})
