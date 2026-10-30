/**
 * Sound (track-E §5.3) without assets: short chiptune effects synthesised with Web Audio, so nothing is
 * downloaded and nothing needs a licence. Silent until the browser allows audio (first pointer/key),
 * and only when settings.sound is on. `effectFor` is pure (tested); `Sfx` does the playing.
 */
import type { AnyCoopEvent } from '../events/types'

export type Effect = 'coin' | 'bell' | 'shield' | 'chime' | 'scroll' | 'cart'

/** Which effect an event plays, if any. */
export function effectFor (e: AnyCoopEvent): Effect | undefined {
  switch (e.type) {
    case 'pledge_added': case 'listing_filled': case 'credits_redeemed': return 'coin'
    case 'pool_settled': case 'settled': return 'bell'
    case 'cosign_denied': case 'pool_failed': return 'shield'
    case 'sign_request': return 'chime'
    case 'job_done': case 'rail_claimed': return 'scroll'
    case 'rail_funded_bsv': return 'cart'
    default: return undefined
  }
}

interface Note { f: number, t: number, d: number, type?: OscillatorType, g?: number }
/** frequency (Hz), start offset (s), duration (s), waveform, relative gain */
export const SCORES: Record<Effect, Note[]> = {
  coin: [{ f: 988, t: 0, d: 0.06, type: 'square' }, { f: 1319, t: 0.06, d: 0.18, type: 'square' }],
  bell: [{ f: 659, t: 0, d: 0.5, type: 'triangle' }, { f: 988, t: 0.12, d: 0.5, type: 'triangle', g: 0.6 }, { f: 1319, t: 0.24, d: 0.7, type: 'sine', g: 0.5 }],
  shield: [{ f: 220, t: 0, d: 0.08, type: 'square' }, { f: 165, t: 0.08, d: 0.22, type: 'sawtooth', g: 0.6 }],
  chime: [{ f: 784, t: 0, d: 0.12, type: 'triangle' }, { f: 1047, t: 0.12, d: 0.12, type: 'triangle' }, { f: 784, t: 0.24, d: 0.12, type: 'triangle' }, { f: 1047, t: 0.36, d: 0.3, type: 'triangle' }],
  scroll: [{ f: 523, t: 0, d: 0.08, type: 'square', g: 0.5 }, { f: 659, t: 0.08, d: 0.08, type: 'square', g: 0.5 }, { f: 784, t: 0.16, d: 0.2, type: 'square', g: 0.5 }],
  cart: [{ f: 110, t: 0, d: 0.1, type: 'sawtooth', g: 0.5 }, { f: 110, t: 0.18, d: 0.1, type: 'sawtooth', g: 0.5 }, { f: 110, t: 0.36, d: 0.1, type: 'sawtooth', g: 0.5 }, { f: 147, t: 0.54, d: 0.14, type: 'sawtooth', g: 0.5 }]
}

export class Sfx {
  private ctx?: AudioContext
  private master?: GainNode
  volume = 0.25
  enabled = false

  /** Call from a user gesture: creates/resumes the context (autoplay policy). */
  unlock (): void {
    if (typeof window === 'undefined') return
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (Ctor === undefined) return
    if (this.ctx === undefined) { this.ctx = new Ctor(); this.master = this.ctx.createGain(); this.master.gain.value = this.volume; this.master.connect(this.ctx.destination) }
    if (this.ctx.state === 'suspended') void this.ctx.resume()
  }

  get ready (): boolean { return this.ctx !== undefined && this.ctx.state === 'running' }

  play (effect: Effect): void {
    if (!this.enabled || this.ctx === undefined || this.master === undefined || this.ctx.state !== 'running') return
    const now = this.ctx.currentTime
    for (const n of SCORES[effect]) {
      const osc = this.ctx.createOscillator()
      const gain = this.ctx.createGain()
      osc.type = n.type ?? 'square'
      osc.frequency.setValueAtTime(n.f, now + n.t)
      const g = (n.g ?? 1) * 0.6
      gain.gain.setValueAtTime(0.0001, now + n.t)
      gain.gain.exponentialRampToValueAtTime(g, now + n.t + 0.01)
      gain.gain.exponentialRampToValueAtTime(0.0001, now + n.t + n.d)
      osc.connect(gain); gain.connect(this.master)
      osc.start(now + n.t); osc.stop(now + n.t + n.d + 0.02)
    }
  }

  setVolume (v: number): void { this.volume = v; if (this.master !== undefined) this.master.gain.value = v }
}
