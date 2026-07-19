import type { AttackButton, Intent } from '../core/input'
import { NO_INTENT } from '../core/input'
import type { Rng } from '../core/rng'
import type { Fighter } from '../sim/fighter'
import type { Match } from '../sim/match'
import { MAX_METER } from '../sim/physics'

/**
 * The CPU opponent.
 *
 * Rather than a state machine, each decision point scores a handful of candidate
 * actions against the situation and the character's personality, then commits to the
 * winner for a few frames. Committing matters: a CPU that re-decides every frame
 * twitches in place and never reads as a fighter with intent.
 *
 * Difficulty adjusts only two things — how many frames late the CPU sees the world,
 * and how reliably it blocks. It never gets extra damage or reduced damage taken.
 * A player can feel the difference between "this one is slow" and "this one cheats",
 * and only the first one is fun to beat.
 */

export type Difficulty = 'easy' | 'normal' | 'hard'

interface DifficultyTuning {
  /** How stale the CPU's view of the opponent is. */
  reaction: number
  /** Multiplier on the character's own block skill. */
  block: number
  /** Frames between decisions. */
  think: number
  /** Chance a decision is simply thrown away, producing a human-ish lapse. */
  lapse: number
  /** Chance of correctly blocking low vs overhead rather than guessing. */
  readMixups: number
}

const TUNING: Record<Difficulty, DifficultyTuning> = {
  easy: { reaction: 21, block: 0.45, think: 15, lapse: 0.26, readMixups: 0.25 },
  normal: { reaction: 12, block: 0.8, think: 9, lapse: 0.1, readMixups: 0.55 },
  hard: { reaction: 6, block: 1, think: 5, lapse: 0.02, readMixups: 0.85 },
}

/** A delayed snapshot of the opponent, so the CPU reacts to the recent past. */
interface Observation {
  x: number
  y: number
  grounded: boolean
  attacking: boolean
  /** Frames into the attack — used to tell a fresh threat from a whiffed one. */
  attackFrame: number
  attackStartup: number
  attackGuard: 'mid' | 'low' | 'overhead' | 'unblockable'
  recovering: boolean
  health: number
  meter: number
  vy: number
}

type PlanKind =
  | 'approach'
  | 'retreat'
  | 'attack'
  | 'block'
  | 'crouchBlock'
  | 'antiair'
  | 'jump'
  | 'special'
  | 'super'
  | 'dashIn'
  | 'wait'

interface Plan {
  kind: PlanKind
  frames: number
  attack?: AttackButton
  crouch?: boolean
}

export class CpuController {
  private readonly side: 0 | 1
  private readonly rng: Rng
  private tuning: DifficultyTuning
  private history: Observation[] = []
  private plan: Plan = { kind: 'wait', frames: 10 }
  private planAge = 0
  /** Fires the attack button on the first frame of an attack plan only. */
  private firedThisPlan = false
  private dashCooldown = 0

  constructor(side: 0 | 1, difficulty: Difficulty, rng: Rng) {
    this.side = side
    this.rng = rng
    this.tuning = TUNING[difficulty]
  }

  setDifficulty(d: Difficulty): void {
    this.tuning = TUNING[d]
  }

  think(match: Match): Intent {
    const me = match.fighters[this.side]!
    const foe = match.fighters[1 - this.side]!

    this.record(foe)
    const seen = this.observed()
    if (!seen) return { ...NO_INTENT }

    if (match.phase !== 'fight') return { ...NO_INTENT }
    if (this.dashCooldown > 0) this.dashCooldown--

    this.planAge++
    if (this.planAge >= this.plan.frames) {
      this.plan = this.decide(match, me, foe, seen)
      this.planAge = 0
      this.firedThisPlan = false
    }

    return this.execute(me, seen)
  }

  private record(foe: Fighter): void {
    const move = foe.move
    this.history.push({
      x: foe.x,
      y: foe.y,
      grounded: foe.grounded,
      attacking: foe.state === 'attack',
      attackFrame: foe.moveFrame,
      attackStartup: move?.startup ?? 0,
      attackGuard: move?.guard ?? 'mid',
      recovering:
        foe.state === 'attack' && move !== null && foe.moveFrame > move.startup + move.active,
      health: foe.health,
      meter: foe.meter,
      vy: foe.vy,
    })
    if (this.history.length > 40) this.history.shift()
  }

  private observed(): Observation | null {
    const idx = this.history.length - 1 - this.tuning.reaction
    return this.history[Math.max(0, idx)] ?? null
  }

  // --- deciding ------------------------------------------------------------

  private decide(match: Match, me: Fighter, foe: Fighter, seen: Observation): Plan {
    const ai = me.def.ai
    const gap = Math.abs(seen.x - me.x)
    const t = this.tuning

    if (this.rng.chance(t.lapse)) return { kind: 'wait', frames: t.think * 2 }

    const scores: [Plan, number][] = []

    // --- defence ---------------------------------------------------------
    // Only worth blocking if the threat is real: they are attacking, they are
    // close enough to reach, and we saw it in time.
    const threatened = seen.attacking && !seen.recovering && gap < 190
    if (threatened) {
      const skill = ai.blockSkill * t.block
      // Guessing the guard height right is a separate, harder skill.
      const readsIt = this.rng.chance(t.readMixups)
      const low = readsIt ? seen.attackGuard === 'low' : this.rng.chance(0.5)
      scores.push([
        { kind: low ? 'crouchBlock' : 'block', frames: 16 },
        2.4 * skill + (gap < 120 ? 0.7 : 0),
      ])
    }

    // Anti-air: they are above us and coming down.
    if (!seen.grounded && seen.vy > -3 && gap < 165) {
      scores.push([{ kind: 'antiair', frames: 16, attack: 'hp', crouch: true }, 2.9])
    }

    // --- punishing -------------------------------------------------------
    // A whiffed or blocked move is the one moment a punish is guaranteed.
    if (seen.recovering && gap < 150) {
      scores.push([{ kind: 'attack', frames: 20, attack: gap < 95 ? 'hp' : 'hk' }, 3.1])
      if (me.meter >= MAX_METER && ai.meterHunger > 0.5) {
        scores.push([{ kind: 'super', frames: 40 }, 3.4 * ai.meterHunger])
      }
    }

    // --- offence ---------------------------------------------------------
    // `ATTACK_RANGE` has to overlap the range at which approaching stops being
    // attractive. If it doesn't, the CPU finds a gap where nothing scores well and
    // stands there shuffling — which looks exactly like a broken opponent.
    const ATTACK_RANGE = 140
    if (gap < ATTACK_RANGE) {
      const button: AttackButton = this.rng.chance(0.55) ? 'lp' : this.rng.chance(0.5) ? 'lk' : 'hp'
      const closeness = 1 - gap / ATTACK_RANGE
      scores.push([
        { kind: 'attack', frames: 18, attack: button },
        (1.1 + closeness) * ai.aggression,
      ])
      // Mix in a low attack so the player actually has to block low sometimes.
      if (this.rng.chance(0.35)) {
        scores.push([
          { kind: 'attack', frames: 20, attack: 'lk', crouch: true },
          (1.0 + closeness) * ai.aggression,
        ])
      }
    }

    // Approaching is always on the table when out of range; how far past the
    // preferred spacing we are only changes how much the CPU wants it.
    if (gap > ATTACK_RANGE * 0.7) {
      const eagerness = Math.min(1.6, gap / Math.max(60, ai.spacing))
      scores.push([{ kind: 'approach', frames: 14 }, (0.85 + 0.7 * eagerness) * ai.aggression])
      if (this.dashCooldown === 0 && gap > 260) {
        scores.push([{ kind: 'dashIn', frames: me.def.dashFrames + 3 }, 1.2 * ai.aggression])
      }
    }
    if (gap < ai.spacing - 50) {
      scores.push([{ kind: 'retreat', frames: 12 }, 0.9 * (1 - ai.aggression) + 0.35])
    }

    // Projectiles and specials.
    const special = me.def.moves[me.def.specialId]
    if (special) {
      const isProjectile = special.projectile !== undefined
      const good = isProjectile ? gap > 240 : gap < 190 && gap > 70
      if (good) {
        scores.push([
          { kind: 'special', frames: 30 },
          (isProjectile ? 1.9 * ai.zoning : 1.7 * ai.aggression) * (this.rng.chance(0.5) ? 1 : 0.5),
        ])
      }
    }

    if (me.meter >= MAX_METER && gap < 180) {
      scores.push([{ kind: 'super', frames: 45 }, 1.4 * ai.meterHunger])
    }

    // Jump-ins, and hopping over incoming projectiles.
    const incoming = match.projectileIncoming(me)
    if (incoming || (gap > 200 && gap < 420)) {
      scores.push([{ kind: 'jump', frames: 34 }, (incoming ? 2.2 : 1.1) * (0.4 + ai.jumpiness)])
    }

    // A losing cat gets more desperate; a winning one is happy to run the clock.
    const behind = me.health < foe.health
    for (const entry of scores) {
      if (entry[0].kind === 'approach' || entry[0].kind === 'attack') {
        entry[1] *= behind ? 1.18 : 0.94
      }
    }

    scores.push([{ kind: 'wait', frames: t.think }, 0.55])

    // Add a little noise so the same situation doesn't always play out identically.
    let best = scores[0]!
    let bestScore = -Infinity
    for (const [plan, score] of scores) {
      const jitter = score * (0.82 + this.rng.next() * 0.36)
      if (jitter > bestScore) {
        bestScore = jitter
        best = [plan, score]
      }
    }
    if (best[0].kind === 'dashIn') this.dashCooldown = 40
    return best[0]
  }

  // --- acting --------------------------------------------------------------

  private execute(me: Fighter, seen: Observation): Intent {
    const intent: Intent = { ...NO_INTENT }
    const toFoe = seen.x >= me.x ? 1 : -1
    const first = this.planAge === 0 || !this.firedThisPlan

    switch (this.plan.kind) {
      case 'approach':
        intent.dirX = toFoe
        break
      case 'retreat':
        intent.dirX = -toFoe
        break
      case 'block':
        intent.dirX = -toFoe
        break
      case 'crouchBlock':
        intent.dirX = -toFoe
        intent.dirY = 1
        break
      case 'jump':
        // Only the take-off frame presses up; after that, drift towards them.
        if (me.grounded && this.planAge < 3) intent.dirY = -1
        intent.dirX = toFoe
        break
      case 'dashIn':
        if (this.planAge < 2) intent.dashForward = true
        intent.dirX = toFoe
        break
      case 'antiair':
        intent.dirY = 1
        if (first) {
          intent.attack = 'hp'
          this.firedThisPlan = true
        }
        break
      case 'attack':
        if (this.plan.crouch) intent.dirY = 1
        if (first) {
          intent.attack = this.plan.attack ?? 'lp'
          this.firedThisPlan = true
        }
        break
      case 'special':
        if (first) {
          intent.special = true
          this.firedThisPlan = true
        }
        break
      case 'super':
        if (first) {
          intent.super = true
          this.firedThisPlan = true
        }
        break
      case 'wait':
        break
    }
    return intent
  }
}
