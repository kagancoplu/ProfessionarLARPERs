import { isMockTxid, shortHex, wocTxUrl } from '../api/woc'
import { cn } from './cn'
import { MockTag } from './Tag'

/** `ab12…cd34` in VT323 + WhatsOnChain link; `mock_` ids get a MOCK tag and no link. */
export function TxLink ({ txid, className, chars = 6 }: { txid: string, className?: string, chars?: number }) {
  const url = wocTxUrl(txid)
  return (
    <span className={cn('inline-flex items-center gap-2', className)}>
      {url === undefined
        ? <span className="mono" title={txid}>{isMockTxid(txid) ? txid : shortHex(txid, chars)}</span>
        : <a className="mono" href={url} target="_blank" rel="noopener noreferrer" title={`${txid} on WhatsOnChain`}>{shortHex(txid, chars)}↗</a>}
      {isMockTxid(txid) && <MockTag />}
    </span>
  )
}
