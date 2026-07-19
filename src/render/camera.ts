import { approach, clamp, lerp } from '../core/math'
import { GROUND_Y, STAGE_W, VIEW_H, VIEW_W } from '../sim/physics'

/**
 * The fight camera.
 *
 * It tracks the midpoint between the two cats and zooms out as they separate, so a
 * long-range projectile war and a nose-to-nose scramble both fill the frame. The
 * ground line is pinned to the same screen height at every zoom level, which stops
 * the floor sliding around and keeps the stage feeling solid.
 */

const MIN_ZOOM = 0.78
const MAX_ZOOM = 1.24
/** Gap at which the camera is fully zoomed in / out. */
const TIGHT_GAP = 190
const WIDE_GAP = 620
/** Where the ground line sits on screen, in view pixels. */
const GROUND_SCREEN_Y = 468

export class Camera {
  x = STAGE_W / 2
  y = GROUND_Y - (VIEW_H / 2 - (VIEW_H - GROUND_SCREEN_Y))
  zoom = 1

  private shakeAmount = 0
  private shakeX = 0
  private shakeY = 0
  private shakeSeed = 0

  /** Extra push applied by hits, decaying each frame. */
  kick = 0

  follow(midX: number, gap: number, immediate = false): void {
    const t = clamp((gap - TIGHT_GAP) / (WIDE_GAP - TIGHT_GAP), 0, 1)
    const targetZoom = lerp(MAX_ZOOM, MIN_ZOOM, t)
    this.zoom = immediate ? targetZoom : lerp(this.zoom, targetZoom, 0.08)

    const halfView = VIEW_W / 2 / this.zoom
    const targetX = clamp(midX, halfView, STAGE_W - halfView)
    this.x = immediate ? targetX : lerp(this.x, targetX, 0.14)

    // Solve for the camera centre that puts the world ground line at a fixed
    // screen height regardless of zoom.
    this.y = GROUND_Y - (GROUND_SCREEN_Y - VIEW_H / 2) / this.zoom
  }

  shake(amount: number): void {
    this.shakeAmount = Math.max(this.shakeAmount, amount)
  }

  update(): void {
    this.shakeSeed++
    // Deterministic-looking but cheap: two out-of-phase sines beat random jitter,
    // which reads as noise rather than as impact.
    this.shakeX = Math.sin(this.shakeSeed * 2.7) * this.shakeAmount
    this.shakeY = Math.sin(this.shakeSeed * 4.1) * this.shakeAmount * 0.6
    this.shakeAmount = approach(this.shakeAmount, 0, Math.max(0.6, this.shakeAmount * 0.25))
    this.kick = approach(this.kick, 0, 0.5)
  }

  /** Apply the world transform. Call inside a save/restore. */
  apply(ctx: CanvasRenderingContext2D): void {
    ctx.translate(VIEW_W / 2 + this.shakeX, VIEW_H / 2 + this.shakeY)
    ctx.scale(this.zoom, this.zoom)
    ctx.translate(-this.x, -this.y)
  }

  /** World point -> screen point, for HUD markers and off-screen arrows. */
  toScreen(wx: number, wy: number): { x: number; y: number } {
    return {
      x: (wx - this.x) * this.zoom + VIEW_W / 2 + this.shakeX,
      y: (wy - this.y) * this.zoom + VIEW_H / 2 + this.shakeY,
    }
  }

  reset(midX: number, gap: number): void {
    this.follow(midX, gap, true)
    this.shakeAmount = 0
    this.kick = 0
  }
}
