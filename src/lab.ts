import { ALL_CATS, BOBBY } from './data/roster'
import { createRigState, drawCat, updateRig, type Pose } from './render/catRig'
import { poseFor } from './render/poses'
import { Fighter } from './sim/fighter'
import { GROUND_Y } from './sim/physics'

/**
 * Development-only rig inspector, served at /lab.html.
 *
 * Tuning a procedural character by playing the game is hopeless — the interesting
 * frames go by in a sixth of a second. This page parks every cat in every important
 * pose at a readable size so silhouettes, markings and joint angles can be judged
 * side by side.
 */

const W = 1600
const H = 1120
const canvas = document.getElementById('lab') as HTMLCanvasElement
const ctx = canvas.getContext('2d')!
const dpr = Math.min(window.devicePixelRatio || 1, 2)
canvas.width = W * dpr
canvas.height = H * dpr
canvas.style.width = `${W}px`
canvas.style.height = `${H}px`
ctx.scale(dpr, dpr)

/** Poses to inspect, by driving a fighter into the matching state. */
const POSES: { label: string; setup: (f: Fighter) => void }[] = [
  { label: 'idle', setup: (f) => void (f.state = 'idle') },
  {
    label: 'walk',
    setup: (f) => {
      f.state = 'walk'
      f.stateFrame = 9
    },
  },
  { label: 'crouch', setup: (f) => void ((f.state = 'crouch'), (f.crouching = true)) },
  {
    label: 'block',
    setup: (f) => {
      f.state = 'idle'
      f.guarding = true
    },
  },
  {
    label: 'jump',
    setup: (f) => {
      f.state = 'jump'
      f.grounded = false
      f.vy = -6
    },
  },
  {
    label: 'jab',
    setup: (f) => {
      f.startMove(f.def.moves['stand.lp']!)
      f.moveFrame = f.def.moves['stand.lp']!.startup + 1
    },
  },
  {
    label: 'heavy paw',
    setup: (f) => {
      f.startMove(f.def.moves['stand.hp']!)
      f.moveFrame = f.def.moves['stand.hp']!.startup + 1
    },
  },
  {
    label: 'roundhouse',
    setup: (f) => {
      f.startMove(f.def.moves['stand.hk']!)
      f.moveFrame = f.def.moves['stand.hk']!.startup + 2
    },
  },
  {
    label: 'uppaw',
    setup: (f) => {
      f.crouching = true
      f.startMove(f.def.moves['crouch.hp']!)
      f.moveFrame = f.def.moves['crouch.hp']!.startup + 2
    },
  },
  {
    label: 'sweep',
    setup: (f) => {
      f.crouching = true
      f.startMove(f.def.moves['crouch.hk']!)
      f.moveFrame = f.def.moves['crouch.hk']!.startup + 2
    },
  },
  {
    label: 'special',
    setup: (f) => {
      f.startMove(f.def.moves[f.def.specialId]!)
      f.moveFrame = f.def.moves[f.def.specialId]!.startup + 1
    },
  },
  { label: 'hitstun', setup: (f) => void ((f.state = 'hitstun'), (f.stateFrame = 4)) },
  { label: 'knockdown', setup: (f) => void ((f.state = 'knockdown'), (f.stateFrame = 12)) },
  { label: 'victory', setup: (f) => void ((f.state = 'victory'), (f.stateFrame = 30)) },
]

interface Cell {
  fighter: Fighter
  rig: ReturnType<typeof createRigState>
  pose: Pose
  label: string
  x: number
  y: number
  scale: number
}

const cells: Cell[] = []

// Row 1: Bobby big, through every pose.
POSES.forEach((p, i) => {
  const f = new Fighter(BOBBY, 0)
  f.x = 0
  f.y = GROUND_Y
  p.setup(f)
  cells.push({
    fighter: f,
    rig: createRigState(),
    pose: poseFor(f, 0),
    label: p.label,
    x: 110 + (i % 7) * 212,
    y: 250 + Math.floor(i / 7) * 240,
    scale: 0.95,
  })
})

// Row 3: the whole roster, idle, so silhouettes can be compared.
ALL_CATS.forEach((def, i) => {
  const f = new Fighter(def, 0)
  f.x = 0
  f.y = GROUND_Y
  f.state = 'idle'
  cells.push({
    fighter: f,
    rig: createRigState(),
    pose: poseFor(f, 0),
    label: def.name,
    x: 150 + i * 255,
    y: 1060,
    scale: 1.2,
  })
})

let t = 0

function frame(): void {
  t += 1 / 60
  ctx.fillStyle = '#1b1720'
  ctx.fillRect(0, 0, W, H)

  ctx.strokeStyle = '#2e2836'
  ctx.lineWidth = 1
  for (const c of cells) {
    ctx.beginPath()
    ctx.moveTo(c.x - 100, c.y)
    ctx.lineTo(c.x + 100, c.y)
    ctx.stroke()
  }

  ctx.fillStyle = '#8d8172'
  ctx.font = '13px ui-monospace, monospace'
  ctx.textAlign = 'center'

  for (const c of cells) {
    const f = c.fighter
    if (f.state === 'walk' || f.state === 'victory') f.stateFrame++
    const pose = poseFor(f, t)
    updateRig(c.rig, pose, f.def.proportions, 0, 0, 1, 1 / 60)
    ctx.save()
    ctx.translate(c.x, c.y)
    ctx.scale(c.scale, c.scale)
    drawCat(ctx, {
      pose,
      palette: f.def.palette,
      proportions: f.def.proportions,
      rig: c.rig,
      x: 0,
      y: 0,
      facing: 1,
    })
    ctx.restore()
    ctx.fillText(c.label, c.x, c.y + 24)
  }

  ctx.fillStyle = '#cbbfae'
  ctx.font = 'bold 20px ui-monospace, monospace'
  ctx.textAlign = 'left'
  ctx.fillText('CAT LAB — Bobby through every pose, then the roster', 40, 44)

  requestAnimationFrame(frame)
}

frame()
