import type { Box } from '../core/math'
import type { Move, HitboxSpec } from './types'

/**
 * Move construction.
 *
 * Every move in the game is data, built through `defineMove` so that defaults and
 * validation live in exactly one place. Balancing a character therefore never means
 * touching the engine — it means editing numbers in `data/roster.ts`.
 */

export type MoveSpec = Pick<Move, 'id' | 'name' | 'startup' | 'active' | 'recovery' | 'damage'> &
  Partial<Omit<Move, 'id' | 'name' | 'startup' | 'active' | 'recovery' | 'damage' | 'hitboxes'>> & {
    /** Hitboxes default to covering exactly the active window. */
    hitboxes?: (Partial<HitboxSpec> & { box: Box })[]
  }

/** Total frames a move occupies. */
export const moveDuration = (m: Move): number => m.startup + m.active + m.recovery

/**
 * Frame advantage: how many frames earlier than the defender the attacker recovers.
 * Positive means the attacker acts first afterwards. Used by the debug overlay and
 * by the balance tests — a normal that's hugely plus on block is a red flag.
 */
export function frameAdvantage(m: Move, onBlock: boolean): number {
  const stun = onBlock ? m.blockstun : m.hitstun
  return stun - m.recovery
}

export function defineMove(spec: MoveSpec): Move {
  const { startup, active, recovery, damage } = spec
  const total = startup + active + recovery

  if (startup < 1) throw new Error(`${spec.id}: startup must be >= 1`)
  if (active < 1) throw new Error(`${spec.id}: active must be >= 1`)
  if (recovery < 0) throw new Error(`${spec.id}: recovery must be >= 0`)

  // Sensible defaults derived from damage keep the game feeling coherent even
  // before anything is hand-tuned: harder hits stun longer and freeze harder.
  const hitstun = spec.hitstun ?? Math.round(11 + damage * 0.09)
  const blockstun = spec.blockstun ?? Math.max(4, hitstun - 5)
  const hitstop = spec.hitstop ?? Math.round(3 + damage * 0.05)

  const hitboxes: HitboxSpec[] = (spec.hitboxes ?? []).map((h) => {
    const from = h.from ?? startup + 1
    const to = h.to ?? startup + active
    if (from < 1 || to > total || from > to) {
      throw new Error(`${spec.id}: hitbox frames ${from}-${to} outside move (1-${total})`)
    }
    return { box: h.box, from, to }
  })

  return {
    id: spec.id,
    name: spec.name,
    startup,
    active,
    recovery,
    damage,
    // Normals do no chip damage by default. Light attacks are slightly plus on
    // block, which is fine and standard — but only as long as a blockstring can't
    // whittle someone to death. Chip is opted into, by specials and supers.
    chip: spec.chip ?? 0,
    hitstun,
    blockstun,
    hitstop,
    guard: spec.guard ?? 'mid',
    knockback: spec.knockback ?? { x: 3.4, y: 0 },
    pushback: spec.pushback ?? 2.2,
    meterGain: spec.meterGain ?? Math.round(damage * 0.12),
    meterCost: spec.meterCost ?? 0,
    hitboxes,
    hurtboxes: spec.hurtboxes,
    impulses: spec.impulses,
    projectile: spec.projectile,
    from: spec.from ?? 'ground',
    cancels: spec.cancels ?? [],
    knockdown: spec.knockdown ?? false,
    invuln: spec.invuln,
    armour: spec.armour ?? 0,
    superFreeze: spec.superFreeze ?? 0,
    anim: spec.anim ?? 'punch',
    voice: spec.voice,
  }
}

/**
 * How a character's normals differ from the baseline.
 * A big slow cat is `{ reach: 1.2, power: 1.25, speed: 1.2, size: 1.15 }`; a small
 * fast one is `{ reach: 0.85, power: 0.8, speed: 0.8, size: 0.9 }`. `speed` is a
 * multiplier on frame counts, so lower is faster.
 */
export interface NormalTuning {
  reach: number
  power: number
  speed: number
  size: number
}

export const DEFAULT_TUNING: NormalTuning = { reach: 1, power: 1, speed: 1, size: 1 }

const scaleBox = (b: Box, reach: number, size: number): Box => ({
  x: Math.round(b.x * reach),
  y: Math.round(b.y * size),
  w: Math.round(b.w * reach),
  h: Math.round(b.h * size),
})

/**
 * The shared normal-attack set: four buttons across three stances.
 *
 * Everyone gets these twelve so that every cat is immediately playable and the CPU
 * always has a full toolkit; characters then override individual entries in
 * `roster.ts` where they want something distinctive.
 */
export function buildNormals(t: NormalTuning = DEFAULT_TUNING): Record<string, Move> {
  const f = (n: number) => Math.max(1, Math.round(n * t.speed))
  const d = (n: number) => Math.round(n * t.power)
  const b = (box: Box) => scaleBox(box, t.reach, t.size)

  const list: Move[] = [
    // ---- standing ----------------------------------------------------------
    defineMove({
      id: 'stand.lp',
      name: 'Paw Jab',
      startup: f(4),
      active: 3,
      recovery: f(7),
      damage: d(32),
      anim: 'jab',
      cancels: ['stand.hp', 'stand.hk', 'special', 'super'],
      knockback: { x: 2.4, y: 0 },
      hitboxes: [{ box: b({ x: 48, y: 106, w: 46, h: 28 }) }],
    }),
    defineMove({
      id: 'stand.hp',
      name: 'Claw Swipe',
      startup: f(8),
      active: 4,
      recovery: f(17),
      damage: d(78),
      anim: 'swipe',
      voice: 'hiss',
      cancels: ['special', 'super'],
      knockback: { x: 4.6, y: -1.2 },
      hitboxes: [{ box: b({ x: 62, y: 112, w: 66, h: 34 }) }],
    }),
    defineMove({
      id: 'stand.lk',
      name: 'Quick Kick',
      startup: f(6),
      active: 3,
      recovery: f(10),
      damage: d(42),
      anim: 'kick',
      cancels: ['stand.hk', 'special', 'super'],
      knockback: { x: 3.0, y: 0 },
      hitboxes: [{ box: b({ x: 56, y: 62, w: 56, h: 28 }) }],
    }),
    defineMove({
      id: 'stand.hk',
      name: 'Tail Roundhouse',
      startup: f(11),
      active: 5,
      recovery: f(21),
      damage: d(92),
      anim: 'roundhouse',
      voice: 'yowl',
      knockdown: true,
      cancels: ['super'],
      knockback: { x: 6.2, y: -4.5 },
      hitboxes: [{ box: b({ x: 74, y: 78, w: 82, h: 42 }) }],
    }),

    // ---- crouching ---------------------------------------------------------
    defineMove({
      id: 'crouch.lp',
      name: 'Low Paw',
      startup: f(4),
      active: 3,
      recovery: f(8),
      damage: d(28),
      anim: 'crouchJab',
      cancels: ['crouch.hp', 'crouch.hk', 'special', 'super'],
      knockback: { x: 2.2, y: 0 },
      hitboxes: [{ box: b({ x: 46, y: 46, w: 46, h: 26 }) }],
    }),
    defineMove({
      // The universal anti-air. Slow enough to be punishable if you throw it out
      // at nothing, with upper-body invulnerability while it rises.
      id: 'crouch.hp',
      name: 'Uppaw',
      startup: f(7),
      active: 4,
      recovery: f(19),
      damage: d(70),
      anim: 'uppaw',
      voice: 'hiss',
      cancels: ['super'],
      knockback: { x: 2.6, y: -8.5 },
      knockdown: true,
      hitboxes: [{ box: b({ x: 42, y: 116, w: 50, h: 74 }) }],
    }),
    defineMove({
      id: 'crouch.lk',
      name: 'Toe Poke',
      startup: f(5),
      active: 3,
      recovery: f(9),
      damage: d(30),
      guard: 'low',
      anim: 'toePoke',
      cancels: ['crouch.hk', 'special', 'super'],
      knockback: { x: 2.2, y: 0 },
      hitboxes: [{ box: b({ x: 52, y: 22, w: 56, h: 24 }) }],
    }),
    defineMove({
      id: 'crouch.hk',
      name: 'Tail Sweep',
      startup: f(9),
      active: 4,
      recovery: f(23),
      damage: d(66),
      guard: 'low',
      anim: 'sweep',
      knockdown: true,
      cancels: [],
      knockback: { x: 4.4, y: 0 },
      hitboxes: [{ box: b({ x: 70, y: 20, w: 84, h: 26 }) }],
    }),

    // ---- airborne ----------------------------------------------------------
    defineMove({
      id: 'air.lp',
      name: 'Air Paw',
      startup: f(5),
      active: 7,
      recovery: 6,
      damage: d(36),
      guard: 'overhead',
      from: 'air',
      anim: 'airJab',
      knockback: { x: 2.4, y: 0 },
      hitboxes: [{ box: b({ x: 42, y: 72, w: 50, h: 34 }) }],
    }),
    defineMove({
      id: 'air.hp',
      name: 'Dive Claw',
      startup: f(8),
      active: 9,
      recovery: 8,
      damage: d(80),
      guard: 'overhead',
      from: 'air',
      anim: 'diveClaw',
      voice: 'yowl',
      knockback: { x: 3.6, y: 0 },
      hitboxes: [{ box: b({ x: 50, y: 58, w: 62, h: 50 }) }],
    }),
    defineMove({
      id: 'air.lk',
      name: 'Air Kick',
      startup: f(6),
      active: 7,
      recovery: 6,
      damage: d(40),
      guard: 'overhead',
      from: 'air',
      anim: 'airKick',
      knockback: { x: 2.8, y: 0 },
      hitboxes: [{ box: b({ x: 48, y: 46, w: 54, h: 36 }) }],
    }),
    defineMove({
      id: 'air.hk',
      name: 'Falling Hind Kick',
      startup: f(9),
      active: 8,
      recovery: 8,
      damage: d(86),
      guard: 'overhead',
      from: 'air',
      anim: 'airRoundhouse',
      knockback: { x: 4.2, y: 0 },
      hitboxes: [{ box: b({ x: 56, y: 40, w: 60, h: 48 }) }],
    }),
  ]

  return Object.fromEntries(list.map((m) => [m.id, m]))
}
