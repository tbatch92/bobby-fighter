/**
 * Small maths helpers shared by the simulation and the renderer.
 *
 * Coordinate conventions used everywhere in this project:
 *   - World space is in pixels, x grows right, y grows DOWN (screen convention).
 *   - A fighter's position is the point between their feet, on the ground plane.
 *   - `Box` is a *local, facing-relative* box: `x` is the forward offset of the box
 *     centre, `y` is the height of the box centre ABOVE the fighter's feet. This lets
 *     move data be written the way you'd describe it out loud ("40px in front, 60px up")
 *     and mirrored for free by multiplying x by the fighter's facing.
 *   - `Rect` is an absolute, axis-aligned world rect anchored at its top-left corner.
 */

export const TAU = Math.PI * 2

export interface Vec2 {
  x: number
  y: number
}

/** Facing-relative box: centre at (forward `x`, `y` above the feet). */
export interface Box {
  x: number
  y: number
  w: number
  h: number
}

/** Absolute world-space rect anchored at its top-left corner. */
export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

export const clamp = (v: number, lo: number, hi: number): number =>
  v < lo ? lo : v > hi ? hi : v

export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t

/** Interpolate angles the short way round, so poses never spin the long way. */
export function lerpAngle(a: number, b: number, t: number): number {
  let d = (b - a) % TAU
  if (d > Math.PI) d -= TAU
  if (d < -Math.PI) d += TAU
  return a + d * t
}

/** Move `v` towards `target` by at most `step`. */
export function approach(v: number, target: number, step: number): number {
  if (v < target) return Math.min(v + step, target)
  if (v > target) return Math.max(v - step, target)
  return target
}

export const sign = (v: number): number => (v > 0 ? 1 : v < 0 ? -1 : 0)

/** Smoothstep easing, used to give pose interpolation some weight. */
export const smoothstep = (t: number): number => t * t * (3 - 2 * t)

/** Convert a facing-relative box into an absolute world rect. */
export function boxToRect(box: Box, originX: number, groundY: number, facing: number): Rect {
  const cx = originX + facing * box.x
  const cy = groundY - box.y
  return { x: cx - box.w / 2, y: cy - box.h / 2, w: box.w, h: box.h }
}

export function rectsOverlap(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y
}

/** Centre point of the overlap between two rects — where a hit spark belongs. */
export function overlapCentre(a: Rect, b: Rect): Vec2 {
  const x0 = Math.max(a.x, b.x)
  const x1 = Math.min(a.x + a.w, b.x + b.w)
  const y0 = Math.max(a.y, b.y)
  const y1 = Math.min(a.y + a.h, b.y + b.h)
  return { x: (x0 + x1) / 2, y: (y0 + y1) / 2 }
}
