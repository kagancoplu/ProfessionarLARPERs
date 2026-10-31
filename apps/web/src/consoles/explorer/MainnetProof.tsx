/** "Already on mainnet": the project's real transactions, shown in every mode (mock included) with WhatsOnChain links. */
import { MAINNET_TXS } from '../../proof/mainnet'
import { Signboard, Tag } from '../../ui'

const woc = (txid: string): string => `https://whatsonchain.com/tx/${txid}`

export function MainnetProof ({ compact = false }: { compact?: boolean }) {
  const rows = compact ? MAINNET_TXS.filter(t => t.kind === 'T5' || t.via === 'BSV Desktop') : MAINNET_TXS
  return (
    <Signboard title={<span className="flex items-center gap-2">Already on BSV mainnet <Tag tone="ok">real</Tag></span>} data-testid="mainnet-proof">
      <p className="mb-2 text-[14px] leading-5 text-ink-muted">Whatever this page is showing (mock, replay or live), these transactions happened on chain. Each opens on WhatsOnChain.</p>
      <ul className="m-0 list-none p-0 flex flex-col gap-1">
        {rows.map(t => (
          <li key={t.txid} className="flex flex-wrap items-center gap-2 border-b border-surface-3 py-1 text-[14px] leading-5">
            <Tag tone={t.kind === 'T5' ? 'gold' : 'neutral'}>{t.kind}</Tag>
            <span className="flex-1">{t.what}</span>
            <Tag tone={t.via === 'BSV Desktop' ? 'info' : 'neutral'}>{t.via}</Tag>
            <a className="mono text-[16px]" href={woc(t.txid)} target="_blank" rel="noopener noreferrer">{t.txid.slice(0, 6)}…{t.txid.slice(-4)} ↗</a>
          </li>
        ))}
      </ul>
    </Signboard>
  )
}
