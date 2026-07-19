import { clamp, lerp, smoothstep, TAU } from '../core/math'
import { LADDER } from '../data/roster'
import { withAlpha } from '../render/color'
import { drawCat, createRigState, updateRig } from '../render/catRig'
import { text } from '../render/hud'
import { poseFor } from '../render/poses'
import { STAGES } from '../render/stage'
import { Fighter } from '../sim/fighter'
import { VIEW_H, VIEW_W } from '../sim/physics'
import type { CharacterDef } from '../sim/types'
import { FightScene } from './fight'
import type { Game, Scene } from './types'

const HOLD_FRAMES = 190

/**
 * The versus card. Two cats slide in from opposite sides, glare at each other, and
 * the fight starts. Pure ceremony, and worth every frame of it — it's what makes a
 * new opponent feel like an event rather than a respawn.
 */
export class VersusScene implements Scene {
  private frame = 0
  private readonly left: Fighter
  private readonly right: Fighter
  private readonly rigs = [createRigState(), createRigState()]

  constructor(
    private readonly player: CharacterDef,
    private readonly opponent: CharacterDef,
  ) {
    this.left = new Fighter(player, 0)
    this.right = new Fighter(opponent, 1)
    this.left.state = 'idle'
    this.right.state = 'idle'
    this.left.facing = 1
    this.right.facing = -1
  }

  update(game: Game): void {
    this.frame++
    this.left.stateFrame++
    this.right.stateFrame++

    const t = this.frame / 60
    updateRig(this.rigs[0]!, poseFor(this.left, t), this.player.proportions, 0, 0, 1, 1 / 60)
    updateRig(this.rigs[1]!, poseFor(this.right, t), this.opponent.proportions, 0, 0, -1, 1 / 60)

    if (this.frame === 20) game.sfx.play('meow')
    if (this.frame === 46) game.sfx.play('growl', 2)

    if (this.frame > HOLD_FRAMES || game.keyboard.tapped('Enter') || game.keyboard.tapped('Space')) {
      game.setScene(new FightScene(this.player, this.opponent, game))
    }
  }

  render(game: Game, ctx: CanvasRenderingContext2D): void {
    const t = this.frame / 60

    // Split background: each cat gets a half in its own colour.
    const seam = VIEW_W / 2 + Math.sin(t * 0.7) * 8
    ctx.fillStyle = '#171018'
    ctx.fillRect(0, 0, VIEW_W, VIEW_H)

    for (let side = 0; side < 2; side++) {
      const def = side === 0 ? this.player : this.opponent
      const g = ctx.createLinearGradient(side === 0 ? 0 : VIEW_W, 0, seam, VIEW_H)
      g.addColorStop(0, withAlpha(def.palette.coat, 0.5))
      g.addColorStop(1, withAlpha(def.palette.outline, 0.9))
      ctx.save()
      ctx.beginPath()
      if (side === 0) {
        ctx.moveTo(0, 0)
        ctx.lineTo(seam + 40, 0)
        ctx.lineTo(seam - 40, VIEW_H)
        ctx.lineTo(0, VIEW_H)
      } else {
        ctx.moveTo(seam + 46, 0)
        ctx.lineTo(VIEW_W, 0)
        ctx.lineTo(VIEW_W, VIEW_H)
        ctx.lineTo(seam - 34, VIEW_H)
      }
      ctx.closePath()
      ctx.fillStyle = g
      ctx.fill()
      ctx.restore()
    }

    // Speed lines converging on the seam.
    ctx.save()
    ctx.globalAlpha = 0.14
    ctx.strokeStyle = '#ffffff'
    ctx.lineWidth = 3
    for (let i = 0; i < 30; i++) {
      const y = ((i * 61 + this.frame * 3) % (VIEW_H + 120)) - 60
      ctx.beginPath()
      ctx.moveTo(0, y)
      ctx.lineTo(VIEW_W, y + 40)
      ctx.stroke()
    }
    ctx.restore()

    // Cats slide in and settle.
    const slide = smoothstep(clamp(this.frame / 34, 0, 1))
    const bump = Math.sin(clamp((this.frame - 34) / 10, 0, 1) * Math.PI) * 14

    this.drawCard(ctx, this.player, 0, lerp(-330, 232 + bump, slide), t)
    this.drawCard(ctx, this.opponent, 1, lerp(VIEW_W + 330, VIEW_W - 232 - bump, slide), t)

    // VS
    const pop = smoothstep(clamp((this.frame - 30) / 16, 0, 1))
    ctx.save()
    ctx.translate(VIEW_W / 2, 214)
    ctx.scale(lerp(3, 1, pop), lerp(3, 1, pop))
    ctx.rotate(lerp(-0.6, -0.07, pop))
    ctx.globalAlpha = pop
    text(ctx, 'VS', 0, 0, {
      size: 96,
      align: 'center',
      colour: '#ffd34d',
      outline: '#2a1206',
      weight: 800,
    })
    ctx.restore()

    // Names and taunt.
    const namesIn = smoothstep(clamp((this.frame - 44) / 20, 0, 1))
    ctx.save()
    ctx.globalAlpha = namesIn
    for (let side = 0; side < 2; side++) {
      const def = side === 0 ? this.player : this.opponent
      const x = side === 0 ? 232 : VIEW_W - 232
      text(ctx, def.name.toUpperCase(), x, 424, {
        size: 34,
        align: 'center',
        colour: '#fff3d6',
        outline: '#1a1216',
        weight: 800,
        tracking: 2,
      })
      text(ctx, def.title, x, 448, {
        size: 14,
        align: 'center',
        colour: '#d9c8ac',
        outline: '#1a1216',
      })
    }

    const stage = STAGES.find((s) => s.id === this.opponent.stageId)
    if (stage) {
      text(ctx, `${stage.name.toUpperCase()}  ·  ${stage.where}`, VIEW_W / 2, 500, {
        size: 14,
        align: 'center',
        colour: '#9c8d78',
        outline: '#1a1216',
        tracking: 3,
      })
    }

    text(ctx, `MATCH ${game.arcade.ladderIndex + 1} OF ${LADDER.length}`, VIEW_W / 2, 40, {
      size: 15,
      align: 'center',
      colour: '#ffd34d',
      outline: '#1a1216',
      tracking: 4,
    })
    ctx.restore()

    // The opponent's line, typed out one character at a time.
    const tauntChars = Math.max(0, Math.floor((this.frame - 76) / 1.6))
    if (tauntChars > 0) {
      const line = `"${this.opponent.taunt}"`.slice(0, tauntChars)
      text(ctx, line, VIEW_W / 2, 472, {
        size: 17,
        align: 'center',
        colour: '#f2e6cc',
        outline: '#1a1216',
      })
    }
  }

  private drawCard(
    ctx: CanvasRenderingContext2D,
    def: CharacterDef,
    side: number,
    x: number,
    t: number,
  ): void {
    const f = side === 0 ? this.left : this.right
    // Glow behind the cat so it separates from the background.
    const g = ctx.createRadialGradient(x, 300, 20, x, 300, 220)
    g.addColorStop(0, withAlpha(def.palette.coat, 0.35))
    g.addColorStop(1, withAlpha(def.palette.coat, 0))
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.ellipse(x, 300, 220, 220, 0, 0, TAU)
    ctx.fill()

    drawCat(ctx, {
      pose: poseFor(f, t),
      palette: def.palette,
      proportions: def.proportions,
      rig: this.rigs[side]!,
      x,
      y: 396,
      facing: side === 0 ? 1 : -1,
    })
  }
}
