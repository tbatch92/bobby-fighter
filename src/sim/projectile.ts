import { boxToRect, type Rect } from '../core/math'
import type { ProjectileSpec } from './types'

/** A travelling hitbox — hairballs, fur clouds, and anything else thrown. */
export class Projectile {
  readonly owner: 0 | 1
  readonly spec: ProjectileSpec
  x: number
  y: number
  prevX: number
  prevY: number
  vx: number
  vy: number
  facing: 1 | -1
  life: number
  age = 0
  /** Spent projectiles stop hitting but linger a few frames for the pop effect. */
  spent = false
  hitstop = 0
  spin = 0

  constructor(owner: 0 | 1, spec: ProjectileSpec, originX: number, groundY: number, facing: 1 | -1) {
    this.owner = owner
    this.spec = spec
    this.facing = facing
    this.x = this.prevX = originX + spec.offset.x * facing
    this.y = this.prevY = groundY - spec.offset.y
    this.vx = spec.velocity.x * facing
    this.vy = spec.velocity.y
    this.life = spec.life
  }

  get dead(): boolean {
    return this.life <= 0
  }

  update(stageLeft: number, stageRight: number): void {
    this.prevX = this.x
    this.prevY = this.y
    if (this.hitstop > 0) {
      this.hitstop--
      return
    }
    this.age++
    this.spin += this.spec.spin * this.facing
    if (this.spec.gravity) this.vy += this.spec.gravity
    this.x += this.vx
    this.y += this.vy
    this.life--
    if (this.x < stageLeft - 120 || this.x > stageRight + 120) this.life = 0
  }

  rect(): Rect {
    if (this.spent) return { x: 0, y: 0, w: 0, h: 0 }
    // Projectile boxes are authored around the projectile's own centre, so the
    // "height above the feet" convention is folded away by passing y directly.
    return boxToRect(this.spec.box, this.x, this.y, this.facing)
  }

  /** Called when it connects or is cancelled by another projectile. */
  expire(): void {
    this.spent = true
    this.life = Math.min(this.life, 6)
    this.vx *= 0.15
    this.vy = 0
  }
}
