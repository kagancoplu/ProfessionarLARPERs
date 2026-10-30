/** / — the Town square: tour, corner counters, the Phaser canvas (lazy), live feed, what is on the board. */
import { lazy, Suspense } from 'react'
import { useShallowStore } from '../../store'
import { selectPools } from '../../store/selectors'
import { DemoPricingTag, EmptyState, LoadingState, Signboard, Tag, formatInt, Counter } from '../../ui'
import { t } from '../../i18n/t'
import { TourBanner } from '../../shell/TourBanner'
import { LiveFeed } from '../LiveFeed'
import { MainnetProof } from '../explorer/MainnetProof'
import { CornerCounters } from './CornerCounters'

const TownCanvas = lazy(() => import('../../town/TownCanvas'))

export function TownPage () {
  const pools = useShallowStore(selectPools())
  const open = pools.filter(p => p.status === 'open' || p.status === 'locking')
  return (
    <div className="mx-auto flex max-w-[1280px] flex-col gap-6 p-6">
      <TourBanner />
      <CornerCounters />
      <Suspense fallback={<LoadingState title="Building the town…" />}><TownCanvas /></Suspense>
      <div className="grid grid-cols-[2fr_1fr] gap-6">
        <LiveFeed />
        <div className="flex flex-col gap-6">
        <Signboard title="On the board now">
          {open.length === 0
            ? <EmptyState title="No open pool on the board." body={t('states.noPools')} />
            : open.map(p => (
              <div key={p.poolId} className="flex flex-col gap-1 border-b border-surface-3 py-2 last:border-0">
                <div className="flex items-center justify-between gap-2"><span className="font-display">{p.terms.label}</span><Tag tone={p.status === 'locking' ? 'warn' : 'ok'}>{p.status}</Tag></div>
                <div className="flex items-baseline gap-2"><Counter value={p.pledgedCredits} size="s" /><span className="text-ink-muted">/ {formatInt(p.terms.credits)} credits</span></div>
                <div className="h-3 border-2 border-ink bg-surface-3" role="progressbar" aria-valuenow={Number(p.pledgedCredits)} aria-valuemin={0} aria-valuemax={Number(p.terms.credits)}>
                  <div className="h-full bg-gold" style={{ width: `${Math.min(100, (Number(p.pledgedCredits) / Number(p.terms.credits)) * 100)}%` }} />
                </div>
                <p className="text-[14px] leading-5 text-ink-muted">{Number(p.terms.priceSats) / Number(p.terms.credits)} sat/credit vs retail {p.terms.retailSatsPerCredit} <DemoPricingTag /></p>
              </div>
            ))}
        </Signboard>
        <MainnetProof compact />
        </div>
      </div>
    </div>
  )
}
