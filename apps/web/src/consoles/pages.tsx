import { lazy, Suspense, useState } from 'react'
/**
 * P0 pages: the Town square shows the live feed and corner counters; the other consoles are
 * concrete placeholders that already read the store (lists arrive in P1–P3).
 */
import { store, useShallowStore, useStore } from '../store'
import { selectMetrics, selectPools, selectTxs } from '../store/selectors'
import { TownDrawer } from '../town/TownDrawer'
import { Counter, DemoPricingTag, EmptyState, LoadingState, Signboard, SimulatedJobsTag, Tag, TxLink, formatInt } from '../ui'
import { t } from '../i18n/t'
import { useQuery } from '@tanstack/react-query'
import { coopApi } from '../api/coop'
import { keys } from '../api/queries'
import { LiveFeed } from './LiveFeed'
import { RailCard } from './RailCard'
import { TourBanner } from '../shell/TourBanner'

const TownCanvas = lazy(() => import('../town/TownCanvas'))

function CornerCounters () {
  const m = useStore(selectMetrics)
  return (
    <div className="grid grid-cols-4 gap-4" data-testid="corner-counters">
      <Signboard><p className="label text-ink-muted">{t('metrics.custody')}</p><Counter value={m.custodiedSats} unit="sat" tone="grass" /></Signboard>
      <Signboard><p className="label text-ink-muted">{t('metrics.settlements')}</p><Counter value={m.settlements} /></Signboard>
      <Signboard><p className="label text-ink-muted">{t('metrics.participants')}</p><Counter value={m.participants} /></Signboard>
      <Signboard><p className="label text-ink-muted flex items-center gap-2">{t('metrics.savings')} <DemoPricingTag /></p><Counter value={m.villageSavingsSats} unit="sat" tone="gold" /></Signboard>
    </div>
  )
}

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
      </div>
    </div>
  )
}

const TX_KINDS = ['all', 'T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'T8', 'T9', 'T10', 'T11'] as const

export function ExplorerPage () {
  const all = useStore(selectTxs)
  const notifications = useStore(s => s.notifications)
  const [kind, setKind] = useState<typeof TX_KINDS[number]>('all')
  const txs = kind === 'all' ? all : all.filter(tx => tx.kind === kind)
  return (
    <div className="mx-auto grid max-w-[1280px] grid-cols-[2fr_1fr] gap-6 p-6">
      <Signboard title="Transactions" actions={<span className="text-surface-2 text-[14px]">{all.length} on record</span>}>
        <div className="mb-3 flex flex-wrap gap-1">{TX_KINDS.map(k => <button key={k} type="button" onClick={() => setKind(k)} aria-pressed={kind === k} className={`label border px-1.5 py-0 text-[12px] leading-4 ${kind === k ? 'bg-gold border-gold-dark text-ink' : 'bg-surface-3 border-ink-muted text-ink hover:bg-surface-2'}`}>{k}</button>)}</div>
        {txs.length === 0 ? <EmptyState title="No transactions yet." body={t('states.noTxs')} /> : (
          <table className="w-full border-collapse text-[14px] leading-5" data-testid="tx-table">
            <thead><tr className="label bg-surface-3 text-left text-[12px]"><th className="px-3 py-2">Type</th><th className="px-3 py-2">What</th><th className="px-3 py-2">txid</th><th className="px-3 py-2">When</th></tr></thead>
            <tbody>{txs.map(tx => (
              <tr key={tx.id} className="h-10 cursor-pointer border-b border-surface-3 hover:bg-surface-3" onClick={() => store.getState().openDrawer('tx', tx.id)}>
                <td className="px-3"><Tag tone={tx.kind === 'T5' ? 'gold' : 'neutral'}>{tx.kind}</Tag></td>
                <td className="px-3">{tx.label}</td>
                <td className="px-3" onClick={e => e.stopPropagation()}><TxLink txid={tx.txid} chars={4} /></td>
                <td className="px-3 counter text-[18px] text-ink-muted">{new Date(tx.ts).toLocaleTimeString('en-GB', { hour12: false })}</td>
              </tr>
            ))}</tbody>
          </table>
        )}
      </Signboard>
      <TownDrawer />
      <Signboard title="Notifications">
        {notifications.length === 0 ? <p className="text-ink-muted">Sign requests and guard refusals land here.</p> : notifications.map(n => (
          <div key={n.id} className="border-b border-surface-3 py-2 last:border-0">
            <div className="flex items-center gap-2"><Tag tone={n.kind === 'error' ? 'danger' : n.kind === 'sign_request' ? 'warn' : 'info'}>{n.kind}</Tag><span className="font-display">{n.title}</span></div>
            {n.body !== undefined && <p className="text-[14px] leading-5">{n.body}</p>}
          </div>
        ))}
      </Signboard>
    </div>
  )
}

export function MetricsPage () {
  const m = useStore(selectMetrics)
  const mode = useStore(s => s.mode)
  const live = useQuery({ queryKey: keys.metrics, queryFn: () => coopApi.metrics(), enabled: mode === 'live', retry: 0 })
  return (
    <div className="mx-auto flex max-w-[1280px] flex-col gap-6 p-6">
      <CornerCounters />
      <Signboard title="Why these numbers">
        <ul className="m-0 list-disc pl-5">
          <li><b>{t('metrics.custody')}</b>: every settlement output is either the provider's payment, a participant's credits, a participant's change or an OP_RETURN. Nothing else, so nothing is ever held.</li>
          <li><b>{t('metrics.savings')}</b>: Σ(retail × credits − pool price) over settled pools. Pool prices are <DemoPricingTag /> set by our own provider.</li>
          <li>Fees so far: <Counter value={m.feeSats} size="s" unit="sat" /> · guard refusals: <Counter value={m.deniedByGuard} size="s" tone="danger" /> · pools that did not fill: <Counter value={m.failedPools} size="s" /></li>
          <li>GPU jobs are <SimulatedJobsTag />; payments, credits and settlements are real transactions in live mode.</li>
        </ul>
      </Signboard>
      <Signboard title="Harbor · Coop Rail" data-testid="rail-signboard"><RailCard /></Signboard>
      {mode === 'live' && (
        <Signboard title="Coordinator /metrics (Track B, computed from the chain)">
          {live.isError ? <p className="text-ink-muted">The coordinator's /metrics is not answering ({String((live.error as Error).message)}).</p>
            : live.data === undefined ? <LoadingState title="Asking the coordinator…" />
              : <pre className="whitespace-pre-wrap break-all text-[14px] leading-5">{JSON.stringify(live.data, null, 1)}</pre>}
        </Signboard>
      )}
    </div>
  )
}

const stub = (title: string, body: string) => function StubPage () {
  return <div className="mx-auto max-w-[1280px] p-6"><Signboard title={title}><EmptyState sprite="board" title={title} body={body} /></Signboard></div>
}

export const SettingsPage = stub('Settings', 'Sound, day/night and replay speed live in the top bar for now.')
