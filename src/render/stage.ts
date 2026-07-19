import { TAU } from '../core/math'
import { GROUND_Y, STAGE_W, VIEW_H, VIEW_W } from '../sim/physics'
import { withAlpha } from './color'
import type { Camera } from './camera'

/**
 * Stages, drawn procedurally like the cats.
 *
 * Each stage is three parallax layers over a floor. `layer()` handles the parallax
 * maths: a factor of 1 moves with the fighters, 0 is painted at infinity.
 */

export interface StageDef {
  id: string
  name: string
  /** Shown under the stage name on the versus screen. */
  where: string
}

export const STAGES: StageDef[] = [
  { id: 'kitchen', name: 'The Kitchen Door', where: 'home turf' },
  { id: 'garden', name: 'The Back Garden', where: 'past the flap' },
  { id: 'livingroom', name: 'The Good Sofa', where: 'strictly off-limits' },
  { id: 'rooftop', name: 'The Rooftops', where: 'after midnight' },
  { id: 'alley', name: 'Bin Alley', where: 'behind the chip shop' },
  { id: 'windowsill', name: 'The Windowsill', where: 'last of the sun' },
]

/** Everything below the floor line is off-limits to the parallax layers. */
const FLOOR_H = VIEW_H

function layer(
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  factor: number,
  draw: (ctx: CanvasRenderingContext2D) => void,
): void {
  ctx.save()
  ctx.translate(cam.x * (1 - factor), 0)
  draw(ctx)
  ctx.restore()
}

/** A generous backdrop rect that covers the view at any zoom. */
function backdrop(ctx: CanvasRenderingContext2D, fill: string | CanvasGradient): void {
  ctx.fillStyle = fill
  ctx.fillRect(-600, -700, STAGE_W + 1200, GROUND_Y + 700)
}

export function drawStage(ctx: CanvasRenderingContext2D, id: string, cam: Camera, t: number): void {
  switch (id) {
    case 'garden':
      return garden(ctx, cam, t)
    case 'livingroom':
      return livingRoom(ctx, cam, t)
    case 'rooftop':
      return rooftop(ctx, cam, t)
    case 'alley':
      return alley(ctx, cam, t)
    case 'windowsill':
      return windowsill(ctx, cam, t)
    default:
      return kitchen(ctx, cam, t)
  }
}

// --- shared pieces ---------------------------------------------------------

function woodFloor(ctx: CanvasRenderingContext2D, base: string, line: string): void {
  const g = ctx.createLinearGradient(0, GROUND_Y, 0, GROUND_Y + 160)
  g.addColorStop(0, base)
  g.addColorStop(1, withAlpha(line, 0.9))
  ctx.fillStyle = g
  ctx.fillRect(-600, GROUND_Y, STAGE_W + 1200, FLOOR_H)

  ctx.strokeStyle = withAlpha(line, 0.5)
  ctx.lineWidth = 2
  for (let i = 0; i < 22; i++) {
    const y = GROUND_Y + 6 + i * i * 0.5
    if (y > GROUND_Y + 130) break
    ctx.beginPath()
    ctx.moveTo(-600, y)
    ctx.lineTo(STAGE_W + 600, y)
    ctx.stroke()
  }
  // Plank seams, converging slightly for a hint of perspective.
  for (let x = -400; x < STAGE_W + 400; x += 118) {
    ctx.beginPath()
    ctx.moveTo(x, GROUND_Y)
    ctx.lineTo(x + 60, GROUND_Y + 130)
    ctx.stroke()
  }
}

/** The soft shadow every fighter casts, drawn by the fight scene. */
export function drawGroundShadow(
  ctx: CanvasRenderingContext2D,
  x: number,
  feetY: number,
  width: number,
): void {
  const height = Math.max(0, GROUND_Y - feetY)
  const spread = 1 - Math.min(0.62, height / 260)
  ctx.save()
  ctx.globalAlpha = 0.32 * spread
  ctx.fillStyle = '#000000'
  ctx.beginPath()
  ctx.ellipse(x, GROUND_Y + 4, width * spread, width * 0.24 * spread, 0, 0, TAU)
  ctx.fill()
  ctx.restore()
}

export function drawVignette(ctx: CanvasRenderingContext2D): void {
  const g = ctx.createRadialGradient(
    VIEW_W / 2,
    VIEW_H / 2,
    VIEW_H * 0.35,
    VIEW_W / 2,
    VIEW_H / 2,
    VIEW_H * 0.95,
  )
  g.addColorStop(0, 'rgba(0,0,0,0)')
  g.addColorStop(1, 'rgba(0,0,0,0.42)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, VIEW_W, VIEW_H)
}

// --- Bobby's kitchen -------------------------------------------------------
// The home stage, built from the reference photo: a glazed back door with a white
// cat flap in it, a coir doormat, pale skirting and a wooden floor.

function kitchen(ctx: CanvasRenderingContext2D, cam: Camera, t: number): void {
  const wall = ctx.createLinearGradient(0, -200, 0, GROUND_Y)
  wall.addColorStop(0, '#f0e6d8')
  wall.addColorStop(0.65, '#e4d6c3')
  wall.addColorStop(1, '#cdbca6')
  backdrop(ctx, wall)

  layer(ctx, cam, 0.4, (c) => {
    // Cabinets along the back wall.
    c.fillStyle = '#dfd0ba'
    c.fillRect(760, 210, 620, 258)
    c.fillStyle = '#c9b79c'
    c.fillRect(760, 206, 620, 12)
    c.strokeStyle = '#b6a288'
    c.lineWidth = 3
    for (let i = 0; i < 4; i++) {
      c.strokeRect(776 + i * 150, 226, 132, 226)
      c.fillStyle = '#8d7c66'
      c.fillRect(830 + i * 150, 246, 28, 7)
      c.fillStyle = '#c9b79c'
    }
    // Fridge
    c.fillStyle = '#eceff1'
    c.fillRect(1420, 120, 190, 348)
    c.strokeStyle = '#c3c9cc'
    c.lineWidth = 3
    c.strokeRect(1420, 120, 190, 348)
    c.beginPath()
    c.moveTo(1420, 250)
    c.lineTo(1610, 250)
    c.stroke()
    c.fillStyle = '#b9c0c4'
    c.fillRect(1585, 200, 10, 40)
    c.fillRect(1585, 268, 10, 46)
  })

  layer(ctx, cam, 0.72, (c) => {
    // The glazed back door. This is the door from the photo.
    const dx = 150
    const dy = 40
    const dw = 300
    const dh = 428

    c.fillStyle = '#f7f4ef'
    c.fillRect(dx - 22, dy - 20, dw + 44, dh + 20)
    c.strokeStyle = '#cdc4b6'
    c.lineWidth = 3
    c.strokeRect(dx - 22, dy - 20, dw + 44, dh + 20)

    // Glass — the garden showing through, blurred to a wash of green.
    const glass = c.createLinearGradient(0, dy, 0, dy + dh)
    glass.addColorStop(0, '#9fb7c4')
    glass.addColorStop(0.55, '#8ea78f')
    glass.addColorStop(1, '#6f8a6d')
    c.fillStyle = glass
    c.fillRect(dx, dy, dw, dh)

    // Reflection streaks on the glass.
    c.fillStyle = withAlpha('#ffffff', 0.14)
    c.beginPath()
    c.moveTo(dx + 30, dy + dh)
    c.lineTo(dx + 120, dy)
    c.lineTo(dx + 178, dy)
    c.lineTo(dx + 88, dy + dh)
    c.closePath()
    c.fill()

    c.fillStyle = '#f7f4ef'
    c.fillRect(dx - 8, dy - 8, dw + 16, 16)
    c.strokeStyle = '#cdc4b6'
    c.strokeRect(dx, dy, dw, dh)

    // The cat flap: white plastic surround, translucent flap, PUSH lettering.
    const fx = dx + dw * 0.5
    const fy = dy + dh * 0.68
    c.save()
    c.translate(fx, fy)
    c.fillStyle = '#f4f3f1'
    roundRect(c, -62, -74, 124, 148, 26)
    c.fill()
    c.strokeStyle = '#d6d3ce'
    c.lineWidth = 3
    c.stroke()
    c.fillStyle = '#fbfbfa'
    roundRect(c, -50, -56, 100, 118, 16)
    c.fill()
    c.stroke()
    // The flap itself, catching a little garden light.
    c.fillStyle = withAlpha('#cfd8cc', 0.92)
    roundRect(c, -42, -46, 84, 100, 10)
    c.fill()
    c.strokeStyle = '#b9bdb6'
    c.lineWidth = 2
    c.stroke()
    c.fillStyle = '#5c5c58'
    c.font = 'bold 20px ui-monospace, monospace'
    c.textAlign = 'center'
    c.fillText('PUSH', 0, 6)
    // Latch
    c.fillStyle = '#e8e6e2'
    roundRect(c, -12, 58, 24, 20, 6)
    c.fill()
    c.strokeStyle = '#c9c6c0'
    c.stroke()
    c.restore()

    // Skirting board and the doorway reveal.
    c.fillStyle = '#f3efe7'
    c.fillRect(-600, GROUND_Y - 34, STAGE_W + 1200, 34)
    c.fillStyle = '#e2dbcd'
    c.fillRect(-600, GROUND_Y - 38, STAGE_W + 1200, 6)
  })

  woodFloor(ctx, '#c69a68', '#8d6844')

  layer(ctx, cam, 1.08, (c) => {
    // The coir doormat, front and centre where Bobby waits.
    c.save()
    c.translate(360, GROUND_Y + 46)
    c.fillStyle = '#b98a4e'
    c.beginPath()
    c.moveTo(-170, -26)
    c.lineTo(190, -26)
    c.lineTo(240, 40)
    c.lineTo(-224, 40)
    c.closePath()
    c.fill()
    c.strokeStyle = '#8a6132'
    c.lineWidth = 3
    c.stroke()
    c.strokeStyle = withAlpha('#8a6132', 0.4)
    c.lineWidth = 1.5
    for (let i = 0; i < 14; i++) {
      const x = -170 + i * 26
      c.beginPath()
      c.moveTo(x, -26)
      c.lineTo(x - 16, 40)
      c.stroke()
    }
    c.restore()

    // A food bowl, because of course.
    c.fillStyle = '#8fb3c9'
    c.beginPath()
    c.ellipse(1180, GROUND_Y + 26, 40, 14, 0, 0, TAU)
    c.fill()
    c.strokeStyle = '#5d7f95'
    c.lineWidth = 3
    c.stroke()
  })

  // Warm evening light spilling in through the door.
  const sun = ctx.createLinearGradient(200, 0, 900, GROUND_Y)
  sun.addColorStop(0, withAlpha('#ffd9a0', 0.24))
  sun.addColorStop(1, withAlpha('#ffd9a0', 0))
  ctx.fillStyle = sun
  ctx.fillRect(-600, -700, STAGE_W + 1200, GROUND_Y + 700 + FLOOR_H)
  void t
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

// --- garden ----------------------------------------------------------------

function garden(ctx: CanvasRenderingContext2D, cam: Camera, t: number): void {
  const sky = ctx.createLinearGradient(0, -300, 0, GROUND_Y)
  sky.addColorStop(0, '#7fb8d8')
  sky.addColorStop(0.55, '#bcd9e0')
  sky.addColorStop(1, '#e6e2c4')
  backdrop(ctx, sky)

  layer(ctx, cam, 0.2, (c) => {
    c.fillStyle = withAlpha('#ffffff', 0.5)
    for (let i = 0; i < 5; i++) {
      const x = 120 + i * 340
      const y = 60 + ((i * 47) % 70)
      c.beginPath()
      c.ellipse(x + Math.sin(t * 0.1 + i) * 14, y, 92, 30, 0, 0, TAU)
      c.ellipse(x + 60, y - 16, 62, 26, 0, 0, TAU)
      c.fill()
    }
    // Distant treeline
    c.fillStyle = '#6d8f63'
    c.beginPath()
    c.moveTo(-600, GROUND_Y)
    for (let x = -600; x < STAGE_W + 600; x += 70) {
      c.lineTo(x, 250 + Math.sin(x * 0.012) * 44 + Math.sin(x * 0.05) * 12)
    }
    c.lineTo(STAGE_W + 600, GROUND_Y)
    c.closePath()
    c.fill()
  })

  layer(ctx, cam, 0.6, (c) => {
    // Fence
    c.fillStyle = '#9c7b52'
    c.fillRect(-600, 300, STAGE_W + 1200, 168)
    c.fillStyle = '#8a6c47'
    for (let x = -600; x < STAGE_W + 600; x += 44) c.fillRect(x, 300, 5, 168)
    c.fillStyle = '#b08a5c'
    c.fillRect(-600, 300, STAGE_W + 1200, 12)
    c.fillRect(-600, 372, STAGE_W + 1200, 10)

    // Bushes along the base of the fence
    c.fillStyle = '#5f8a4e'
    for (let x = -500; x < STAGE_W + 500; x += 180) {
      c.beginPath()
      c.ellipse(x, 462, 106, 62, 0, 0, TAU)
      c.fill()
    }
    c.fillStyle = '#6f9c5b'
    for (let x = -420; x < STAGE_W + 500; x += 180) {
      c.beginPath()
      c.ellipse(x, 470, 82, 46, 0, 0, TAU)
      c.fill()
    }
  })

  const grass = ctx.createLinearGradient(0, GROUND_Y, 0, GROUND_Y + 140)
  grass.addColorStop(0, '#79a85a')
  grass.addColorStop(1, '#4d6c38')
  ctx.fillStyle = grass
  ctx.fillRect(-600, GROUND_Y, STAGE_W + 1200, FLOOR_H)
  // Tufts of grass rather than single blades — one stroke reads as a stray mark.
  ctx.strokeStyle = withAlpha('#5f7f43', 0.55)
  ctx.lineWidth = 2
  for (let i = 0; i < 220; i++) {
    const x = -600 + ((i * 137) % (STAGE_W + 1200))
    const y = GROUND_Y + 10 + ((i * 53) % 118)
    const h = 5 + ((i * 7) % 4)
    for (let b = -1; b <= 1; b++) {
      ctx.beginPath()
      ctx.moveTo(x + b * 3, y)
      ctx.quadraticCurveTo(x + b * 4, y - h * 0.6, x + b * 6, y - h)
      ctx.stroke()
    }
  }
}

// --- living room -----------------------------------------------------------

function livingRoom(ctx: CanvasRenderingContext2D, cam: Camera, t: number): void {
  const wall = ctx.createLinearGradient(0, -200, 0, GROUND_Y)
  wall.addColorStop(0, '#4a4258')
  wall.addColorStop(1, '#6d5f70')
  backdrop(ctx, wall)

  layer(ctx, cam, 0.35, (c) => {
    // Wallpaper stripes
    c.strokeStyle = withAlpha('#ffffff', 0.06)
    c.lineWidth = 26
    for (let x = -600; x < STAGE_W + 600; x += 70) {
      c.beginPath()
      c.moveTo(x, -200)
      c.lineTo(x, GROUND_Y)
      c.stroke()
    }
    // Bookshelf
    c.fillStyle = '#5b4436'
    c.fillRect(1180, 120, 330, 348)
    c.fillStyle = '#4a362b'
    for (let i = 0; i < 3; i++) c.fillRect(1180, 200 + i * 92, 330, 12)
    const spines = ['#b4574f', '#d9a45b', '#5f8fa8', '#8a6fa0', '#6f9c6b']
    for (let s = 0; s < 3; s++) {
      for (let i = 0; i < 12; i++) {
        c.fillStyle = spines[(i + s) % spines.length]!
        const h = 56 + ((i * 13) % 22)
        c.fillRect(1196 + i * 25, 200 + s * 92 - h, 20, h)
      }
    }
    // Lamp glow
    const glow = c.createRadialGradient(880, 180, 10, 880, 180, 260)
    glow.addColorStop(0, withAlpha('#ffe6a8', 0.36))
    glow.addColorStop(1, withAlpha('#ffe6a8', 0))
    c.fillStyle = glow
    c.fillRect(600, -100, 560, 560)
  })

  layer(ctx, cam, 0.75, (c) => {
    // The good sofa.
    c.fillStyle = '#7a5f86'
    roundRect(c, 200, 250, 620, 218, 26)
    c.fill()
    c.fillStyle = '#8d6f9a'
    roundRect(c, 232, 290, 250, 120, 18)
    c.fill()
    roundRect(c, 512, 290, 250, 120, 18)
    c.fill()
    c.fillStyle = '#6b5276'
    roundRect(c, 200, 380, 620, 88, 18)
    c.fill()
    // Radiator
    c.fillStyle = '#d8d3cb'
    for (let i = 0; i < 9; i++) c.fillRect(1000 + i * 20, 330, 13, 138)
    c.fillRect(1000, 320, 190, 14)
  })

  woodFloor(ctx, '#8a6a4c', '#5d452f')

  layer(ctx, cam, 1.06, (c) => {
    // Rug
    c.fillStyle = '#a0524d'
    c.beginPath()
    c.ellipse(760, GROUND_Y + 54, 470, 74, 0, 0, TAU)
    c.fill()
    c.strokeStyle = '#c47c66'
    c.lineWidth = 6
    c.beginPath()
    c.ellipse(760, GROUND_Y + 54, 400, 58, 0, 0, TAU)
    c.stroke()
  })
  void t
}

// --- rooftop ---------------------------------------------------------------

function rooftop(ctx: CanvasRenderingContext2D, cam: Camera, t: number): void {
  const sky = ctx.createLinearGradient(0, -300, 0, GROUND_Y)
  sky.addColorStop(0, '#0d1230')
  sky.addColorStop(0.6, '#22284f')
  sky.addColorStop(1, '#4a3f5e')
  backdrop(ctx, sky)

  layer(ctx, cam, 0.12, (c) => {
    c.fillStyle = '#ffffff'
    for (let i = 0; i < 90; i++) {
      const x = -600 + ((i * 271) % (STAGE_W + 1200))
      const y = -180 + ((i * 97) % 380)
      const tw = 0.4 + 0.6 * Math.abs(Math.sin(t * 1.4 + i))
      c.globalAlpha = tw * 0.9
      c.fillRect(x, y, 2, 2)
    }
    c.globalAlpha = 1
    // Moon
    c.fillStyle = '#f2ecd8'
    c.beginPath()
    c.arc(1180, 100, 46, 0, TAU)
    c.fill()
    c.fillStyle = '#22284f'
    c.beginPath()
    c.arc(1160, 88, 40, 0, TAU)
    c.fill()
  })

  layer(ctx, cam, 0.38, (c) => {
    // City skyline with lit windows.
    c.fillStyle = '#161a38'
    let x = -600
    let i = 0
    while (x < STAGE_W + 600) {
      const w = 90 + ((i * 61) % 110)
      const h = 130 + ((i * 89) % 200)
      c.fillRect(x, GROUND_Y - h, w, h)
      c.fillStyle = withAlpha('#ffd98a', 0.55)
      for (let wy = 0; wy < Math.floor(h / 34); wy++) {
        for (let wx = 0; wx < Math.floor(w / 30); wx++) {
          if ((wx * 7 + wy * 13 + i * 5) % 5 < 2) {
            c.fillRect(x + 12 + wx * 30, GROUND_Y - h + 16 + wy * 34, 12, 16)
          }
        }
      }
      c.fillStyle = '#161a38'
      x += w + 16
      i++
    }
  })

  // Tiled roof
  const roof = ctx.createLinearGradient(0, GROUND_Y, 0, GROUND_Y + 150)
  roof.addColorStop(0, '#5a4a52')
  roof.addColorStop(1, '#2e262e')
  ctx.fillStyle = roof
  ctx.fillRect(-600, GROUND_Y, STAGE_W + 1200, FLOOR_H)
  ctx.strokeStyle = withAlpha('#241e26', 0.8)
  ctx.lineWidth = 2
  for (let row = 0; row < 8; row++) {
    const y = GROUND_Y + 8 + row * row * 2.6
    if (y > GROUND_Y + 140) break
    ctx.beginPath()
    ctx.moveTo(-600, y)
    ctx.lineTo(STAGE_W + 600, y)
    ctx.stroke()
    for (let x = -600; x < STAGE_W + 600; x += 54) {
      ctx.beginPath()
      ctx.moveTo(x + (row % 2 ? 27 : 0), y)
      ctx.lineTo(x + (row % 2 ? 27 : 0), y + row * 2.6 + 8)
      ctx.stroke()
    }
  }

  layer(ctx, cam, 0.82, (c) => {
    // Chimney stack with pots
    c.fillStyle = '#7a4a3c'
    c.fillRect(1240, 250, 170, 218)
    c.fillStyle = '#8d5a48'
    for (let r = 0; r < 8; r++) c.fillRect(1240, 254 + r * 27, 170, 4)
    c.fillStyle = '#c98a5c'
    c.fillRect(1258, 206, 44, 52)
    c.fillRect(1330, 194, 44, 64)
    // Aerial
    c.strokeStyle = '#1c1a24'
    c.lineWidth = 4
    c.beginPath()
    c.moveTo(300, GROUND_Y)
    c.lineTo(300, 200)
    c.stroke()
    c.lineWidth = 3
    for (let i = 0; i < 5; i++) {
      c.beginPath()
      c.moveTo(272, 214 + i * 22)
      c.lineTo(328, 214 + i * 22)
      c.stroke()
    }
  })
}

// --- alley -----------------------------------------------------------------

function alley(ctx: CanvasRenderingContext2D, cam: Camera, t: number): void {
  const air = ctx.createLinearGradient(0, -200, 0, GROUND_Y)
  air.addColorStop(0, '#2b2a2e')
  air.addColorStop(1, '#4b4239')
  backdrop(ctx, air)

  layer(ctx, cam, 0.45, (c) => {
    // Brick wall
    c.fillStyle = '#6b4a3d'
    c.fillRect(-600, -200, STAGE_W + 1200, GROUND_Y + 200)
    c.strokeStyle = withAlpha('#4d3428', 0.75)
    c.lineWidth = 3
    for (let row = 0; row < 26; row++) {
      const y = -180 + row * 26
      c.beginPath()
      c.moveTo(-600, y)
      c.lineTo(STAGE_W + 600, y)
      c.stroke()
      for (let x = -600; x < STAGE_W + 600; x += 62) {
        c.beginPath()
        c.moveTo(x + (row % 2 ? 31 : 0), y)
        c.lineTo(x + (row % 2 ? 31 : 0), y + 26)
        c.stroke()
      }
    }
    // Flickering wall lamp
    const flick = 0.72 + 0.28 * Math.sin(t * 21) * Math.sin(t * 7.3)
    const glow = c.createRadialGradient(520, 150, 8, 520, 150, 320)
    glow.addColorStop(0, withAlpha('#ffd48a', 0.42 * flick))
    glow.addColorStop(1, withAlpha('#ffd48a', 0))
    c.fillStyle = glow
    c.fillRect(180, -180, 680, 680)
    c.fillStyle = '#2a2622'
    c.fillRect(506, 120, 28, 40)
    c.fillStyle = withAlpha('#ffe6b0', flick)
    c.beginPath()
    c.arc(520, 158, 13, 0, TAU)
    c.fill()
  })

  layer(ctx, cam, 0.8, (c) => {
    // Fire escape
    c.strokeStyle = '#2f2a26'
    c.lineWidth = 6
    c.strokeRect(1120, 130, 260, 14)
    for (let i = 0; i < 9; i++) {
      c.beginPath()
      c.moveTo(1130 + i * 30, 130)
      c.lineTo(1130 + i * 30, 66)
      c.stroke()
    }
    // Wheelie bins
    const bin = (x: number, w: number, h: number, col: string): void => {
      c.fillStyle = col
      roundRect(c, x, GROUND_Y - h, w, h, 8)
      c.fill()
      c.strokeStyle = '#20201e'
      c.lineWidth = 3
      c.stroke()
      c.fillStyle = withAlpha('#ffffff', 0.1)
      c.fillRect(x + 8, GROUND_Y - h + 10, w - 16, 12)
      c.fillStyle = '#20201e'
      c.beginPath()
      c.arc(x + 16, GROUND_Y - 4, 9, 0, TAU)
      c.arc(x + w - 16, GROUND_Y - 4, 9, 0, TAU)
      c.fill()
    }
    bin(1180, 108, 150, '#3f6b46')
    bin(1300, 96, 128, '#4a4f6b')
    bin(120, 116, 162, '#6b4a4a')
  })

  const tar = ctx.createLinearGradient(0, GROUND_Y, 0, GROUND_Y + 150)
  tar.addColorStop(0, '#3d3a38')
  tar.addColorStop(1, '#211f1e')
  ctx.fillStyle = tar
  ctx.fillRect(-600, GROUND_Y, STAGE_W + 1200, FLOOR_H)
  // Puddles catching the lamp
  ctx.fillStyle = withAlpha('#8fa3b0', 0.2)
  ctx.beginPath()
  ctx.ellipse(700, GROUND_Y + 48, 160, 22, 0, 0, TAU)
  ctx.ellipse(1120, GROUND_Y + 80, 110, 16, 0, 0, TAU)
  ctx.fill()
}

// --- windowsill ------------------------------------------------------------

function windowsill(ctx: CanvasRenderingContext2D, cam: Camera, t: number): void {
  const room = ctx.createLinearGradient(0, -200, 0, GROUND_Y)
  room.addColorStop(0, '#3d3038')
  room.addColorStop(1, '#6b5244')
  backdrop(ctx, room)

  layer(ctx, cam, 0.55, (c) => {
    // A huge window with the sun going down behind it.
    const wx = 260
    const wy = -60
    const ww = 980
    const wh = 470
    const sky = c.createLinearGradient(0, wy, 0, wy + wh)
    sky.addColorStop(0, '#3f5b93')
    sky.addColorStop(0.45, '#d97a55')
    sky.addColorStop(0.75, '#f0a862')
    sky.addColorStop(1, '#7d5c4e')
    c.fillStyle = sky
    c.fillRect(wx, wy, ww, wh)

    c.fillStyle = withAlpha('#ffe7b0', 0.85)
    c.beginPath()
    c.arc(wx + ww * 0.62, wy + wh * 0.62, 62, 0, TAU)
    c.fill()

    // Rooftops on the horizon
    c.fillStyle = '#5b4152'
    let x = wx
    let i = 0
    while (x < wx + ww) {
      const w = 70 + ((i * 53) % 90)
      const h = 60 + ((i * 71) % 90)
      c.fillRect(x, wy + wh - h, Math.min(w, wx + ww - x), h)
      x += w + 10
      i++
    }

    // Frame
    c.strokeStyle = '#efe6d6'
    c.lineWidth = 20
    c.strokeRect(wx, wy, ww, wh)
    c.lineWidth = 14
    c.beginPath()
    c.moveTo(wx + ww / 2, wy)
    c.lineTo(wx + ww / 2, wy + wh)
    c.moveTo(wx, wy + wh * 0.55)
    c.lineTo(wx + ww, wy + wh * 0.55)
    c.stroke()

    // Sill
    c.fillStyle = '#f2e9da'
    c.fillRect(wx - 40, wy + wh, ww + 80, 26)
    c.fillStyle = '#d9cdb8'
    c.fillRect(wx - 40, wy + wh + 26, ww + 80, 10)

    // Plant pots
    const pot = (px: number, s: number): void => {
      c.fillStyle = '#b5643f'
      c.beginPath()
      c.moveTo(px - 26 * s, wy + wh)
      c.lineTo(px + 26 * s, wy + wh)
      c.lineTo(px + 19 * s, wy + wh - 44 * s)
      c.lineTo(px - 19 * s, wy + wh - 44 * s)
      c.closePath()
      c.fill()
      c.fillStyle = '#4f7c46'
      for (let k = -2; k <= 2; k++) {
        c.beginPath()
        c.ellipse(
          px + k * 15 * s,
          wy + wh - 66 * s + Math.sin(t * 0.6 + k) * 2,
          11 * s,
          26 * s,
          k * 0.4,
          0,
          TAU,
        )
        c.fill()
      }
    }
    pot(wx + 90, 1)
    pot(wx + ww - 110, 0.85)
  })

  woodFloor(ctx, '#a8794f', '#6d4a2e')

  // Long low sunlight across the floor.
  const shaft = ctx.createLinearGradient(400, 0, 1100, GROUND_Y + 120)
  shaft.addColorStop(0, withAlpha('#ffbe7a', 0.3))
  shaft.addColorStop(1, withAlpha('#ffbe7a', 0))
  ctx.fillStyle = shaft
  ctx.fillRect(-600, -700, STAGE_W + 1200, GROUND_Y + 900)
}
