/**
 * Sound, synthesised at runtime.
 *
 * Same principle as the artwork: no asset files. Impacts are noise bursts through a
 * lowpass, and the cat voices are a sawtooth run through a couple of bandpass
 * "formant" filters with a pitch envelope — which is, roughly, how a meow works.
 */

type Voice = 'meow' | 'hiss' | 'yowl' | 'chirp' | 'growl'
export type SoundName =
  | Voice
  | 'hitLight'
  | 'hitHeavy'
  | 'block'
  | 'whoosh'
  | 'jump'
  | 'land'
  | 'ko'
  | 'ui'
  | 'bell'
  | 'super'
  | 'throw'

export class Sfx {
  private ctx: AudioContext | null = null
  private master: GainNode | null = null
  private noise: AudioBuffer | null = null
  muted = false

  /** Browsers require a gesture before audio starts; call this from a keypress. */
  unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume()
      return
    }
    const Ctor = window.AudioContext ?? (window as never as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    if (!Ctor) return
    this.ctx = new Ctor()
    this.master = this.ctx.createGain()
    this.master.gain.value = 0.32
    this.master.connect(this.ctx.destination)

    // One second of white noise, reused for every impact and hiss.
    const len = this.ctx.sampleRate
    this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate)
    const data = this.noise.getChannelData(0)
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1
  }

  toggleMute(): boolean {
    this.muted = !this.muted
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.32
    return this.muted
  }

  play(name: SoundName, detune = 0): void {
    if (!this.ctx || !this.master || this.muted) return
    const t = this.ctx.currentTime
    switch (name) {
      case 'hitLight':
        this.thump(t, 190, 0.09, 0.5)
        this.burst(t, 1900, 0.07, 0.32)
        break
      case 'hitHeavy':
        this.thump(t, 110, 0.2, 0.85)
        this.burst(t, 1100, 0.14, 0.5)
        break
      case 'block':
        this.burst(t, 3400, 0.09, 0.34, 'bandpass')
        this.thump(t, 260, 0.06, 0.24)
        break
      case 'whoosh':
        this.sweep(t, 900, 220, 0.16, 0.18)
        break
      case 'jump':
        this.blip(t, 380, 620, 0.09, 0.18, 'triangle')
        break
      case 'land':
        this.thump(t, 90, 0.14, 0.4)
        break
      case 'throw':
        this.sweep(t, 1400, 500, 0.18, 0.2)
        break
      case 'ko':
        this.catVoice(t, 'yowl', -4)
        this.thump(t + 0.1, 70, 0.5, 0.9)
        break
      case 'super':
        this.sweep(t, 200, 2400, 0.5, 0.3)
        this.blip(t + 0.1, 440, 880, 0.4, 0.22, 'sawtooth')
        break
      case 'ui':
        this.blip(t, 660, 660, 0.05, 0.16, 'square')
        break
      case 'bell':
        this.blip(t, 880, 880, 0.5, 0.2, 'sine')
        this.blip(t + 0.01, 1320, 1320, 0.45, 0.1, 'sine')
        break
      default:
        this.catVoice(t, name, detune)
    }
  }

  // --- primitives ----------------------------------------------------------

  private env(t: number, attack: number, dur: number, peak: number): GainNode {
    const g = this.ctx!.createGain()
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(peak, t + attack)
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    g.connect(this.master!)
    return g
  }

  private thump(t: number, freq: number, dur: number, peak: number): void {
    const osc = this.ctx!.createOscillator()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(freq, t)
    osc.frequency.exponentialRampToValueAtTime(freq * 0.4, t + dur)
    osc.connect(this.env(t, 0.004, dur, peak))
    osc.start(t)
    osc.stop(t + dur + 0.02)
  }

  private burst(
    t: number,
    cutoff: number,
    dur: number,
    peak: number,
    type: BiquadFilterType = 'lowpass',
  ): void {
    const src = this.ctx!.createBufferSource()
    src.buffer = this.noise
    const filt = this.ctx!.createBiquadFilter()
    filt.type = type
    filt.frequency.setValueAtTime(cutoff, t)
    filt.frequency.exponentialRampToValueAtTime(Math.max(120, cutoff * 0.35), t + dur)
    filt.Q.value = type === 'bandpass' ? 3 : 1
    src.connect(filt)
    filt.connect(this.env(t, 0.003, dur, peak))
    src.start(t)
    src.stop(t + dur + 0.02)
  }

  private sweep(t: number, from: number, to: number, dur: number, peak: number): void {
    const src = this.ctx!.createBufferSource()
    src.buffer = this.noise
    const filt = this.ctx!.createBiquadFilter()
    filt.type = 'bandpass'
    filt.Q.value = 5
    filt.frequency.setValueAtTime(from, t)
    filt.frequency.exponentialRampToValueAtTime(to, t + dur)
    src.connect(filt)
    filt.connect(this.env(t, 0.02, dur, peak))
    src.start(t)
    src.stop(t + dur + 0.02)
  }

  private blip(
    t: number,
    from: number,
    to: number,
    dur: number,
    peak: number,
    type: OscillatorType,
  ): void {
    const osc = this.ctx!.createOscillator()
    osc.type = type
    osc.frequency.setValueAtTime(from, t)
    osc.frequency.exponentialRampToValueAtTime(to, t + dur)
    osc.connect(this.env(t, 0.006, dur, peak))
    osc.start(t)
    osc.stop(t + dur + 0.02)
  }

  /**
   * A cat noise. The pitch contour is what distinguishes them: a meow rises then
   * falls, a chirp is a fast upward blip, a yowl holds and wavers, a growl sits low
   * with heavy amplitude modulation, and a hiss has no pitch at all.
   */
  private catVoice(t: number, kind: Voice, detune: number): void {
    if (kind === 'hiss') {
      this.burst(t, 6200, 0.3, 0.24, 'bandpass')
      this.burst(t + 0.04, 4200, 0.22, 0.16, 'highpass')
      return
    }

    const base = { meow: 520, yowl: 400, chirp: 900, growl: 130 }[kind] * Math.pow(2, detune / 12)
    const dur = { meow: 0.42, yowl: 0.75, chirp: 0.13, growl: 0.5 }[kind]
    const peak = { meow: 0.3, yowl: 0.36, chirp: 0.22, growl: 0.3 }[kind]

    const osc = this.ctx!.createOscillator()
    osc.type = kind === 'growl' ? 'sawtooth' : 'sawtooth'
    const f = osc.frequency
    f.setValueAtTime(base * 0.8, t)
    if (kind === 'meow') {
      f.linearRampToValueAtTime(base * 1.25, t + dur * 0.22)
      f.linearRampToValueAtTime(base * 0.72, t + dur)
    } else if (kind === 'yowl') {
      f.linearRampToValueAtTime(base * 1.4, t + dur * 0.18)
      f.linearRampToValueAtTime(base * 1.15, t + dur * 0.55)
      f.linearRampToValueAtTime(base * 0.55, t + dur)
    } else if (kind === 'chirp') {
      f.linearRampToValueAtTime(base * 1.9, t + dur)
    } else {
      f.linearRampToValueAtTime(base * 0.85, t + dur)
    }

    // Two bandpass formants turn a buzzy sawtooth into something vocal.
    const f1 = this.ctx!.createBiquadFilter()
    f1.type = 'bandpass'
    f1.frequency.value = kind === 'growl' ? 320 : 780
    f1.Q.value = 4
    const f2 = this.ctx!.createBiquadFilter()
    f2.type = 'bandpass'
    f2.frequency.value = kind === 'growl' ? 900 : 2100
    f2.Q.value = 6

    const out = this.env(t, kind === 'chirp' ? 0.01 : 0.05, dur, peak)
    osc.connect(f1)
    f1.connect(f2)
    f2.connect(out)

    if (kind === 'growl' || kind === 'yowl') {
      // Amplitude wobble — the rasp in a real growl.
      const lfo = this.ctx!.createOscillator()
      const lfoGain = this.ctx!.createGain()
      lfo.frequency.value = kind === 'growl' ? 26 : 7
      lfoGain.gain.value = kind === 'growl' ? 0.5 : 0.22
      lfo.connect(lfoGain)
      lfoGain.connect(out.gain)
      lfo.start(t)
      lfo.stop(t + dur + 0.05)
    }

    osc.start(t)
    osc.stop(t + dur + 0.05)
  }
}
