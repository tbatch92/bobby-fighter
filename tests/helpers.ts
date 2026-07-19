import { NO_INTENT, type Intent } from '../src/core/input'
import { Match } from '../src/sim/match'
import type { CharacterDef } from '../src/sim/types'

/** Skip the round-start ceremony so tests can get straight to fighting. */
export function fastForwardToFight(match: Match): void {
  let guard = 0
  while (match.phase !== 'fight' && guard++ < 600) {
    match.step([{ ...NO_INTENT }, { ...NO_INTENT }])
  }
  if (match.phase !== 'fight') throw new Error('match never reached the fight phase')
}

export function makeMatch(a: CharacterDef, b: CharacterDef, seed = 1): Match {
  const m = new Match(a, b, seed)
  fastForwardToFight(m)
  return m
}

/** A per-frame intent source, so tests can script inputs over time. */
export type IntentSource = (frame: number) => Intent

export const idle: IntentSource = () => ({ ...NO_INTENT })

export function step(match: Match, frames: number, p1 = idle, p2 = idle): void {
  for (let i = 0; i < frames; i++) match.step([p1(i), p2(i)])
}

/** Place both fighters at a known distance, facing each other. */
export function position(match: Match, gap: number): void {
  const mid = (match.fighters[0].x + match.fighters[1].x) / 2
  match.fighters[0].x = match.fighters[0].prevX = mid - gap / 2
  match.fighters[1].x = match.fighters[1].prevX = mid + gap / 2
  match.fighters[0].facing = 1
  match.fighters[1].facing = -1
}
