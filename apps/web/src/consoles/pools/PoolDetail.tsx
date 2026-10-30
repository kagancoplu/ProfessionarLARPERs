import { env } from '../../env'
import { usePledges } from '../../api/queries'
import { shortHex } from '../../api/woc'
import { blocksToHuman } from '../../api/arcade'
import { useStore } from '../../store'
import { Counter, DemoPricingTag, IdentityChip, LoadingState, Tag, TxLink, formatInt } from '../../ui'
import { blocksLeft, discount, satsPerCredit } from './sort'

const STATUS_TONE = { open: 'info', locking: 'warn', settled: 'ok', failed: 'danger', cancelled: 'danger' } as const

export function PoolDetail ({ poolId }: { poolId: string }) {
  const pool = useStore(s => s.pools.byId[poolId])
  const mode = useStore(s => s.mode)
  const q = usePledges(mode === 'live' ? poolId : undefined)
  if (pool === undefined) return <p>This pool is not on the overlay.</p>
  const pledges = pool.pledges ?? []
  const left = blocksLeft(pool)
  return (
    <div className="flex flex-col gap-4" data-testid="pool-detail">
      <div>
        <div className="flex items-center justify-between gap-2"><h3>{pool.terms.label}</h3><Tag tone={STATUS_TONE[pool.status]}>{pool.status}</Tag></div>
        <p className="mono text-ink-muted">{shortHex(pool.poolId, 8)}</p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div><p className="label text-ink-muted">Pledged</p><Counter value={pool.pledgedCredits} size="s" /> <span className="text-ink-muted">/ {formatInt(pool.terms.credits)} credits</span></div>
        <div><p className="label text-ink-muted">Block price</p><Counter value={pool.terms.priceSats} size="s" unit="sat" tone="gold" /></div>
        <div><p className="label text-ink-muted flex items-center gap-1">Per credit <DemoPricingTag /></p><span className="counter text-[24px]">{satsPerCredit(pool).toFixed(0)} sat</span> <span className="text-ink-muted">vs retail {pool.terms.retailSatsPerCredit} ({Math.round(discount(pool) * 100)} % off)</span></div>
        <div><p className="label text-ink-muted">Deadline</p><span className="counter text-[24px]">{left === undefined ? `block ${pool.terms.deadlineHeight}` : left > 0 ? `Festival in ${blocksToHuman(left)}` : 'passed'}</span></div>
        <div><p className="label text-ink-muted">Registration fee</p><Counter value={pool.terms.feeSats} size="s" unit="sat / pledge" /></div>
        <div><p className="label text-ink-muted">Offer</p><Tag tone={pool.hasOffer ? 'ok' : 'warn'}>{pool.hasOffer ? 'signed (SINGLE|ACP)' : 'no offer yet'}</Tag></div>
      </div>
      <div>
        <p className="label text-ink-muted">Provider</p>
        <IdentityChip identity={pool.terms.provider} role="provider" name="provider" />
      </div>
      {pool.settledTxid !== undefined && <div><p className="label text-ink-muted">Settlement</p><TxLink txid={pool.settledTxid} chars={8} /><p className="text-[14px] leading-5 text-ink-muted">1 transaction · {pool.pledgeCount} participants · 0 sat held by anyone</p></div>}
      {pool.coordinator !== undefined && (
        <div className="border-2 border-surface-3 p-2 text-[14px] leading-5">
          <p className="label text-ink-muted">Coordinator</p>
          <p>Round {pool.coordinator.round} · {pool.coordinator.signed}/{pool.coordinator.total} signed</p>
          {pool.coordinator.blacklist.length > 0 && <ul className="m-0 pl-4">{pool.coordinator.blacklist.map(b => <li key={b.outpoint}>{shortHex(b.outpoint, 4)}: {b.reason}</li>)}</ul>}
          {pool.coordinator.lastRound !== undefined && <p>Last round {pool.coordinator.lastRound.round}: {pool.coordinator.lastRound.outcome}{pool.coordinator.lastRound.missing.length > 0 && ` (${pool.coordinator.lastRound.missing.length} missing)`}</p>}
        </div>
      )}
      <div>
        <p className="label text-ink-muted">Pledges</p>
        {q.isLoading && pledges.length === 0 ? <LoadingState title="Reading the overlay…" body="ls_agentcoop · pledges" /> : pledges.length === 0 ? <p className="text-ink-muted text-[14px]">No pledge yet. The coin stays in each wallet until settlement.</p> : (
          <table className="w-full border-collapse text-[14px] leading-5" data-testid="pledge-table">
            <thead><tr className="label bg-surface-3 text-left text-[12px]"><th className="px-2 py-1">Who</th><th className="px-2 py-1 text-right">Credits</th><th className="px-2 py-1 text-right">Coin</th><th className="px-2 py-1">State</th></tr></thead>
            <tbody>{pledges.map(p => (
              <tr key={p.outpoint} className="border-b border-surface-3">
                <td className="px-2 py-1"><IdentityChip identity={p.participant} role="agent" /></td>
                <td className="px-2 py-1 text-right counter text-[18px]">{formatInt(p.credits)}</td>
                <td className="px-2 py-1 text-right counter text-[18px]">{formatInt(p.coinSats)} sat</td>
                <td className="px-2 py-1"><Tag tone={p.spent ? (p.spendingTxid === pool.settledTxid ? 'ok' : 'neutral') : p.valid ? 'info' : 'danger'}>{p.spent ? (p.spendingTxid === pool.settledTxid ? 'settled' : 'withdrawn') : p.valid ? `in wallet${p.signer === 'vault' ? ' (vault)' : ''}` : 'invalid'}</Tag></td>
              </tr>
            ))}</tbody>
          </table>
        )}
      </div>
      {mode === 'live' && pool.status === 'settled' && <a className="text-[14px]" href={`${env.urls.coop}/pools/${pool.poolId}/audit`} target="_blank" rel="noopener noreferrer">Audit this settlement (coordinator) ↗</a>}
    </div>
  )
}
