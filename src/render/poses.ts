import { clamp, lerp, smoothstep } from '../core/math'
import type { Fighter } from '../sim/fighter'
import { KNOCKDOWN_FRAMES, WAKEUP_FRAMES } from '../sim/physics'
import { NEUTRAL_POSE, type Pose } from './catRig'

/**
 * Animation: fighter state in, `Pose` out.
 *
 * Attacks are NOT keyframed frame-by-frame. Each one is described by just two
 * poses — a windup and a strike — which are then stretched across whatever
 * startup/active/recovery the move data specifies. That means a 4-frame jab and an
 * 11-frame roundhouse both animate correctly with no extra authoring, and rebalancing
 * frame data never desynchronises the artwork from the hitboxes.
 */

type P = Partial<Pose>

const TUPLES = ['armNear', 'armFar', 'legNear', 'legFar'] as const
type TupleKey = (typeof TUPLES)[number]

function resolve(o: P): Pose {
  return { ...NEUTRAL_POSE, ...o }
}

export function lerpPose(a: Pose, b: Pose, t: number): Pose {
  const out = {} as Pose
  for (const key of Object.keys(NEUTRAL_POSE) as (keyof Pose)[]) {
    if ((TUPLES as readonly string[]).includes(key)) {
      const av = a[key as TupleKey]
      const bv = b[key as TupleKey]
      out[key as TupleKey] = [lerp(av[0], bv[0], t), lerp(av[1], bv[1], t)]
    } else {
      ;(out[key] as number) = lerp(a[key] as number, b[key] as number, t)
    }
  }
  return out
}

// --- stances ---------------------------------------------------------------

const STANCE: Record<string, P> = {
  idle: {},

  crouch: {
    hip: 0.6,
    hipX: -4,
    lean: 0.26,
    headY: 3,
    armNear: [0.95, 1.25],
    armFar: [0.7, 1.35],
    legNear: [1.05, -2.01],
    legFar: [-1.0, 1.95],
    tailBase: -1.8,
    tailCurl: 0.16,
  },

  jump: {
    hip: 1.06,
    lean: -0.05,
    headAngle: -0.15,
    armNear: [1.15, 1.55],
    armFar: [0.85, 1.7],
    legNear: [1.05, -1.75],
    legFar: [0.55, -1.35],
    tailBase: -2.35,
    tailCurl: 0.2,
    earFlat: 0.15,
  },

  land: {
    hip: 0.74,
    lean: 0.3,
    squash: 0.87,
    armNear: [0.5, 1.1],
    armFar: [0.3, 1.2],
    legNear: [0.85, -1.7],
    legFar: [-0.75, 1.6],
    tailBase: -1.8,
  },

  dash: {
    hip: 0.92,
    hipX: 4,
    lean: 0.48,
    headAngle: -0.3,
    armNear: [-0.35, 0.9],
    armFar: [-0.6, 0.8],
    legNear: [0.95, -1.15],
    legFar: [-0.85, 1.5],
    tailBase: -2.45,
    tailCurl: 0.12,
    earFlat: 0.35,
    stretch: 4,
  },

  block: {
    hip: 0.86,
    hipX: -8,
    lean: -0.16,
    headAngle: 0.12,
    armNear: [1.62, 0.62],
    armFar: [1.42, 0.78],
    legNear: [0.75, -1.3],
    legFar: [-0.7, 1.35],
    earFlat: 0.75,
    eye: 0.35,
    brow: 0.6,
    tailBase: -1.75,
    tailCurl: 0.2,
  },

  blockCrouch: {
    hip: 0.6,
    hipX: -8,
    lean: 0.1,
    armNear: [1.5, 0.7],
    armFar: [1.3, 0.85],
    legNear: [1.05, -2.01],
    legFar: [-1.0, 1.95],
    earFlat: 0.75,
    eye: 0.35,
    brow: 0.6,
  },

  hitstun: {
    hip: 0.9,
    hipX: -10,
    lean: -0.46,
    headAngle: 0.4,
    headY: -3,
    armNear: [-0.85, 0.9],
    armFar: [-1.15, 0.7],
    legNear: [-0.15, -0.35],
    legFar: [-0.55, 0.55],
    earFlat: 1,
    eye: 0.12,
    mouth: 0.75,
    brow: -0.4,
    tailBase: -1.3,
    tailCurl: 0.1,
  },

  knockdown: {
    hip: 0.19,
    hipX: -14,
    lean: -1.36,
    headAngle: 0.5,
    armNear: [-1.5, 0.55],
    armFar: [-1.75, 0.4],
    legNear: [1.5, -0.45],
    legFar: [1.85, -0.35],
    earFlat: 1,
    eye: 0,
    mouth: 0.35,
    brow: -0.6,
    tailBase: -1.1,
    tailCurl: 0.05,
    squash: 0.95,
  },

  victory: {
    hip: 1.04,
    lean: -0.06,
    headAngle: -0.22,
    armNear: [2.5, -0.15],
    armFar: [0.35, 1.5],
    legNear: [0.16, -0.22],
    legFar: [-0.16, 0.22],
    tailBase: -2.7,
    tailCurl: -0.12,
    mouth: 0.85,
    brow: -0.35,
    eye: 0.85,
  },

  intro: {
    hip: 0.72,
    lean: 0.42,
    headAngle: -0.35,
    armNear: [0.3, 1.15],
    armFar: [0.15, 1.25],
    legNear: [0.87, -1.72],
    legFar: [-0.82, 1.66],
    tailBase: -2.5,
    tailCurl: 0.05,
    earFlat: 0,
    brow: 0.1,
  },
}

// --- attacks ---------------------------------------------------------------

interface AttackAnim {
  windup: P
  strike: P
  /** Stance the move returns to. Defaults to the fighter's current stance. */
  base?: 'idle' | 'crouch' | 'jump'
}

const ATTACKS: Record<string, AttackAnim> = {
  jab: {
    windup: { armNear: [0.95, 1.15], lean: 0.02, hipX: -6, brow: 0.5 },
    strike: { armNear: [1.36, 0.12], lean: 0.3, hipX: 4, brow: 0.7, earFlat: 0.25 },
  },
  swipe: {
    windup: {
      armNear: [-0.42, 1.9],
      lean: -0.2,
      hipX: -10,
      earFlat: 0.6,
      brow: 0.9,
      mouth: 0.35,
      claws: 1,
      headAngle: 0.15,
    },
    strike: {
      armNear: [1.28, 0.02],
      lean: 0.46,
      hipX: 9,
      stretch: 3,
      earFlat: 0.9,
      brow: 1,
      mouth: 0.75,
      claws: 1,
      eye: 0.6,
    },
  },
  kick: {
    windup: { legNear: [1.15, -1.6], hip: 1.02, lean: -0.1, armNear: [0.4, 1.5] },
    strike: {
      legNear: [1.42, -0.42],
      legFar: [-0.12, 0.3],
      hip: 1.0,
      lean: 0.16,
      hipX: 2,
      armNear: [-0.3, 1.3],
      armFar: [-0.5, 1.2],
      earFlat: 0.4,
      brow: 0.7,
    },
  },
  roundhouse: {
    windup: {
      legNear: [1.25, -1.95],
      hip: 1.04,
      lean: -0.32,
      tailBase: -1.5,
      armNear: [-0.5, 1.2],
      earFlat: 0.7,
      mouth: 0.3,
    },
    strike: {
      legNear: [1.78, -0.58],
      legFar: [-0.1, 0.28],
      hip: 1.02,
      lean: 0.34,
      hipX: 8,
      tailBase: -0.55,
      tailCurl: 0.05,
      armNear: [-0.9, 1.0],
      armFar: [-1.1, 0.9],
      earFlat: 1,
      mouth: 0.9,
      brow: 1,
      eye: 0.5,
    },
  },

  crouchJab: {
    base: 'crouch',
    windup: { armNear: [0.9, 1.2], hipX: -8 },
    strike: { armNear: [1.48, 0.08], hipX: 3, lean: 0.34, brow: 0.7 },
  },
  uppaw: {
    base: 'crouch',
    windup: { hip: 0.5, lean: 0.34, armNear: [-0.28, 0.75], brow: 0.9, mouth: 0.3, claws: 0.6 },
    strike: {
      hip: 1.16,
      lean: -0.16,
      hipX: 4,
      armNear: [2.62, -0.32],
      armFar: [0.2, 1.4],
      legNear: [0.55, -0.6],
      legFar: [-0.2, 0.35],
      claws: 1,
      mouth: 0.85,
      earFlat: 0.9,
      brow: 1,
      tailBase: -2.6,
    },
  },
  toePoke: {
    base: 'crouch',
    windup: { legNear: [1.1, -1.75], hipX: -8 },
    strike: { legNear: [1.3, -0.78], hipX: 4, lean: 0.35, brow: 0.6 },
  },
  sweep: {
    base: 'crouch',
    windup: { hip: 0.52, lean: 0.15, legNear: [1.2, -1.95], armFar: [1.1, 0.5] },
    strike: {
      hip: 0.42,
      hipX: -6,
      lean: 0.52,
      legNear: [1.62, -1.02],
      legFar: [-1.1, 2.0],
      armFar: [1.5, 0.15],
      armNear: [0.9, 1.1],
      tailBase: -1.2,
      earFlat: 0.8,
      mouth: 0.5,
    },
  },

  airJab: {
    base: 'jump',
    windup: { armNear: [1.0, 1.35], lean: 0.05 },
    strike: { armNear: [1.5, 0.15], lean: 0.3, claws: 0.8, brow: 0.8, earFlat: 0.4 },
  },
  diveClaw: {
    base: 'jump',
    windup: { armNear: [-0.3, 1.7], armFar: [-0.5, 1.6], lean: -0.3, claws: 0.5, mouth: 0.4 },
    strike: {
      armNear: [2.05, -0.3],
      armFar: [1.9, -0.25],
      lean: 0.55,
      legNear: [0.9, -1.5],
      legFar: [0.7, -1.3],
      claws: 1,
      mouth: 1,
      earFlat: 1,
      brow: 1,
      eye: 0.55,
    },
  },
  airKick: {
    base: 'jump',
    windup: { legNear: [1.2, -1.7], lean: 0.05 },
    strike: { legNear: [1.5, -0.5], lean: 0.28, earFlat: 0.5, brow: 0.7 },
  },
  airRoundhouse: {
    base: 'jump',
    windup: { legNear: [1.3, -1.9], lean: -0.2, tailBase: -1.6 },
    strike: {
      legNear: [1.9, -0.7],
      legFar: [0.9, -1.0],
      lean: 0.42,
      tailBase: -0.9,
      mouth: 0.8,
      earFlat: 1,
      brow: 1,
    },
  },

  // --- specials ------------------------------------------------------------
  hairball: {
    windup: {
      hip: 0.86,
      hipX: -12,
      lean: -0.34,
      headAngle: 0.3,
      armNear: [0.4, 1.9],
      armFar: [0.25, 1.95],
      mouth: 0.9,
      eye: 0.4,
      earFlat: 0.5,
      brow: 0.8,
    },
    strike: {
      hip: 0.98,
      hipX: 8,
      lean: 0.5,
      headAngle: -0.2,
      armNear: [1.55, -0.1],
      armFar: [1.4, 0.0],
      mouth: 1,
      eye: 0.25,
      earFlat: 1,
      brow: 1,
      stretch: 3,
    },
  },
  pounce: {
    windup: {
      hip: 0.5,
      lean: 0.5,
      hipX: -12,
      legNear: [1.1, -2.05],
      legFar: [-1.0, 1.95],
      armNear: [0.5, 1.6],
      earFlat: 0.9,
      brow: 1,
      tailBase: -2.5,
      tailCurl: 0.02,
      eye: 1,
    },
    strike: {
      hip: 1.08,
      lean: 0.62,
      hipX: 12,
      armNear: [2.2, -0.3],
      armFar: [2.0, -0.2],
      legNear: [0.4, -0.9],
      legFar: [-0.5, 1.1],
      claws: 1,
      mouth: 1,
      earFlat: 1,
      brow: 1,
      stretch: 5,
    },
  },
  furstorm: {
    windup: {
      hip: 0.94,
      lean: -0.3,
      armNear: [-0.1, 2.1],
      armFar: [-0.25, 2.15],
      headAngle: 0.25,
      mouth: 0.4,
      eye: 0.5,
    },
    strike: {
      hip: 1.02,
      lean: 0.34,
      hipX: 6,
      armNear: [1.7, 0.25],
      armFar: [1.55, 0.35],
      mouth: 0.8,
      earFlat: 0.6,
      brow: 0.8,
      stretch: 3,
    },
  },
  bellyflop: {
    windup: { hip: 0.52, lean: 0.2, legNear: [1.05, -2.0], legFar: [-0.95, 1.9], mouth: 0.5 },
    strike: {
      hip: 0.9,
      lean: 0.95,
      armNear: [2.3, -0.5],
      armFar: [2.2, -0.45],
      legNear: [-0.7, 0.7],
      legFar: [-0.9, 0.8],
      mouth: 1,
      earFlat: 1,
      eye: 0.2,
      squash: 0.92,
      stretch: 6,
    },
  },
  warp: {
    windup: { hip: 0.78, lean: -0.4, armNear: [-0.6, 1.4], eye: 0.3, earFlat: 0.8, squash: 0.9 },
    strike: { hip: 1.08, lean: 0.2, armNear: [1.9, 0.1], eye: 1, brow: 1, claws: 1, squash: 1.08 },
  },
  clawUpper: {
    windup: { hip: 0.62, lean: 0.35, armNear: [-0.45, 0.8], brow: 1, mouth: 0.4, claws: 0.7 },
    strike: {
      hip: 1.2,
      lean: -0.28,
      hipX: 6,
      armNear: [2.75, -0.4],
      armFar: [0.1, 1.35],
      legNear: [0.7, -0.75],
      legFar: [-0.3, 0.5],
      claws: 1,
      mouth: 1,
      earFlat: 1,
      brow: 1,
      eye: 0.6,
      tailBase: -2.65,
    },
  },
  zoomies: {
    windup: {
      hip: 0.56,
      lean: 0.6,
      hipX: -14,
      legNear: [1.15, -2.05],
      armNear: [-0.4, 1.5],
      earFlat: 1,
      brow: 1,
      mouth: 0.6,
      eye: 0.8,
    },
    strike: {
      hip: 0.98,
      lean: 0.72,
      hipX: 16,
      armNear: [2.15, -0.35],
      armFar: [1.95, -0.3],
      legNear: [0.5, -1.0],
      legFar: [-0.6, 1.2],
      claws: 1,
      mouth: 1,
      earFlat: 1,
      brow: 1,
      eye: 0.4,
      stretch: 6,
    },
  },
}

// --- the main entry point --------------------------------------------------

const IDLE = resolve(STANCE.idle!)

/** Which resting pose a fighter animates around right now. */
function stanceFor(f: Fighter): Pose {
  if (!f.grounded) return resolve(STANCE.jump!)
  if (f.crouching) return resolve(STANCE.crouch!)
  return IDLE
}

/**
 * `t` is a free-running seconds counter used only for cosmetic idle motion —
 * breathing, ear twitches, tail sway. Nothing it drives feeds back into the sim.
 */
export function poseFor(f: Fighter, t: number): Pose {
  switch (f.state) {
    case 'attack':
      return attackPose(f)
    case 'intro':
      return introPose(f, t)
    case 'blockstun':
      return resolve(f.crouching ? STANCE.blockCrouch! : STANCE.block!)
    case 'hitstun':
      return hitPose(f)
    case 'knockdown':
      return knockdownPose(f)
    case 'wakeup':
      return wakeupPose(f)
    case 'ko':
      return koPose(f)
    case 'victory':
      return victoryPose(f, t)
    case 'dash':
      return dashPose(f)
    case 'land':
      return landPose(f)
    case 'jump':
      return jumpPose(f)
    case 'crouch':
      return f.guarding ? resolve(STANCE.blockCrouch!) : breathe(resolve(STANCE.crouch!), t, 0.4)
    case 'walk':
      return walkPose(f, t)
    default:
      return f.guarding ? resolve(STANCE.block!) : breathe(IDLE, t, 1)
  }
}

/** Gentle idle life: ribcage rise, head bob, occasional ear flick. */
function breathe(base: Pose, t: number, amount: number): Pose {
  const b = { ...base }
  const s = Math.sin(t * 2.4)
  b.stretch = base.stretch + s * 1.7 * amount
  b.hip = base.hip + s * 0.008 * amount
  b.headY = base.headY - s * 1.2 * amount
  b.lean = base.lean + Math.sin(t * 1.3) * 0.02 * amount
  // A quick double ear-flick every few seconds.
  const flick = Math.max(0, Math.sin(t * 0.7) - 0.985) * 60
  b.earFlat = clamp(base.earFlat + flick, 0, 1)
  b.armNear = [base.armNear[0] + s * 0.02, base.armNear[1] - s * 0.03]
  b.armFar = [base.armFar[0] + s * 0.018, base.armFar[1] - s * 0.025]
  return b
}

function walkPose(f: Fighter, t: number): Pose {
  const base = f.guarding ? resolve(STANCE.block!) : breathe(IDLE, t, 0.6)
  const ph = f.stateFrame * 0.34
  const s = Math.sin(ph)
  const c = Math.sin(ph + Math.PI)
  const out = { ...base }
  out.legNear = [base.legNear[0] + s * 0.42, base.legNear[1] - Math.max(0, s) * 0.5]
  out.legFar = [base.legFar[0] + c * 0.42, base.legFar[1] + Math.max(0, c) * 0.45]
  out.hip = base.hip - Math.abs(Math.sin(ph * 2)) * 0.022
  out.hipX = base.hipX + s * 2
  out.tailBase = base.tailBase + s * 0.18
  return out
}

function jumpPose(f: Fighter): Pose {
  const base = resolve(STANCE.jump!)
  // Tuck on the way up, reach for the floor on the way down.
  const fall = clamp(f.vy / 12, -1, 1)
  const out = { ...base }
  out.legNear = [base.legNear[0] - fall * 0.5, base.legNear[1] + fall * 0.65]
  out.legFar = [base.legFar[0] - fall * 0.45, base.legFar[1] + fall * 0.6]
  out.lean = base.lean - fall * 0.16
  out.tailBase = base.tailBase + fall * 0.35
  out.squash = 1 + clamp(-f.vy, -4, 6) * 0.012
  return out
}

function landPose(f: Fighter): Pose {
  const t = clamp(f.stateFrame / 4, 0, 1)
  return lerpPose(resolve(STANCE.land!), IDLE, smoothstep(t))
}

function dashPose(f: Fighter): Pose {
  const base = resolve(STANCE.dash!)
  const t = clamp(f.stateFrame / Math.max(1, f.def.dashFrames), 0, 1)
  // Stretch out of the start, gather back in at the end.
  return lerpPose(base, IDLE, smoothstep(clamp((t - 0.5) * 2, 0, 1)))
}

function hitPose(f: Fighter): Pose {
  const base = resolve(STANCE.hitstun!)
  // The first few frames snap; the rest recovers towards stance.
  const settle = clamp((f.stateFrame - 3) / 12, 0, 1)
  const out = lerpPose(base, stanceFor(f), settle * 0.55)
  out.squash = 1 - Math.max(0, 3 - f.stateFrame) * 0.03
  return out
}

function knockdownPose(f: Fighter): Pose {
  const t = clamp(f.stateFrame / 6, 0, 1)
  const out = lerpPose(resolve(STANCE.hitstun!), resolve(STANCE.knockdown!), smoothstep(t))
  // A small bounce as they hit the floor.
  const bounce = Math.max(0, Math.sin(f.stateFrame * 0.55)) * Math.max(0, 1 - f.stateFrame / 8)
  out.hip += bounce * 0.09
  return out
}

function wakeupPose(f: Fighter): Pose {
  const t = clamp(f.stateFrame / WAKEUP_FRAMES, 0, 1)
  const out = lerpPose(resolve(STANCE.knockdown!), IDLE, smoothstep(t))
  out.earFlat = 1 - t
  out.eye = t
  return out
}

function koPose(f: Fighter): Pose {
  if (!f.grounded) {
    const out = resolve(STANCE.hitstun!)
    out.lean = -0.9
    out.eye = 0
    out.mouth = 0.9
    out.legNear = [0.9, -0.5]
    out.legFar = [1.2, -0.4]
    return out
  }
  const t = clamp(f.stateFrame / 10, 0, 1)
  const out = lerpPose(resolve(STANCE.hitstun!), resolve(STANCE.knockdown!), smoothstep(t))
  out.eye = 0
  out.mouth = 0.25
  return out
}

function victoryPose(f: Fighter, t: number): Pose {
  const entry = clamp(f.stateFrame / 14, 0, 1)
  const base = lerpPose(IDLE, resolve(STANCE.victory!), smoothstep(entry))
  const out = { ...base }
  const s = Math.sin(t * 3.2)
  out.armNear = [base.armNear[0] + s * 0.12, base.armNear[1]]
  out.headY = base.headY - s * 2
  out.tailBase = base.tailBase + Math.sin(t * 2.1) * 0.22
  return out
}

function introPose(f: Fighter, t: number): Pose {
  const enter = clamp(f.stateFrame / 30, 0, 1)
  const base = lerpPose(resolve(STANCE.intro!), IDLE, smoothstep(enter))
  return breathe(base, t, 1)
}

/**
 * Stretch a two-pose attack across the move's real frame data.
 *
 * Startup eases into the windup, the active window snaps to the strike (fast, so
 * the hit reads on the exact frame the hitbox appears), and recovery drifts back
 * to the stance.
 */
function attackPose(f: Fighter): Pose {
  const move = f.move
  if (!move) return stanceFor(f)

  const anim = ATTACKS[move.anim]
  const stance = anim?.base ? resolve(STANCE[anim.base === 'idle' ? 'idle' : anim.base]!) : stanceFor(f)
  if (!anim) return stance

  const windup = { ...stance, ...anim.windup } as Pose
  const strike = { ...stance, ...anim.strike } as Pose

  const fr = f.moveFrame
  if (fr <= move.startup) {
    return lerpPose(stance, windup, smoothstep(clamp(fr / move.startup, 0, 1)))
  }
  const activeEnd = move.startup + move.active
  if (fr <= activeEnd) {
    // Snap in over the first couple of frames, then hold the extended pose.
    return lerpPose(windup, strike, clamp((fr - move.startup) / 2, 0, 1))
  }
  const t = clamp((fr - activeEnd) / Math.max(1, move.recovery), 0, 1)
  return lerpPose(strike, stance, smoothstep(t))
}

export { KNOCKDOWN_FRAMES }
