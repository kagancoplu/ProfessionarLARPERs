import { useState } from 'react'
import { usePools } from '../../api/queries'
import { blocksToHuman } from '../../api/arcade'
import { store, useShallowStore, useStore } from '../../store'
import { selectPools } from '../../store/selectors'
import { DemoPricingTag, EmptyState, ErrorState, LoadingState, PixelButton, Signboard, Tag, TxLink, cn, formatInt } from '../../ui'
import { t } from '../../i18n/t'
import { TownDrawer } from '../../town/TownDrawer'
import { blocksLeft, discount, fillRatio, filterPools, satsPerCredit, sortPools, type PoolFilter, type PoolSort } from './sort'

const FILTERS: PoolFilter[] = ['all', 'open', 'settled', 'failed']
const SORTS: Array<{ id: PoolSort, label: string }> = [{ id: 'newest', label: 'newest' }, { id: 'deadline', label: 'deadline' }, { id: 'fill', label: 'fill' }, { id: 'discount', label: 'discount' }]
const STATUS_TONE = { open: 'info', locking: 'warn', settled: 'ok', failed: 'danger', cancelled: 'danger' } as const

export function PoolsPage () {
  const mode = useStore(s => s.mode)
  const q = usePools()
  const all = useShallowStore(selectPools())
  const [filter, setFilter] = useState<PoolFilter>('all')
  const [sort, setSort] = useState<PoolSort>('newest')
  const pools = sortPools(filterPools(all, filter), sort)
  const live = mode === 'live'
  return (
    <div className="mx-auto max-w-[1280px] p-6">
      <Signboard title="Pools" actions={<DemoPricingTag />} data-testid="pools-page">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <span className="label text-ink-muted">show</span>
          {FILTERS.map(f => <PixelButton key={f} size="sm" variant={filter === f ? 'primary' : 'secondary'} onClick={() => setFilter(f)} aria-pressed={filter === f}>{f}</PixelButton>)}
          <span className="label ml-4 text-ink-muted">sort</span>
          {SORTS.map(s => <PixelButton key={s.id} size="sm" variant={sort === s.id ? 'primary' : 'secondary'} onClick={() => setSort(s.id)} aria-pressed={sort === s.id}>{s.label}</PixelButton>)}
        </div>
        {live && q.isError && all.length === 0 && <ErrorState title="The coordinator is not answering." body={String((q.error as Error).message)} onRetry={() => { void q.refetch() }} />}
        {live && q.isLoading && all.length === 0 && <LoadingState title="Reading the overlay…" body="coordinator · GET /pools" />}
        {pools.length === 0 && !(live && (q.isLoading || q.isError)) && <EmptyState title={filter === 'all' ? 'No pools yet.' : `No ${filter} pools.`} body={t('states.noPools')} />}
        {pools.length > 0 && (
          <table className="w-full border-collapse text-[14px] leading-5" data-testid="pools-table">
            <thead><tr className="label bg-surface-3 text-left text-[12px]"><th className="px-3 py-2">Pool</th><th className="px-3 py-2">Status</th><th className="px-3 py-2">Fill</th><th className="px-3 py-2 text-right">sat / credit</th><th className="px-3 py-2">Deadline</th><th className="px-3 py-2">Settlement</th></tr></thead>
            <tbody>{pools.map(p => {
              const left = blocksLeft(p)
              return (
                <tr key={p.poolId} className="h-10 cursor-pointer border-b border-surface-3 hover:bg-surface-3" onClick={() => store.getState().openDrawer('pool', p.poolId)} data-testid="pool-row">
                  <td className="px-3 font-display">{p.terms.label}</td>
                  <td className="px-3"><Tag tone={STATUS_TONE[p.status]}>{p.status}</Tag></td>
                  <td className="px-3">
                    <div className="flex items-center gap-2">
                      <div className="h-3 w-24 border-2 border-ink bg-surface-3" role="progressbar" aria-valuenow={Math.round(fillRatio(p) * 100)} aria-valuemin={0} aria-valuemax={100}><div className={cn('h-full', p.status === 'failed' ? 'bg-ink-muted' : 'bg-gold')} style={{ width: `${Math.min(100, fillRatio(p) * 100)}%` }} /></div>
                      <span className="counter text-[18px]">{formatInt(p.pledgedCredits)}/{formatInt(p.terms.credits)}</span>
                    </div>
                  </td>
                  <td className="px-3 text-right counter text-[18px]">{satsPerCredit(p).toFixed(0)} <span className="text-ink-muted text-[14px] font-body">({Math.round(discount(p) * 100)} % off {p.terms.retailSatsPerCredit})</span></td>
                  <td className="px-3">{p.status === 'settled' ? '—' : left === undefined ? `block ${p.terms.deadlineHeight}` : left > 0 ? blocksToHuman(left) : 'passed'}</td>
                  <td className="px-3" onClick={e => e.stopPropagation()}>{p.settledTxid !== undefined ? <TxLink txid={p.settledTxid} chars={4} /> : <span className="text-ink-muted">—</span>}</td>
                </tr>
              )
            })}</tbody>
          </table>
        )}
      </Signboard>
      <TownDrawer />
    </div>
  )
}
