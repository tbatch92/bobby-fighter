import { Sfx } from './audio/sfx'
import { InputBuffer, Keyboard } from './core/input'
import { startLoop } from './core/loop'
import { VIEW_H, VIEW_W } from './sim/physics'
import { text } from './render/hud'
import { TitleScene } from './scenes/title'
import { freshArcade, type Game, type Scene } from './scenes/types'

/**
 * Bootstrap: size the canvas, wire up input and audio, and run the scene stack on
 * the fixed-timestep loop.
 *
 * The canvas always draws at a logical 960x540 and is scaled to fit the window, so
 * layout maths never has to care about the display size or the device pixel ratio.
 */

const canvas = document.getElementById('game') as HTMLCanvasElement
const ctx = canvas.getContext('2d', { alpha: false })!

function resize(): void {
  const dpr = Math.min(window.devicePixelRatio || 1, 2.5)
  // Leave room for the bezel padding and the controls hint underneath.
  const availW = window.innerWidth - 44
  const availH = window.innerHeight - 92
  const scale = Math.max(0.35, Math.min(availW / VIEW_W, availH / VIEW_H))

  canvas.width = Math.round(VIEW_W * dpr)
  canvas.height = Math.round(VIEW_H * dpr)
  canvas.style.width = `${Math.round(VIEW_W * scale)}px`
  canvas.style.height = `${Math.round(VIEW_H * scale)}px`
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.imageSmoothingEnabled = true
}

resize()
window.addEventListener('resize', resize)

const keyboard = new Keyboard()
const input = new InputBuffer()
const sfx = new Sfx()

let scene: Scene = new TitleScene()

const game: Game = {
  keyboard,
  input,
  sfx,
  arcade: freshArcade(),
  debug: { hitboxes: false },
  setScene(next: Scene) {
    scene = next
    input.clear()
    next.enter?.(game)
  },
}

let muteFlash = 0

startLoop({
  step() {
    // One keyboard sample per simulation frame keeps input and physics in lockstep.
    input.push(keyboard.sample())

    if (keyboard.tapped('F1')) game.debug.hitboxes = !game.debug.hitboxes
    if (keyboard.tapped('KeyM')) {
      sfx.unlock()
      sfx.toggleMute()
      muteFlash = 90
    }
    // Audio can only start from a real key press, so unlock on any of them.
    if (input.current.held !== 0 || keyboard.tapped('Enter') || keyboard.tapped('Space')) {
      sfx.unlock()
    }

    if (muteFlash > 0) muteFlash--
    scene.update(game)
  },

  render(alpha) {
    ctx.fillStyle = '#000000'
    ctx.fillRect(0, 0, VIEW_W, VIEW_H)
    scene.render(game, ctx, alpha)

    if (muteFlash > 0) {
      text(ctx, sfx.muted ? 'SOUND OFF' : 'SOUND ON', VIEW_W / 2, VIEW_H - 30, {
        size: 16,
        align: 'center',
        colour: '#f6ecd6',
        outline: '#14100f',
        tracking: 3,
        alpha: Math.min(1, muteFlash / 25),
      })
    }
  },
})

scene.enter?.(game)

// Dev handle: lets the running game be inspected and driven from the console,
// which is the only practical way to check frame data against what's on screen.
if (import.meta.env.DEV) {
  Object.defineProperty(window, 'bobby', {
    value: {
      game,
      get scene() {
        return scene
      },
    },
  })
}
