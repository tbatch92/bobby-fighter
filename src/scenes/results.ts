import { clamp, smoothstep, TAU } from '../core/math'
import { BOBBY, LADDER } from '../data/roster'
import { createRigState, drawCat, updateRig } from '../render/catRig'
import { withAlpha } from '../render/color'
import { text } from '../render/hud'
import { poseFor } from '../render/poses'
import { drawStage, drawVignette } from '../render/stage'
import { Camera } from '../render/camera'
import { Fighter } from '../sim/fighter'
import { GROUND_Y, STAGE_W, VIEW_H, VIEW_W } from '../sim/physics'
import type { CharacterDef } from '../sim/types'
import { TitleScene } from './title'
import { VersusScene } from './versus'
import type { Game, Scene } from './types'

/**
 * After a match: advance the ladder, spend a continue, or roll the ending.
 *
 * Losing offers a continue rather than dumping you back to the title, because a
 * five-fight ladder that restarts from scratch on every loss is a five-fight ladder
 * nobody finishes.
 */
export class ResultsScene implements Scene {
  private frame = 0
  private readonly cat: Fighter
  private readonly rig = createRigState()
  private readonly camera = new Camera()
  private decided = false

  constructor(
    private readonly won: boolean,
    player: CharacterDef,
    private readonly opponent: CharacterDef,
  ) {
    this.cat = new Fighter(player, 0)
    // Stand the cat off to one side so the stat block has the other half to itself.
    this.cat.x = this.cat.prevX = STAGE_W / 2 + 170
    this.cat.y = this.cat.prevY = GROUND_Y
    this.cat.state = won ? 'victory' : 'knockdown'
    this.cat.facing = -1
    this.camera.reset(STAGE_W / 2 + 40, 300)
  }

  enter(game: Game): void {
    if (this.won) game.arcade.ladderIndex++
    else game.arcade.continues--
  }

  update(game: Game): void {
    this.frame++
    this.cat.stateFrame++
    const t = this.frame / 60
    updateRig(this.rig, poseFor(this.cat, t), this.cat.def.proportions, 0, 0, 1, 1 / 60)

    if (this.frame === 30) game.sfx.play(this.won ? 'meow' : 'yowl', this.won ? 2 : -3)

    const go = game.keyboard.tapped('Enter') || game.keyboard.tapped('Space')
    if (!go || this.frame < 40 || this.decided) return
    this.decided = true

    game.sfx.play('ui')
    if (!this.won) {
      if (game.arcade.continues >= 0) {
        game.setScene(new VersusScene(BOBBY, this.opponent))
      } else {
        game.setScene(new TitleScene())
      }
      return
    }

    const next = LADDER[game.arcade.ladderIndex]
    game.setScene(next ? new VersusScene(BOBBY, next) : new EndingScene())
  }

  render(game: Game, ctx: CanvasRenderingContext2D): void {
    const t = this.frame / 60
    ctx.save()
    this.camera.apply(ctx)
    drawStage(ctx, this.opponent.stageId, this.camera, t)
    ctx.restore()

    // Dim the stage *before* the cat, so the cat stays bright and the text stays
    // readable — dimming everything at once buries the character in the murk.
    ctx.fillStyle = withAlpha('#0a0710', 0.52)
    ctx.fillRect(0, 0, VIEW_W, VIEW_H)

    ctx.save()
    this.camera.apply(ctx)
    const glow = ctx.createRadialGradient(this.cat.x, GROUND_Y - 90, 20, this.cat.x, GROUND_Y - 90, 240)
    glow.addColorStop(0, withAlpha(this.won ? '#ffd34d' : '#4a3f5e', 0.3))
    glow.addColorStop(1, withAlpha('#ffd34d', 0))
    ctx.fillStyle = glow
    ctx.fillRect(this.cat.x - 260, GROUND_Y - 340, 520, 400)
    drawCat(ctx, {
      pose: poseFor(this.cat, t),
      palette: this.cat.def.palette,
      proportions: this.cat.def.proportions,
      rig: this.rig,
      x: this.cat.x,
      y: this.cat.y,
      facing: -1,
    })
    ctx.restore()

    drawVignette(ctx)

    const pop = smoothstep(clamp(this.frame / 22, 0, 1))
    ctx.save()
    ctx.translate(VIEW_W * 0.33, 150)
    ctx.scale(2 - pop, 2 - pop)
    ctx.globalAlpha = pop
    text(ctx, this.won ? 'VICTORY' : 'DEFEAT', 0, 0, {
      size: 74,
      align: 'center',
      colour: this.won ? '#ffd34d' : '#ff6b5e',
      outline: '#2a1206',
      weight: 800,
      tracking: 8,
    })
    ctx.restore()

    if (this.frame < 30) return

    const lines: [string, string][] = this.won
      ? [
          ['DEFEATED', this.opponent.name],
          ['ROUNDS WON', String(game.arcade.roundsWon)],
          ['PERFECTS', String(game.arcade.perfects)],
          ['NEXT', LADDER[game.arcade.ladderIndex]?.name ?? '—'],
        ]
      : [
          ['BEATEN BY', this.opponent.name],
          ['CONTINUES LEFT', String(Math.max(0, game.arcade.continues + 1))],
        ]

    const alpha = clamp((this.frame - 30) / 20, 0, 1)
    const col = VIEW_W * 0.33
    lines.forEach(([label, value], i) => {
      const y = 262 + i * 34
      text(ctx, label, col - 12, y, {
        size: 15,
        align: 'right',
        colour: '#9c8d78',
        outline: '#1a1216',
        tracking: 2,
        alpha,
      })
      text(ctx, value.toUpperCase(), col + 12, y, {
        size: 20,
        align: 'left',
        colour: '#f6ecd6',
        outline: '#1a1216',
        weight: 800,
        alpha,
      })
    })

    if (this.frame > 44 && Math.sin(t * 4) > -0.3) {
      const prompt = this.won
        ? LADDER[game.arcade.ladderIndex]
          ? 'ENTER — NEXT CHALLENGER'
          : 'ENTER — FINISH'
        : game.arcade.continues >= 0
          ? 'ENTER — CONTINUE'
          : 'ENTER — BACK TO TITLE'
      text(ctx, prompt, VIEW_W * 0.33, 448, {
        size: 22,
        align: 'center',
        colour: '#fff3d6',
        outline: '#2a1206',
        weight: 800,
        tracking: 4,
      })
    }
  }
}

/** Beat the whole ladder: a curtain call with every cat on screen. */
export class EndingScene implements Scene {
  private frame = 0
  private readonly cats = [BOBBY, ...LADDER].map((def, i) => {
    const f = new Fighter(def, 0)
    f.state = i === 0 ? 'victory' : 'idle'
    f.facing = i === 0 ? 1 : i % 2 === 0 ? 1 : -1
    return { def, f, rig: createRigState() }
  })

  update(game: Game): void {
    this.frame++
    const t = this.frame / 60
    for (const c of this.cats) {
      c.f.stateFrame++
      updateRig(c.rig, poseFor(c.f, t), c.def.proportions, 0, 0, c.f.facing, 1 / 60)
    }
    if (this.frame === 40) game.sfx.play('meow', 4)
    if (this.frame > 90 && (game.keyboard.tapped('Enter') || game.keyboard.tapped('Space'))) {
      game.setScene(new TitleScene())
    }
  }

  render(game: Game, ctx: CanvasRenderingContext2D): void {
    const t = this.frame / 60
    const sky = ctx.createLinearGradient(0, 0, 0, VIEW_H)
    sky.addColorStop(0, '#2b1f3a')
    sky.addColorStop(0.6, '#7a4a52')
    sky.addColorStop(1, '#e0a05c')
    ctx.fillStyle = sky
    ctx.fillRect(0, 0, VIEW_W, VIEW_H)

    // Confetti of drifting fur.
    ctx.fillStyle = withAlpha('#fff4dd', 0.5)
    for (let i = 0; i < 60; i++) {
      const x = (i * 137 + this.frame * (0.6 + (i % 5) * 0.2)) % (VIEW_W + 40)
      const y = ((i * 89 + this.frame * (1.1 + (i % 3) * 0.4)) % (VIEW_H + 40)) - 20
      ctx.beginPath()
      ctx.ellipse(x, y, 4, 2, i, 0, TAU)
      ctx.fill()
    }

    const spacing = VIEW_W / (this.cats.length + 1)
    this.cats.forEach((c, i) => {
      const enter = clamp((this.frame - i * 12) / 26, 0, 1)
      const y = 470 + (1 - smoothstep(enter)) * 260
      ctx.save()
      ctx.globalAlpha = enter
      ctx.scale(0.78, 0.78)
      drawCat(ctx, {
        pose: poseFor(c.f, t + i),
        palette: c.def.palette,
        proportions: c.def.proportions,
        rig: c.rig,
        x: (spacing * (i + 1)) / 0.78,
        y: y / 0.78,
        facing: c.f.facing,
      })
      ctx.restore()
    })

    drawVignette(ctx)

    text(ctx, 'THE FLAP IS SAFE', VIEW_W / 2, 118, {
      size: 54,
      align: 'center',
      colour: '#ffe9a8',
      outline: '#2a1206',
      weight: 800,
      tracking: 6,
    })
    text(
      ctx,
      `Bobby went back inside. ${game.arcade.roundsWon} rounds, ${game.arcade.perfects} perfect.`,
      VIEW_W / 2,
      154,
      { size: 17, align: 'center', colour: '#f2e6cc', outline: '#2a1206' },
    )

    if (this.frame > 90 && Math.sin(t * 4) > -0.3) {
      text(ctx, 'PRESS ENTER', VIEW_W / 2, 200, {
        size: 22,
        align: 'center',
        colour: '#fff3d6',
        outline: '#2a1206',
        weight: 800,
        tracking: 5,
      })
    }
  }
}
