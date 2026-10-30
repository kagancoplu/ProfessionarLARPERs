import { useState } from 'react'
import { shortHex } from '../api/woc'
import { cn } from './cn'

export type Role = 'provider' | 'agent' | 'owner' | 'guard' | 'me' | 'unknown'
const DOT: Record<Role, string> = { provider: 'bg-wood', agent: 'bg-grass', owner: 'bg-gold', guard: 'bg-sky', me: 'bg-danger', unknown: 'bg-ink-muted' }

/** Short identity key in VT323 with a role dot; click copies the full key. */
export function IdentityChip ({ identity, role = 'unknown', name, className }: { identity: string, role?: Role, name?: string, className?: string }) {
  const [copied, setCopied] = useState(false)
  const copy = async (): Promise<void> => {
    try { await navigator.clipboard.writeText(identity); setCopied(true); setTimeout(() => setCopied(false), 1200) } catch { /* no clipboard */ }
  }
  return (
    <button type="button" onClick={() => { void copy() }} title={`${identity}\n(click to copy)`}
      className={cn('inline-flex items-center gap-2 whitespace-nowrap border border-ink-muted bg-surface-2 px-2 py-0.5 text-ink hover:bg-surface-3', className)}>
      <span className={cn('inline-block size-2', DOT[role])} aria-hidden />
      {name !== undefined && <span className="font-display text-[14px]">{name}</span>}
      <span className="mono text-[16px] leading-5">{copied ? 'copied' : shortHex(identity, 5)}</span>
    </button>
  )
}
