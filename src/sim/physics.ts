/** Shared world constants. Everything is in pixels and frames. */

/** Logical render resolution. The canvas scales to fit; the game never changes. */
export const VIEW_W = 960
export const VIEW_H = 540

/** Y of the floor. Fighters' feet rest here; the HUD lives above. */
export const GROUND_Y = 468

/** The stage is wider than the view, so the camera has somewhere to travel. */
export const STAGE_W = 1500
/** Fighters cannot walk past this many pixels from either stage edge. */
export const WALL_MARGIN = 70

export const STAGE_LEFT = WALL_MARGIN
export const STAGE_RIGHT = STAGE_W - WALL_MARGIN

/** Downward acceleration per frame, before the character's weight multiplier. */
export const GRAVITY = 0.86

/** Ground friction applied when a fighter isn't driving their own movement. */
export const FRICTION = 0.62

/** Frames of landing recovery after any jump. */
export const LANDING_LAG = 3

/** Frames spent on the floor after a hard knockdown, then getting up. */
export const KNOCKDOWN_FRAMES = 26
export const WAKEUP_FRAMES = 16

/** Meter is a 0..100 bar; a super costs the lot. */
export const MAX_METER = 100
export const SUPER_COST = 100

/** Damage falls off through a combo so long strings can't delete a health bar. */
export function comboScaling(hitsSoFar: number): number {
  if (hitsSoFar <= 1) return 1
  return Math.max(0.28, 1 - 0.12 * (hitsSoFar - 1))
}
