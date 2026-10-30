/** "Under the hood" (DESIGN.md): one human line per protocol step, with its stamp, measured ms and link. */
import { useStore } from '../store'
import { Signboard } from './Signboard'
import { Tag } from './Tag'
import { TxLink } from './TxLink'
import { cn } from './cn'

export function UnderTheHood ({ flows, title = 'Under the hood', className }: { flows: string[], title?: string, className?: string }) {
  const feed = useStore(s => s.feed)
  const steps = feed.filter(e => e.type === 'flow_step' && flows.includes(e.data.flow) && e.data.status !== 'start').slice(-14)
  return (
    <Signboard title={title} className={cn('text-[14px] leading-5', className)} data-testid="under-the-hood">
      {steps.length === 0 ? <p className="text-ink-muted">Each step of your next action lands here: what happened, which protocol, how long it took.</p> : (
        <ol className="m-0 flex list-none flex-col gap-1 p-0">
          {steps.map(e => e.type === 'flow_step' && (
            <li key={`${e.src}:${e.id}`} className={cn('flex flex-col gap-1 border-b border-surface-3 py-1 last:border-0', e.data.status === 'error' && 'text-danger-dark')}>
              <span>{e.data.step}{e.data.status === 'error' && e.data.detail !== undefined && <span className="block text-[12px]">{e.data.detail}</span>}</span>
              <span className="flex flex-wrap items-center gap-1">
                {e.data.status !== 'error' && e.data.detail !== undefined && e.data.detail.split(' · ').map(d => <Tag key={d} tone="neutral">{d}</Tag>)}
                {e.data.ms !== undefined && <span className="counter whitespace-nowrap text-[18px] text-ink-muted">{e.data.ms} ms</span>}
                {e.data.txid !== undefined && <TxLink txid={e.data.txid} chars={4} />}
              </span>
            </li>
          ))}
        </ol>
      )}
    </Signboard>
  )
}
