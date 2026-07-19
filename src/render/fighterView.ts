import { clamp } from '../core/math'
import type { Fighter } from '../sim/fighter'
import { STEP_MS } from '../core/loop'
import { createRigState, drawCat, updateRig, type RigState } from './catRig'
import { poseFor } from './poses'
import { drawGroundShadow } from './stage'
import { withAlpha } from './color'

/**
 * Everything needed to draw one fighter: its rig state, its impact flash, and the
 * interpolation between simulation frames.
 *
 * Positions are interpolated towards the next sim frame so the game looks smooth on
 * a 120Hz display while the simulation stays locked to 60. During hitstop the
 * previous and current positions are identical, so the freeze reads as a hard stop
 * rather than as a stutter.
 */
export class FighterView {
  readonly rig: RigState = createRigState()
  private flash = 0
  private lastHealth = -1
  private t = 0
  /** Trailing afterimages, used by lunging specials and supers. */
  private trail: { x: number; y: number; life: number }[] = []

  update(f: Fighter): void {
    this.t += STEP_MS / 1000

    if (this.lastHealth < 0) this.lastHealth = f.health
    if (f.health < this.lastHealth) this.flash = 1
    this.lastHealth = f.health
    this.flash = Math.max(0, this.flash - 0.12)

    const pose = poseFor(f, this.t)
    updateRig(this.rig, pose, f.def.proportions, f.x - f.prevX, f.y - f.prevY, f.facing, STEP_MS / 1000)

    // Afterimages while moving fast: dashes, teleports, supers.
    const speed = Math.abs(f.x - f.prevX)
    if (speed > 6.5) {
      this.trail.push({ x: f.x, y: f.y, life: 10 })
      if (this.trail.length > 8) this.trail.shift()
    }
    for (let i = this.trail.length - 1; i >= 0; i--) {
      if (--this.trail[i]!.life <= 0) this.trail.splice(i, 1)
    }
  }

  draw(ctx: CanvasRenderingContext2D, f: Fighter, alpha: number): void {
    const x = f.prevX + (f.x - f.prevX) * alpha
    const y = f.prevY + (f.y - f.prevY) * alpha
    const pose = poseFor(f, this.t)
    // Cats only start looking roughed up once they're actually in trouble; tinting
    // from the first hit makes a healthy fighter look ill.
    const lost = 1 - f.health / f.maxHealth
    const hurt = clamp((lost - 0.45) / 0.55, 0, 1) * 0.7

    drawGroundShadow(ctx, x, y, 44 * f.def.proportions.scale)

    for (const g of this.trail) {
      ctx.save()
      ctx.globalAlpha = (g.life / 10) * 0.28
      drawCat(ctx, {
        pose,
        palette: f.def.palette,
        proportions: f.def.proportions,
        rig: this.rig,
        x: g.x,
        y: g.y,
        facing: f.facing,
        silhouette: withAlpha(f.def.palette.coat, 1),
      })
      ctx.restore()
    }

    // A KO sends the cat tumbling. Rotating about the middle of the body rather
    // than the feet is what makes it read as tumbling rather than as pivoting.
    const tumbling = f.state === 'ko' && !f.grounded
    if (tumbling) {
      ctx.save()
      const pivotY = y - 90 * f.def.proportions.scale
      ctx.translate(x, pivotY)
      ctx.rotate(f.stateFrame * 0.13 * -f.facing)
      ctx.translate(-x, -pivotY)
    }

    drawCat(ctx, {
      pose,
      palette: f.def.palette,
      proportions: f.def.proportions,
      rig: this.rig,
      x,
      y,
      facing: f.facing,
      flash: this.flash * 0.85,
      hurt,
    })

    if (tumbling) ctx.restore()

    // Invulnerability shimmer, so reversals and wakeups are legible.
    if (f.invulnerable() && f.state !== 'ko') {
      ctx.save()
      ctx.globalAlpha = 0.28 + 0.2 * Math.sin(this.t * 28)
      drawCat(ctx, {
        pose,
        palette: f.def.palette,
        proportions: f.def.proportions,
        rig: this.rig,
        x,
        y,
        facing: f.facing,
        silhouette: '#9fe8ff',
      })
      ctx.restore()
    }
  }

  reset(): void {
    this.flash = 0
    this.lastHealth = -1
    this.trail.length = 0
  }
}

/** The debug overlay: red hitboxes, blue hurtboxes, a green pushbox. */
export function drawBoxes(ctx: CanvasRenderingContext2D, f: Fighter): void {
  ctx.save()
  ctx.lineWidth = 2

  const pb = f.pushbox()
  ctx.strokeStyle = 'rgba(90, 255, 140, 0.8)'
  ctx.strokeRect(pb.x, pb.y, pb.w, pb.h)

  ctx.fillStyle = 'rgba(70, 150, 255, 0.22)'
  ctx.strokeStyle = 'rgba(70, 170, 255, 0.9)'
  for (const r of f.hurtboxes()) {
    ctx.fillRect(r.x, r.y, r.w, r.h)
    ctx.strokeRect(r.x, r.y, r.w, r.h)
  }

  ctx.fillStyle = 'rgba(255, 60, 60, 0.3)'
  ctx.strokeStyle = 'rgba(255, 80, 80, 1)'
  for (const r of f.activeHitboxes()) {
    ctx.fillRect(r.x, r.y, r.w, r.h)
    ctx.strokeRect(r.x, r.y, r.w, r.h)
  }

  ctx.fillStyle = '#fff'
  ctx.font = '12px ui-monospace, monospace'
  ctx.textAlign = 'center'
  const label = f.move
    ? `${f.move.id} ${f.moveFrame}/${f.move.startup}+${f.move.active}+${f.move.recovery}`
    : `${f.state} ${f.stateFrame}`
  ctx.fillText(label, f.x, f.y + 22)
  ctx.restore()
}
