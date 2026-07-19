import { CpuController } from '../ai/cpu'
import { dirToAxes, type Intent, type InputBuffer } from '../core/input'
import { clamp, TAU } from '../core/math'
import { Rng } from '../core/rng'
import { Camera } from '../render/camera'
import { withAlpha } from '../render/color'
import { drawBoxes, FighterView } from '../render/fighterView'
import { Fx, drawProjectile } from '../render/fx'
import { announce, Hud, text, type Announcement } from '../render/hud'
import { drawStage, drawVignette } from '../render/stage'
import type { Fighter } from '../sim/fighter'
import { Match, ROUNDS_TO_WIN } from '../sim/match'
import { VIEW_H, VIEW_W } from '../sim/physics'
import type { CharacterDef } from '../sim/types'
import { ResultsScene } from './results'
import type { Game, Scene } from './types'

/**
 * The fight itself: one best-of-three between the player and a CPU cat.
 *
 * This scene owns the presentation only — the `Match` owns all the rules. It feeds
 * two `Intent`s in per frame (one from the keyboard, one from the CPU) and turns the
 * events that come back out into particles, screen shake and noise.
 */
export class FightScene implements Scene {
  readonly match: Match
  private readonly camera = new Camera()
  private readonly fx = new Fx()
  private readonly hud = new Hud()
  private readonly views: [FighterView, FighterView] = [new FighterView(), new FighterView()]
  private readonly cpu: CpuController
  private readonly stageId: string

  private announcement: (Announcement & { life: number; total: number }) | null = null
  private t = 0
  private endTimer = 0
  private lastPhase = ''
  private lastRound = 0

  constructor(
    private readonly player: CharacterDef,
    private readonly opponent: CharacterDef,
    game: Game,
  ) {
    this.match = new Match(player, opponent, 0x51f0 + game.arcade.ladderIndex * 977)
    this.cpu = new CpuController(1, game.arcade.difficulty, new Rng(0xbeef + game.arcade.ladderIndex))
    this.stageId = opponent.stageId
    this.camera.reset(this.match.centreX, this.match.gap)
  }

  enter(game: Game): void {
    game.input.clear()
    this.hud.reset()
    this.say(`ROUND ${this.match.round}`, this.opponent.name.toUpperCase(), '#ffd34d', 90)
  }

  update(game: Game): void {
    this.t += 1 / 60

    const me = this.match.fighters[0]!
    const before = me.move

    const playerIntent = readPlayer(game.input, me)
    const cpuIntent = this.cpu.think(this.match)
    this.match.step([playerIntent, cpuIntent])

    // If a move actually came out, spend the buffered press so it can't repeat.
    if (me.move !== before && playerIntent.attack) game.input.consumeAttack(playerIntent.attack)

    this.consumeEvents(game)

    for (let i = 0; i < 2; i++) this.views[i]!.update(this.match.fighters[i]!)
    this.fx.update()

    if (this.match.freeze === 0) this.camera.follow(this.match.centreX, this.match.gap)
    this.camera.update()

    this.hud.update(this.match)
    this.updateAnnouncements(game)

    if (this.match.phase === 'matchEnd') {
      this.endTimer++
      if (this.endTimer > 150 || game.keyboard.tapped('Enter')) {
        game.setScene(new ResultsScene(this.match.matchWinner === 0, this.player, this.opponent))
      }
    }
  }

  /** Turn simulation events into things you can see and hear. */
  private consumeEvents(game: Game): void {
    const ev = this.match.events

    for (const hit of ev.hits) {
      const power = clamp(hit.damage / 110, 0.25, 1.4)
      if (hit.blocked) {
        this.fx.block(hit.at.x, hit.at.y)
        this.camera.shake(2.5)
        game.sfx.play('block')
      } else {
        this.fx.hit(hit.at.x, hit.at.y, power, hit.counter)
        this.camera.shake(4 + power * 9 + (hit.counter ? 4 : 0))
        game.sfx.play(power > 0.6 ? 'hitHeavy' : 'hitLight')
        const victim = this.match.fighters[hit.victim]!
        if (!victim.alive) {
          game.sfx.play('ko')
          this.camera.shake(20)
        }
      }
    }

    for (const d of ev.dust) this.fx.dust(d.x, d.y, d.amount)
    for (const voice of ev.voices) {
      game.sfx.play(voice.sound as 'meow', voice.side === 0 ? 0 : 3)
    }

    if (this.match.freeze > 0 && this.lastPhase !== 'freeze') {
      game.sfx.play('super')
      this.camera.shake(9)
      this.lastPhase = 'freeze'
    } else if (this.match.freeze === 0) {
      this.lastPhase = ''
    }
  }

  private updateAnnouncements(game: Game): void {
    if (this.announcement) {
      this.announcement.life--
      if (this.announcement.life <= 0) this.announcement = null
    }

    const m = this.match
    if (m.round !== this.lastRound && m.phase === 'intro') {
      this.lastRound = m.round
      if (m.round > 1) this.say(`ROUND ${m.round}`, undefined, '#ffd34d', 90)
    }

    if (m.phase === 'fight' && m.phaseFrame === 1) {
      this.say('FIGHT!', undefined, '#ff6b5e', 60)
      game.sfx.play('bell')
    }

    if (m.phase === 'ko' && m.phaseFrame === 1) {
      const loser = m.fighters[m.lastRoundWinner === 0 ? 1 : 0]!
      const winner = m.lastRoundWinner === null ? null : m.fighters[m.lastRoundWinner]!
      if (m.timer <= 0 && loser.alive) {
        this.say('TIME UP', undefined, '#ffd34d', 110)
      } else if (winner && winner.health === winner.maxHealth) {
        this.say('PERFECT', undefined, '#7fd7ff', 110)
        game.arcade.perfects++
      } else {
        this.say('K.O.', undefined, '#ff6b5e', 110)
      }
    }

    if (m.events.roundOver) {
      const w = m.events.roundOver.winner
      if (w === 0) game.arcade.roundsWon++
    }
  }

  private say(str: string, sub: string | undefined, colour: string, frames: number): void {
    this.announcement = { text: str, sub, colour, t: 0, life: frames, total: frames }
  }

  // --- rendering -----------------------------------------------------------

  render(game: Game, ctx: CanvasRenderingContext2D, alpha: number): void {
    ctx.save()
    this.camera.apply(ctx)

    drawStage(ctx, this.stageId, this.camera, this.t)

    // Draw the attacking cat in front so its limbs never disappear behind the
    // other one at the exact moment a hit lands.
    const [a, b] = this.match.fighters
    const order: [Fighter, FighterView][] =
      a.state === 'attack' && b.state !== 'attack'
        ? [
            [b, this.views[1]!],
            [a, this.views[0]!],
          ]
        : [
            [a, this.views[0]!],
            [b, this.views[1]!],
          ]
    for (const [f, view] of order) view.draw(ctx, f, alpha)

    for (const p of this.match.projectiles) drawProjectile(ctx, p, alpha)
    this.fx.draw(ctx)

    if (game.debug.hitboxes) {
      for (const f of this.match.fighters) drawBoxes(ctx, f)
    }

    ctx.restore()

    if (this.match.freeze > 0) this.drawSuperFlash(ctx)
    this.drawDanger(ctx)
    drawVignette(ctx)
    this.hud.draw(ctx, this.match)

    if (this.announcement) {
      this.announcement.t = 1 - this.announcement.life / this.announcement.total
      announce(ctx, this.announcement)
    }

    if (this.match.phase === 'matchEnd') this.drawMatchEnd(ctx)
  }

  /** The screen-filling flash while a super is starting up. */
  private drawSuperFlash(ctx: CanvasRenderingContext2D): void {
    const user = this.match.fighters.find((f) => f.move?.superFreeze)
    const t = 1 - this.match.freeze / 38

    ctx.save()
    const g = ctx.createRadialGradient(VIEW_W / 2, VIEW_H / 2, 0, VIEW_W / 2, VIEW_H / 2, VIEW_W * 0.7)
    g.addColorStop(0, withAlpha('#ffffff', 0.55 * (1 - t)))
    g.addColorStop(1, withAlpha('#ffcf4d', 0.15 * (1 - t)))
    ctx.fillStyle = g
    ctx.fillRect(0, 0, VIEW_W, VIEW_H)

    // Radiating speed lines.
    ctx.translate(VIEW_W / 2, VIEW_H / 2)
    ctx.strokeStyle = withAlpha('#fff3c4', 0.5)
    ctx.lineWidth = 5
    for (let i = 0; i < 26; i++) {
      const ang = (i / 26) * TAU + t * 0.6
      const inner = 140 + t * 380
      ctx.beginPath()
      ctx.moveTo(Math.cos(ang) * inner, Math.sin(ang) * inner)
      ctx.lineTo(Math.cos(ang) * (inner + 220), Math.sin(ang) * (inner + 220))
      ctx.stroke()
    }
    ctx.restore()

    if (user?.move) {
      text(ctx, user.move.name, VIEW_W / 2, 300, {
        size: 46,
        align: 'center',
        colour: '#fff3c4',
        outline: '#7a3a12',
        weight: 800,
        tracking: 4,
      })
    }
  }

  /** A red pulse round the frame when someone is one hit from losing. */
  private drawDanger(ctx: CanvasRenderingContext2D): void {
    const low = this.match.fighters.some((f) => f.alive && f.health / f.maxHealth < 0.18)
    if (!low || this.match.phase !== 'fight') return
    const pulse = 0.18 + 0.14 * Math.sin(this.t * 7)
    const g = ctx.createRadialGradient(
      VIEW_W / 2,
      VIEW_H / 2,
      VIEW_H * 0.4,
      VIEW_W / 2,
      VIEW_H / 2,
      VIEW_H,
    )
    g.addColorStop(0, 'rgba(0,0,0,0)')
    g.addColorStop(1, withAlpha('#ff2b1f', pulse))
    ctx.fillStyle = g
    ctx.fillRect(0, 0, VIEW_W, VIEW_H)
  }

  private drawMatchEnd(ctx: CanvasRenderingContext2D): void {
    const won = this.match.matchWinner === 0
    const fade = clamp(this.endTimer / 40, 0, 1)
    ctx.save()
    ctx.globalAlpha = fade * 0.55
    ctx.fillStyle = '#0a0710'
    ctx.fillRect(0, 0, VIEW_W, VIEW_H)
    ctx.restore()

    text(ctx, won ? 'WINNER' : 'YOU LOSE', VIEW_W / 2, 250, {
      size: 66,
      align: 'center',
      colour: won ? '#ffd34d' : '#ff6b5e',
      outline: '#17121a',
      weight: 800,
      tracking: 6,
      alpha: fade,
    })
    text(
      ctx,
      won ? `${this.player.name.toUpperCase()} TAKES IT ${this.match.fighters[0]!.roundsWon}-${this.match.fighters[1]!.roundsWon}` : 'PRESS ENTER',
      VIEW_W / 2,
      290,
      { size: 20, align: 'center', colour: '#f2e6cc', outline: '#17121a', tracking: 3, alpha: fade },
    )
    void ROUNDS_TO_WIN
  }
}

/**
 * Keyboard -> `Intent`.
 *
 * Specials fire either from the dedicated button or from a quarter-circle motion
 * plus an attack. Supporting both means motion inputs are there for players who
 * want them without being a wall for players who don't.
 */
export function readPlayer(buf: InputBuffer, me: Fighter): Intent {
  const axes = dirToAxes(buf.current.dir)
  let attack = buf.bufferedAttack()
  let special = buf.pressed('special')

  if (attack && (buf.hasMotion('qcf', me.facing) || buf.hasMotion('qcb', me.facing))) {
    special = true
    buf.consumeAttack(attack)
    attack = null
  }

  return {
    dirX: axes.x,
    dirY: axes.y,
    attack,
    special,
    // The super has its own button rather than a motion: it costs the whole meter,
    // so fumbling the input is the worst possible moment to lose a round.
    super: buf.pressed('super'),
    dashForward: buf.hasDoubleTap(true, me.facing),
    dashBack: buf.hasDoubleTap(false, me.facing),
  }
}
