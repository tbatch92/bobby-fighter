import { overlapCentre, rectsOverlap, type Rect, type Vec2 } from '../core/math'
import type { Fighter } from './fighter'
import type { Projectile } from './projectile'
import { comboScaling, STAGE_LEFT, STAGE_RIGHT } from './physics'
import type { Guard, HitEvent, Move } from './types'

/**
 * Hit resolution.
 *
 * Boxes for every fighter are snapshotted *before* anything is applied, so two
 * attacks landing on the same frame trade cleanly instead of the first one
 * resolved cancelling the second. Trades are a real part of fighting games and
 * getting them wrong makes neutral feel arbitrary.
 */

interface PendingHit {
  attacker: Fighter
  victim: Fighter
  move: Move
  at: Vec2
  projectile: Projectile | null
}

/** Can the victim's current guard stop this attack? */
function guardStops(victim: Fighter, guard: Guard): boolean {
  if (guard === 'unblockable') return false
  if (!victim.guarding || !victim.grounded) return false
  if (guard === 'low') return victim.crouching
  if (guard === 'overhead') return !victim.crouching
  return true
}

function firstOverlap(hitboxes: Rect[], hurtboxes: Rect[]): Vec2 | null {
  for (const hit of hitboxes) {
    for (const hurt of hurtboxes) {
      if (rectsOverlap(hit, hurt)) return overlapCentre(hit, hurt)
    }
  }
  return null
}

export function resolveCombat(
  fighters: [Fighter, Fighter],
  projectiles: Projectile[],
  events: HitEvent[],
): void {
  const snapshot = fighters.map((f) => ({
    hit: f.activeHitboxes(),
    hurt: f.hurtboxes(),
  }))

  const pending: PendingHit[] = []

  // Fighter vs fighter, both directions, from the same snapshot so trades work.
  for (let i = 0; i < 2; i++) {
    const attacker = fighters[i]!
    const victim = fighters[1 - i]!
    const move = attacker.move
    if (!move || snapshot[i]!.hit.length === 0) continue
    const at = firstOverlap(snapshot[i]!.hit, snapshot[1 - i]!.hurt)
    if (at) pending.push({ attacker, victim, move, at, projectile: null })
  }

  // Projectiles cancel each other out when they meet in the middle.
  for (let i = 0; i < projectiles.length; i++) {
    const a = projectiles[i]!
    if (a.spent) continue
    for (let j = i + 1; j < projectiles.length; j++) {
      const b = projectiles[j]!
      if (b.spent || b.owner === a.owner) continue
      if (rectsOverlap(a.rect(), b.rect())) {
        a.expire()
        b.expire()
        break
      }
    }
  }

  // Projectiles vs fighters.
  for (const p of projectiles) {
    if (p.spent) continue
    const victim = fighters[1 - p.owner]!
    const attacker = fighters[p.owner]!
    const hurt = snapshot[1 - p.owner]!.hurt
    const rect = p.rect()
    for (const h of hurt) {
      if (rectsOverlap(rect, h)) {
        const spec = p.spec
        const asMove: Move = {
          ...attacker.def.moves[attacker.def.specialId]!,
          damage: spec.damage,
          chip: spec.chip,
          hitstun: spec.hitstun,
          blockstun: spec.blockstun,
          hitstop: spec.hitstop,
          knockback: spec.knockback,
          guard: 'mid',
          knockdown: false,
        }
        pending.push({ attacker, victim, move: asMove, at: overlapCentre(rect, h), projectile: p })
        break
      }
    }
  }

  for (const hit of pending) applyHit(hit, events)
}

function applyHit(pending: PendingHit, events: HitEvent[]): void {
  const { attacker, victim, move, at, projectile } = pending
  const blocked = guardStops(victim, move.guard)

  if (projectile) projectile.expire()
  else attacker.moveHasHit = true

  if (blocked) {
    const push = move.pushback * -victim.facing
    victim.takeBlock(move.chip, move.blockstun, push)
    if (!projectile) attacker.vx = move.pushback * -attacker.facing * 0.8
    attacker.addMeter(Math.round(move.meterGain * 0.4))
    victim.addMeter(Math.round(move.meterGain * 0.5))
    const stop = Math.round(move.hitstop * 0.7)
    attacker.hitstop = stop
    victim.hitstop = stop
    events.push({
      attacker: attacker.side,
      victim: victim.side,
      at,
      damage: move.chip,
      blocked: true,
      move,
      counter: false,
      comboCount: 0,
    })
    return
  }

  // Armour: absorb the hit, take reduced damage, keep attacking. This is what
  // makes a heavyweight's signature move feel like a heavyweight's move.
  if (victim.armour > 0 && victim.state === 'attack') {
    victim.armour--
    victim.health = Math.max(0, victim.health - Math.round(move.damage * 0.5))
    attacker.hitstop = move.hitstop
    victim.hitstop = move.hitstop
    events.push({
      attacker: attacker.side,
      victim: victim.side,
      at,
      damage: Math.round(move.damage * 0.5),
      blocked: true,
      move,
      counter: false,
      comboCount: 0,
    })
    return
  }

  // A counter hit is one that lands while the victim is starting their own move.
  const counter =
    victim.state === 'attack' && victim.move !== null && victim.moveFrame <= victim.move.startup

  const scale = comboScaling(victim.comboHits + 1)
  const damage = Math.max(1, Math.round(move.damage * scale * (counter ? 1.3 : 1)))
  const hitstun = move.hitstun + (counter ? 5 : 0)
  const kbX = move.knockback.x * -victim.facing
  const kbY = move.knockback.y

  victim.takeHit(damage, hitstun, kbX, kbY, move.knockdown)

  attacker.addMeter(move.meterGain)
  victim.addMeter(Math.round(move.meterGain * 0.35))

  const stop = move.hitstop + (counter ? 3 : 0)
  attacker.hitstop = projectile ? 0 : stop
  victim.hitstop = stop

  events.push({
    attacker: attacker.side,
    victim: victim.side,
    at,
    damage,
    blocked: false,
    move,
    counter,
    comboCount: victim.comboHits,
  })
}

/**
 * Keep the two bodies from occupying the same space. Each fighter gives half the
 * overlap, except against a wall, where the cornered fighter gives nothing and the
 * other one is pushed the whole way — the standard corner behaviour that makes
 * pinning someone against the wall meaningful.
 */
export function separate(a: Fighter, b: Fighter): void {
  const ra = a.pushbox()
  const rb = b.pushbox()
  if (!rectsOverlap(ra, rb)) return

  const overlap =
    a.x < b.x ? ra.x + ra.w - rb.x : rb.x + rb.w - ra.x
  if (overlap <= 0) return

  const dir = a.x < b.x ? -1 : 1
  const aAtWall = a.x <= STAGE_LEFT + 0.5 || a.x >= STAGE_RIGHT - 0.5
  const bAtWall = b.x <= STAGE_LEFT + 0.5 || b.x >= STAGE_RIGHT - 0.5

  let aShare = 0.5
  if (aAtWall && !bAtWall) aShare = 0
  else if (bAtWall && !aAtWall) aShare = 1

  a.x = Math.min(Math.max(a.x + dir * overlap * aShare, STAGE_LEFT), STAGE_RIGHT)
  b.x = Math.min(Math.max(b.x - dir * overlap * (1 - aShare), STAGE_LEFT), STAGE_RIGHT)
}
