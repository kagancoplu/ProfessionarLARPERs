import type { ServiceHealth } from '../store/types'
import { cn } from './cn'

/** 8 px square light + name: green ok, red down, gray unknown. */
export function ServiceBadge ({ name, health, url, className }: { name: string, health: ServiceHealth, url?: string, className?: string }) {
  const light = health.ok === true ? 'bg-grass' : health.ok === false ? 'bg-danger' : 'bg-ink-muted'
  const title = `${name}${url !== undefined ? ` · ${url}` : ''}${health.checkedAt !== undefined ? ` · checked ${new Date(health.checkedAt).toLocaleTimeString()}` : ''}${health.detail !== undefined ? `\n${health.detail}` : ''}`
  return (
    <span className={cn('inline-flex items-center gap-1.5 text-[14px] leading-5', className)} title={title} data-ok={String(health.ok)}>
      <span className={cn('inline-block size-2 border border-ink', light)} aria-hidden />
      <span className="font-display">{name}</span>
    </span>
  )
}
