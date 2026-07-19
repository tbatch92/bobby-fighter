import type { Box, Vec2 } from '../core/math'
import type { AttackButton } from '../core/input'
import type { CatPalette, CatProportions } from '../render/catRig'

/** Every animation/behaviour state a fighter can be in. */
export type StateName =
  | 'intro'
  | 'idle'
  | 'walk'
  | 'crouch'
  | 'jump'
  | 'land'
  | 'dash'
  | 'attack'
  | 'blockstun'
  | 'hitstun'
  | 'knockdown'
  | 'wakeup'
  | 'ko'
  | 'victory'

/**
 * How an attack must be defended against.
 *   `mid`      — blockable standing or crouching (most normals)
 *   `low`      — must be blocked crouching
 *   `overhead` — must be blocked standing
 *   `unblockable` — throws and the like
 */
export type Guard = 'mid' | 'low' | 'overhead' | 'unblockable'

export interface HitboxSpec {
  box: Box
  /** Inclusive move-frame range. Defaults to the move's active window. */
  from: number
  to: number
}

export interface ProjectileSpec {
  /** Frame of the move on which the projectile spawns. */
  spawnFrame: number
  /** Spawn offset, facing-relative (x forward, y above feet). */
  offset: Vec2
  velocity: Vec2
  /** Optional per-frame acceleration, for arcing or drifting shots. */
  gravity?: number
  box: Box
  damage: number
  chip: number
  hitstun: number
  blockstun: number
  hitstop: number
  knockback: Vec2
  /** Frames before it despawns on its own. */
  life: number
  /** Visual style, drawn by `render/fx.ts`. */
  look: 'hairball' | 'furcloud' | 'dust'
  radius: number
  spin: number
}

export interface Move {
  id: string
  name: string
  /** Frames before the first active frame. */
  startup: number
  /** Frames the hitbox is live. */
  active: number
  /** Frames of helplessness after the active window. */
  recovery: number

  damage: number
  /** Damage dealt through a block. */
  chip: number
  hitstun: number
  blockstun: number
  /** Freeze frames applied to both fighters on connect — the "crunch". */
  hitstop: number
  guard: Guard
  /** Applied to the victim on hit. Negative y launches. */
  knockback: Vec2
  /** Applied to the attacker on block, so pokes are safe-ish on spacing. */
  pushback: number
  /** Meter gained by the attacker on hit (the victim gains a third of it). */
  meterGain: number
  /** Meter spent to use the move at all. */
  meterCost: number

  hitboxes: HitboxSpec[]
  /** Replaces the state hurtbox for the duration of the move. */
  hurtboxes?: Box[]
  /** Per-frame velocity impulses, e.g. a lunging dash attack. */
  impulses?: { frame: number; vx: number; vy: number }[]
  projectile?: ProjectileSpec

  /** Where the move can be performed from. */
  from: 'ground' | 'air' | 'crouch'
  /** Moves this can be cancelled into on hit or block. */
  cancels: string[]
  /** Hard knockdown instead of normal hitstun. */
  knockdown: boolean
  /** Inclusive move-frame range of full invulnerability. */
  invuln?: { from: number; to: number }
  /** Hits of armour: this many incoming hits are absorbed during startup. */
  armour: number
  /** Frames the whole screen freezes when the move starts (supers). */
  superFreeze: number
  /** Cosmetic tag the renderer uses to pick a pose and the audio uses for SFX. */
  anim: string
  /** Cat noise on startup, if any. */
  voice?: 'hiss' | 'meow' | 'yowl' | 'chirp' | 'growl'
}

export interface HurtboxSet {
  stand: Box[]
  crouch: Box[]
  air: Box[]
  down: Box[]
}

/** How a CPU-controlled version of this cat likes to fight. */
export interface AiProfile {
  /** 0 = never approaches, 1 = always in your face. */
  aggression: number
  /** Preference for staying at range and throwing projectiles. */
  zoning: number
  /** How readily it jumps in. */
  jumpiness: number
  /** Base probability of blocking a move it has reacted to. */
  blockSkill: number
  /** Preferred distance to hover at, in pixels. */
  spacing: number
  /** Willingness to spend meter the moment it has it. */
  meterHunger: number
}

export interface CharacterDef {
  id: string
  name: string
  /** One-line arcade-mode flavour. */
  title: string
  /** Shown on the versus screen. */
  taunt: string

  maxHealth: number
  walkForward: number
  walkBack: number
  jumpVelocity: number
  /** Multiplier on global gravity — floaty cats vs heavy cats. */
  weight: number
  dashSpeed: number
  dashFrames: number
  /** Half-width of the body used for push-out. */
  bodyRadius: number

  palette: CatPalette
  proportions: CatProportions
  hurtboxes: HurtboxSet
  moves: Record<string, Move>
  /** Which move each attack button maps to, by stance. */
  normals: {
    stand: Record<AttackButton, string>
    crouch: Record<AttackButton, string>
    air: Record<AttackButton, string>
  }
  specialId: string
  superId: string
  ai: AiProfile
  /** Stage this cat calls home. */
  stageId: string
}

/** Result of one hitbox connecting, handed to the FX and audio layers. */
export interface HitEvent {
  attacker: 0 | 1
  victim: 0 | 1
  at: Vec2
  damage: number
  blocked: boolean
  move: Move
  counter: boolean
  comboCount: number
}
