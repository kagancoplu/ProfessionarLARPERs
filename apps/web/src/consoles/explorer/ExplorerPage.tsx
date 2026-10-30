/** /explorer — every transaction (T1–T11) with its type, actor and WhatsOnChain link; notifications; the real mainnet runs. */
import { useState } from 'react'
import { store, useStore } from '../../store'
import { selectTxs } from '../../store/selectors'
import { TownDrawer } from '../../town/TownDrawer'
import { EmptyState, Signboard, Tag, TxLink } from '../../ui'
import { t } from '../../i18n/t'
import { MainnetProof } from './MainnetProof'

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
      <div className="flex flex-col gap-6">
      <MainnetProof />
      <Signboard title="Notifications">
        {notifications.length === 0 ? <p className="text-ink-muted">Sign requests and guard refusals land here.</p> : notifications.map(n => (
          <div key={n.id} className="border-b border-surface-3 py-2 last:border-0">
            <div className="flex items-center gap-2"><Tag tone={n.kind === 'error' ? 'danger' : n.kind === 'sign_request' ? 'warn' : 'info'}>{n.kind}</Tag><span className="font-display">{n.title}</span></div>
            {n.body !== undefined && <p className="text-[14px] leading-5">{n.body}</p>}
          </div>
        ))}
      </Signboard>
      </div>
    </div>
  )
}
