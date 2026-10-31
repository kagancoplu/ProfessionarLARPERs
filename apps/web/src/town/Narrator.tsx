/**
 * One line over the Town's bottom-left corner: what just happened, in words (the newest meaningful event).
 * The Town is decorative; this keeps a viewer who does not read pixel scenes oriented.
 */
import { useEffect, useState } from 'react'
import { describeEvent } from '../consoles/LiveFeed'
import { useStore } from '../store'
import type { AnyCoopEvent } from '../events/types'

const QUIET = new Set<AnyCoopEvent['type']>(['flow_step', 'service_health', 'mode_changed', 'wallet_connected', 'wallet_disconnected', 'agent_thought', 'vault_credits', 'pool_update'])

export function Narrator () {
  const last = useStore(s => { for (let i = s.feed.length - 1; i >= 0; i--) { const e = s.feed[i]!; if (!QUIET.has(e.type)) return e } return undefined })
  const [shown, setShown] = useState<{ id: string, text: string }>()
  useEffect(() => {
    if (last === undefined) return
    setShown({ id: last.id, text: describeEvent(last) })
    const t = setTimeout(() => setShown(s => (s?.id === last.id ? undefined : s)), 9_000)
    return () => clearTimeout(t)
  }, [last])
  if (shown === undefined) return null
  return (
    <div key={shown.id} className="steps-in town-label pointer-events-none absolute bottom-3 left-3 max-w-[60%] !whitespace-normal px-2 py-1 text-[14px] leading-5" style={{ fontFamily: 'var(--font-body)' }} data-testid="narrator" aria-live="polite">
      {shown.text}
    </div>
  )
}
