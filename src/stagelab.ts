import { lerp } from './core/math'
import { ALL_CATS, BOBBY } from './data/roster'
import { Camera } from './render/camera'
import { createRigState, drawCat, updateRig, type RigState } from './render/catRig'
import { poseFor } from './render/poses'
import { drawStage, drawVignette, STAGES } from './render/stage'
import { Fighter } from './sim/fighter'
import { STAGE_W, VIEW_H, VIEW_W } from './sim/physics'
import type { CharacterDef } from './sim/types'

/**
 * Development-only stage gallery, served at /stages.html.
 *
 * The counterpart to the cat lab: the same reason the cats need one — you cannot
 * judge a background by catching sixth-of-a-second glimpses of it during a fight.
 * This parks all six stages side by side at true in-game framing, slowly panning
 * each one across its full width so the parts off-screen at neutral, and the
 * parallax between layers, are both visible.
 */

/** Each stage pairs to the cat whose home it is, matched by `stageId`. */
function opponentFor(stageId: string): CharacterDef {
  return ALL_CATS.find((c) => c.stageId === stageId) ?? BOBBY
}

/** Framing gap fed to the camera: wide enough to show most of the scenery. */
const REVIEW_GAP = 520
const HALF_VIEW = VIEW_W / 2 / 0.9

interface Panel {
  id: string
  ctx: CanvasRenderingContext2D
  cam: Camera
  phase: number
  /** left/right fighters standing idle for scale. */
  cats: { fighter: Fighter; rig: RigState }[]
}

const grid = document.getElementById('grid') as HTMLElement
const showFighters = document.getElementById('fighters') as HTMLInputElement
const dpr = Math.min(window.devicePixelRatio || 1, 2)

const panels: Panel[] = STAGES.map((stage, i) => {
  const fig = document.createElement('figure')

  const frame = document.createElement('div')
  frame.className = 'frame'
  const canvas = document.createElement('canvas')
  canvas.width = VIEW_W * dpr
  canvas.height = VIEW_H * dpr
  frame.appendChild(canvas)

  const oppTag = document.createElement('div')
  oppTag.className = 'opp'
  const opp = opponentFor(stage.id)
  oppTag.textContent = opp.id === 'bobby' ? "BOBBY'S HOME" : `vs ${opp.name.toUpperCase()}`
  frame.appendChild(oppTag)

  const cap = document.createElement('figcaption')
  cap.innerHTML = `<b>${stage.name}</b><span>${stage.where}</span><span class="id">${stage.id}</span>`

  fig.append(frame, cap)
  grid.appendChild(fig)

  const ctx = canvas.getContext('2d')!
  ctx.scale(dpr, dpr)

  // Bobby on the left, the stage's own cat on the right, at round-start spacing.
  const mid = STAGE_W / 2
  const left = new Fighter(BOBBY, 0)
  left.x = left.prevX = mid - 150
  left.facing = 1
  left.state = 'idle'
  const right = new Fighter(opp, 1)
  right.x = right.prevX = mid + 150
  right.facing = -1
  right.state = 'idle'

  return {
    id: stage.id,
    ctx,
    cam: new Camera(),
    phase: i * 1.1,
    cats: [
      { fighter: left, rig: createRigState() },
      { fighter: right, rig: createRigState() },
    ],
  }
})

let t = 0

function frame(): void {
  t += 1 / 60
  const withCats = showFighters.checked

  for (const panel of panels) {
    // Sweep the camera slowly from one side of the stage to the other and back.
    const sweep = Math.sin(t * 0.22 + panel.phase) * 0.5 + 0.5
    const midX = lerp(HALF_VIEW, STAGE_W - HALF_VIEW, sweep)
    panel.cam.follow(midX, REVIEW_GAP, true)

    const ctx = panel.ctx
    ctx.save()
    panel.cam.apply(ctx)
    drawStage(ctx, panel.id, panel.cam, t)

    if (withCats) {
      for (const c of panel.cats) {
        c.fighter.stateFrame++
        const pose = poseFor(c.fighter, t)
        updateRig(c.rig, pose, c.fighter.def.proportions, 0, 0, c.fighter.facing, 1 / 60)
        drawCat(ctx, {
          pose,
          palette: c.fighter.def.palette,
          proportions: c.fighter.def.proportions,
          rig: c.rig,
          x: c.fighter.x,
          y: c.fighter.y,
          facing: c.fighter.facing,
        })
      }
    }
    ctx.restore()

    drawVignette(ctx)
  }

  requestAnimationFrame(frame)
}

requestAnimationFrame(frame)
