import type { Box } from '../core/math'
import { DEFAULT_PROPORTIONS, type CatPalette, type CatProportions } from '../render/catRig'
import { buildNormals, defineMove, type NormalTuning } from '../sim/moves'
import type { AiProfile, CharacterDef, HurtboxSet, Move } from '../sim/types'

/**
 * The roster.
 *
 * Because the cats are drawn procedurally, a fighter is nothing but data: a palette,
 * a set of body proportions, some stat tweaks, and one signature special. Everything
 * else — twelve normals, hurtboxes, animation — is generated from the shared
 * definitions in `sim/moves.ts` and `render/poses.ts`.
 */

const scaleBox = (b: Box, s: number): Box => ({
  x: Math.round(b.x * s),
  y: Math.round(b.y * s),
  w: Math.round(b.w * s),
  h: Math.round(b.h * s),
})

/** Hurtboxes are derived from the cat's draw scale so they always match the art. */
function hurtboxesFor(scale: number, girth: number): HurtboxSet {
  const g = (b: Box): Box => scaleBox({ ...b, w: b.w * girth }, scale)
  return {
    stand: [
      g({ x: 0, y: 34, w: 52, h: 70 }),
      g({ x: 2, y: 106, w: 58, h: 76 }),
      g({ x: 10, y: 154, w: 52, h: 46 }),
    ],
    crouch: [g({ x: 0, y: 28, w: 64, h: 60 }), g({ x: 6, y: 82, w: 58, h: 52 })],
    air: [g({ x: 0, y: 62, w: 56, h: 74 }), g({ x: 8, y: 126, w: 48, h: 44 })],
    down: [g({ x: -8, y: 22, w: 122, h: 46 })],
  }
}

interface CatSpec {
  id: string
  name: string
  title: string
  taunt: string
  stageId: string
  palette: CatPalette
  proportions?: Partial<CatProportions>
  tuning?: Partial<NormalTuning>
  ai: AiProfile
  stats?: Partial<
    Pick<
      CharacterDef,
      | 'maxHealth'
      | 'walkForward'
      | 'walkBack'
      | 'jumpVelocity'
      | 'weight'
      | 'dashSpeed'
      | 'dashFrames'
      | 'bodyRadius'
    >
  >
  special: Move
  superMove: Move
  /** Overrides for individual normals. */
  overrides?: Record<string, Move>
}

function defineCat(spec: CatSpec): CharacterDef {
  const proportions: CatProportions = { ...DEFAULT_PROPORTIONS, ...spec.proportions }
  const tuning: NormalTuning = {
    reach: 1,
    power: 1,
    speed: 1,
    size: proportions.scale,
    ...spec.tuning,
  }

  const moves: Record<string, Move> = {
    ...buildNormals(tuning),
    ...spec.overrides,
    [spec.special.id]: spec.special,
    [spec.superMove.id]: spec.superMove,
  }

  return {
    id: spec.id,
    name: spec.name,
    title: spec.title,
    taunt: spec.taunt,
    maxHealth: 1000,
    walkForward: 2.7,
    walkBack: 2.2,
    jumpVelocity: -15.2,
    weight: 1,
    dashSpeed: 7.5,
    dashFrames: 13,
    bodyRadius: 30,
    ...spec.stats,
    palette: spec.palette,
    proportions,
    hurtboxes: hurtboxesFor(proportions.scale, proportions.girth),
    moves,
    normals: {
      stand: { lp: 'stand.lp', hp: 'stand.hp', lk: 'stand.lk', hk: 'stand.hk' },
      crouch: { lp: 'crouch.lp', hp: 'crouch.hp', lk: 'crouch.lk', hk: 'crouch.hk' },
      air: { lp: 'air.lp', hp: 'air.hp', lk: 'air.lk', hk: 'air.hk' },
    },
    specialId: spec.special.id,
    superId: spec.superMove.id,
    ai: spec.ai,
    stageId: spec.stageId,
  }
}

/** A rushing multi-hit super: several disjoint hitbox windows while lunging. */
function rushSuper(id: string, name: string, anim: string, hits: number, perHit: number): Move {
  const hitboxes = []
  const impulses = []
  for (let i = 0; i < hits; i++) {
    const f = 8 + i * 5
    hitboxes.push({ box: { x: 62, y: 96, w: 78, h: 92 }, from: f, to: f + 2 })
    impulses.push({ frame: f - 2, vx: 7.5, vy: 0 })
  }
  return defineMove({
    id,
    name,
    startup: 7,
    active: hits * 5 + 2,
    recovery: 30,
    damage: perHit,
    chip: Math.round(perHit * 0.2),
    hitstun: 16,
    blockstun: 11,
    hitstop: 5,
    anim,
    voice: 'yowl',
    meterCost: 100,
    superFreeze: 38,
    knockdown: true,
    knockback: { x: 7, y: -6 },
    hitboxes,
    impulses,
  })
}

// ---------------------------------------------------------------------------
// BOBBY — the player character, matched to the reference photo: a white cat with
// dark tabby patches over one eye and one ear, a patch on the shoulder and back,
// a ringed tail, a pink nose and green-gold eyes.
// ---------------------------------------------------------------------------

export const BOBBY = defineCat({
  id: 'bobby',
  name: 'Bobby',
  title: 'The One Who Guards The Flap',
  taunt: 'You are between me and outside.',
  stageId: 'kitchen',
  palette: {
    coat: '#f4efe6',
    belly: '#fffdf7',
    patch: '#3b352e',
    nose: '#e6a2a6',
    eye: '#b9c46b',
    pupil: '#20211c',
    innerEar: '#e8b0b2',
    outline: '#2c2620',
    markings: ['eyePatch', 'earPatchFar', 'shoulderPatch', 'backPatch', 'tailRings'],
  },
  proportions: { scale: 1, girth: 1, fluff: 0.42, tailFluff: 0.45 },
  ai: {
    aggression: 0.55,
    zoning: 0.45,
    jumpiness: 0.3,
    blockSkill: 0.6,
    spacing: 150,
    meterHunger: 0.5,
  },
  special: defineMove({
    id: 'special',
    name: 'Hairball Hurl',
    startup: 13,
    active: 3,
    recovery: 25,
    damage: 0,
    anim: 'hairball',
    voice: 'hiss',
    hitboxes: [],
    projectile: {
      spawnFrame: 14,
      offset: { x: 44, y: 116 },
      velocity: { x: 7.4, y: -0.35 },
      gravity: 0.014,
      box: { x: 0, y: 0, w: 46, h: 42 },
      damage: 74,
      chip: 12,
      hitstun: 18,
      blockstun: 11,
      hitstop: 6,
      knockback: { x: 4.6, y: 0 },
      life: 130,
      look: 'hairball',
      radius: 19,
      spin: 0.22,
    },
  }),
  superMove: rushSuper('super', 'ZOOMIES!', 'zoomies', 6, 52),
})

// ---------------------------------------------------------------------------

export const MOCHI = defineCat({
  id: 'mochi',
  name: 'Mochi',
  title: 'Small, Round, Extremely Fast',
  taunt: 'I have already hit you four times.',
  stageId: 'garden',
  palette: {
    coat: '#b9b6bd',
    belly: '#efeced',
    patch: '#7c7984',
    nose: '#d99aa4',
    eye: '#7fc7d9',
    pupil: '#1d1f24',
    innerEar: '#e0aab0',
    outline: '#31303a',
    markings: ['tabbyStripes', 'socks', 'tuxedoChest'],
  },
  proportions: { scale: 0.86, girth: 1.14, fluff: 0.85, tailFluff: 0.8, headSize: 1.12, earSize: 0.94 },
  tuning: { reach: 0.88, power: 0.8, speed: 0.82 },
  stats: {
    maxHealth: 900,
    walkForward: 3.35,
    walkBack: 2.8,
    jumpVelocity: -14.4,
    weight: 0.92,
    dashSpeed: 9.2,
    dashFrames: 11,
    bodyRadius: 26,
  },
  ai: {
    aggression: 0.88,
    zoning: 0.1,
    jumpiness: 0.55,
    blockSkill: 0.45,
    spacing: 78,
    meterHunger: 0.75,
  },
  special: defineMove({
    id: 'special',
    name: 'Pounce',
    startup: 11,
    active: 7,
    recovery: 19,
    damage: 82,
    chip: 10,
    guard: 'overhead',
    anim: 'pounce',
    voice: 'chirp',
    knockback: { x: 4.2, y: -3 },
    impulses: [
      { frame: 9, vx: 9.5, vy: -8.5 },
      { frame: 20, vx: 3, vy: 0 },
    ],
    hitboxes: [{ box: { x: 44, y: 92, w: 66, h: 64 } }],
  }),
  superMove: rushSuper('super', 'KITTEN BARRAGE', 'zoomies', 9, 34),
})

// ---------------------------------------------------------------------------

export const DUCHESS = defineCat({
  id: 'duchess',
  name: 'Duchess',
  title: 'Sits On The Warm Laundry',
  taunt: 'Do not touch the fur.',
  stageId: 'livingroom',
  palette: {
    coat: '#fbf4e4',
    belly: '#fffefa',
    patch: '#d8c3a0',
    nose: '#e0a5aa',
    eye: '#6fa9e0',
    pupil: '#1b2230',
    innerEar: '#eab7ba',
    outline: '#3a3227',
    markings: ['socks', 'tuxedoChest', 'maskFace'],
  },
  proportions: {
    scale: 1.0,
    girth: 1.2,
    fluff: 1,
    tailFluff: 1,
    headSize: 1.05,
    snout: 0.82,
    earSize: 0.85,
  },
  tuning: { reach: 1.05, power: 0.95, speed: 1.06 },
  stats: {
    maxHealth: 950,
    walkForward: 2.3,
    walkBack: 2.15,
    jumpVelocity: -16.2,
    weight: 0.76,
    dashSpeed: 6.6,
    dashFrames: 15,
    bodyRadius: 31,
  },
  ai: {
    aggression: 0.28,
    zoning: 0.92,
    jumpiness: 0.2,
    blockSkill: 0.68,
    spacing: 265,
    meterHunger: 0.4,
  },
  special: defineMove({
    id: 'special',
    name: 'Fur Storm',
    startup: 16,
    active: 3,
    recovery: 27,
    damage: 0,
    anim: 'furstorm',
    voice: 'meow',
    hitboxes: [],
    projectile: {
      spawnFrame: 17,
      offset: { x: 40, y: 104 },
      velocity: { x: 3.3, y: 0 },
      box: { x: 0, y: 0, w: 64, h: 64 },
      damage: 58,
      chip: 10,
      hitstun: 16,
      blockstun: 12,
      hitstop: 5,
      knockback: { x: 3.4, y: 0 },
      life: 175,
      look: 'furcloud',
      radius: 28,
      spin: 0.05,
    },
  }),
  superMove: defineMove({
    id: 'super',
    name: 'BLIZZARD OF FLUFF',
    startup: 12,
    active: 4,
    recovery: 34,
    damage: 0,
    anim: 'furstorm',
    voice: 'yowl',
    meterCost: 100,
    superFreeze: 38,
    hitboxes: [],
    projectile: {
      spawnFrame: 13,
      offset: { x: 42, y: 108 },
      velocity: { x: 4.6, y: 0 },
      box: { x: 0, y: 0, w: 120, h: 150 },
      damage: 230,
      chip: 42,
      hitstun: 24,
      blockstun: 16,
      hitstop: 9,
      knockback: { x: 8, y: -5 },
      life: 190,
      look: 'furcloud',
      radius: 62,
      spin: 0.03,
    },
  }),
})

// ---------------------------------------------------------------------------

export const MEATBALL = defineCat({
  id: 'meatball',
  name: 'Meatball',
  title: 'Nineteen Pounds Of Opinion',
  taunt: 'I was asleep. Now I am not.',
  stageId: 'alley',
  palette: {
    coat: '#e08a44',
    belly: '#f6d6ac',
    patch: '#a85c22',
    nose: '#c9666e',
    eye: '#e0b458',
    pupil: '#241a11',
    innerEar: '#dd9b93',
    outline: '#3d2415',
    markings: ['tabbyStripes', 'backPatch', 'tailRings', 'tuxedoChest'],
  },
  proportions: { scale: 1.16, girth: 1.42, fluff: 0.55, tailFluff: 0.5, headSize: 0.95 },
  tuning: { reach: 1.12, power: 1.28, speed: 1.2 },
  stats: {
    maxHealth: 1160,
    walkForward: 2.05,
    walkBack: 1.7,
    jumpVelocity: -14.6,
    weight: 1.24,
    dashSpeed: 6.2,
    dashFrames: 16,
    bodyRadius: 39,
  },
  ai: {
    aggression: 0.62,
    zoning: 0.2,
    jumpiness: 0.12,
    blockSkill: 0.5,
    spacing: 110,
    meterHunger: 0.6,
  },
  special: defineMove({
    id: 'special',
    name: 'Belly Flop',
    startup: 15,
    active: 9,
    recovery: 26,
    damage: 118,
    chip: 14,
    guard: 'overhead',
    anim: 'bellyflop',
    voice: 'growl',
    armour: 1,
    knockdown: true,
    knockback: { x: 5, y: -2 },
    impulses: [
      { frame: 5, vx: 3.4, vy: -12 },
      { frame: 16, vx: 4.2, vy: 8 },
    ],
    hitboxes: [{ box: { x: 34, y: 62, w: 108, h: 86 } }],
  }),
  superMove: defineMove({
    id: 'super',
    name: 'METEOR MEATBALL',
    startup: 10,
    active: 14,
    recovery: 34,
    damage: 260,
    chip: 44,
    anim: 'bellyflop',
    voice: 'yowl',
    meterCost: 100,
    superFreeze: 38,
    armour: 3,
    knockdown: true,
    knockback: { x: 8, y: -7 },
    hitstop: 10,
    impulses: [
      { frame: 4, vx: 5, vy: -17 },
      { frame: 15, vx: 6, vy: 11 },
    ],
    hitboxes: [{ box: { x: 30, y: 66, w: 140, h: 108 } }],
  }),
})

// ---------------------------------------------------------------------------

export const SHADOW = defineCat({
  id: 'shadow',
  name: 'Shadow',
  title: 'Only Ever Seen Leaving',
  taunt: '...',
  stageId: 'rooftop',
  palette: {
    coat: '#3c3a48',
    belly: '#55525f',
    patch: '#22212b',
    nose: '#3b3540',
    eye: '#f0c04a',
    pupil: '#141018',
    innerEar: '#6b5058',
    outline: '#17161d',
    markings: ['socks'],
  },
  proportions: { scale: 0.98, girth: 0.86, fluff: 0.12, tailFluff: 0.18, snout: 1.12, earSize: 1.15 },
  tuning: { reach: 1.04, power: 0.92, speed: 0.88 },
  stats: {
    maxHealth: 940,
    walkForward: 3.05,
    walkBack: 2.65,
    jumpVelocity: -15.7,
    weight: 0.94,
    dashSpeed: 8.6,
    dashFrames: 11,
    bodyRadius: 28,
  },
  ai: {
    aggression: 0.72,
    zoning: 0.35,
    jumpiness: 0.62,
    blockSkill: 0.72,
    spacing: 175,
    meterHunger: 0.55,
  },
  special: defineMove({
    id: 'special',
    name: 'Night Warp',
    startup: 12,
    active: 5,
    recovery: 22,
    damage: 88,
    chip: 10,
    anim: 'warp',
    voice: 'growl',
    // Invulnerable while phasing forward, then a claw on the far side. Mechanically
    // a teleport, implemented as an invulnerable lunge so the engine stays simple.
    invuln: { from: 2, to: 12 },
    knockback: { x: 4, y: -1 },
    impulses: [
      { frame: 3, vx: 15, vy: 0 },
      { frame: 12, vx: 0, vy: 0 },
    ],
    hitboxes: [{ box: { x: -50, y: 100, w: 74, h: 88 } }],
  }),
  superMove: rushSuper('super', 'NINE SHADOWS', 'zoomies', 7, 46),
})

// ---------------------------------------------------------------------------

export const WHISKERS = defineCat({
  id: 'whiskers',
  name: 'Sgt. Whiskers',
  title: 'Undefeated Since The Skip Fire',
  taunt: 'I have been outside. You have not.',
  stageId: 'windowsill',
  palette: {
    coat: '#d4682f',
    belly: '#e9c191',
    patch: '#8f3f16',
    nose: '#b8535c',
    eye: '#e8d24a',
    pupil: '#1d1409',
    innerEar: '#c98d84',
    outline: '#33190c',
    markings: ['tabbyStripes', 'tornEar', 'scar', 'backPatch', 'tailRings'],
  },
  proportions: { scale: 1.06, girth: 1.08, fluff: 0.5, tailFluff: 0.55, earSize: 1.05 },
  tuning: { reach: 1.06, power: 1.08, speed: 0.94 },
  stats: {
    maxHealth: 1060,
    walkForward: 2.85,
    walkBack: 2.35,
    jumpVelocity: -15.4,
    weight: 1.04,
    dashSpeed: 8,
    dashFrames: 12,
    bodyRadius: 32,
  },
  ai: {
    aggression: 0.8,
    zoning: 0.5,
    jumpiness: 0.4,
    blockSkill: 0.85,
    spacing: 140,
    meterHunger: 0.85,
  },
  special: defineMove({
    id: 'special',
    name: 'Claw Uppercut',
    startup: 5,
    active: 12,
    recovery: 26,
    damage: 104,
    chip: 12,
    anim: 'clawUpper',
    voice: 'yowl',
    // The classic invulnerable reversal: it beats anything on the way up, and the
    // long recovery is the price for guessing wrong.
    invuln: { from: 1, to: 8 },
    knockdown: true,
    knockback: { x: 3.4, y: -11 },
    impulses: [
      { frame: 4, vx: 4.5, vy: -13.5 },
      { frame: 18, vx: 1, vy: 0 },
    ],
    hitboxes: [{ box: { x: 40, y: 128, w: 66, h: 108 } }],
  }),
  superMove: rushSuper('super', 'NINE LIVES FLURRY', 'zoomies', 8, 44),
})

/** Bobby always plays; the rest are the arcade ladder, easiest first. */
export const PLAYER_CAT = BOBBY
export const LADDER: CharacterDef[] = [MOCHI, DUCHESS, SHADOW, MEATBALL, WHISKERS]
export const ALL_CATS: CharacterDef[] = [BOBBY, ...LADDER]

export function catById(id: string): CharacterDef {
  return ALL_CATS.find((c) => c.id === id) ?? BOBBY
}
