import { cn } from './cn'

export interface CounterProps {
  value: number | string | bigint
  unit?: string
  size?: 's' | 'm' | 'l'
  tone?: 'ink' | 'gold' | 'grass' | 'danger' | 'muted'
  className?: string
  title?: string
}

const SIZES = { s: 'text-[24px] leading-6', m: 'text-[40px] leading-10', l: 'text-[64px] leading-none' }
const TONES = { ink: 'text-ink', gold: 'text-gold-dark', grass: 'text-grass-dark', danger: 'text-danger-dark', muted: 'text-ink-muted' }

/** thin-space thousands separators: 25 000 */
export const formatInt = (v: number | string | bigint): string => {
  const s = typeof v === 'number' ? Math.round(v).toString() : v.toString()
  return s.replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
}

export function Counter ({ value, unit, size = 'm', tone = 'ink', className, title }: CounterProps) {
  return (
    <span className={cn('counter inline-flex items-baseline gap-1', className)} title={title}>
      <span className={cn(SIZES[size], TONES[tone])}>{formatInt(value)}</span>
      {unit !== undefined && <span className="label text-ink-muted">{unit}</span>}
    </span>
  )
}
