/**
 * Keyboard input, buffered.
 *
 * Fighting games need three things from input that a naive `keydown` handler can't
 * give you:
 *   1. Per-frame edge detection ("was light paw pressed on THIS sim frame"), so a
 *      single tap can't fire twice or get swallowed between frames.
 *   2. A short buffer, so an attack pressed a few frames early during recovery still
 *      comes out. Without this the game feels like it's ignoring you.
 *   3. Motion recognition (quarter-circles), matched against recent directions.
 *
 * Directions are stored in arcade numpad notation, which makes motions readable:
 *
 *      7 8 9        up-back    up    up-fwd      (assuming the player faces right)
 *      4 5 6        back     neutral  forward
 *      1 2 3        down-back  down  down-fwd
 */

export type AttackButton = 'lp' | 'hp' | 'lk' | 'hk'
export type Button = AttackButton | 'special' | 'super'

export const ATTACK_BUTTONS: readonly AttackButton[] = ['lp', 'hp', 'lk', 'hk']

const BIT: Record<Button, number> = {
  lp: 1 << 0,
  hp: 1 << 1,
  lk: 1 << 2,
  hk: 1 << 3,
  special: 1 << 4,
  super: 1 << 5,
}

/** Physical key -> action. Both arrow keys and WASD drive movement. */
const KEY_MAP: Record<string, Button | 'up' | 'down' | 'left' | 'right'> = {
  ArrowLeft: 'left',
  ArrowRight: 'right',
  ArrowUp: 'up',
  ArrowDown: 'down',
  KeyA: 'lp',
  KeyS: 'hp',
  KeyZ: 'lk',
  KeyX: 'hk',
  KeyD: 'special',
  KeyC: 'super',
}

export interface InputFrame {
  /** Arcade numpad direction, 1-9, 5 = neutral. Always in absolute screen terms. */
  dir: number
  /** Bitmask of buttons held this frame. */
  held: number
  /** Bitmask of buttons that went down on this frame. */
  pressed: number
}

const NEUTRAL: InputFrame = { dir: 5, held: 0, pressed: 0 }

/** How many frames of history the buffer keeps. Motions look back through this. */
const BUFFER_SIZE = 30
/** A buffered attack stays valid this long, so early presses still come out. */
export const INPUT_BUFFER_FRAMES = 6
/** Directions of a motion must all land inside this window. */
const MOTION_WINDOW = 16
/** Two taps of the same direction inside this window is a dash. */
const DASH_WINDOW = 13

/** Mirror a numpad direction left/right, for facing-relative matching. */
function mirrorDir(d: number): number {
  const swap: Record<number, number> = { 1: 3, 2: 2, 3: 1, 4: 6, 5: 5, 6: 4, 7: 9, 8: 8, 9: 7 }
  return swap[d] ?? d
}

/**
 * Motions are written facing RIGHT and mirrored on demand.
 * Quarter-circle-forward: down, down-forward, forward.
 */
export const MOTIONS = {
  qcf: [2, 3, 6],
  qcb: [2, 1, 4],
} as const

export type MotionName = keyof typeof MOTIONS

/** What a controller (human or CPU) asks a fighter to do on a given frame. */
export interface Intent {
  /** Absolute horizontal direction: -1 left, 0 none, +1 right. */
  dirX: number
  /** -1 up, 0 none, +1 down. */
  dirY: number
  /** Attack button pressed (or buffered) this frame, if any. */
  attack: AttackButton | null
  special: boolean
  super: boolean
  /** Dash requests, facing-relative. */
  dashForward: boolean
  dashBack: boolean
}

export const NO_INTENT: Intent = {
  dirX: 0,
  dirY: 0,
  attack: null,
  special: false,
  super: false,
  dashForward: false,
  dashBack: false,
}

export class InputBuffer {
  /** Newest frame last. */
  private frames: InputFrame[] = []
  /** Frames since each attack button was pressed, for the buffering window. */
  private sinceAttack = new Map<AttackButton, number>()
  /** Consumed buffered attacks are cleared so they can't fire twice. */
  private consumed = new Set<AttackButton>()

  push(frame: InputFrame): void {
    this.frames.push(frame)
    if (this.frames.length > BUFFER_SIZE) this.frames.shift()

    for (const b of ATTACK_BUTTONS) {
      if (frame.pressed & BIT[b]) {
        this.sinceAttack.set(b, 0)
        this.consumed.delete(b)
      } else {
        const n = this.sinceAttack.get(b)
        if (n !== undefined) this.sinceAttack.set(b, n + 1)
      }
    }
  }

  get current(): InputFrame {
    return this.frames[this.frames.length - 1] ?? NEUTRAL
  }

  held(button: Button): boolean {
    return (this.current.held & BIT[button]) !== 0
  }

  pressed(button: Button): boolean {
    return (this.current.pressed & BIT[button]) !== 0
  }

  /** An attack pressed within the buffer window and not yet acted on. */
  bufferedAttack(): AttackButton | null {
    let best: AttackButton | null = null
    let bestAge = Infinity
    for (const b of ATTACK_BUTTONS) {
      if (this.consumed.has(b)) continue
      const age = this.sinceAttack.get(b)
      if (age !== undefined && age <= INPUT_BUFFER_FRAMES && age < bestAge) {
        best = b
        bestAge = age
      }
    }
    return best
  }

  consumeAttack(button: AttackButton): void {
    this.consumed.add(button)
  }

  /**
   * Has `motion` been completed in the last `MOTION_WINDOW` frames?
   * Directions must appear in order but may be held across several frames, which
   * is how a real stick behaves.
   */
  hasMotion(motion: MotionName, facing: number): boolean {
    const pattern = MOTIONS[motion]
    const want = facing < 0 ? pattern.map(mirrorDir) : [...pattern]

    const start = Math.max(0, this.frames.length - MOTION_WINDOW)
    let need = 0
    for (let i = start; i < this.frames.length; i++) {
      if (this.frames[i]!.dir === want[need]) {
        need++
        if (need === want.length) return true
      }
    }
    return false
  }

  /** Two taps of forward (or back) inside the dash window. */
  hasDoubleTap(forward: boolean, facing: number): boolean {
    const target = forward ? (facing > 0 ? 6 : 4) : facing > 0 ? 4 : 6
    const start = Math.max(0, this.frames.length - DASH_WINDOW)

    let taps = 0
    let wasNeutral = true
    for (let i = start; i < this.frames.length; i++) {
      const d = this.frames[i]!.dir
      if (d === target) {
        if (wasNeutral) taps++
        wasNeutral = false
      } else {
        wasNeutral = true
      }
    }
    return taps >= 2
  }

  clear(): void {
    this.frames.length = 0
    this.sinceAttack.clear()
    this.consumed.clear()
  }
}

/**
 * Reads the physical keyboard. Key state is captured on DOM events and sampled
 * once per simulation frame by `sample()`, so input can never be missed or
 * double-counted regardless of how events interleave with rAF.
 */
export class Keyboard {
  private down = new Set<string>()
  private downedSinceSample = new Set<string>()
  /** Keys pressed this frame, for one-off UI actions outside the sim. */
  private edge = new Set<string>()

  constructor(target: EventTarget = window) {
    target.addEventListener('keydown', (e) => this.onDown(e as KeyboardEvent))
    target.addEventListener('keyup', (e) => this.onUp(e as KeyboardEvent))
    window.addEventListener('blur', () => {
      this.down.clear()
    })
  }

  private onDown(e: KeyboardEvent): void {
    // Stop the browser scrolling the page out from under the game.
    if (e.code.startsWith('Arrow') || e.code === 'Space') e.preventDefault()
    if (e.repeat) return
    this.down.add(e.code)
    this.downedSinceSample.add(e.code)
  }

  private onUp(e: KeyboardEvent): void {
    this.down.delete(e.code)
  }

  isDown(code: string): boolean {
    return this.down.has(code)
  }

  /** True once per physical press — for menus and debug toggles, not the sim. */
  tapped(code: string): boolean {
    return this.edge.has(code)
  }

  /** Build this frame's input snapshot and reset edge state. */
  sample(): InputFrame {
    this.edge = new Set(this.downedSinceSample)

    let x = 0
    let y = 0
    let held = 0
    let pressed = 0

    for (const [code, action] of Object.entries(KEY_MAP)) {
      const isDown = this.down.has(code)
      const wasPressed = this.downedSinceSample.has(code)
      if (!isDown && !wasPressed) continue

      switch (action) {
        case 'left':
          x -= 1
          break
        case 'right':
          x += 1
          break
        case 'up':
          y -= 1
          break
        case 'down':
          y += 1
          break
        default:
          if (isDown) held |= BIT[action]
          if (wasPressed) pressed |= BIT[action]
      }
    }

    this.downedSinceSample.clear()

    x = Math.sign(x)
    y = Math.sign(y)
    return { dir: 5 + x - 3 * y, held, pressed }
  }
}

/** Split a numpad direction back into components. */
export function dirToAxes(dir: number): { x: number; y: number } {
  const col = ((dir - 1) % 3) - 1 // -1, 0, +1
  const row = Math.floor((dir - 1) / 3) // 0 bottom, 1 middle, 2 top
  return { x: col, y: row === 0 ? 1 : row === 2 ? -1 : 0 }
}
