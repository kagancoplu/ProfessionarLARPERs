/**
 * Replay player (track-E §2.3): a JSONL file of CoopEvents is published through the bus at
 * `speed`×, keeping the original gaps (capped) so the Town animates like the live run did.
 */
import type { EventBus } from '../events/bus'
import { isCoopEvent, type AnyCoopEvent } from '../events/types'

export type ReplayStatus = 'idle' | 'loading' | 'playing' | 'paused' | 'done' | 'error'

export interface ReplayPlayerOptions {
  bus: EventBus
  speed?: number
  /** longest pause between two events, in real ms at speed 1 */
  maxGapMs?: number
  onStatus?: (status: ReplayStatus, position: number, total: number) => void
  fetchImpl?: typeof fetch
}

export function parseJsonl (text: string): AnyCoopEvent[] {
  return text.split('\n').map(l => l.trim()).filter(l => l !== '' && !l.startsWith('#')).map(l => JSON.parse(l) as unknown).filter(isCoopEvent)
}

export class ReplayPlayer {
  events: AnyCoopEvent[] = []
  position = 0
  status: ReplayStatus = 'idle'
  speed: number
  private timer: ReturnType<typeof setTimeout> | undefined
  private readonly maxGapMs: number
  /** resolves once events are loaded (load or loadEvents) */
  ready: Promise<void>
  private markReady: () => void = () => {}

  constructor (private readonly opts: ReplayPlayerOptions) {
    this.speed = opts.speed ?? 1
    this.maxGapMs = opts.maxGapMs ?? 4_000
    this.ready = new Promise<void>(resolve => { this.markReady = resolve })
  }

  async load (url: string): Promise<number> {
    this.setStatus('loading')
    const res = await (this.opts.fetchImpl ?? fetch)(url)
    if (!res.ok) { this.setStatus('error'); throw new Error(`replay ${url}: HTTP ${res.status}`) }
    this.events = parseJsonl(await res.text())
    this.position = 0
    this.setStatus('paused')
    this.markReady()
    return this.events.length
  }

  loadEvents (events: AnyCoopEvent[]): void { this.events = events; this.position = 0; this.setStatus('paused'); this.markReady() }

  play (): void { if (this.status === 'playing' || this.events.length === 0) return; this.setStatus('playing'); this.tick() }
  pause (): void { if (this.timer !== undefined) clearTimeout(this.timer); this.timer = undefined; if (this.status === 'playing') this.setStatus('paused') }
  setSpeed (speed: number): void { this.speed = Math.max(0.1, speed) }

  /** Publish everything up to and including the next event of `type` (e.g. 'settled'). */
  skipTo (type: AnyCoopEvent['type']): void {
    this.pause()
    while (this.position < this.events.length) {
      const e = this.events[this.position++]!
      this.opts.bus.publish(e)
      if (e.type === type) break
    }
    this.setStatus(this.position >= this.events.length ? 'done' : 'paused')
  }

  private tick (): void {
    if (this.status !== 'playing') return
    if (this.position >= this.events.length) { this.setStatus('done'); return }
    const e = this.events[this.position++]!
    this.opts.bus.publish(e)
    this.opts.onStatus?.('playing', this.position, this.events.length)
    const next = this.events[this.position]
    if (next === undefined) { this.setStatus('done'); return }
    const gap = Math.min(Math.max(0, new Date(next.ts).getTime() - new Date(e.ts).getTime()), this.maxGapMs)
    this.timer = setTimeout(() => this.tick(), gap / this.speed)
  }

  private setStatus (s: ReplayStatus): void { this.status = s; this.opts.onStatus?.(s, this.position, this.events.length) }
}
