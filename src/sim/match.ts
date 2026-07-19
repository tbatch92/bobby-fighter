import { NO_INTENT, type Intent } from '../core/input'
import { Rng } from '../core/rng'
import { Fighter } from './fighter'
import { Projectile } from './projectile'
import { resolveCombat, separate } from './collision'
import { GROUND_Y, STAGE_LEFT, STAGE_RIGHT, STAGE_W } from './physics'
import type { CharacterDef, HitEvent } from './types'

export type MatchPhase = 'intro' | 'ready' | 'fight' | 'ko' | 'roundEnd' | 'matchEnd'

/** Round timer in arcade units, and how many frames each unit lasts. */
const TIMER_START = 99
const FRAMES_PER_TICK = 47

const INTRO_FRAMES = 70
const READY_FRAMES = 75
const KO_FRAMES = 110
const ROUND_END_FRAMES = 110

/** First to this many round wins takes the match. */
export const ROUNDS_TO_WIN = 2

const START_OFFSET = 150

export interface MatchEvents {
  hits: HitEvent[]
  dust: { x: number; y: number; amount: number }[]
  voices: { side: 0 | 1; sound: string }[]
  /** Fires once when a round is decided. */
  roundOver: { winner: 0 | 1 | null } | null
}

/**
 * Owns a whole best-of-three between two cats: both fighters, their projectiles,
 * the round timer, and the little ceremony around each round.
 *
 * The match never reads input directly — controllers hand it two `Intent`s per
 * frame. That keeps the human player and the CPU completely interchangeable and
 * makes the simulation replayable from a recorded intent stream.
 */
export class Match {
  readonly fighters: [Fighter, Fighter]
  projectiles: Projectile[] = []
  readonly rng: Rng

  phase: MatchPhase = 'intro'
  phaseFrame = 0
  round = 1
  timer = TIMER_START
  private timerSub = 0
  /** Whole-screen freeze during a super's flash. */
  freeze = 0
  /** Side that won the last round, or null for a draw. */
  lastRoundWinner: 0 | 1 | null = null
  matchWinner: 0 | 1 | null = null

  readonly events: MatchEvents = { hits: [], dust: [], voices: [], roundOver: null }

  constructor(defA: CharacterDef, defB: CharacterDef, seed = 12345) {
    this.fighters = [new Fighter(defA, 0), new Fighter(defB, 1)]
    this.rng = new Rng(seed)
    this.resetRound(true)
  }

  get centreX(): number {
    return (this.fighters[0].x + this.fighters[1].x) / 2
  }

  /** Distance between the two cats, used constantly by the AI and the camera. */
  get gap(): number {
    return Math.abs(this.fighters[0].x - this.fighters[1].x)
  }

  resetRound(fullReset: boolean): void {
    const mid = STAGE_W / 2
    this.fighters[0].reset(mid - START_OFFSET, 1, true)
    this.fighters[1].reset(mid + START_OFFSET, -1, true)
    if (fullReset) {
      this.fighters[0].roundsWon = 0
      this.fighters[1].roundsWon = 0
      this.round = 1
      this.matchWinner = null
    }
    this.projectiles.length = 0
    this.timer = TIMER_START
    this.timerSub = 0
    this.phase = 'intro'
    this.phaseFrame = 0
    this.freeze = 0
  }

  step(intents: [Intent, Intent]): void {
    this.events.hits.length = 0
    this.events.dust.length = 0
    this.events.voices.length = 0
    this.events.roundOver = null

    this.phaseFrame++

    if (this.freeze > 0) {
      this.freeze--
      return
    }

    switch (this.phase) {
      case 'intro':
        if (this.phaseFrame >= INTRO_FRAMES) this.setPhase('ready')
        return
      case 'ready':
        if (this.phaseFrame >= READY_FRAMES) {
          this.setPhase('fight')
          this.fighters[0].state = 'idle'
          this.fighters[1].state = 'idle'
        }
        return
      case 'ko':
        this.simulate([NO_INTENT, NO_INTENT])
        if (this.phaseFrame >= KO_FRAMES) this.finishRound()
        return
      case 'roundEnd':
        this.simulate([NO_INTENT, NO_INTENT])
        if (this.phaseFrame >= ROUND_END_FRAMES) this.nextRound()
        return
      case 'matchEnd':
        this.simulate([NO_INTENT, NO_INTENT])
        return
      case 'fight':
        break
    }

    this.simulate(intents)
    this.tickTimer()
    this.checkRoundOver()
  }

  private setPhase(phase: MatchPhase): void {
    this.phase = phase
    this.phaseFrame = 0
  }

  private simulate(intents: [Intent, Intent]): void {
    const [a, b] = this.fighters

    a.update(intents[0], b.x)
    b.update(intents[1], a.x)

    this.drainRequests(a)
    this.drainRequests(b)

    for (const p of this.projectiles) p.update(STAGE_LEFT, STAGE_RIGHT)

    resolveCombat(this.fighters, this.projectiles, this.events.hits)
    separate(a, b)

    this.projectiles = this.projectiles.filter((p) => !p.dead)
  }

  private drainRequests(f: Fighter): void {
    for (const req of f.requests) {
      switch (req.kind) {
        case 'projectile': {
          const spec = req.move.projectile
          if (spec) this.projectiles.push(new Projectile(f.side, spec, f.x, f.y, f.facing))
          break
        }
        case 'superFreeze':
          this.freeze = Math.max(this.freeze, req.frames)
          break
        case 'dust':
          this.events.dust.push({ x: req.x, y: req.y, amount: req.amount })
          break
        case 'voice':
          this.events.voices.push({ side: f.side, sound: req.sound })
          break
      }
    }
    f.requests.length = 0
  }

  private tickTimer(): void {
    this.timerSub++
    if (this.timerSub >= FRAMES_PER_TICK) {
      this.timerSub = 0
      this.timer = Math.max(0, this.timer - 1)
    }
  }

  private checkRoundOver(): void {
    const [a, b] = this.fighters
    const aDown = !a.alive
    const bDown = !b.alive

    if (aDown || bDown) {
      this.lastRoundWinner = aDown && bDown ? null : aDown ? 1 : 0
      this.setPhase('ko')
      return
    }

    if (this.timer <= 0) {
      const pa = a.health / a.maxHealth
      const pb = b.health / b.maxHealth
      this.lastRoundWinner = pa === pb ? null : pa > pb ? 0 : 1
      this.setPhase('ko')
    }
  }

  private finishRound(): void {
    const w = this.lastRoundWinner
    if (w === null) {
      this.fighters[0].roundsWon++
      this.fighters[1].roundsWon++
    } else {
      this.fighters[w].roundsWon++
      this.fighters[w].state = 'victory'
      this.fighters[w].stateFrame = 0
    }
    this.events.roundOver = { winner: w }

    const [a, b] = this.fighters
    if (a.roundsWon >= ROUNDS_TO_WIN || b.roundsWon >= ROUNDS_TO_WIN) {
      this.matchWinner =
        a.roundsWon > b.roundsWon ? 0 : b.roundsWon > a.roundsWon ? 1 : null
      this.setPhase('matchEnd')
    } else {
      this.setPhase('roundEnd')
    }
  }

  private nextRound(): void {
    this.round++
    const mid = STAGE_W / 2
    this.fighters[0].reset(mid - START_OFFSET, 1, true)
    this.fighters[1].reset(mid + START_OFFSET, -1, true)
    this.projectiles.length = 0
    this.timer = TIMER_START
    this.timerSub = 0
    this.setPhase('intro')
  }

  /** Is an enemy projectile currently bearing down on this fighter? */
  projectileIncoming(f: Fighter): boolean {
    return this.projectiles.some((p) => {
      if (p.spent || p.owner === f.side) return false
      const dx = f.x - p.x
      return Math.sign(dx) === Math.sign(p.vx) && Math.abs(dx) < 340
    })
  }

  /** Whole-match fingerprint for the determinism test. */
  hash(): number {
    let h = this.fighters[0].hash() ^ Math.imul(this.fighters[1].hash(), 31)
    h = Math.imul(h ^ this.projectiles.length, 16777619)
    h = Math.imul(h ^ this.timer, 16777619)
    return h >>> 0
  }
}

export { GROUND_Y }
