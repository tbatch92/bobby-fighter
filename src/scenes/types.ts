import type { InputBuffer, Keyboard } from '../core/input'
import type { Sfx } from '../audio/sfx'
import type { Difficulty } from '../ai/cpu'

export interface Scene {
  enter?(game: Game): void
  update(game: Game): void
  render(game: Game, ctx: CanvasRenderingContext2D, alpha: number): void
}

export interface ArcadeState {
  /** Index into `LADDER` — which opponent is next. */
  ladderIndex: number
  difficulty: Difficulty
  continues: number
  /** Rounds won across the whole run, for the ending screen. */
  roundsWon: number
  perfects: number
}

export interface Game {
  keyboard: Keyboard
  input: InputBuffer
  sfx: Sfx
  arcade: ArcadeState
  debug: { hitboxes: boolean }
  setScene(scene: Scene): void
}

export function freshArcade(difficulty: Difficulty = 'normal'): ArcadeState {
  return { ladderIndex: 0, difficulty, continues: 2, roundsWon: 0, perfects: 0 }
}
