/**
 * Virtual time for render mode (`?render=1`, VIDEO.md): the page's timers, animation frames, Date,
 * performance.now and CSS animations all follow one virtual clock. Until `freeze()` the clock follows the wall
 * clock (the page loads normally); after it, time moves only when the renderer calls `advance(ms)`, so a
 * frame-by-frame capture of any page (the film, the app tour) is smooth and on time however slow the machine.
 * Installed by render-boot.ts before any other module runs.
 */
export interface VirtualTime {
  /** virtual milliseconds since the page started (what performance.now() returns, minus its origin) */
  now: () => number
  frozen: () => boolean
  freeze: () => void
  /** move the clock forward: due timers fire in order, then one animation frame, then CSS animations catch up */
  advance: (ms: number) => Promise<void>
  /** resolves on the browser's next real paint (the renderer waits for it before a screenshot) */
  nextPaint: () => Promise<void>
}

interface Timer { id: number, at: number, fn: (...a: unknown[]) => void, args: unknown[], every?: number }

export function installVirtualTime (w: Window & typeof globalThis = window): VirtualTime {
  const real = {
    setTimeout: w.setTimeout.bind(w), clearTimeout: w.clearTimeout.bind(w),
    rAF: w.requestAnimationFrame.bind(w), perf: w.performance.now.bind(w.performance), Date: w.Date
  }
  const p0 = real.perf()
  const d0 = real.Date.now()
  let v = 0
  let isFrozen = false
  let seq = 1
  const timers = new Map<number, Timer>()
  let frameCbs = new Map<number, FrameRequestCallback>()
  // a real macrotask between timers lets promises, React and MSW settle the way they would between real ticks
  const channel = new MessageChannel()
  const waiting: Array<() => void> = []
  channel.port1.onmessage = () => { waiting.shift()?.() }
  const yieldTask = (): Promise<void> => new Promise(resolve => { waiting.push(resolve); channel.port2.postMessage(0) })

  const add = (fn: unknown, ms: unknown, args: unknown[], every: boolean): number => {
    const id = seq++
    const delay = Math.max(0, Number(ms) || 0)
    if (typeof fn !== 'function') return id
    timers.set(id, { id, at: v + delay, fn: fn as Timer['fn'], args, ...(every ? { every: Math.max(1, delay) } : {}) })
    return id
  }
  w.setTimeout = ((fn: TimerHandler, ms?: number, ...args: unknown[]) => add(fn, ms, args, false)) as typeof w.setTimeout
  w.setInterval = ((fn: TimerHandler, ms?: number, ...args: unknown[]) => add(fn, ms, args, true)) as typeof w.setInterval
  w.clearTimeout = ((id?: number) => { if (id !== undefined) timers.delete(id) }) as typeof w.clearTimeout
  w.clearInterval = w.clearTimeout as unknown as typeof w.clearInterval
  w.requestAnimationFrame = (cb: FrameRequestCallback) => { const id = seq++; frameCbs.set(id, cb); return id }
  w.cancelAnimationFrame = (id: number) => { frameCbs.delete(id) }
  if ('requestIdleCallback' in w) (w as unknown as { requestIdleCallback: (cb: () => void) => number }).requestIdleCallback = cb => add(cb, 1, [], false)
  w.performance.now = () => p0 + v
  const RealDate = real.Date
  class VDate extends RealDate {
    constructor (...args: unknown[]) {
      if (args.length === 0) super(d0 + v)
      else super(...(args as [string]))
    }

    static now (): number { return d0 + v }
  }
  w.Date = VDate as unknown as DateConstructor

  const due = (until: number): Timer | undefined => {
    let next: Timer | undefined
    for (const t of timers.values()) if (t.at <= until && (next === undefined || t.at < next.at || (t.at === next.at && t.id < next.id))) next = t
    return next
  }
  const runTimers = async (until: number): Promise<void> => {
    for (let guard = 0; guard < 10_000; guard++) {
      const t = due(until)
      if (t === undefined) break
      v = Math.max(v, t.at)
      if (t.every !== undefined) t.at += t.every
      else timers.delete(t.id)
      try { t.fn(...t.args) } catch (err) { console.error('[vclock] timer', err) }
      await yieldTask()
    }
    v = Math.max(v, until)
  }
  const runFrame = (): void => {
    const cbs = frameCbs
    frameCbs = new Map()
    const ts = p0 + v
    for (const cb of cbs.values()) { try { cb(ts) } catch (err) { console.error('[vclock] frame', err) } }
  }
  // CSS animations and transitions: paused, and moved to where the virtual clock says they are
  const born = new WeakMap<Animation, number>()
  const catchUpAnimations = (): void => {
    if (typeof document === 'undefined' || typeof document.getAnimations !== 'function') return
    for (const a of document.getAnimations()) {
      if (!born.has(a)) { born.set(a, v - Number(a.currentTime ?? 0)); a.pause() }
      a.currentTime = (v - born.get(a)!) * a.playbackRate
    }
  }

  // free run until frozen: the wall clock drives the virtual one
  const pump = async (): Promise<void> => {
    if (isFrozen) return
    await runTimers(real.perf() - p0)
    runFrame()
    real.rAF(() => { void pump() })
  }
  real.rAF(() => { void pump() })

  return {
    now: () => v,
    frozen: () => isFrozen,
    freeze: () => { isFrozen = true },
    advance: async (ms: number) => {
      if (!isFrozen) throw new Error('vclock: freeze() before advance()')
      await runTimers(v + ms)
      runFrame()
      catchUpAnimations()
      await yieldTask()
    },
    nextPaint: () => new Promise(resolve => { real.rAF(() => resolve()) })
  }
}
