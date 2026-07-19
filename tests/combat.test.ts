import { describe, expect, it } from 'vitest'
import { CpuController } from '../src/ai/cpu'
import { NO_INTENT, type Intent } from '../src/core/input'
import { Rng } from '../src/core/rng'
import { BOBBY, MEATBALL, MOCHI, WHISKERS } from '../src/data/roster'
import { STAGE_LEFT, STAGE_RIGHT } from '../src/sim/physics'
import type { Match } from '../src/sim/match'
import type { CharacterDef } from '../src/sim/types'
import { idle, makeMatch, position, step, type IntentSource } from './helpers'

/** Back the defender into the corner so they cannot retreat out of range. */
function cornerVictim(attacker: CharacterDef, victim: CharacterDef, gap = 100): Match {
  const m = makeMatch(attacker, victim)
  m.fighters[1]!.x = m.fighters[1]!.prevX = STAGE_RIGHT
  m.fighters[0]!.x = m.fighters[0]!.prevX = STAGE_RIGHT - gap
  m.fighters[0]!.facing = 1
  m.fighters[1]!.facing = -1
  return m
}

/** Step until `predicate` holds, returning whether it ever did. */
function stepUntil(
  m: Match,
  frames: number,
  predicate: () => boolean,
  p1: IntentSource = idle,
  p2: IntentSource = idle,
): boolean {
  for (let i = 0; i < frames; i++) {
    m.step([p1(i), p2(i)])
    if (predicate()) return true
  }
  return false
}

/**
 * Behavioural tests for the rules that make the game a fighting game. Each one
 * describes something a player would notice immediately if it broke.
 */
describe('combat', () => {
  it('takes health off when an attack lands', () => {
    const m = makeMatch(BOBBY, MOCHI)
    position(m, 110)
    const before = m.fighters[1]!.health

    m.fighters[0]!.startMove(BOBBY.moves['stand.hp']!)
    step(m, 30)

    expect(m.fighters[1]!.health).toBeLessThan(before)
    expect(m.fighters[1]!.state).not.toBe('idle')
  })

  it('reduces damage a lot when the hit is blocked', () => {
    // Guarding means holding away, which also walks the defender backwards. Cornering
    // them means the attack is guaranteed to reach and the test measures the block
    // rather than accidentally measuring them stepping out of range.
    const clean = cornerVictim(BOBBY, MOCHI)
    clean.fighters[0]!.startMove(BOBBY.moves['stand.hp']!)
    step(clean, 30)
    const cleanDamage = clean.fighters[1]!.maxHealth - clean.fighters[1]!.health

    const blocked = cornerVictim(BOBBY, MOCHI)
    blocked.fighters[0]!.startMove(BOBBY.moves['stand.hp']!)
    const guard = (): Intent => ({ ...NO_INTENT, dirX: 1 })
    const sawBlockstun = stepUntil(
      blocked,
      30,
      () => blocked.fighters[1]!.state === 'blockstun',
      idle,
      guard,
    )
    const chipDamage = blocked.fighters[1]!.maxHealth - blocked.fighters[1]!.health

    expect(sawBlockstun).toBe(true)
    expect(cleanDamage).toBeGreaterThan(0)
    // Heavy normals deal no chip at all, so a clean guard costs nothing.
    expect(chipDamage).toBe(0)
  })

  it('lets a low attack through a standing guard', () => {
    const m = cornerVictim(BOBBY, MOCHI)
    m.fighters[0]!.crouching = true
    m.fighters[0]!.startMove(BOBBY.moves['crouch.hk']!) // sweep — hits low
    const standingGuard = (): Intent => ({ ...NO_INTENT, dirX: 1 })
    step(m, 30, idle, standingGuard)

    // A sweep knocks down, which a standing block would have prevented entirely.
    expect(m.fighters[1]!.state).toBe('knockdown')
    expect(m.fighters[1]!.health).toBeLessThan(m.fighters[1]!.maxHealth)
  })

  it('blocks a low attack when crouching', () => {
    const m = cornerVictim(BOBBY, MOCHI)
    m.fighters[0]!.crouching = true
    m.fighters[0]!.startMove(BOBBY.moves['crouch.hk']!)
    const crouchGuard = (): Intent => ({ ...NO_INTENT, dirX: 1, dirY: 1 })
    // Blockstun is short, so watch for it rather than checking once at the end.
    const sawBlockstun = stepUntil(
      m,
      30,
      () => m.fighters[1]!.state === 'blockstun',
      idle,
      crouchGuard,
    )

    expect(sawBlockstun).toBe(true)
    expect(m.fighters[1]!.state).not.toBe('knockdown')
    expect(m.fighters[1]!.health).toBe(m.fighters[1]!.maxHealth)
  })

  it('freezes both fighters for the same hitstop on impact', () => {
    const m = makeMatch(BOBBY, MOCHI)
    position(m, 110)
    m.fighters[0]!.startMove(BOBBY.moves['stand.hp']!)
    // Step to the exact frame the hit lands.
    let guard = 0
    while (m.fighters[0]!.hitstop === 0 && guard++ < 40) step(m, 1)
    expect(guard).toBeLessThan(40)
    expect(m.fighters[0]!.hitstop).toBe(m.fighters[1]!.hitstop)
    expect(m.fighters[0]!.hitstop).toBeGreaterThan(0)
  })

  it('scales damage down through a combo', () => {
    const m = makeMatch(BOBBY, MOCHI)
    position(m, 100)
    const victim = m.fighters[1]!
    const jab = BOBBY.moves['stand.lp']!

    const damages: number[] = []
    for (let hit = 0; hit < 4; hit++) {
      const before = victim.health
      m.fighters[0]!.startMove(jab)
      // Advance just past the active window so the next jab starts in hitstun.
      step(m, jab.startup + jab.active + 2)
      damages.push(before - victim.health)
    }

    expect(damages[0]).toBeGreaterThan(0)
    expect(damages[3]).toBeLessThan(damages[0]!)
  })

  it('ends the round and the match when health runs out', () => {
    const m = makeMatch(BOBBY, MOCHI)
    position(m, 100)
    m.fighters[1]!.health = 1
    m.fighters[0]!.startMove(BOBBY.moves['stand.hp']!)
    step(m, 30)

    expect(m.fighters[1]!.alive).toBe(false)
    expect(m.phase).toBe('ko')
    expect(m.lastRoundWinner).toBe(0)

    // Play out the KO ceremony; the winner should bank a round.
    step(m, 130)
    expect(m.fighters[0]!.roundsWon).toBe(1)
  })

  it('keeps fighters inside the stage', () => {
    const m = makeMatch(BOBBY, MOCHI)
    const runLeft = (): Intent => ({ ...NO_INTENT, dirX: -1 })
    const runRight = (): Intent => ({ ...NO_INTENT, dirX: 1 })
    step(m, 600, runLeft, runRight)

    for (const f of m.fighters) {
      expect(f.x).toBeGreaterThanOrEqual(STAGE_LEFT - 0.001)
      expect(f.x).toBeLessThanOrEqual(STAGE_RIGHT + 0.001)
    }
  })

  it('never lets the two cats occupy the same space', () => {
    const m = makeMatch(BOBBY, MEATBALL)
    const towardsEachOther = (side: number) => (): Intent => ({
      ...NO_INTENT,
      dirX: side === 0 ? 1 : -1,
    })
    step(m, 240, towardsEachOther(0), towardsEachOther(1))

    const minGap = BOBBY.bodyRadius + MEATBALL.bodyRadius
    expect(m.gap).toBeGreaterThanOrEqual(minGap - 1)
  })

  it('spawns and travels a projectile that eventually connects', () => {
    const m = makeMatch(BOBBY, MOCHI)
    position(m, 380)
    m.fighters[0]!.startMove(BOBBY.moves.special!)
    step(m, 20)
    expect(m.projectiles.length).toBe(1)

    const before = m.fighters[1]!.health
    step(m, 90)
    expect(m.fighters[1]!.health).toBeLessThan(before)
  })

  it('makes an invulnerable reversal beat a meaty attack', () => {
    const m = makeMatch(WHISKERS, MOCHI)
    position(m, 110)
    // Whiskers' Claw Uppercut is invulnerable frames 1-8.
    m.fighters[0]!.startMove(WHISKERS.moves.special!)
    m.fighters[1]!.startMove(MOCHI.moves['stand.hp']!)
    const before = m.fighters[0]!.health
    step(m, 12)

    expect(m.fighters[0]!.health).toBe(before)
  })

  it('lets armour absorb a hit without interrupting the move', () => {
    const m = makeMatch(MEATBALL, MOCHI)
    position(m, 110)
    m.fighters[0]!.startMove(MEATBALL.moves.special!) // Belly Flop, 1 hit of armour
    m.fighters[1]!.startMove(MOCHI.moves['stand.lp']!)
    step(m, 8)

    expect(m.fighters[0]!.state).toBe('attack')
    expect(m.fighters[0]!.health).toBeLessThan(MEATBALL.maxHealth)
  })

  it('plays a whole CPU-vs-CPU match to a winner', () => {
    const m = makeMatch(BOBBY, WHISKERS, 99)
    const a = new CpuController(0, 'hard', new Rng(7))
    const b = new CpuController(1, 'hard', new Rng(11))

    let frames = 0
    while (m.phase !== 'matchEnd' && frames++ < 60 * 60 * 5) {
      m.step([a.think(m), b.think(m)])
    }

    expect(m.phase).toBe('matchEnd')
    expect(m.matchWinner === 0 || m.matchWinner === 1).toBe(true)
    const [p1, p2] = m.fighters
    expect(Math.max(p1!.roundsWon, p2!.roundsWon)).toBeGreaterThanOrEqual(2)
  })

  it('makes an easy CPU noticeably less dangerous than a hard one', () => {
    // Same character on both sides, so the only variable is reaction time.
    const damageDealtBy = (difficulty: 'easy' | 'hard'): number => {
      const m = makeMatch(BOBBY, BOBBY, 4242)
      const cpu = new CpuController(1, difficulty, new Rng(31))
      // The player side stands still and never blocks.
      for (let i = 0; i < 60 * 25 && m.phase === 'fight'; i++) {
        m.step([{ ...NO_INTENT }, cpu.think(m)])
      }
      return m.fighters[0]!.maxHealth - m.fighters[0]!.health
    }

    expect(damageDealtBy('hard')).toBeGreaterThan(damageDealtBy('easy'))
  })
})
