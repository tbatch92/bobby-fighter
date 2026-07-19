/**
 * Fixed-timestep game loop.
 *
 * The simulation advances in exact 1/60s ticks and never sees wall-clock time; the
 * renderer runs as fast as the display allows and interpolates between the previous
 * and current sim states using `alpha`. This is what lets every timing value in the
 * game be an integer frame count ("heavy kick is 7 frames of startup") and keeps the
 * match identical on a 60Hz laptop and a 144Hz monitor.
 */

export const FPS = 60
export const STEP_MS = 1000 / FPS

/** Never simulate more than this many ticks in one rAF, or a backgrounded tab
 *  returns and tries to catch up on thousands of frames at once. */
const MAX_STEPS_PER_FRAME = 5

export interface LoopHandlers {
  /** Advance the simulation exactly one frame. */
  step(): void
  /** Draw. `alpha` is 0..1 progress towards the next sim frame. */
  render(alpha: number): void
}

export interface Loop {
  stop(): void
  /** Frames simulated since the loop started — handy for debug readouts. */
  readonly frames: number
}

export function startLoop(handlers: LoopHandlers): Loop {
  let running = true
  let raf = 0
  let last = performance.now()
  let accumulator = 0
  let frames = 0

  const tick = (now: number): void => {
    if (!running) return
    raf = requestAnimationFrame(tick)

    accumulator += now - last
    last = now

    let steps = 0
    while (accumulator >= STEP_MS && steps < MAX_STEPS_PER_FRAME) {
      handlers.step()
      accumulator -= STEP_MS
      steps++
      frames++
    }

    // If we blew the budget the tab was probably asleep. Drop the debt rather
    // than carrying it forward, which would make the game run fast to "catch up".
    if (steps === MAX_STEPS_PER_FRAME) accumulator = 0

    handlers.render(accumulator / STEP_MS)
  }

  raf = requestAnimationFrame(tick)

  return {
    stop() {
      running = false
      cancelAnimationFrame(raf)
    },
    get frames() {
      return frames
    },
  }
}
