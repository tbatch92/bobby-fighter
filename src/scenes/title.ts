import type { Difficulty } from '../ai/cpu'
import { TAU } from '../core/math'
import { BOBBY, LADDER } from '../data/roster'
import { Camera } from '../render/camera'
import { withAlpha } from '../render/color'
import { FighterView } from '../render/fighterView'
import { text } from '../render/hud'
import { drawStage, drawVignette } from '../render/stage'
import { Fighter } from '../sim/fighter'
import { GROUND_Y, STAGE_W, VIEW_H, VIEW_W } from '../sim/physics'
import { VersusScene } from './versus'
import { freshArcade, type Game, type Scene } from './types'

const DIFFICULTIES: Difficulty[] = ['easy', 'normal', 'hard']
const DIFFICULTY_BLURB: Record<Difficulty, string> = {
  easy: 'slow to react, forgets to block',
  normal: 'a fair fight',
  hard: 'reads you like a tin opener',
}

/** Title screen: Bobby, the logo, and a difficulty choice. */
export class TitleScene implements Scene {
  private readonly bobby = new Fighter(BOBBY, 0)
  private readonly view = new FighterView()
  private readonly camera = new Camera()
  private t = 0
  private choice = 1

  constructor() {
    this.bobby.x = STAGE_W / 2 + 210
    this.bobby.prevX = this.bobby.x
    this.bobby.y = this.bobby.prevY = GROUND_Y
    this.bobby.state = 'idle'
    this.bobby.facing = -1
    this.camera.reset(STAGE_W / 2 + 120, 300)
  }

  update(game: Game): void {
    this.t += 1 / 60

    // Bobby throws a slow victory pose every few seconds so the title isn't static.
    const cycle = Math.floor(this.t / 5) % 3
    this.bobby.state = cycle === 2 ? 'victory' : 'idle'
    this.bobby.stateFrame++
    this.view.update(this.bobby)

    if (game.keyboard.tapped('ArrowLeft')) {
      this.choice = (this.choice + DIFFICULTIES.length - 1) % DIFFICULTIES.length
      game.sfx.play('ui')
    }
    if (game.keyboard.tapped('ArrowRight')) {
      this.choice = (this.choice + 1) % DIFFICULTIES.length
      game.sfx.play('ui')
    }
    if (game.keyboard.tapped('Enter') || game.keyboard.tapped('Space')) {
      game.arcade = freshArcade(DIFFICULTIES[this.choice]!)
      game.sfx.play('bell')
      game.setScene(new VersusScene(BOBBY, LADDER[0]!))
    }
  }

  render(_game: Game, ctx: CanvasRenderingContext2D): void {
    ctx.save()
    this.camera.apply(ctx)
    drawStage(ctx, 'kitchen', this.camera, this.t)
    this.view.draw(ctx, this.bobby, 0)
    ctx.restore()

    // Dim the stage so the logo reads.
    ctx.fillStyle = 'rgba(12, 8, 14, 0.42)'
    ctx.fillRect(0, 0, VIEW_W, VIEW_H)
    drawVignette(ctx)

    const bob = Math.sin(this.t * 1.6) * 4
    ctx.save()
    ctx.translate(VIEW_W * 0.36, 150 + bob)

    // Logo: a hard-shadowed arcade wordmark with a claw-mark slash through it.
    ctx.rotate(-0.035)
    text(ctx, 'BOBBY', 0, 0, {
      size: 92,
      align: 'center',
      colour: '#ffd34d',
      outline: '#2a1206',
      weight: 800,
      tracking: 4,
    })
    text(ctx, 'FIGHTER', 0, 74, {
      size: 74,
      align: 'center',
      colour: '#ff8a3d',
      outline: '#2a1206',
      weight: 800,
      tracking: 10,
    })

    // Three claw slashes across the logo.
    ctx.strokeStyle = withAlpha('#fff6e0', 0.85)
    ctx.lineWidth = 4
    ctx.lineCap = 'round'
    for (let i = 0; i < 3; i++) {
      ctx.beginPath()
      ctx.moveTo(-170 + i * 26, -62)
      ctx.quadraticCurveTo(-120 + i * 30, 10, -40 + i * 34, 96)
      ctx.stroke()
    }
    ctx.restore()

    text(ctx, 'a fighting game about cats', VIEW_W * 0.36, 268, {
      size: 18,
      align: 'center',
      colour: '#e9d9bd',
      outline: '#2a1206',
      tracking: 5,
    })

    // Difficulty picker
    const dy = 366
    text(ctx, '◀   DIFFICULTY   ▶', VIEW_W * 0.36, dy - 34, {
      size: 14,
      align: 'center',
      colour: '#9c8d78',
      outline: '#1a1216',
      tracking: 3,
    })
    for (let i = 0; i < DIFFICULTIES.length; i++) {
      const selected = i === this.choice
      const x = VIEW_W * 0.36 + (i - 1) * 128
      if (selected) {
        ctx.fillStyle = withAlpha('#ffd34d', 0.16)
        ctx.beginPath()
        ctx.ellipse(x, dy - 8, 62, 22, 0, 0, TAU)
        ctx.fill()
      }
      text(ctx, DIFFICULTIES[i]!.toUpperCase(), x, dy, {
        size: selected ? 26 : 20,
        align: 'center',
        colour: selected ? '#ffd34d' : '#8d8172',
        outline: '#1a1216',
        weight: 800,
        tracking: 2,
      })
    }
    text(ctx, DIFFICULTY_BLURB[DIFFICULTIES[this.choice]!], VIEW_W * 0.36, dy + 28, {
      size: 15,
      align: 'center',
      colour: '#c9b9a0',
      outline: '#1a1216',
    })

    const blink = Math.sin(this.t * 4) > -0.3
    if (blink) {
      text(ctx, 'PRESS ENTER', VIEW_W * 0.36, dy + 84, {
        size: 28,
        align: 'center',
        colour: '#fff3d6',
        outline: '#2a1206',
        weight: 800,
        tracking: 6,
      })
    }

    text(ctx, `${LADDER.length} challengers  ·  best of 3`, VIEW_W - 24, VIEW_H - 20, {
      size: 13,
      align: 'right',
      colour: '#7d7060',
      outline: '#14100f',
    })
  }
}
