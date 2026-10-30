/**
 * P0 pages: the Town square shows the live feed and corner counters; the other consoles are
 * concrete placeholders that already read the store (lists arrive in P1–P3).
 */
import { useShallowStore, useStore } from '../store'
import { selectAgents, selectMetrics, selectPools, selectTxs } from '../store/selectors'
import { Counter, DemoPricingTag, formatInt, EmptyState, IdentityChip, Signboard, SimulatedJobsTag, Tag, TxLink } from '../ui'
import { t } from '../i18n/t'
import { LiveFeed } from './LiveFeed'

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
      <CornerCounters />
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
      <p className="text-ink-muted text-[14px] leading-5">The pixel-art square (Phaser) arrives in Phase 1; this page is the ledger view of the same store.</p>
    </div>
  )
}

export function PoolsPage () {
  const pools = useShallowStore(selectPools())
  return (
    <div className="mx-auto max-w-[1280px] p-6">
      <Signboard title="Pools" actions={<DemoPricingTag />}>
        {pools.length === 0 ? <EmptyState title="No pools yet." body={t('states.noPools')} /> : (
          <table className="w-full border-collapse text-[14px] leading-5">
            <thead><tr className="label bg-surface-3 text-left text-[12px]"><th className="px-3 py-2">Pool</th><th className="px-3 py-2">Status</th><th className="px-3 py-2 text-right">Pledged</th><th className="px-3 py-2 text-right">Price</th><th className="px-3 py-2">Settlement</th></tr></thead>
            <tbody>{pools.map(p => (
              <tr key={p.poolId} className="h-10 border-b border-surface-3 hover:bg-surface-3">
                <td className="px-3">{p.terms.label}</td>
                <td className="px-3"><Tag tone={p.status === 'settled' ? 'ok' : p.status === 'failed' || p.status === 'cancelled' ? 'danger' : p.status === 'locking' ? 'warn' : 'neutral'}>{p.status}</Tag></td>
                <td className="px-3 text-right counter text-[18px]">{formatInt(p.pledgedCredits)} / {formatInt(p.terms.credits)}</td>
                <td className="px-3 text-right counter text-[18px]">{formatInt(p.terms.priceSats)} sat</td>
                <td className="px-3">{p.settledTxid !== undefined ? <TxLink txid={p.settledTxid} chars={4} /> : <span className="text-ink-muted">—</span>}</td>
              </tr>
            ))}</tbody>
          </table>
        )}
      </Signboard>
    </div>
  )
}

export function AgentsPage () {
  const agents = useShallowStore(selectAgents)
  return (
    <div className="mx-auto grid max-w-[1280px] grid-cols-3 gap-4 p-6">
      {agents.length === 0 && <EmptyState title="No agents in the square yet." body="Agents appear when their event stream (or the mock scenario) starts." />}
      {agents.map(a => (
        <Signboard key={a.identity} title={<span className="flex items-center gap-2">{a.name} <Tag tone={a.mode === 'vault' ? 'gold' : 'neutral'}>{a.mode ?? 'p2pkh'}</Tag></span>}>
          <IdentityChip identity={a.identity} role="agent" />
          {a.lastThought !== undefined && <p className="mt-2 italic">“{a.lastThought.text}”</p>}
          {a.lastDecision !== undefined && <p className="mt-2 text-[14px] leading-5"><Tag tone={a.lastDecision.action === 'reject' ? 'danger' : 'ok'}>{a.lastDecision.action}</Tag> {a.lastDecision.reason}</p>}
          {a.injected !== undefined && <p className="mt-2 border-2 border-danger-dark bg-surface-3 p-2 text-[14px] leading-5">Injected: “{a.injected.text}”</p>}
        </Signboard>
      ))}
    </div>
  )
}

export function ExplorerPage () {
  const txs = useStore(selectTxs)
  const notifications = useStore(s => s.notifications)
  return (
    <div className="mx-auto grid max-w-[1280px] grid-cols-[2fr_1fr] gap-6 p-6">
      <Signboard title="Transactions">
        {txs.length === 0 ? <EmptyState title="No transactions yet." body={t('states.noTxs')} /> : (
          <table className="w-full border-collapse text-[14px] leading-5" data-testid="tx-table">
            <thead><tr className="label bg-surface-3 text-left text-[12px]"><th className="px-3 py-2">Type</th><th className="px-3 py-2">What</th><th className="px-3 py-2">txid</th><th className="px-3 py-2">When</th></tr></thead>
            <tbody>{txs.map(tx => (
              <tr key={tx.id} className="h-10 border-b border-surface-3 hover:bg-surface-3">
                <td className="px-3"><Tag tone={tx.kind === 'T5' ? 'gold' : 'neutral'}>{tx.kind}</Tag></td>
                <td className="px-3">{tx.label}</td>
                <td className="px-3"><TxLink txid={tx.txid} chars={4} /></td>
                <td className="px-3 counter text-[18px] text-ink-muted">{new Date(tx.ts).toLocaleTimeString('en-GB', { hour12: false })}</td>
              </tr>
            ))}</tbody>
          </table>
        )}
      </Signboard>
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
    </div>
  )
}

const stub = (title: string, body: string) => function StubPage () {
  return <div className="mx-auto max-w-[1280px] p-6"><Signboard title={title}><EmptyState sprite="board" title={title} body={body} /></Signboard></div>
}

export const MarketPage = stub('Market stalls', 'Listings and sweeps arrive in Phase 3. Until then the live feed shows listing events.')
export const ProviderPage = stub('Provider workshop', 'Mint credits, open a pool, follow revenue: Phase 2 (BSV Desktop flows).')
export const OwnerPage = stub('Owner console', 'Create a vault, write the policy, watch the guard: Phase 3.')
export const SettingsPage = stub('Settings', 'Sound, day/night and replay speed live in the top bar for now.')
