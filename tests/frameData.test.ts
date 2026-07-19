import { describe, expect, it } from 'vitest'
import { ALL_CATS } from '../src/data/roster'
import { frameAdvantage, moveDuration } from '../src/sim/moves'

/**
 * Balance data is hand-written numbers, and a typo in it produces a move that
 * either never hits or is unbeatable — neither of which throws an error at runtime.
 * These checks catch that class of mistake before it reaches the game.
 */
describe('frame data', () => {
  const everyMove = ALL_CATS.flatMap((cat) =>
    Object.values(cat.moves).map((move) => ({ cat, move })),
  )

  it('covers every button in every stance for every cat', () => {
    for (const cat of ALL_CATS) {
      for (const stance of ['stand', 'crouch', 'air'] as const) {
        for (const button of ['lp', 'hp', 'lk', 'hk'] as const) {
          const id = cat.normals[stance][button]
          expect(cat.moves[id], `${cat.id} ${stance}.${button} -> ${id}`).toBeDefined()
        }
      }
      expect(cat.moves[cat.specialId], `${cat.id} special`).toBeDefined()
      expect(cat.moves[cat.superId], `${cat.id} super`).toBeDefined()
    }
  })

  it('gives every move a usable timeline', () => {
    for (const { cat, move } of everyMove) {
      const where = `${cat.id}/${move.id}`
      expect(move.startup, `${where} startup`).toBeGreaterThan(0)
      expect(move.active, `${where} active`).toBeGreaterThan(0)
      expect(move.recovery, `${where} recovery`).toBeGreaterThanOrEqual(0)
      expect(moveDuration(move), `${where} duration`).toBeLessThan(200)
    }
  })

  it('keeps every hitbox inside its move and gives it real area', () => {
    for (const { cat, move } of everyMove) {
      for (const h of move.hitboxes) {
        const where = `${cat.id}/${move.id}`
        expect(h.from, `${where} hitbox start`).toBeGreaterThanOrEqual(1)
        expect(h.to, `${where} hitbox end`).toBeLessThanOrEqual(moveDuration(move))
        expect(h.from, `${where} hitbox range`).toBeLessThanOrEqual(h.to)
        expect(h.box.w, `${where} hitbox width`).toBeGreaterThan(0)
        expect(h.box.h, `${where} hitbox height`).toBeGreaterThan(0)
      }
    }
  })

  it('gives every damaging move a way to connect', () => {
    for (const { cat, move } of everyMove) {
      if (move.damage <= 0) continue
      const connects = move.hitboxes.length > 0 || move.projectile !== undefined
      expect(connects, `${cat.id}/${move.id} deals damage but has no hitbox`).toBe(true)
    }
  })

  it('never lets a blockstring chip someone to death', () => {
    // Light normals being a couple of frames plus on block is normal and fine —
    // pushback ends the string. What must never happen is a move that is plus on
    // block AND deals chip, because that loops into a guaranteed kill.
    for (const { cat, move } of everyMove) {
      const adv = frameAdvantage(move, true)
      if (adv <= 0) continue
      // Air moves recover on landing rather than on their recovery frames, so the
      // number means nothing for them — but the chip rule still has to hold.
      if (move.from !== 'air') {
        expect(adv, `${cat.id}/${move.id} is +${adv} on block`).toBeLessThanOrEqual(3)
      }
      expect(move.chip, `${cat.id}/${move.id} is +${adv} on block and chips`).toBe(0)
    }
  })

  it('gives heavy normals real risk on block', () => {
    for (const cat of ALL_CATS) {
      for (const id of ['stand.hp', 'stand.hk', 'crouch.hp', 'crouch.hk']) {
        const move = cat.moves[id]!
        expect(
          frameAdvantage(move, true),
          `${cat.id}/${id} should be punishable on block`,
        ).toBeLessThan(0)
      }
    }
  })

  it('charges meter for supers and nothing else', () => {
    for (const cat of ALL_CATS) {
      expect(cat.moves[cat.superId]!.meterCost, `${cat.id} super cost`).toBe(100)
      for (const move of Object.values(cat.moves)) {
        if (move.id === cat.superId) continue
        expect(move.meterCost, `${cat.id}/${move.id}`).toBe(0)
      }
    }
  })

  it('spawns projectiles within their move and sends them somewhere', () => {
    for (const { cat, move } of everyMove) {
      const p = move.projectile
      if (!p) continue
      const where = `${cat.id}/${move.id} projectile`
      expect(p.spawnFrame, `${where} spawn frame`).toBeGreaterThanOrEqual(1)
      expect(p.spawnFrame, `${where} spawn frame`).toBeLessThanOrEqual(moveDuration(move))
      expect(Math.abs(p.velocity.x), `${where} speed`).toBeGreaterThan(0)
      expect(p.life, `${where} lifetime`).toBeGreaterThan(10)
      expect(p.damage, `${where} damage`).toBeGreaterThan(0)
    }
  })

  it('keeps the roster within sane stat ranges', () => {
    for (const cat of ALL_CATS) {
      expect(cat.maxHealth).toBeGreaterThanOrEqual(850)
      expect(cat.maxHealth).toBeLessThanOrEqual(1250)
      // Walking backwards must never be faster than walking forwards, or
      // retreating becomes strictly better than approaching.
      expect(cat.walkBack, `${cat.id} walk speeds`).toBeLessThan(cat.walkForward)
      expect(cat.jumpVelocity, `${cat.id} jump`).toBeLessThan(0)
      expect(cat.bodyRadius).toBeGreaterThan(10)
    }
  })
})
