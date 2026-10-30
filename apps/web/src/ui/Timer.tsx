import { useEffect, useState } from 'react'
import { cn } from './cn'

/** Countdown to `expiresAt` (ISO). Warn under 20 s, danger under 5 s (DESIGN.md). */
export function Timer ({ expiresAt, className, onExpire }: { expiresAt: string, className?: string, onExpire?: () => void }) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250)
    return () => clearInterval(id)
  }, [])
  const left = Math.max(0, Math.ceil((new Date(expiresAt).getTime() - now) / 1000))
  useEffect(() => { if (left === 0) onExpire?.() }, [left, onExpire])
  const tone = left <= 5 ? 'text-danger-dark' : left <= 20 ? 'text-warn' : 'text-ink'
  return (
    <span className={cn('counter inline-flex items-center gap-2', className)} role="timer" aria-live="polite">
      <span className={cn('inline-block size-3 border-2 border-ink', left <= 5 ? 'bg-danger' : left <= 20 ? 'bg-warn' : 'bg-grass')} aria-hidden />
      <span className={cn('text-[24px] leading-6', tone)}>{left}s</span>
    </span>
  )
}
