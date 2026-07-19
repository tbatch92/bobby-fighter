import type { Vec2 } from '../core/math'
import { clamp } from '../core/math'
import { darken, lighten, mix, withAlpha } from './color'

/**
 * The procedural cat.
 *
 * Every fighter in this game is drawn from the same skeleton: a bipedal cat posed by
 * joint angles and painted with a palette. There are no image assets anywhere, which
 * means a new fighter costs one data object rather than a sprite sheet, and any pose
 * the simulation asks for can be drawn at any size without redrawing artwork.
 *
 * All drawing happens in "cat space": the origin sits between the feet, +x is the
 * direction the cat faces, and +y points down into the floor. The caller flips the
 * horizontal axis for a left-facing cat, so poses never need mirrored variants.
 */

export type Marking =
  | 'eyePatch'
  | 'earPatchNear'
  | 'earPatchFar'
  | 'shoulderPatch'
  | 'backPatch'
  | 'tailRings'
  | 'tabbyStripes'
  | 'tuxedoChest'
  | 'socks'
  | 'maskFace'
  | 'scar'
  | 'tornEar'

export interface CatPalette {
  coat: string
  belly: string
  patch: string
  nose: string
  eye: string
  pupil: string
  innerEar: string
  outline: string
  markings: Marking[]
}

export interface CatProportions {
  /** Overall size. 1.0 is the reference cat. */
  scale: number
  /** Torso girth multiplier. */
  girth: number
  legLength: number
  headSize: number
  earSize: number
  /** 0 = sleek, 1 = extremely fluffy. Adds silhouette tufts. */
  fluff: number
  tailLength: number
  tailFluff: number
  /** Muzzle projection — flat-faced Persians vs pointy Siamese. */
  snout: number
}

export const DEFAULT_PROPORTIONS: CatProportions = {
  scale: 1,
  girth: 1,
  legLength: 1,
  headSize: 1,
  earSize: 1,
  fluff: 0.35,
  tailLength: 1,
  tailFluff: 0.4,
  snout: 1,
}

/**
 * A pose is the full set of joint angles. Angles are in radians; 0 points straight
 * down for limbs and straight up for the spine, and positive always rotates towards
 * the direction the cat is facing.
 */
export interface Pose {
  /** Pelvis height above the feet, as a fraction of the standing height. */
  hip: number
  /** Pelvis forward shift, in cat units. */
  hipX: number
  /** Spine lean; positive leans towards the opponent. */
  lean: number
  /** Extra spine extension, for stretching and lunging. */
  stretch: number
  headAngle: number
  headX: number
  headY: number
  /** 0 = ears perked, 1 = ears flat back. Cats flatten when they mean it. */
  earFlat: number
  /** [shoulder, elbow] for the arm nearest the viewer. */
  armNear: [number, number]
  armFar: [number, number]
  /** [hip, knee] */
  legNear: [number, number]
  legFar: [number, number]
  /** Base angle of the tail; the rest is spring physics. */
  tailBase: number
  /** How much the tail curls along its length. */
  tailCurl: number
  /** Vertical squash/stretch. 1 is neutral, <1 squashed. */
  squash: number
  /** 0 shut, 1 wide open. */
  mouth: number
  /** 1 open, 0 screwed shut. */
  eye: number
  /** -1 worried, 0 neutral, +1 furious. */
  brow: number
  /** Claws out — drawn on the near paw. */
  claws: number
}

export const NEUTRAL_POSE: Pose = {
  hip: 1,
  hipX: -2,
  lean: 0.13,
  stretch: 0,
  headAngle: -0.08,
  headX: 3,
  headY: 0,
  earFlat: 0,
  armNear: [0.72, 1.42],
  armFar: [0.46, 1.52],
  legNear: [0.42, -0.62],
  legFar: [-0.38, 0.58],
  tailBase: -2.15,
  tailCurl: 0.15,
  squash: 1,
  mouth: 0,
  eye: 1,
  brow: 0.25,
  claws: 0,
}

/**
 * Reference skeleton, in cat units. A standing cat is ~180 units tall, split
 * roughly 39% legs / 27% torso / 34% head — a cartoon cat's head is large, but not
 * so large that the body stops carrying the pose.
 */
const SKEL = {
  hipHeight: 70,
  spine: 48,
  neck: 13,
  headR: 25,
  earH: 26,
  upperArm: 29,
  foreArm: 26,
  thigh: 38,
  shin: 38,
  footLen: 19,
  tailSegs: 8,
  tailSeg: 16,
  limbW: 13,
  armW: 11,
  neckW: 25,
}

/** Standing height of the reference cat, used to size stages and hurtboxes. */
export const CAT_HEIGHT = SKEL.hipHeight + SKEL.spine + SKEL.neck + SKEL.headR * 1.1

// --- small geometry helpers -----------------------------------------------

const v = (x: number, y: number): Vec2 => ({ x, y })
const add = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x + b.x, y: a.y + b.y })

/** A limb segment: angle 0 hangs straight down, positive swings forward. */
const down = (len: number, a: number): Vec2 => ({ x: Math.sin(a) * len, y: Math.cos(a) * len })

/** A spine segment: lean 0 points straight up, positive tilts forward. */
const up = (len: number, lean: number): Vec2 => ({
  x: Math.sin(lean) * len,
  y: -Math.cos(lean) * len,
})

/**
 * Catmull-Rom through the given points, emitted as bezier curves. Everything
 * organic in the cat — head, torso, ears, tail — is built from this, which is why
 * the cats read as soft rather than as a pile of rectangles.
 */
function smoothClosedPath(ctx: CanvasRenderingContext2D, pts: Vec2[], tension = 0.42): void {
  const n = pts.length
  ctx.moveTo(pts[0]!.x, pts[0]!.y)
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n]!
    const p1 = pts[i]!
    const p2 = pts[(i + 1) % n]!
    const p3 = pts[(i + 2) % n]!
    ctx.bezierCurveTo(
      p1.x + ((p2.x - p0.x) * tension) / 3,
      p1.y + ((p2.y - p0.y) * tension) / 3,
      p2.x - ((p3.x - p1.x) * tension) / 3,
      p2.y - ((p3.y - p1.y) * tension) / 3,
      p2.x,
      p2.y,
    )
  }
  ctx.closePath()
}

// --- forward kinematics ----------------------------------------------------

interface Joints {
  hip: Vec2
  chest: Vec2
  headBase: Vec2
  head: Vec2
  headRot: number
  shoulderNear: Vec2
  shoulderFar: Vec2
  elbowNear: Vec2
  elbowFar: Vec2
  pawNear: Vec2
  pawFar: Vec2
  kneeNear: Vec2
  kneeFar: Vec2
  footNear: Vec2
  footFar: Vec2
  tailRoot: Vec2
}

function solve(pose: Pose, p: CatProportions): Joints {
  const legK = p.legLength
  const hip = v(pose.hipX, -SKEL.hipHeight * legK * pose.hip)
  const spineLen = (SKEL.spine + pose.stretch) * p.girth ** 0.25
  const chest = add(hip, up(spineLen, pose.lean))

  const headRot = pose.lean + pose.headAngle
  const headBase = add(chest, up(SKEL.neck, headRot))
  const head = add(headBase, {
    x: up(SKEL.headR * 0.55 * p.headSize, headRot).x + pose.headX,
    y: up(SKEL.headR * 0.55 * p.headSize, headRot).y + pose.headY,
  })

  // Shoulders sit towards the front edge of the ribcage rather than on the spine,
  // so the upper arm emerges from the body instead of being swallowed by it.
  const shoulderNear = add(chest, v(15 * p.girth, 4))
  const shoulderFar = add(chest, v(8 * p.girth, 8))

  const arm = (shoulder: Vec2, a: [number, number]): [Vec2, Vec2] => {
    const elbow = add(shoulder, down(SKEL.upperArm, a[0] + pose.lean))
    const paw = add(elbow, down(SKEL.foreArm, a[0] + a[1] + pose.lean))
    return [elbow, paw]
  }
  const [elbowNear, pawNear] = arm(shoulderNear, pose.armNear)
  const [elbowFar, pawFar] = arm(shoulderFar, pose.armFar)

  const leg = (origin: Vec2, a: [number, number]): [Vec2, Vec2] => {
    const knee = add(origin, down(SKEL.thigh * legK, a[0]))
    const foot = add(knee, down(SKEL.shin * legK, a[0] + a[1]))
    return [knee, foot]
  }
  const [kneeNear, footNear] = leg(add(hip, v(4, 0)), pose.legNear)
  const [kneeFar, footFar] = leg(add(hip, v(-6, 2)), pose.legFar)

  return {
    hip,
    chest,
    headBase,
    head,
    headRot,
    shoulderNear,
    shoulderFar,
    elbowNear,
    elbowFar,
    pawNear,
    pawFar,
    kneeNear,
    kneeFar,
    footNear,
    footFar,
    tailRoot: add(hip, v(-26 * p.girth, -2)),
  }
}

// --- tail physics ----------------------------------------------------------

/**
 * Per-fighter render state. The tail is a spring chain rather than a keyframed
 * limb: it lags behind the body, overshoots on direction changes and settles with
 * a wobble. It is the cheapest single thing that makes the whole rig read as a cat.
 */
export interface RigState {
  tail: Vec2[]
  tailVel: Vec2[]
  /** Free-running counter for breathing and idle sway. */
  t: number
  lastX: number
  lastY: number
}

export function createRigState(): RigState {
  const tail: Vec2[] = []
  const tailVel: Vec2[] = []
  for (let i = 0; i < SKEL.tailSegs; i++) {
    tail.push(v(-11 - i * SKEL.tailSeg, -SKEL.hipHeight))
    tailVel.push(v(0, 0))
  }
  return { tail, tailVel, t: 0, lastX: 0, lastY: 0 }
}

/**
 * Advance the tail. `vx`/`vy` are the cat's world velocity; converting them into
 * cat space means the tail streams backwards when running and lifts when falling,
 * without the pose data having to say anything about it.
 */
export function updateRig(
  rig: RigState,
  pose: Pose,
  p: CatProportions,
  vx: number,
  vy: number,
  facing: number,
  dt: number,
): void {
  rig.t += dt

  const j = solve(pose, p)
  const segLen = SKEL.tailSeg * p.tailLength
  rig.tail[0] = j.tailRoot

  const localVx = vx * facing
  const sway = Math.sin(rig.t * 2.1) * 0.9 + Math.sin(rig.t * 3.7) * 0.35

  for (let i = 1; i < rig.tail.length; i++) {
    const prev = rig.tail[i - 1]!
    const cur = rig.tail[i]!
    const vel = rig.tailVel[i]!

    // Where this segment would sit at rest: base angle, curling further along.
    const restAngle = pose.tailBase - pose.tailCurl * i + sway * 0.06 * i
    const rest = add(prev, down(segLen, restAngle))

    vel.x += (rest.x - cur.x) * 0.32 - localVx * 0.16 * dt * 60
    vel.y += (rest.y - cur.y) * 0.32 - vy * 0.1 * dt * 60
    vel.x *= 0.76
    vel.y *= 0.76
    cur.x += vel.x
    cur.y += vel.y

    // Hard length constraint so the tail can never stretch like elastic.
    const dx = cur.x - prev.x
    const dy = cur.y - prev.y
    const d = Math.hypot(dx, dy) || 1
    cur.x = prev.x + (dx / d) * segLen
    cur.y = prev.y + (dy / d) * segLen
  }
}

// --- painting --------------------------------------------------------------

export interface DrawOptions {
  pose: Pose
  palette: CatPalette
  proportions: CatProportions
  rig: RigState
  x: number
  y: number
  facing: number
  /** 0..1 white flash on impact. */
  flash?: number
  /** 0..1 red tint as health drops, for the losing cat. */
  hurt?: number
  alpha?: number
  /** Silhouette only — used for the teleport afterimage and the versus screen. */
  silhouette?: string
}

export function drawCat(ctx: CanvasRenderingContext2D, o: DrawOptions): void {
  const { pose, palette, proportions: p, rig } = o
  const j = solve(pose, p)

  ctx.save()
  ctx.translate(o.x, o.y)
  ctx.scale(o.facing * p.scale, p.scale)
  // Squash pivots on the feet, so a landing cat compresses into the floor.
  ctx.scale(1 / Math.sqrt(pose.squash), pose.squash)
  if (o.alpha !== undefined) ctx.globalAlpha = o.alpha

  const paint = o.silhouette
    ? silhouettePalette(o.silhouette)
    : tintPalette(palette, o.flash ?? 0, o.hurt ?? 0)

  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'

  drawTail(ctx, rig, paint, p, o.facing)
  drawLeg(ctx, j.hip, j.kneeFar, j.footFar, paint, p, true)
  drawArm(ctx, j.shoulderFar, j.elbowFar, j.pawFar, paint, p, true, pose)
  // The neck goes under the torso and the head, so neither end shows a seam.
  strokeSegment(ctx, j.chest, j.headBase, SKEL.neckW * p.girth ** 0.3, paint.coat, paint.outline)
  drawTorso(ctx, j, paint, p, pose)
  drawLeg(ctx, j.hip, j.kneeNear, j.footNear, paint, p, false)
  drawHead(ctx, j, paint, p, pose)
  drawArm(ctx, j.shoulderNear, j.elbowNear, j.pawNear, paint, p, false, pose)

  ctx.restore()
}

interface Paint extends CatPalette {
  coatDark: string
  coatLight: string
  patchDark: string
}

function tintPalette(pal: CatPalette, flash: number, hurt: number): Paint {
  const t = (c: string): string => {
    let out = c
    if (hurt > 0) out = mix(out, '#c0392b', hurt * 0.32)
    if (flash > 0) out = mix(out, '#ffffff', flash)
    return out
  }
  return {
    ...pal,
    coat: t(pal.coat),
    belly: t(pal.belly),
    patch: t(pal.patch),
    nose: t(pal.nose),
    innerEar: t(pal.innerEar),
    outline: flash > 0.5 ? mix(pal.outline, '#ffffff', flash * 0.6) : pal.outline,
    coatDark: t(darken(pal.coat, 0.22)),
    coatLight: t(lighten(pal.coat, 0.16)),
    patchDark: t(darken(pal.patch, 0.25)),
  }
}

function silhouettePalette(colour: string): Paint {
  return {
    coat: colour,
    belly: colour,
    patch: colour,
    nose: colour,
    eye: colour,
    pupil: colour,
    innerEar: colour,
    outline: colour,
    markings: [],
    coatDark: colour,
    coatLight: colour,
    patchDark: colour,
  }
}

const OUTLINE = 3

function fillAndOutline(ctx: CanvasRenderingContext2D, fill: string, outline: string): void {
  ctx.fillStyle = fill
  ctx.fill()
  ctx.lineWidth = OUTLINE
  ctx.strokeStyle = outline
  ctx.stroke()
}

// --- torso -----------------------------------------------------------------

function torsoPath(ctx: CanvasRenderingContext2D, j: Joints, p: CatProportions): void {
  const hip = j.hip
  const chest = j.chest
  const dx = chest.x - hip.x
  const dy = chest.y - hip.y
  const len = Math.hypot(dx, dy) || 1
  const ux = dx / len
  const uy = dy / len
  const nx = -uy
  const ny = ux

  const g = p.girth
  const wHip = 30 * g
  const wChest = 34 * g
  const at = (along: number, side: number): Vec2 =>
    v(hip.x + ux * len * along + nx * side, hip.y + uy * len * along + ny * side)

  // The body extends well below the hip joint so the tops of the legs are buried
  // in it — otherwise the cat reads as a puppet with the limbs pinned on.
  smoothClosedPath(
    ctx,
    [
      at(-0.3, wHip * 0.72), // front of the hips
      at(0.24, wHip * 1.16), // belly
      at(0.66, wChest * 1.02), // ribs
      at(1.02, wChest * 0.76), // upper chest
      at(1.2, wChest * 0.1), // top of the shoulders
      at(1.04, -wChest * 0.82), // shoulder blades
      at(0.62, -wChest * 0.96), // back
      at(0.2, -wHip * 1.12), // rump
      at(-0.3, -wHip * 0.72), // back of the hips
      at(-0.46, 0), // between the legs
    ],
    0.5,
  )
}

function drawTorso(
  ctx: CanvasRenderingContext2D,
  j: Joints,
  paint: Paint,
  p: CatProportions,
  pose: Pose,
): void {
  ctx.beginPath()
  torsoPath(ctx, j, p)
  fillAndOutline(ctx, paint.coat, paint.outline)

  // Everything below is painted inside the torso silhouette.
  ctx.save()
  ctx.beginPath()
  torsoPath(ctx, j, p)
  ctx.clip()

  const hip = j.hip
  const chest = j.chest
  const mid = v((hip.x + chest.x) / 2, (hip.y + chest.y) / 2)
  const g = p.girth

  // Belly / chest fur, always a shade lighter than the coat.
  ctx.beginPath()
  ctx.ellipse(mid.x + 17 * g, mid.y + 2, 22 * g, 30, -0.15, 0, Math.PI * 2)
  ctx.fillStyle = paint.belly
  ctx.fill()

  if (paint.markings.includes('tuxedoChest')) {
    ctx.beginPath()
    ctx.ellipse(chest.x + 15 * g, chest.y + 14, 15 * g, 22, -0.2, 0, Math.PI * 2)
    ctx.fillStyle = paint.belly
    ctx.fill()
  }

  // Patches sit on the far edge of the back, where a real cat's markings break the
  // silhouette. Kept small — a patch that covers the torso just reads as a black cat.
  if (paint.markings.includes('shoulderPatch')) {
    ctx.beginPath()
    ctx.ellipse(chest.x - 20 * g, chest.y + 6, 13 * g, 12, 0.4, 0, Math.PI * 2)
    ctx.fillStyle = paint.patch
    ctx.fill()
  }

  if (paint.markings.includes('backPatch')) {
    ctx.beginPath()
    ctx.ellipse(hip.x - 20 * g, hip.y - 14, 14 * g, 12, -0.35, 0, Math.PI * 2)
    ctx.fillStyle = paint.patch
    ctx.fill()
  }

  if (paint.markings.includes('tabbyStripes')) {
    ctx.strokeStyle = withAlpha(paint.patch, 0.85)
    ctx.lineWidth = 5
    for (let i = 0; i < 4; i++) {
      const t = 0.2 + i * 0.2
      const bx = hip.x + (chest.x - hip.x) * t
      const by = hip.y + (chest.y - hip.y) * t
      ctx.beginPath()
      ctx.moveTo(bx - 26 * g, by - 4)
      ctx.quadraticCurveTo(bx - 6 * g, by + 6, bx + 10 * g, by - 2)
      ctx.stroke()
    }
  }

  // Contact shadow where the far side of the body falls away from the light.
  const grad = ctx.createLinearGradient(hip.x - 34 * g, 0, hip.x + 6 * g, 0)
  grad.addColorStop(0, withAlpha('#000000', 0.15))
  grad.addColorStop(1, withAlpha('#000000', 0))
  ctx.fillStyle = grad
  ctx.fillRect(hip.x - 90, chest.y - 60, 160, 200)

  ctx.restore()

  if (p.fluff > 0.25) drawFluff(ctx, j, paint, p, pose)
}

/** Fur tufts along the chest and rump — sells long-haired cats. */
function drawFluff(
  ctx: CanvasRenderingContext2D,
  j: Joints,
  paint: Paint,
  p: CatProportions,
  pose: Pose,
): void {
  const amount = p.fluff
  ctx.fillStyle = paint.coat
  ctx.strokeStyle = paint.outline
  ctx.lineWidth = 2
  const spots: [Vec2, number][] = [
    [v(j.chest.x + 22 * p.girth, j.chest.y + 12), 0.5],
    [v(j.chest.x + 16 * p.girth, j.chest.y + 28), 0.1],
    [v(j.hip.x - 22 * p.girth, j.hip.y - 6), 2.6],
  ]
  for (const [pt, angle] of spots) {
    const s = 9 * amount
    const a = angle + pose.lean + Math.sin(pt.x * 0.3) * 0.2
    ctx.beginPath()
    ctx.moveTo(pt.x, pt.y - s)
    ctx.quadraticCurveTo(pt.x + Math.sin(a) * s * 2.4, pt.y + Math.cos(a) * s * 2.4, pt.x, pt.y + s)
    ctx.quadraticCurveTo(pt.x - s * 0.4, pt.y, pt.x, pt.y - s)
    ctx.fill()
    ctx.stroke()
  }
}

// --- limbs -----------------------------------------------------------------

function strokeSegment(
  ctx: CanvasRenderingContext2D,
  a: Vec2,
  b: Vec2,
  width: number,
  fill: string,
  outline: string,
): void {
  ctx.beginPath()
  ctx.moveTo(a.x, a.y)
  ctx.lineTo(b.x, b.y)
  ctx.lineWidth = width + OUTLINE * 2
  ctx.strokeStyle = outline
  ctx.stroke()
  ctx.lineWidth = width
  ctx.strokeStyle = fill
  ctx.stroke()
}

function drawArm(
  ctx: CanvasRenderingContext2D,
  shoulder: Vec2,
  elbow: Vec2,
  paw: Vec2,
  paint: Paint,
  p: CatProportions,
  far: boolean,
  pose: Pose,
): void {
  const coat = far ? paint.coatDark : paint.coat
  const w = SKEL.armW * (0.85 + p.girth * 0.2)
  strokeSegment(ctx, shoulder, elbow, w, coat, paint.outline)
  strokeSegment(ctx, elbow, paw, w * 0.86, coat, paint.outline)

  // Paw
  const socks = paint.markings.includes('socks')
  ctx.beginPath()
  ctx.ellipse(paw.x, paw.y, w * 0.78, w * 0.68, 0, 0, Math.PI * 2)
  fillAndOutline(ctx, socks ? paint.belly : far ? paint.coatDark : paint.coat, paint.outline)

  if (pose.claws > 0.05 && !far) {
    const dir = Math.atan2(paw.y - elbow.y, paw.x - elbow.x)
    ctx.strokeStyle = '#f3ece2'
    ctx.lineWidth = 3
    for (let i = -1; i <= 1; i++) {
      const a = dir + i * 0.42
      ctx.beginPath()
      ctx.moveTo(paw.x + Math.cos(a) * w * 0.5, paw.y + Math.sin(a) * w * 0.5)
      ctx.lineTo(
        paw.x + Math.cos(a) * (w * 0.5 + 13 * pose.claws),
        paw.y + Math.sin(a) * (w * 0.5 + 13 * pose.claws),
      )
      ctx.stroke()
    }
  }
}

function drawLeg(
  ctx: CanvasRenderingContext2D,
  hip: Vec2,
  knee: Vec2,
  foot: Vec2,
  paint: Paint,
  p: CatProportions,
  far: boolean,
): void {
  const coat = far ? paint.coatDark : paint.coat
  const w = SKEL.limbW * (0.85 + p.girth * 0.2)
  strokeSegment(ctx, hip, knee, w * 1.15, coat, paint.outline)
  strokeSegment(ctx, knee, foot, w * 0.9, coat, paint.outline)

  // Foot, pointing the way the shin leans.
  const dir = Math.atan2(foot.y - knee.y, foot.x - knee.x) - Math.PI / 2
  ctx.save()
  ctx.translate(foot.x, foot.y)
  ctx.rotate(dir)
  ctx.beginPath()
  ctx.ellipse(SKEL.footLen * 0.28, 0, SKEL.footLen * 0.62, w * 0.62, 0, 0, Math.PI * 2)
  fillAndOutline(
    ctx,
    paint.markings.includes('socks') ? paint.belly : far ? paint.coatDark : paint.coat,
    paint.outline,
  )
  ctx.restore()
}

// --- tail ------------------------------------------------------------------

function drawTail(
  ctx: CanvasRenderingContext2D,
  rig: RigState,
  paint: Paint,
  p: CatProportions,
  _facing: number,
): void {
  const pts = rig.tail
  const baseW = (9 + p.tailFluff * 11) * p.girth ** 0.4

  // Outline pass, then fill pass — the same trick as the limbs, but tapered by
  // stroking each segment individually with a shrinking width.
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1]!
      const b = pts[i]!
      const t = i / (pts.length - 1)
      const w = baseW * (1 - t * 0.64) * (1 + p.tailFluff * Math.sin(t * Math.PI) * 0.5)
      ctx.beginPath()
      ctx.moveTo(a.x, a.y)
      ctx.lineTo(b.x, b.y)
      ctx.lineWidth = pass === 0 ? w + OUTLINE * 2 : w
      ctx.strokeStyle = pass === 0 ? paint.outline : paint.coat
      ctx.stroke()
    }
  }

  if (paint.markings.includes('tailRings')) {
    // Bands across the tail rather than along it, so they read as rings.
    for (let i = 2; i < pts.length; i += 2) {
      const a = pts[i - 1]!
      const b = pts[i]!
      const t = i / (pts.length - 1)
      const w = baseW * (1 - t * 0.64) * (1 + p.tailFluff * Math.sin(t * Math.PI) * 0.5)
      ctx.beginPath()
      ctx.moveTo(a.x + (b.x - a.x) * 0.18, a.y + (b.y - a.y) * 0.18)
      ctx.lineTo(a.x + (b.x - a.x) * 0.62, a.y + (b.y - a.y) * 0.62)
      ctx.lineWidth = w
      ctx.lineCap = 'butt'
      ctx.strokeStyle = paint.patch
      ctx.stroke()
    }
    ctx.lineCap = 'round'
  }

  // Tail tip
  const tip = pts[pts.length - 1]!
  ctx.beginPath()
  ctx.arc(tip.x, tip.y, baseW * 0.26, 0, Math.PI * 2)
  ctx.fillStyle = paint.markings.includes('tailRings') ? paint.patch : paint.coat
  ctx.fill()
}

// --- head ------------------------------------------------------------------

function headOutline(r: number, snout: number, fluff: number): Vec2[] {
  const cheek = 1 + fluff * 0.22
  return [
    v(0, -r * 1.02), // crown
    v(r * 0.66, -r * 0.76), // brow
    v(r * 0.92 * snout, -r * 0.16), // bridge of the nose
    v(r * 1.06 * snout, r * 0.24), // muzzle
    v(r * 0.74, r * 0.68), // chin
    v(r * 0.14, r * 0.9), // jaw
    v(-r * 0.62 * cheek, r * 0.74 * cheek), // cheek ruff
    v(-r * 1.0 * cheek, r * 0.06), // back of the cheek
    v(-r * 0.84, -r * 0.66), // back of the skull
  ]
}

function drawHead(
  ctx: CanvasRenderingContext2D,
  j: Joints,
  paint: Paint,
  p: CatProportions,
  pose: Pose,
): void {
  const r = SKEL.headR * p.headSize
  ctx.save()
  ctx.translate(j.head.x, j.head.y)
  ctx.rotate(j.headRot * 0.55)

  const shape = headOutline(r, p.snout, p.fluff)

  drawEar(ctx, paint, p, pose, r, false)
  drawEar(ctx, paint, p, pose, r, true)

  ctx.beginPath()
  smoothClosedPath(ctx, shape, 0.46)
  fillAndOutline(ctx, paint.coat, paint.outline)

  ctx.save()
  ctx.beginPath()
  smoothClosedPath(ctx, shape, 0.46)
  ctx.clip()

  // Muzzle and chin, always lighter.
  ctx.beginPath()
  ctx.ellipse(r * 0.66 * p.snout, r * 0.38, r * 0.46, r * 0.34, -0.1, 0, Math.PI * 2)
  ctx.fillStyle = paint.belly
  ctx.fill()

  if (paint.markings.includes('maskFace')) {
    ctx.beginPath()
    ctx.ellipse(r * 0.62 * p.snout, r * 0.1, r * 0.66, r * 0.62, 0, 0, Math.PI * 2)
    ctx.fillStyle = paint.patch
    ctx.fill()
    ctx.beginPath()
    ctx.ellipse(r * 0.66 * p.snout, r * 0.42, r * 0.4, r * 0.3, -0.1, 0, Math.PI * 2)
    ctx.fillStyle = paint.belly
    ctx.fill()
  }

  // Bobby's defining feature: a dark patch spilling over the near eye and brow.
  if (paint.markings.includes('eyePatch')) {
    ctx.beginPath()
    smoothClosedPath(
      ctx,
      [
        v(r * 0.1, -r * 1.1),
        v(r * 0.78, -r * 0.62),
        v(r * 0.62, -r * 0.02),
        v(r * 0.16, r * 0.16),
        v(-r * 0.28, -r * 0.18),
        v(-r * 0.3, -r * 0.86),
      ],
      0.5,
    )
    ctx.fillStyle = paint.patch
    ctx.fill()
  }

  if (paint.markings.includes('tabbyStripes')) {
    ctx.strokeStyle = withAlpha(paint.patch, 0.9)
    ctx.lineWidth = 4
    for (let i = 0; i < 3; i++) {
      ctx.beginPath()
      ctx.moveTo(-r * 0.5 + i * r * 0.26, -r * 1.05)
      ctx.lineTo(-r * 0.34 + i * r * 0.24, -r * 0.5)
      ctx.stroke()
    }
  }

  ctx.restore()

  drawFace(ctx, paint, p, pose, r)
  ctx.restore()
}

function drawEar(
  ctx: CanvasRenderingContext2D,
  paint: Paint,
  p: CatProportions,
  pose: Pose,
  r: number,
  far: boolean,
): void {
  const h = SKEL.earH * p.earSize
  const flat = pose.earFlat
  const baseX = far ? -r * 0.62 : r * 0.16
  const baseY = far ? -r * 0.62 : -r * 0.86
  // Flattened ears rotate backwards and shrink — the universal "this cat is done
  // being polite" signal, and it reads instantly at gameplay size.
  const rot = (far ? -0.5 : -0.12) - flat * 1.15
  const torn = paint.markings.includes('tornEar') && !far

  ctx.save()
  ctx.translate(baseX, baseY)
  ctx.rotate(rot)
  ctx.scale(1, 1 - flat * 0.35)

  ctx.beginPath()
  const tip = torn ? h * 0.72 : h
  ctx.moveTo(-r * 0.36, r * 0.12)
  ctx.quadraticCurveTo(-r * 0.3, -tip * 0.72, r * 0.02, -tip)
  if (torn) {
    ctx.lineTo(r * 0.16, -tip * 0.6)
    ctx.lineTo(r * 0.28, -tip * 0.88)
  }
  ctx.quadraticCurveTo(r * 0.44, -tip * 0.5, r * 0.42, r * 0.14)
  ctx.closePath()
  const patched =
    (far && paint.markings.includes('earPatchFar')) ||
    (!far && paint.markings.includes('earPatchNear'))
  fillAndOutline(ctx, patched ? paint.patch : far ? paint.coatDark : paint.coat, paint.outline)

  // Inner ear
  ctx.beginPath()
  ctx.moveTo(-r * 0.16, r * 0.02)
  ctx.quadraticCurveTo(-r * 0.1, -tip * 0.56, r * 0.03, -tip * 0.7)
  ctx.quadraticCurveTo(r * 0.24, -tip * 0.42, r * 0.24, r * 0.04)
  ctx.closePath()
  ctx.fillStyle = far ? darken(paint.innerEar, 0.2) : paint.innerEar
  ctx.fill()

  ctx.restore()
}

function drawFace(
  ctx: CanvasRenderingContext2D,
  paint: Paint,
  p: CatProportions,
  pose: Pose,
  r: number,
): void {
  const snout = p.snout
  const eyeX = r * 0.42
  const eyeY = -r * 0.18
  const open = clamp(pose.eye, 0, 1)

  // Eye
  ctx.save()
  ctx.translate(eyeX, eyeY)
  if (open > 0.08) {
    ctx.beginPath()
    smoothClosedPath(
      ctx,
      [
        v(-r * 0.26, r * 0.02),
        v(-r * 0.04, -r * 0.2 * open),
        v(r * 0.24, -r * 0.04 * open),
        v(r * 0.02, r * 0.2 * open),
      ],
      0.5,
    )
    ctx.fillStyle = paint.eye
    ctx.fill()
    ctx.lineWidth = 2.4
    ctx.strokeStyle = paint.outline
    ctx.stroke()

    // Vertical slit pupil — the single most "cat" detail on the whole rig.
    ctx.beginPath()
    ctx.ellipse(r * 0.01, 0, r * 0.06 + r * 0.03 * (1 - open), r * 0.19 * open, 0, 0, Math.PI * 2)
    ctx.fillStyle = paint.pupil
    ctx.fill()

    ctx.beginPath()
    ctx.arc(-r * 0.06, -r * 0.08, r * 0.045, 0, Math.PI * 2)
    ctx.fillStyle = '#ffffff'
    ctx.fill()
  } else {
    ctx.beginPath()
    ctx.moveTo(-r * 0.24, 0)
    ctx.quadraticCurveTo(0, r * 0.12, r * 0.22, -r * 0.02)
    ctx.lineWidth = 3
    ctx.strokeStyle = paint.outline
    ctx.stroke()
  }
  ctx.restore()

  // Brow — a short angled line above the eye does most of the emoting.
  if (Math.abs(pose.brow) > 0.05) {
    ctx.beginPath()
    const tilt = pose.brow * 0.5
    ctx.moveTo(eyeX - r * 0.22, eyeY - r * 0.3 + tilt * r * 0.14)
    ctx.lineTo(eyeX + r * 0.2, eyeY - r * 0.36 - tilt * r * 0.16)
    ctx.lineWidth = 3
    ctx.strokeStyle = paint.outline
    ctx.stroke()
  }

  if (paint.markings.includes('scar')) {
    ctx.beginPath()
    ctx.moveTo(eyeX - r * 0.1, eyeY - r * 0.52)
    ctx.lineTo(eyeX + r * 0.12, eyeY + r * 0.3)
    ctx.lineWidth = 2.6
    ctx.strokeStyle = darken(paint.coat, 0.55)
    ctx.stroke()
  }

  // Nose
  const nx = r * 0.94 * snout
  const ny = r * 0.2
  ctx.beginPath()
  ctx.moveTo(nx - r * 0.12, ny - r * 0.06)
  ctx.lineTo(nx + r * 0.08, ny - r * 0.05)
  ctx.lineTo(nx - r * 0.02, ny + r * 0.12)
  ctx.closePath()
  ctx.fillStyle = paint.nose
  ctx.fill()
  ctx.lineWidth = 1.8
  ctx.strokeStyle = paint.outline
  ctx.stroke()

  // Mouth — a cat's "w", opening into a hiss.
  const mo = pose.mouth
  ctx.beginPath()
  ctx.moveTo(nx - r * 0.02, ny + r * 0.12)
  ctx.lineTo(nx - r * 0.02, ny + r * 0.22)
  ctx.lineWidth = 2.4
  ctx.strokeStyle = paint.outline
  ctx.stroke()

  if (mo > 0.1) {
    ctx.beginPath()
    ctx.ellipse(nx - r * 0.2, ny + r * 0.3, r * 0.17, r * 0.08 + r * 0.18 * mo, -0.25, 0, Math.PI * 2)
    ctx.fillStyle = '#8c3b47'
    ctx.fill()
    ctx.lineWidth = 2
    ctx.strokeStyle = paint.outline
    ctx.stroke()
    // Fangs
    ctx.beginPath()
    ctx.moveTo(nx - r * 0.28, ny + r * 0.24)
    ctx.lineTo(nx - r * 0.22, ny + r * 0.38)
    ctx.lineTo(nx - r * 0.16, ny + r * 0.24)
    ctx.fillStyle = '#fffaf2'
    ctx.fill()
  } else {
    ctx.beginPath()
    ctx.moveTo(nx - r * 0.24, ny + r * 0.26)
    ctx.quadraticCurveTo(nx - r * 0.14, ny + r * 0.34, nx - r * 0.02, ny + r * 0.22)
    ctx.quadraticCurveTo(nx + r * 0.04, ny + r * 0.32, nx + r * 0.12, ny + r * 0.24)
    ctx.lineWidth = 2.2
    ctx.strokeStyle = paint.outline
    ctx.stroke()
  }

  // Whiskers — short enough to stay inside the character's silhouette at
  // gameplay size, where long ones just read as scratches on the screen.
  ctx.strokeStyle = withAlpha('#ffffff', 0.6)
  ctx.lineWidth = 1.6
  for (let i = -1; i <= 1; i++) {
    ctx.beginPath()
    const sy = ny + r * 0.04 + i * r * 0.1
    ctx.moveTo(nx - r * 0.22, sy)
    ctx.quadraticCurveTo(
      nx + r * 0.16,
      sy + i * r * 0.08 - r * 0.04,
      nx + r * 0.52,
      sy + i * r * 0.2 - r * 0.06,
    )
    ctx.stroke()
  }
}
