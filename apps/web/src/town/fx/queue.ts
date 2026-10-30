/**
 * The animation queue (track-E §5.2): every Town effect is a function returning a promise. Big scenes
 * run one at a time in order; small ones can run in parallel. `speed` divides durations (replay 8×),
 * `reducedMotion` cuts scenes to their final frame. Pure of Phaser: tests run it with fake timers.
 */
export type FxJob = (ctx: FxContext) => Promise<void>
export interface FxContext {
  speed: number
  reducedMotion: boolean
  /** resolves after `ms` scaled by speed (and 0 when reduced motion) */
  wait: (ms: number) => Promise<void>
  /** true when a newer exclusive job wants the stage; long scenes check it between beats */
  cancelled: () => boolean
}

export interface FxQueueOptions {
  speed?: number
  reducedMotion?: boolean
  setTimeoutImpl?: (fn: () => void, ms: number) => unknown
}

export class FxQueue {
  speed: number
  reducedMotion: boolean
  private readonly exclusive: Array<{ label: string, job: FxJob }> = []
  private running = false
  private generation = 0
  private readonly setTimeoutImpl: (fn: () => void, ms: number) => unknown
  readonly log: string[] = []

  constructor (opts: FxQueueOptions = {}) {
    this.speed = opts.speed ?? 1
    this.reducedMotion = opts.reducedMotion ?? false
    this.setTimeoutImpl = opts.setTimeoutImpl ?? ((fn, ms) => setTimeout(fn, ms))
  }

  get pending (): number { return this.exclusive.length + (this.running ? 1 : 0) }

  private context (gen: number): FxContext {
    return {
      speed: this.speed,
      reducedMotion: this.reducedMotion,
      wait: ms => new Promise(resolve => { this.setTimeoutImpl(resolve, this.reducedMotion ? 0 : Math.max(0, ms / this.speed)) }),
      cancelled: () => gen !== this.generation
    }
  }

  /** Runs now, alongside whatever is on stage (bubbles, purse glow, counters). */
  parallel (label: string, job: FxJob): Promise<void> {
    this.log.push(`parallel:${label}`)
    return job(this.context(this.generation)).catch(err => { console.error('[fx]', label, err) })
  }

  /** Waits for the stage (settlement, failed pool, lock-in). */
  enqueue (label: string, job: FxJob): void {
    this.exclusive.push({ label, job })
    void this.drain()
  }

  /** Drop everything waiting and signal the running scene to finish fast (replay seek, scene teardown). */
  clear (): void {
    this.exclusive.length = 0
    this.generation++
  }

  private async drain (): Promise<void> {
    if (this.running) return
    this.running = true
    try {
      while (this.exclusive.length > 0) {
        const next = this.exclusive.shift()!
        this.log.push(`run:${next.label}`)
        const gen = this.generation
        try { await next.job(this.context(gen)) } catch (err) { console.error('[fx]', next.label, err) }
      }
    } finally {
      this.running = false
    }
  }
}
