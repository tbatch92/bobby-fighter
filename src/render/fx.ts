import { TAU } from '../core/math'
import { withAlpha } from './color'
import type { Projectile } from '../sim/projectile'

/**
 * Impact effects.
 *
 * The particles here are the difference between "the health bar went down" and
 * "that hurt". Fur puffs are the signature: every clean hit knocks a small cloud of
 * fur off the cat, which drifts and settles instead of vanishing.
 */

type Kind = 'fur' | 'spark' | 'dust' | 'ring' | 'star'

interface Particle {
  kind: Kind
  x: number
  y: number
  vx: number
  vy: number
  life: number
  maxLife: number
  size: number
  rot: number
  spin: number
  colour: string
  gravity: number
}

export class Fx {
  private parts: Particle[] = []
  /** Purely cosmetic, so `Math.random` is fine here — none of it feeds the sim. */
  private t = 0

  clear(): void {
    this.parts.length = 0
  }

  private add(p: Particle): void {
    // A hard cap keeps a long super from tanking the frame rate.
    if (this.parts.length > 340) this.parts.shift()
    this.parts.push(p)
  }

  /** A clean hit: fur, sparks and an expanding ring. */
  hit(x: number, y: number, power: number, counter = false): void {
    const n = Math.round(4 + power * 7)
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU
      const s = 1.6 + Math.random() * 4.4 * power
      this.add({
        kind: 'fur',
        x,
        y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s - 1.4,
        life: 34 + Math.random() * 26,
        maxLife: 60,
        size: 3 + Math.random() * 4.5,
        rot: Math.random() * TAU,
        spin: (Math.random() - 0.5) * 0.3,
        colour: '#fff6e6',
        gravity: 0.11,
      })
    }
    for (let i = 0; i < Math.round(3 + power * 5); i++) {
      const a = Math.random() * TAU
      const s = 5 + Math.random() * 9 * power
      this.add({
        kind: 'spark',
        x,
        y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        life: 7 + Math.random() * 7,
        maxLife: 14,
        size: 2 + Math.random() * 2.5,
        rot: a,
        spin: 0,
        colour: counter ? '#ff5a5a' : '#ffe08a',
        gravity: 0,
      })
    }
    this.add({
      kind: 'ring',
      x,
      y,
      vx: 0,
      vy: 0,
      life: 11,
      maxLife: 11,
      size: 14 + power * 26,
      rot: 0,
      spin: 0,
      colour: counter ? '#ff8080' : '#ffffff',
      gravity: 0,
    })
    if (counter || power > 0.85) {
      this.add({
        kind: 'star',
        x,
        y,
        vx: 0,
        vy: -0.6,
        life: 16,
        maxLife: 16,
        size: 26 + power * 30,
        rot: (Math.random() - 0.5) * 0.5,
        spin: 0,
        colour: counter ? '#ff6b5e' : '#fff0a8',
        gravity: 0,
      })
    }
  }

  /** A blocked hit: hard white flash, no fur — nothing actually connected. */
  block(x: number, y: number): void {
    this.add({
      kind: 'ring',
      x,
      y,
      vx: 0,
      vy: 0,
      life: 9,
      maxLife: 9,
      size: 20,
      rot: 0,
      spin: 0,
      colour: '#9fd8ff',
      gravity: 0,
    })
    for (let i = 0; i < 7; i++) {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.4
      this.add({
        kind: 'spark',
        x,
        y,
        vx: Math.cos(a) * (3 + Math.random() * 6),
        vy: Math.sin(a) * (3 + Math.random() * 6),
        life: 8 + Math.random() * 5,
        maxLife: 13,
        size: 2,
        rot: a,
        spin: 0,
        colour: '#cceaff',
        gravity: 0.1,
      })
    }
  }

  /** Ground dust from jumps, landings, dashes and knockdowns. */
  dust(x: number, y: number, amount: number): void {
    for (let i = 0; i < amount; i++) {
      const dir = Math.random() < 0.5 ? -1 : 1
      this.add({
        kind: 'dust',
        x: x + (Math.random() - 0.5) * 22,
        y: y - Math.random() * 6,
        vx: dir * (0.7 + Math.random() * 2.6),
        vy: -0.5 - Math.random() * 1.5,
        life: 16 + Math.random() * 14,
        maxLife: 30,
        size: 5 + Math.random() * 8,
        rot: 0,
        spin: 0,
        colour: '#d9cdbb',
        gravity: -0.02,
      })
    }
  }

  update(): void {
    this.t += 1
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const p = this.parts[i]!
      p.life--
      if (p.life <= 0) {
        this.parts.splice(i, 1)
        continue
      }
      p.x += p.vx
      p.y += p.vy
      p.vy += p.gravity
      p.rot += p.spin
      if (p.kind === 'fur') {
        // Fur flutters rather than falling — it's the whole point of fur.
        p.vx *= 0.94
        p.vy *= 0.9
        p.vx += Math.sin((this.t + p.size * 9) * 0.14) * 0.12
      } else if (p.kind === 'spark') {
        p.vx *= 0.86
        p.vy *= 0.86
      } else if (p.kind === 'dust') {
        p.vx *= 0.93
        p.vy *= 0.95
      }
    }
  }

  draw(ctx: CanvasRenderingContext2D): void {
    for (const p of this.parts) {
      const a = Math.min(1, p.life / (p.maxLife * 0.55))
      switch (p.kind) {
        case 'fur': {
          ctx.save()
          ctx.translate(p.x, p.y)
          ctx.rotate(p.rot)
          ctx.fillStyle = withAlpha(p.colour, a * 0.95)
          ctx.beginPath()
          ctx.ellipse(0, 0, p.size, p.size * 0.5, 0, 0, TAU)
          ctx.fill()
          ctx.restore()
          break
        }
        case 'spark': {
          ctx.strokeStyle = withAlpha(p.colour, a)
          ctx.lineWidth = p.size
          ctx.lineCap = 'round'
          ctx.beginPath()
          ctx.moveTo(p.x, p.y)
          ctx.lineTo(p.x - p.vx * 1.7, p.y - p.vy * 1.7)
          ctx.stroke()
          break
        }
        case 'dust': {
          ctx.fillStyle = withAlpha(p.colour, a * 0.42)
          ctx.beginPath()
          ctx.arc(p.x, p.y, p.size * (1.6 - a * 0.6), 0, TAU)
          ctx.fill()
          break
        }
        case 'ring': {
          const t = 1 - p.life / p.maxLife
          ctx.strokeStyle = withAlpha(p.colour, (1 - t) * 0.9)
          ctx.lineWidth = 5 * (1 - t) + 1
          ctx.beginPath()
          ctx.arc(p.x, p.y, p.size * (0.3 + t * 1.5), 0, TAU)
          ctx.stroke()
          break
        }
        case 'star': {
          const t = 1 - p.life / p.maxLife
          ctx.save()
          ctx.translate(p.x, p.y)
          ctx.rotate(p.rot + t * 0.3)
          ctx.scale(1 + t * 0.6, 1 + t * 0.6)
          ctx.fillStyle = withAlpha(p.colour, (1 - t) * 0.95)
          ctx.beginPath()
          // A jagged comic-book impact burst.
          const spikes = 9
          for (let i = 0; i < spikes * 2; i++) {
            const ang = (i / (spikes * 2)) * TAU
            const r = i % 2 === 0 ? p.size : p.size * 0.45
            const x = Math.cos(ang) * r
            const y = Math.sin(ang) * r * 0.8
            if (i === 0) ctx.moveTo(x, y)
            else ctx.lineTo(x, y)
          }
          ctx.closePath()
          ctx.fill()
          ctx.restore()
          break
        }
      }
    }
  }
}

/** Projectiles are drawn here so all the "stuff flying around" lives together. */
export function drawProjectile(ctx: CanvasRenderingContext2D, p: Projectile, alpha: number): void {
  const x = p.prevX + (p.x - p.prevX) * alpha
  const y = p.prevY + (p.y - p.prevY) * alpha
  const fade = p.spent ? Math.max(0, p.life / 6) : 1
  const r = p.spec.radius * (p.spent ? 1 + (1 - fade) * 0.8 : 1)

  ctx.save()
  ctx.translate(x, y)
  ctx.globalAlpha = fade

  if (p.spec.look === 'hairball') {
    ctx.rotate(p.spin)
    // Motion smear behind it.
    ctx.fillStyle = withAlpha('#b8a48a', 0.28)
    ctx.beginPath()
    ctx.ellipse(-p.vx * 1.6, 0, r * 1.5, r * 0.65, 0, 0, TAU)
    ctx.fill()

    ctx.beginPath()
    // A lumpy ball: a circle with the radius wobbling around it.
    for (let i = 0; i <= 22; i++) {
      const a = (i / 22) * TAU
      const rad = r * (0.86 + Math.sin(a * 5 + p.spin * 2) * 0.14)
      const px = Math.cos(a) * rad
      const py = Math.sin(a) * rad
      if (i === 0) ctx.moveTo(px, py)
      else ctx.lineTo(px, py)
    }
    ctx.closePath()
    ctx.fillStyle = '#a89073'
    ctx.fill()
    ctx.lineWidth = 3
    ctx.strokeStyle = '#4a3c2c'
    ctx.stroke()

    ctx.strokeStyle = withAlpha('#6d5a45', 0.9)
    ctx.lineWidth = 2
    for (let i = 0; i < 4; i++) {
      ctx.beginPath()
      ctx.arc(0, 0, r * (0.3 + i * 0.16), i * 1.4, i * 1.4 + 2.1)
      ctx.stroke()
    }
  } else {
    // Fur cloud: overlapping soft blobs that churn as it drifts.
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * TAU + p.age * 0.05
      const d = r * 0.42
      ctx.beginPath()
      ctx.arc(Math.cos(a) * d, Math.sin(a) * d * 0.8, r * 0.62, 0, TAU)
      ctx.fillStyle = withAlpha(i % 2 ? '#fffaf0' : '#efe4d2', 0.85)
      ctx.fill()
    }
    ctx.beginPath()
    ctx.arc(0, 0, r * 0.7, 0, TAU)
    ctx.fillStyle = withAlpha('#ffffff', 0.9)
    ctx.fill()
  }
  ctx.restore()
}
