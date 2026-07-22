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
  { id: 'garden', name: 'The Back Yard', where: 'sun on the setts' },
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

/**
 * A parallax layer anchored to the middle of the stage.
 *
 * `layer()` is fine for things that repeat across the whole width — walls, fences,
 * skylines — because it doesn't matter where they land. It is the wrong tool for a
 * single landmark: at a parallax factor of 0.6 the layer is displaced by 40% of the
 * camera position, so a door authored at x=640 shows up hundreds of pixels away and
 * the whole composition slides apart.
 *
 * This variant cancels that displacement at the stage centre, so a landmark written
 * at `STAGE_W / 2` actually appears there, while still parallaxing as the camera
 * travels either side of it.
 */
function anchoredLayer(
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  factor: number,
  draw: (ctx: CanvasRenderingContext2D) => void,
): void {
  ctx.save()
  ctx.translate((cam.x - STAGE_W / 2) * (1 - factor), 0)
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
// Bobby's actual back yard: a walled courtyard, not a lawn. White-painted brick,
// a raised bed behind a low retaining wall, brick steps up to a plank gate,
// bamboo on one side, and a path of granite setts running through pale gravel.

/**
 * The scatter in this stage — gravel, bamboo canes, lavender, moss — is placed by
 * hashing an index rather than by calling `Math.random()`, so it never shimmers
 * between frames.
 *
 * Always shift those hashes with `>>>`, never `>>`. A signed shift reinterprets a
 * hash above 2^31 as negative, `% n` then returns a negative number, and handing
 * that to `ctx.ellipse` as a radius throws — which kills the render loop and
 * leaves the game showing a blank frame.
 */

/**
 * Gravel is hundreds of little stones, which is too many to redraw every frame.
 * It's also completely static, so it gets rendered once into an offscreen tile
 * and blitted thereafter.
 */
let gravelTile: HTMLCanvasElement | null = null

function getGravelTile(): HTMLCanvasElement {
  if (gravelTile) return gravelTile
  const size = 240
  const c = document.createElement('canvas')
  c.width = c.height = size
  const g = c.getContext('2d')!

  g.fillStyle = '#b9b4ab'
  g.fillRect(0, 0, size, size)

  // A fixed hash keeps the pattern stable, and stops the tile edges repeating
  // too obviously by varying stone size as well as position.
  const tones = ['#e8e4dc', '#d3cec4', '#c2bcb2', '#a8a299', '#f2efe8']
  for (let i = 0; i < 900; i++) {
    const h = (i * 2654435761) >>> 0
    const x = (h % size) + ((h >>> 9) % 3)
    const y = ((h >>> 7) % size) + ((h >>> 17) % 3)
    const r = 2.1 + ((h >>> 13) % 26) / 9
    g.fillStyle = tones[(h >>> 5) % tones.length]!
    g.beginPath()
    g.ellipse(x, y, r, r * (0.62 + ((h >>> 21) % 30) / 80), (h % 31) / 5, 0, TAU)
    g.fill()
  }
  gravelTile = c
  return c
}

function drawGravel(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  const pattern = ctx.createPattern(getGravelTile(), 'repeat')
  if (pattern) {
    ctx.fillStyle = pattern
    ctx.fillRect(x, y, w, h)
  }
  // Gravel further away catches less light, which stops the tile reading as flat.
  const shade = ctx.createLinearGradient(0, y, 0, y + h)
  shade.addColorStop(0, withAlpha('#4a453d', 0.34))
  shade.addColorStop(0.45, withAlpha('#4a453d', 0.05))
  shade.addColorStop(1, withAlpha('#4a453d', 0))
  ctx.fillStyle = shade
  ctx.fillRect(x, y, w, h)
}

/** White-painted brickwork: courses visible through the paint, not drawn on it. */
function paintedBrick(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  base: string,
  line: string,
  courseH = 22,
): void {
  ctx.fillStyle = base
  ctx.fillRect(x, y, w, h)
  ctx.strokeStyle = line
  ctx.lineWidth = 1.5
  let row = 0
  for (let cy = y; cy < y + h; cy += courseH, row++) {
    ctx.beginPath()
    ctx.moveTo(x, cy)
    ctx.lineTo(x + w, cy)
    ctx.stroke()
    for (let cx = x + (row % 2 ? 34 : 0); cx < x + w; cx += 68) {
      ctx.beginPath()
      ctx.moveTo(cx, cy)
      ctx.lineTo(cx, Math.min(cy + courseH, y + h))
      ctx.stroke()
    }
  }
}

/** A clump of bamboo — tall segmented canes with narrow drooping leaves. */
function bamboo(ctx: CanvasRenderingContext2D, cx: number, baseY: number, height: number, t: number): void {
  for (let i = 0; i < 16; i++) {
    const h = (i * 2654435761) >>> 0
    const off = ((h % 200) - 100) * 1.6
    const len = height * (0.62 + ((h >>> 8) % 40) / 100)
    const lean = (((h >>> 4) % 100) - 50) / 260 + Math.sin(t * 0.5 + i) * 0.012
    const topX = cx + off + lean * len
    const topY = baseY - len

    ctx.strokeStyle = i % 3 === 0 ? '#6f8f4a' : '#55743a'
    ctx.lineWidth = 4 + ((h >>> 11) % 3)
    ctx.beginPath()
    ctx.moveTo(cx + off, baseY)
    ctx.quadraticCurveTo(cx + off + lean * len * 0.4, baseY - len * 0.55, topX, topY)
    ctx.stroke()

    // Leaves, densest towards the top. Three per node rather than one, otherwise
    // the clump reads as bare green sticks instead of foliage.
    for (let l = 0; l < 9; l++) {
      const lt = 0.28 + l * 0.082
      const lx = cx + off + lean * len * lt * lt
      const ly = baseY - len * lt
      const sway = Math.sin(t * 0.7 + i + l) * 0.06
      for (let k = 0; k < 3; k++) {
        const spread = ((h >>> (l + k)) % 12) / 20
        const dir = (k === 1 ? -1 : 1) * (0.45 + spread + k * 0.28)
        ctx.fillStyle = (i + l + k) % 3 ? '#3d6130' : '#548339'
        ctx.save()
        ctx.translate(lx, ly)
        ctx.rotate(dir + sway)
        ctx.beginPath()
        ctx.ellipse(17, 0, 19 - k * 2, 3.6, 0, 0, TAU)
        ctx.fill()
        ctx.restore()
      }
    }
  }
}

/** A leggy wall shrub with a few thin upright stems. */
function wallShrub(ctx: CanvasRenderingContext2D, cx: number, baseY: number, h: number, t: number): void {
  ctx.strokeStyle = '#6b5a44'
  for (let i = 0; i < 6; i++) {
    const hash = (i * 40503 * 2654435761) >>> 0
    const off = ((hash % 100) - 50) * 1.9
    const len = h * (0.55 + ((hash >>> 9) % 45) / 100)
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.moveTo(cx + off * 0.3, baseY)
    ctx.quadraticCurveTo(cx + off, baseY - len * 0.6, cx + off * 1.5, baseY - len)
    ctx.stroke()

    for (let l = 0; l < 9; l++) {
      const lt = 0.2 + l * 0.09
      const lx = cx + off * (0.3 + 1.2 * lt * lt)
      const ly = baseY - len * lt
      ctx.fillStyle = l % 3 ? '#4f7a3e' : '#3f6531'
      ctx.save()
      ctx.translate(lx, ly)
      ctx.rotate(((l % 2 ? 1 : -1) * 0.9) + Math.sin(t * 0.6 + l) * 0.08)
      ctx.beginPath()
      ctx.ellipse(9, 0, 10, 5, 0, 0, TAU)
      ctx.fill()
      ctx.restore()
    }
  }
}

/** Lavender: grey-green stems topped with a purple spike. */
function lavender(ctx: CanvasRenderingContext2D, cx: number, baseY: number, count: number): void {
  for (let i = 0; i < count; i++) {
    const hash = (i * 2246822519) >>> 0
    const x = cx + ((hash % 220) - 110)
    const len = 44 + ((hash >>> 8) % 28)
    const lean = (((hash >>> 3) % 100) - 50) / 300
    ctx.strokeStyle = '#7d8a6a'
    ctx.lineWidth = 2.4
    ctx.beginPath()
    ctx.moveTo(x, baseY)
    ctx.quadraticCurveTo(x + lean * len, baseY - len * 0.6, x + lean * len * 2, baseY - len)
    ctx.stroke()

    const tipX = x + lean * len * 2
    const tipY = baseY - len
    ctx.fillStyle = i % 3 === 0 ? '#8f7ac4' : '#7462ab'
    for (let b = 0; b < 5; b++) {
      ctx.beginPath()
      ctx.ellipse(tipX + lean * b * 2, tipY + b * 5.5, 4.2, 3.4, 0, 0, TAU)
      ctx.fill()
    }
  }
}

function garden(ctx: CanvasRenderingContext2D, cam: Camera, t: number): void {
  // Vertical budget: the camera only ever shows roughly y = -120..550, and barely
  // 70px of floor below the ground line. Everything worth seeing lives in there.
  const BED = 396 // top of the retaining wall, and the level the raised bed sits at

  // A courtyard is mostly wall, with a strip of bright sky above it.
  const sky = ctx.createLinearGradient(0, -300, 0, 60)
  sky.addColorStop(0, '#9dbdd4')
  sky.addColorStop(1, '#dfe7e6')
  backdrop(ctx, sky)

  // --- back wall ---------------------------------------------------------
  layer(ctx, cam, 0.32, (c) => {
    paintedBrick(c, -800, 20, STAGE_W + 1600, GROUND_Y + 40, '#e9e6df', '#d6d2c9', 26)
    const foot = c.createLinearGradient(0, BED - 190, 0, BED)
    foot.addColorStop(0, withAlpha('#8d8478', 0))
    foot.addColorStop(1, withAlpha('#8d8478', 0.26))
    c.fillStyle = foot
    c.fillRect(-800, BED - 190, STAGE_W + 1600, 190)
  })

  // --- raised bed: gate, steps, planting ---------------------------------
  anchoredLayer(ctx, cam, 0.6, (c) => {
    // The plank gate, centred on the stage.
    const dw = 176
    const dx = STAGE_W / 2 - dw / 2
    const dTop = 132
    const dBottom = 356

    c.fillStyle = '#cfc9bd'
    c.fillRect(dx - 22, dTop - 18, dw + 44, dBottom - dTop + 18)
    // A dark reveal around the gate. Without it the gate is the same value as the
    // wall behind and the focal point of the stage simply disappears.
    c.fillStyle = '#2b2823'
    c.fillRect(dx - 9, dTop - 7, dw + 18, dBottom - dTop + 7)

    c.fillStyle = '#c3beaf'
    c.fillRect(dx, dTop, dw, dBottom - dTop)
    const lit = c.createLinearGradient(dx, 0, dx + dw, 0)
    lit.addColorStop(0, withAlpha('#ffffff', 0.26))
    lit.addColorStop(1, withAlpha('#5d5749', 0.28))
    c.fillStyle = lit
    c.fillRect(dx, dTop, dw, dBottom - dTop)
    c.strokeStyle = '#a8a294'
    c.lineWidth = 2
    for (let i = 1; i < 6; i++) {
      c.beginPath()
      c.moveTo(dx + (dw / 6) * i, dTop)
      c.lineTo(dx + (dw / 6) * i, dBottom)
      c.stroke()
    }
    // Z-brace: two rails and a diagonal, the way a garden gate is actually built.
    c.fillStyle = '#cdc8b9'
    c.strokeStyle = '#8f8a7c'
    const rail = (ry: number): void => {
      c.fillRect(dx, ry, dw, 16)
      c.strokeRect(dx, ry, dw, 16)
    }
    c.save()
    c.beginPath()
    c.rect(dx, dTop, dw, dBottom - dTop)
    c.clip()
    const span = dBottom - dTop - 80
    c.translate(dx, dBottom - 40)
    c.rotate(-Math.atan2(span, dw))
    c.fillRect(0, 0, Math.hypot(dw, span), 16)
    c.strokeRect(0, 0, Math.hypot(dw, span), 16)
    c.restore()
    rail(dTop + 22)
    rail(dBottom - 40)

    // Two brick steps down from the gate to the bed.
    for (let s = 0; s < 2; s++) {
      const sy = BED - s * 20
      const inset = s * 22
      c.fillStyle = '#efece4'
      c.fillRect(dx - 76 + inset, sy - 20, dw + 152 - inset * 2, 20)
      c.fillStyle = '#4a3b34'
      c.fillRect(dx - 76 + inset, sy - 24, dw + 152 - inset * 2, 8)
    }

    // Bamboo on the right, shrubs and a young tree on the left.
    bamboo(c, 1120, BED + 20, 340, t)
    bamboo(c, 1290, BED + 20, 300, t)
    wallShrub(c, 300, BED + 16, 170, t)
    wallShrub(c, 150, BED + 16, 140, t)

    c.strokeStyle = '#7a6a52'
    c.lineWidth = 5
    c.beginPath()
    c.moveTo(452, BED + 16)
    c.quadraticCurveTo(442, BED - 110, 458, BED - 236)
    c.stroke()
    c.lineWidth = 2.5
    for (let b = 0; b < 4; b++) {
      const by = BED - 96 - b * 42
      const dir = b % 2 ? 1 : -1
      c.beginPath()
      c.moveTo(450, by)
      c.quadraticCurveTo(450 + dir * 30, by - 12, 450 + dir * 56, by - 34)
      c.stroke()
      c.fillStyle = '#4e7a3a'
      for (let l = 0; l < 4; l++) {
        c.beginPath()
        c.ellipse(450 + dir * (12 + l * 12), by - 6 - l * 8, 7, 4, dir * 0.5, 0, TAU)
        c.fill()
      }
    }

    // Ground cover spilling over the retaining wall, and lavender at the left.
    for (let i = 0; i < 110; i++) {
      const hash = (i * 2654435761) >>> 0
      const x = 20 + ((hash % 1400) | 0)
      if (x > STAGE_W / 2 - 160 && x < STAGE_W / 2 + 160) continue
      c.fillStyle = i % 4 ? '#5f8a43' : '#7aa356'
      c.beginPath()
      c.ellipse(x, BED + 14 - ((hash >>> 9) % 22), 14, 8, 0, 0, TAU)
      c.fill()
    }
    lavender(c, 260, BED + 10, 14)

    // A terracotta pot at the foot of the steps.
    c.fillStyle = '#b5643f'
    c.beginPath()
    c.moveTo(880, BED + 16)
    c.lineTo(932, BED + 16)
    c.lineTo(925, BED - 26)
    c.lineTo(887, BED - 26)
    c.closePath()
    c.fill()
    c.fillStyle = '#c47049'
    c.fillRect(883, BED - 34, 46, 9)
  })

  // --- retaining wall ----------------------------------------------------
  layer(ctx, cam, 0.82, (c) => {
    paintedBrick(c, -800, BED, STAGE_W + 1600, GROUND_Y - BED, '#f6f3ec', '#d5d0c4', 22)
    // Red brick coping — the detail that makes it read as a raised bed rather
    // than as a random white ledge.
    c.fillStyle = '#a8563a'
    c.fillRect(-800, BED - 15, STAGE_W + 1600, 17)
    c.strokeStyle = '#8a4229'
    c.lineWidth = 1.6
    for (let x = -800; x < STAGE_W + 800; x += 44) {
      c.beginPath()
      c.moveTo(x, BED - 15)
      c.lineTo(x, BED + 2)
      c.stroke()
    }
    c.fillStyle = withAlpha('#ffffff', 0.24)
    c.fillRect(-800, BED - 15, STAGE_W + 1600, 4)
    // Shadow cast by the coping, and grime where the wall meets the ground.
    c.fillStyle = withAlpha('#6b6357', 0.3)
    c.fillRect(-800, BED + 2, STAGE_W + 1600, 7)
    c.fillStyle = withAlpha('#000000', 0.2)
    c.fillRect(-800, GROUND_Y - 9, STAGE_W + 1600, 9)
  })

  // --- the floor ---------------------------------------------------------
  drawGravel(ctx, -800, GROUND_Y, STAGE_W + 1600, FLOOR_H)

  // Setts run down the middle of the yard with gravel either side, so the cats
  // walk off the paving and onto the stones near the stage edges.
  const PATH_L = 360
  const PATH_R = 1140
  // A strip of gravel sits between the wall and the paving, so the stones are
  // visible right at the cats' feet rather than only at the stage edges.
  let rowY = GROUND_Y + 10
  let rowH = 8
  for (let row = 0; row < 8 && rowY < GROUND_Y + 96; row++) {
    const settW = 30 + row * 7
    const spread = 1 + row * 0.075
    const left = STAGE_W / 2 - (STAGE_W / 2 - PATH_L) * spread
    const right = STAGE_W / 2 + (PATH_R - STAGE_W / 2) * spread
    // The far end of the path is near-black, lightening to pale granite nearby.
    const tone = Math.min(1, row / 3)

    for (let x = left; x < right; x += settW + 2.5) {
      const hash = ((row * 73856093) ^ (Math.floor(x) * 19349663)) >>> 0
      const lightness = tone + ((hash % 26) - 13) / 95
      const shade = Math.round(38 + Math.max(0, lightness) * 138)
      ctx.fillStyle = `rgb(${shade}, ${shade}, ${Math.round(shade * 0.97)})`
      ctx.fillRect(x + (row % 2 ? settW * 0.45 : 0), rowY, Math.min(settW, right - x), rowH)
    }
    if (row > 2) {
      for (let i = 0; i < 3; i++) {
        const hash = ((row * 2654435761) ^ (i * 40503)) >>> 0
        if (hash % 3) continue
        ctx.fillStyle = withAlpha('#7d9a4e', 0.7)
        ctx.beginPath()
        ctx.ellipse(left + (hash % (right - left)), rowY + rowH * 0.5, 6, rowH * 0.45, 0, 0, TAU)
        ctx.fill()
      }
    }
    rowY += rowH
    rowH *= 1.2
  }

  // Dappled shade from the tree, thrown across the paving.
  ctx.save()
  ctx.globalCompositeOperation = 'multiply'
  for (let i = 0; i < 12; i++) {
    const hash = (i * 2654435761) >>> 0
    ctx.fillStyle = withAlpha('#807d71', 0.28)
    ctx.beginPath()
    ctx.ellipse(
      340 + (hash % 380),
      GROUND_Y + 16 + ((hash >>> 9) % 56),
      20 + (hash % 16),
      8 + (hash % 6),
      ((hash >>> 3) % 30) / 10,
      0,
      TAU,
    )
    ctx.fill()
  }
  ctx.restore()

  // --- things standing in the yard ---------------------------------------
  anchoredLayer(ctx, cam, 0.94, (c) => {
    // The kennel, off on the gravel to one side.
    const kx = 140
    const ky = GROUND_Y + 12
    c.fillStyle = '#f2f0eb'
    roundRect(c, kx, ky - 74, 116, 74, 6)
    c.fill()
    c.strokeStyle = '#c8c4bd'
    c.lineWidth = 2
    c.stroke()
    c.fillStyle = '#2f2b28'
    c.beginPath()
    c.ellipse(kx + 58, ky - 4, 25, 36, 0, Math.PI, TAU)
    c.fill()
    c.fillStyle = '#d33f3a'
    c.beginPath()
    c.moveTo(kx - 12, ky - 72)
    c.lineTo(kx + 58, ky - 118)
    c.lineTo(kx + 128, ky - 72)
    c.closePath()
    c.fill()
    c.strokeStyle = '#ab302b'
    c.lineWidth = 1.5
    for (let i = 1; i < 5; i++) {
      c.beginPath()
      c.moveTo(kx - 12 + i * 13, ky - 72 - i * 9)
      c.lineTo(kx + 128 - i * 13, ky - 72 - i * 9)
      c.stroke()
    }

    // A plastic storage box.
    const sx = 1160
    const sy = GROUND_Y + 8
    c.fillStyle = '#5c625f'
    roundRect(c, sx, sy - 84, 168, 84, 6)
    c.fill()
    c.fillStyle = '#6d736f'
    roundRect(c, sx - 6, sy - 96, 180, 18, 6)
    c.fill()
    c.strokeStyle = '#484d4a'
    c.lineWidth = 2
    for (let i = 1; i < 7; i++) {
      c.beginPath()
      c.moveTo(sx + i * 23, sy - 74)
      c.lineTo(sx + i * 23, sy - 8)
      c.stroke()
    }

    // The metal bench.
    const bx = 1348
    const by = GROUND_Y + 16
    c.strokeStyle = '#22201f'
    c.lineWidth = 5
    c.lineCap = 'round'
    c.beginPath()
    c.moveTo(bx, by)
    c.lineTo(bx + 5, by - 54)
    c.moveTo(bx + 150, by)
    c.lineTo(bx + 155, by - 54)
    c.stroke()
    c.fillStyle = '#2b2927'
    c.fillRect(bx - 4, by - 62, 172, 11)
    c.lineWidth = 5
    c.beginPath()
    c.moveTo(bx + 150, by - 56)
    c.quadraticCurveTo(bx + 200, by - 118, bx + 180, by - 164)
    c.stroke()
    c.lineWidth = 2.5
    for (let i = 0; i < 6; i++) {
      c.beginPath()
      c.moveTo(bx + 152 + i * 5, by - 58 - i * 2)
      c.quadraticCurveTo(bx + 192 + i * 2, by - 110, bx + 174 + i * 3, by - 158)
      c.stroke()
    }
    c.lineCap = 'butt'
  })

  // Soft daylight from the left, matching the shadow direction on the setts.
  const sun = ctx.createLinearGradient(0, 0, STAGE_W, GROUND_Y)
  sun.addColorStop(0, withAlpha('#fff3d2', 0.16))
  sun.addColorStop(1, withAlpha('#fff3d2', 0))
  ctx.fillStyle = sun
  ctx.fillRect(-800, -800, STAGE_W + 1600, GROUND_Y + 800 + FLOOR_H)
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
