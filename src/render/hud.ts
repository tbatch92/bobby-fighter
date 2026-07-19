import { clamp, lerp } from '../core/math'
import type { Match } from '../sim/match'
import { MAX_METER, VIEW_W } from '../sim/physics'
import { ROUNDS_TO_WIN } from '../sim/match'
import { withAlpha } from './color'

/**
 * The arcade furniture: health bars, timer, round pips and super meters.
 *
 * The health bars use the classic two-layer trick — a fast red bar that snaps to
 * the real value and a slow amber bar that catches up over the next half second.
 * The gap between them is how a player reads "that combo cost me a lot" at a glance.
 */

const BAR_W = 396
const BAR_H = 26
const BAR_Y = 30
const BAR_INSET = 26

export interface Announcement {
  text: string
  sub?: string
  /** 0..1 progress through the announcement, used for the pop-in. */
  t: number
  colour: string
}

export class Hud {
  /** Slow-following health, one per side. */
  private lagHealth: [number, number] = [1, 1]
  private comboShown: [number, number] = [0, 0]
  private comboAge: [number, number] = [0, 0]

  reset(): void {
    this.lagHealth = [1, 1]
    this.comboShown = [0, 0]
    this.comboAge = [0, 0]
  }

  update(match: Match): void {
    for (let i = 0; i < 2; i++) {
      const f = match.fighters[i]!
      const frac = f.health / f.maxHealth
      this.lagHealth[i] =
        this.lagHealth[i] > frac ? Math.max(frac, this.lagHealth[i] - 0.006) : frac

      // Show the combo on the attacker's side, and let it linger after it ends.
      const victim = match.fighters[1 - i]!
      if (victim.comboHits >= 2) {
        this.comboShown[i] = victim.comboHits
        this.comboAge[i] = 0
      } else if (this.comboShown[i] > 0) {
        this.comboAge[i]++
        if (this.comboAge[i] > 60) this.comboShown[i] = 0
      }
    }
  }

  draw(ctx: CanvasRenderingContext2D, match: Match): void {
    for (let side = 0 as 0 | 1; side < 2; side = (side + 1) as 0 | 1) {
      this.drawSide(ctx, match, side)
    }
    this.drawTimer(ctx, match)
  }

  private drawSide(ctx: CanvasRenderingContext2D, match: Match, side: 0 | 1): void {
    const f = match.fighters[side]!
    const flip = side === 1
    const x = flip ? VIEW_W - BAR_INSET - BAR_W : BAR_INSET
    const frac = clamp(f.health / f.maxHealth, 0, 1)
    const lag = clamp(this.lagHealth[side], 0, 1)

    // Frame
    ctx.fillStyle = 'rgba(8,6,10,0.72)'
    slantRect(ctx, x - 4, BAR_Y - 4, BAR_W + 8, BAR_H + 8, flip)
    ctx.fill()
    ctx.strokeStyle = '#efe3c8'
    ctx.lineWidth = 2
    slantRect(ctx, x - 4, BAR_Y - 4, BAR_W + 8, BAR_H + 8, flip)
    ctx.stroke()

    ctx.fillStyle = '#2a1c1c'
    slantRect(ctx, x, BAR_Y, BAR_W, BAR_H, flip)
    ctx.fill()

    // Amber trailing bar
    ctx.save()
    slantRect(ctx, x, BAR_Y, BAR_W, BAR_H, flip)
    ctx.clip()
    ctx.fillStyle = '#e8a53a'
    ctx.fillRect(flip ? x + BAR_W * (1 - lag) : x, BAR_Y, BAR_W * lag, BAR_H)

    // Live health bar, greener at full and red when it's nearly over.
    const g = ctx.createLinearGradient(0, BAR_Y, 0, BAR_Y + BAR_H)
    const hot = frac < 0.25
    g.addColorStop(0, hot ? '#ff7a6b' : '#8fd66a')
    g.addColorStop(0.5, hot ? '#e2483a' : '#5cb247')
    g.addColorStop(1, hot ? '#a82a22' : '#3d8a32')
    ctx.fillStyle = g
    ctx.fillRect(flip ? x + BAR_W * (1 - frac) : x, BAR_Y, BAR_W * frac, BAR_H)

    ctx.fillStyle = withAlpha('#ffffff', 0.22)
    ctx.fillRect(x, BAR_Y + 2, BAR_W, 6)
    ctx.restore()

    // Name
    text(ctx, f.def.name.toUpperCase(), flip ? x + BAR_W : x, BAR_Y + BAR_H + 22, {
      size: 17,
      align: flip ? 'right' : 'left',
      colour: '#f6ecd6',
      outline: '#1a1216',
      weight: 700,
    })

    // Round pips
    for (let i = 0; i < ROUNDS_TO_WIN; i++) {
      const px = flip ? x + BAR_W - 12 - i * 24 : x + 12 + i * 24
      const py = BAR_Y + BAR_H + 32
      ctx.beginPath()
      ctx.arc(px, py, 8, 0, Math.PI * 2)
      ctx.fillStyle = i < f.roundsWon ? '#ffd34d' : 'rgba(0,0,0,0.45)'
      ctx.fill()
      ctx.lineWidth = 2
      ctx.strokeStyle = '#efe3c8'
      ctx.stroke()
    }

    // Super meter
    const mw = 268
    const mh = 17
    const mx = flip ? VIEW_W - BAR_INSET - mw : BAR_INSET
    const my = 496
    const meter = clamp(f.meter / MAX_METER, 0, 1)
    ctx.fillStyle = 'rgba(8,6,10,0.72)'
    slantRect(ctx, mx - 3, my - 3, mw + 6, mh + 6, flip)
    ctx.fill()
    ctx.strokeStyle = meter >= 1 ? '#ffe066' : '#8e8375'
    ctx.lineWidth = 2
    slantRect(ctx, mx - 3, my - 3, mw + 6, mh + 6, flip)
    ctx.stroke()

    ctx.save()
    slantRect(ctx, mx, my, mw, mh, flip)
    ctx.clip()
    ctx.fillStyle = '#171018'
    ctx.fillRect(mx, my, mw, mh)
    const mg = ctx.createLinearGradient(0, my, 0, my + mh)
    if (meter >= 1) {
      // Full meter pulses so you cannot miss it.
      const pulse = 0.75 + 0.25 * Math.sin(performance.now() / 90)
      mg.addColorStop(0, withAlpha('#fff4b0', pulse))
      mg.addColorStop(1, withAlpha('#f5a623', pulse))
    } else {
      mg.addColorStop(0, '#7fd7ff')
      mg.addColorStop(1, '#2f7fd0')
    }
    ctx.fillStyle = mg
    ctx.fillRect(flip ? mx + mw * (1 - meter) : mx, my, mw * meter, mh)
    ctx.restore()

    text(ctx, meter >= 1 ? 'SUPER READY' : 'SUPER', flip ? mx + mw : mx, my - 8, {
      size: 12,
      align: flip ? 'right' : 'left',
      colour: meter >= 1 ? '#ffe066' : '#9a9186',
      outline: '#120e14',
      weight: 700,
    })

    // Combo counter
    const combo = this.comboShown[side]
    if (combo >= 2) {
      const fade = clamp(1 - (this.comboAge[side] - 40) / 20, 0, 1)
      const pop = clamp(1 - this.comboAge[side] / 6, 0, 1)
      ctx.save()
      ctx.globalAlpha = fade
      const cx = flip ? VIEW_W - 150 : 150
      text(ctx, `${combo}`, cx, 168, {
        size: 52 + pop * 16,
        align: 'center',
        colour: '#ffe066',
        outline: '#1a1216',
        weight: 800,
      })
      text(ctx, 'HIT COMBO', cx, 192, {
        size: 15,
        align: 'center',
        colour: '#f6ecd6',
        outline: '#1a1216',
        weight: 700,
      })
      ctx.restore()
    }
  }

  private drawTimer(ctx: CanvasRenderingContext2D, match: Match): void {
    const cx = VIEW_W / 2
    ctx.fillStyle = 'rgba(8,6,10,0.72)'
    slantRect(ctx, cx - 52, BAR_Y - 8, 104, BAR_H + 22, false)
    ctx.fill()
    ctx.strokeStyle = '#efe3c8'
    ctx.lineWidth = 2
    slantRect(ctx, cx - 52, BAR_Y - 8, 104, BAR_H + 22, false)
    ctx.stroke()

    const low = match.timer <= 10
    text(ctx, String(match.timer).padStart(2, '0'), cx, BAR_Y + 30, {
      size: 38,
      align: 'center',
      colour: low ? '#ff6b5e' : '#fff3d6',
      outline: '#1a1216',
      weight: 800,
    })
  }
}

/** Health bars are cut on a slant, like every arcade fighter ever made. */
function slantRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  flip: boolean,
): void {
  const s = 14
  ctx.beginPath()
  if (flip) {
    ctx.moveTo(x, y)
    ctx.lineTo(x + w, y)
    ctx.lineTo(x + w, y + h)
    ctx.lineTo(x + s, y + h)
  } else {
    ctx.moveTo(x, y)
    ctx.lineTo(x + w, y)
    ctx.lineTo(x + w - s, y + h)
    ctx.lineTo(x, y + h)
  }
  ctx.closePath()
}

export interface TextOptions {
  size?: number
  colour?: string
  outline?: string
  align?: CanvasTextAlign
  weight?: number
  family?: string
  /** Extra spacing between characters, for headline text. */
  tracking?: number
  alpha?: number
}

/** Outlined arcade text. Used by the HUD and every scene. */
export function text(
  ctx: CanvasRenderingContext2D,
  str: string,
  x: number,
  y: number,
  o: TextOptions = {},
): void {
  const size = o.size ?? 18
  ctx.save()
  ctx.globalAlpha = o.alpha ?? 1
  ctx.font = `${o.weight ?? 700} ${size}px ${o.family ?? '"Avenir Next Condensed", "Helvetica Neue", system-ui, sans-serif'}`
  ctx.textAlign = o.tracking ? 'left' : (o.align ?? 'left')
  ctx.textBaseline = 'alphabetic'
  ctx.lineJoin = 'round'

  const paint = (s: string, px: number, py: number): void => {
    if (o.outline) {
      ctx.strokeStyle = o.outline
      ctx.lineWidth = Math.max(3, size * 0.16)
      ctx.strokeText(s, px, py)
    }
    ctx.fillStyle = o.colour ?? '#ffffff'
    ctx.fillText(s, px, py)
  }

  if (o.tracking) {
    const chars = [...str]
    const total =
      chars.reduce((sum, c) => sum + ctx.measureText(c).width, 0) + o.tracking * (chars.length - 1)
    let cx = o.align === 'center' ? x - total / 2 : o.align === 'right' ? x - total : x
    for (const c of chars) {
      paint(c, cx, y)
      cx += ctx.measureText(c).width + o.tracking
    }
  } else {
    paint(str, x, y)
  }
  ctx.restore()
}

/** Big centred announcement with a pop-in and a drift-out. */
export function announce(ctx: CanvasRenderingContext2D, a: Announcement): void {
  const inT = clamp(a.t * 5, 0, 1)
  const outT = clamp((a.t - 0.78) / 0.22, 0, 1)
  const scale = lerp(2.1, 1, inT * inT) + outT * 0.35
  const alpha = 1 - outT

  ctx.save()
  ctx.translate(VIEW_W / 2, 210)
  ctx.scale(scale, scale)
  ctx.globalAlpha = alpha
  text(ctx, a.text, 0, 0, {
    size: 58,
    align: 'center',
    colour: a.colour,
    outline: '#17121a',
    weight: 800,
    tracking: 3,
  })
  if (a.sub) {
    text(ctx, a.sub, 0, 32, {
      size: 20,
      align: 'center',
      colour: '#f2e6cc',
      outline: '#17121a',
      weight: 700,
      tracking: 2,
    })
  }
  ctx.restore()
}
