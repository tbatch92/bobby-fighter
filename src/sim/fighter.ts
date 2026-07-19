import { approach, boxToRect, clamp, type Rect } from '../core/math'
import type { AttackButton, Intent } from '../core/input'
import type { CharacterDef, Move, StateName } from './types'
import { moveDuration } from './moves'
import {
  FRICTION,
  GRAVITY,
  GROUND_Y,
  KNOCKDOWN_FRAMES,
  LANDING_LAG,
  MAX_METER,
  STAGE_LEFT,
  STAGE_RIGHT,
  WAKEUP_FRAMES,
} from './physics'

/** Something the fighter wants the match to do on its behalf this frame. */
export type FighterRequest =
  | { kind: 'projectile'; move: Move }
  | { kind: 'superFreeze'; frames: number }
  | { kind: 'voice'; sound: string }
  | { kind: 'dust'; x: number; y: number; amount: number }

/**
 * One fighter: a frame-driven state machine plus the physics of a body that can
 * stand, crouch, jump and get knocked over.
 *
 * The single most important rule in here is that nothing advances while `hitstop`
 * is non-zero. Hitstop is the few frames of total freeze on impact that make a hit
 * feel like it landed, and because it pauses the move counter too, it costs neither
 * fighter any frame advantage.
 */
export class Fighter {
  readonly def: CharacterDef
  readonly side: 0 | 1

  x = 0
  y = GROUND_Y
  vx = 0
  vy = 0
  /** +1 faces right, -1 faces left. */
  facing: 1 | -1 = 1

  /** Position at the end of the previous frame, for render interpolation. */
  prevX = 0
  prevY = GROUND_Y

  state: StateName = 'idle'
  stateFrame = 0

  move: Move | null = null
  /** 1-based frame counter within the current move. */
  moveFrame = 0
  /** A move may only connect once per activation (multi-hit moves opt out). */
  moveHasHit = false

  health: number
  meter = 0
  roundsWon = 0

  hitstop = 0
  /** Remaining hitstun or blockstun frames. */
  stunFrames = 0
  /** Hits of armour left on the current move. */
  armour = 0

  grounded = true
  crouching = false
  /** Holding away from the opponent — the guard is up if a hit arrives. */
  guarding = false
  /** Air normals are limited to one per jump so jump-ins can't be spammed. */
  airAttackUsed = false
  /** Combo counter for the *opponent's* current string, tracked on the victim. */
  comboHits = 0
  /** Frames since the fighter last acted freely — the CPU reads this to punish. */
  vulnerableFrames = 0

  /** Requests drained by the match each frame (projectiles, sounds, dust). */
  requests: FighterRequest[] = []

  constructor(def: CharacterDef, side: 0 | 1) {
    this.def = def
    this.side = side
    this.health = def.maxHealth
  }

  // --- queries ------------------------------------------------------------

  get maxHealth(): number {
    return this.def.maxHealth
  }

  get alive(): boolean {
    return this.health > 0
  }

  /** In a state where the player has control. */
  canAct(): boolean {
    return (
      this.state === 'idle' ||
      this.state === 'walk' ||
      this.state === 'crouch' ||
      this.state === 'jump' ||
      this.state === 'land'
    )
  }

  /** In a state where they can be made to face the other way. */
  private canTurn(): boolean {
    return this.state === 'idle' || this.state === 'walk' || this.state === 'crouch'
  }

  /** Invulnerable right now — backdash startup, wakeup, or a move's i-frames. */
  invulnerable(): boolean {
    if (this.state === 'wakeup') return true
    if (this.state === 'ko') return true
    const inv = this.move?.invuln
    if (inv && this.state === 'attack' && this.moveFrame >= inv.from && this.moveFrame <= inv.to) {
      return true
    }
    return false
  }

  hurtboxes(): Rect[] {
    if (this.invulnerable()) return []
    const set = this.def.hurtboxes
    let boxes = set.stand
    if (this.move?.hurtboxes && this.state === 'attack') boxes = this.move.hurtboxes
    else if (this.state === 'knockdown') boxes = set.down
    else if (!this.grounded) boxes = set.air
    else if (this.crouching) boxes = set.crouch
    return boxes.map((b) => boxToRect(b, this.x, this.y, this.facing))
  }

  activeHitboxes(): Rect[] {
    if (this.state !== 'attack' || !this.move || this.moveHasHit) return []
    return this.move.hitboxes
      .filter((h) => this.moveFrame >= h.from && this.moveFrame <= h.to)
      .map((h) => boxToRect(h.box, this.x, this.y, this.facing))
  }

  /** The solid body used to stop fighters walking through each other. */
  pushbox(): Rect {
    const r = this.def.bodyRadius
    const h = this.crouching || this.state === 'knockdown' ? 110 : 168
    return { x: this.x - r, y: this.y - h, w: r * 2, h }
  }

  // --- lifecycle ----------------------------------------------------------

  reset(x: number, facing: 1 | -1, fullHealth: boolean): void {
    this.x = this.prevX = x
    this.y = this.prevY = GROUND_Y
    this.vx = this.vy = 0
    this.facing = facing
    this.state = 'intro'
    this.stateFrame = 0
    this.move = null
    this.moveFrame = 0
    this.moveHasHit = false
    this.hitstop = 0
    this.stunFrames = 0
    this.grounded = true
    this.crouching = false
    this.guarding = false
    this.airAttackUsed = false
    this.comboHits = 0
    this.armour = 0
    this.requests.length = 0
    if (fullHealth) {
      this.health = this.def.maxHealth
      this.meter = 0
    }
  }

  // --- per-frame ----------------------------------------------------------

  update(intent: Intent, opponentX: number): void {
    this.prevX = this.x
    this.prevY = this.y

    // Hitstop freezes absolutely everything, including the move's own counter.
    if (this.hitstop > 0) {
      this.hitstop--
      return
    }

    this.stateFrame++

    if (this.canTurn()) {
      this.facing = opponentX >= this.x ? 1 : -1
    }

    switch (this.state) {
      case 'intro':
        // Held by the match until the round starts.
        break
      case 'attack':
        this.updateAttack(intent)
        break
      case 'hitstun':
      case 'blockstun':
        this.updateStun()
        break
      case 'knockdown':
        if (this.stateFrame >= KNOCKDOWN_FRAMES) this.enter('wakeup')
        break
      case 'wakeup':
        if (this.stateFrame >= WAKEUP_FRAMES) this.enter('idle')
        break
      case 'dash':
        this.updateDash()
        break
      case 'land':
        if (this.stateFrame >= LANDING_LAG) this.enter('idle')
        else this.vx = approach(this.vx, 0, FRICTION)
        break
      case 'ko':
      case 'victory':
        this.vx = approach(this.vx, 0, FRICTION)
        break
      default:
        this.updateFree(intent)
    }

    this.integrate()
    this.vulnerableFrames = this.canAct() ? 0 : this.vulnerableFrames + 1
  }

  private enter(state: StateName): void {
    this.state = state
    this.stateFrame = 0
    if (state !== 'attack') {
      this.move = null
      this.moveFrame = 0
    }
  }

  /** Free movement: walking, crouching, jumping, dashing, starting attacks. */
  private updateFree(intent: Intent): void {
    const forward = intent.dirX === this.facing
    const back = intent.dirX === -this.facing

    if (this.grounded) {
      this.crouching = intent.dirY > 0
      // Holding away from the opponent is the guard, Street Fighter style. Whether
      // it actually stops the incoming attack depends on that attack's guard height,
      // which `collision.ts` decides at the moment of impact.
      this.guarding = back

      if (this.tryAttack(intent)) return

      if (intent.dashForward || intent.dashBack) {
        this.startDash(intent.dashForward ? 1 : -1)
        return
      }

      if (intent.dirY < 0) {
        this.jump(intent.dirX)
        return
      }

      if (this.crouching) {
        this.vx = approach(this.vx, 0, FRICTION)
        if (this.state !== 'crouch') this.enter('crouch')
      } else if (intent.dirX !== 0) {
        this.vx = forward ? this.def.walkForward * intent.dirX : this.def.walkBack * intent.dirX
        if (this.state !== 'walk') this.enter('walk')
      } else {
        this.vx = approach(this.vx, 0, FRICTION)
        if (this.state !== 'idle') this.enter('idle')
      }
    } else {
      // Airborne: no guard, limited air control, one attack per jump.
      this.guarding = false
      this.crouching = false
      this.tryAttack(intent)
    }
  }

  private updateStun(): void {
    this.stunFrames--
    this.vx = approach(this.vx, 0, this.grounded ? FRICTION * 0.7 : 0)
    if (this.stunFrames <= 0) {
      // Being launched means you don't recover until you touch the floor.
      if (!this.grounded) return
      this.comboHits = 0
      this.enter(this.crouching ? 'crouch' : 'idle')
    }
  }

  private updateDash(): void {
    if (this.stateFrame >= this.def.dashFrames) {
      this.vx = 0
      this.enter('idle')
    }
  }

  private updateAttack(intent: Intent): void {
    this.moveFrame++
    const move = this.move
    if (!move) {
      this.enter('idle')
      return
    }

    for (const imp of move.impulses ?? []) {
      if (imp.frame === this.moveFrame) {
        this.vx = imp.vx * this.facing
        if (imp.vy !== 0) {
          this.vy = imp.vy
          this.grounded = false
        }
      }
    }

    if (move.projectile && this.moveFrame === move.projectile.spawnFrame) {
      this.requests.push({ kind: 'projectile', move })
    }

    if (this.grounded && !move.impulses) this.vx = approach(this.vx, 0, FRICTION)

    // Multi-hit moves are written as several disjoint hitbox windows. Clearing the
    // "already connected" flag in the gap between windows lets each window hit once,
    // without any special multi-hit machinery in the collision code.
    if (this.moveHasHit && !this.hitboxLiveThisFrame(move)) this.moveHasHit = false

    // Cancel windows: once a move has connected it can be cancelled into
    // anything on its list, which is where combos come from.
    if (this.moveHasHit && move.cancels.length > 0) {
      if (this.tryAttack(intent, move.cancels)) return
    }

    if (this.moveFrame > moveDuration(move)) {
      this.armour = 0
      if (!this.grounded) this.enter('jump')
      else this.enter(this.crouching ? 'crouch' : 'idle')
    }
  }

  private hitboxLiveThisFrame(move: Move): boolean {
    return move.hitboxes.some((h) => this.moveFrame >= h.from && this.moveFrame <= h.to)
  }

  /** Try to start a special, super or normal. Returns true if a move started. */
  private tryAttack(intent: Intent, restrictTo?: string[]): boolean {
    const allowed = (id: string): boolean => !restrictTo || restrictTo.includes(id)

    if (intent.super && this.meter >= MAX_METER && allowed('super')) {
      const sup = this.def.moves[this.def.superId]
      if (sup && this.moveUsable(sup)) return this.startMove(sup)
    }

    if (intent.special && allowed('special')) {
      const sp = this.def.moves[this.def.specialId]
      if (sp && this.moveUsable(sp) && this.meter >= sp.meterCost) return this.startMove(sp)
    }

    if (intent.attack) {
      const table = !this.grounded
        ? this.def.normals.air
        : this.crouching
          ? this.def.normals.crouch
          : this.def.normals.stand
      const id = table[intent.attack as AttackButton]
      if (id && allowed(id)) {
        const m = this.def.moves[id]
        if (m && this.moveUsable(m)) return this.startMove(m)
      }
    }
    return false
  }

  private moveUsable(m: Move): boolean {
    if (m.from === 'air') {
      if (this.grounded || this.airAttackUsed) return false
    } else if (!this.grounded) {
      return false
    }
    return true
  }

  startMove(m: Move): boolean {
    this.move = m
    this.moveFrame = 0
    this.moveHasHit = false
    this.state = 'attack'
    this.stateFrame = 0
    this.guarding = false
    this.armour = m.armour
    this.meter = Math.max(0, this.meter - m.meterCost)
    if (!this.grounded) this.airAttackUsed = true
    if (m.superFreeze > 0) this.requests.push({ kind: 'superFreeze', frames: m.superFreeze })
    if (m.voice) this.requests.push({ kind: 'voice', sound: m.voice })
    return true
  }

  private jump(dirX: number): void {
    this.vy = this.def.jumpVelocity
    this.vx = dirX * this.def.walkForward * 1.15
    this.grounded = false
    this.airAttackUsed = false
    this.crouching = false
    this.requests.push({ kind: 'dust', x: this.x, y: this.y, amount: 6 })
    this.enter('jump')
  }

  private startDash(dir: number): void {
    this.vx = this.def.dashSpeed * dir * this.facing
    this.requests.push({ kind: 'dust', x: this.x, y: this.y, amount: 4 })
    this.enter('dash')
  }

  private integrate(): void {
    if (!this.grounded) {
      this.vy += GRAVITY * this.def.weight
      this.y += this.vy
      if (this.y >= GROUND_Y) {
        this.y = GROUND_Y
        this.vy = 0
        this.grounded = true
        this.onLand()
      }
    }
    this.x = clamp(this.x + this.vx, STAGE_LEFT, STAGE_RIGHT)
  }

  private onLand(): void {
    this.airAttackUsed = false
    this.requests.push({ kind: 'dust', x: this.x, y: this.y, amount: 5 })
    if (this.state === 'hitstun') {
      // Landing out of a launch is a hard knockdown.
      this.knockDown()
    } else if (this.state !== 'ko') {
      this.vx = 0
      this.enter('land')
    }
  }

  knockDown(): void {
    this.comboHits = 0
    this.vx = 0
    this.crouching = false
    this.enter('knockdown')
    this.requests.push({ kind: 'dust', x: this.x, y: this.y, amount: 10 })
  }

  addMeter(amount: number): void {
    this.meter = clamp(this.meter + amount, 0, MAX_METER)
  }

  /** Apply a confirmed hit. Blocking, armour and KO are decided by the caller. */
  takeHit(damage: number, hitstun: number, kbX: number, kbY: number, knockdown: boolean): void {
    this.health = Math.max(0, this.health - damage)
    this.comboHits++
    this.move = null
    this.moveFrame = 0
    this.guarding = false
    this.vx = kbX
    if (kbY < 0) {
      this.vy = kbY
      this.grounded = false
    }

    if (this.health <= 0) {
      this.state = 'ko'
      this.stateFrame = 0
      this.vx = kbX * 1.4
      this.vy = Math.min(kbY, -7)
      this.grounded = false
      return
    }

    if (knockdown && this.grounded) {
      this.knockDown()
      return
    }
    this.stunFrames = hitstun
    this.enter('hitstun')
  }

  takeBlock(chip: number, blockstun: number, pushX: number): void {
    this.health = Math.max(0, this.health - chip)
    this.vx = pushX
    this.stunFrames = blockstun
    this.guarding = true
    this.enter('blockstun')
    if (this.health <= 0) {
      this.state = 'ko'
      this.grounded = false
      this.vy = -6
    }
  }

  /** Compact state fingerprint used by the determinism test. */
  hash(): number {
    const parts = [
      Math.round(this.x * 16),
      Math.round(this.y * 16),
      Math.round(this.vx * 64),
      Math.round(this.vy * 64),
      this.facing,
      this.state.length + this.state.charCodeAt(0),
      this.stateFrame,
      this.moveFrame,
      Math.round(this.health),
      Math.round(this.meter),
      this.grounded ? 1 : 0,
    ]
    let h = 2166136261
    for (const p of parts) {
      h ^= p | 0
      h = Math.imul(h, 16777619)
    }
    return h >>> 0
  }
}
