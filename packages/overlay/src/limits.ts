/**
 * Per-IP rate limits for the public overlay and coordinator (B-P5a §3).
 * Fixed one-minute windows in memory; no extra dependency. Loopback callers
 * (the coordinator talking to its overlay, agents on the same box) are exempt
 * when `exemptLoopback` is set. Behind Caddy the app must `trust proxy`
 * loopback so `req.ip` is the client's address from X-Forwarded-For.
 */
import type { NextFunction, Request, Response } from 'express'

export class WindowCounter {
  private readonly hits = new Map<string, { start: number, n: number }>()

  constructor (private readonly max: number, private readonly windowMs = 60_000) {}

  /** Count one hit for `key`. Returns 0 when allowed, otherwise ms until the window resets. */
  hit (key: string, now = Date.now()): number {
    let w = this.hits.get(key)
    if (w === undefined || now - w.start >= this.windowMs) {
      w = { start: now, n: 0 }
      this.hits.set(key, w)
      if (this.hits.size > 10_000) this.prune(now)
    }
    w.n++
    return w.n > this.max ? w.start + this.windowMs - now : 0
  }

  private prune (now: number): void {
    for (const [k, w] of this.hits) if (now - w.start >= this.windowMs) this.hits.delete(k)
  }
}

export const isLoopback = (ip: string | undefined): boolean =>
  ip === undefined || ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1'

export interface RateLimitOptions {
  /** requests per minute per IP */
  perMin: number
  exemptLoopback?: boolean
  /** only count requests this returns true for (default: all) */
  match?: (req: Request) => boolean
}

export function rateLimit (opts: RateLimitOptions) {
  const counter = new WindowCounter(opts.perMin)
  return (req: Request, res: Response, next: NextFunction): void => {
    if (opts.match !== undefined && !opts.match(req)) { next(); return }
    if (opts.exemptLoopback === true && isLoopback(req.ip)) { next(); return }
    const wait = counter.hit(req.ip ?? 'unknown')
    if (wait === 0) { next(); return }
    res.setHeader('Retry-After', String(Math.ceil(wait / 1000)))
    res.status(429).json({ code: 'RATE_LIMITED', error: `more than ${opts.perMin} requests per minute from this address` })
  }
}

/** Env number with a default; `RATE_LIMIT=off` disables limits in the callers. */
export const envInt = (v: string | undefined, d: number): number => {
  const n = Number(v)
  return v !== undefined && v !== '' && Number.isInteger(n) && n > 0 ? n : d
}
