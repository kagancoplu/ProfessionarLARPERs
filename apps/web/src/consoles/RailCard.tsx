/** Coop Rail (Track D.P3, experimental): the harbor office. A quote from the maker, the rules, the last Rail events. The swap itself has no API yet. */
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { makerApi } from '../api/maker'
import { useStore } from '../store'
import { Counter, ExperimentalTag, PixelButton, Tag, TxLink, formatInt } from '../ui'

export function RailCard () {
  const mode = useStore(s => s.mode)
  const health = useStore(s => s.health.maker)
  const feed = useStore(s => s.feed)
  const [usdc, setUsdc] = useState('0.50')
  const [asked, setAsked] = useState<string>()
  const quote = useQuery({ queryKey: ['rail-quote', asked], queryFn: () => makerApi.quote(asked!), enabled: asked !== undefined, retry: 0 })
  const rail = [...feed].reverse().filter(e => e.src === 'maker').slice(0, 6)
  const closed = mode === 'live' && health.ok === false
  return (
    <div className="flex flex-col gap-3" data-testid="rail-card">
      <div className="flex flex-wrap items-center gap-2"><span className="font-display text-[20px] leading-7">Coop Rail · USDC (Base) → BSV</span><ExperimentalTag /><Tag tone={health.ok === true ? 'ok' : health.ok === false ? 'danger' : 'neutral'}>maker {health.ok === true ? 'up' : health.ok === false ? 'down' : 'unknown'}</Tag></div>
      <p className="text-[14px] leading-5">An agent locks USDC on Base; the maker funds a BSV HTLC that only <b>agent + guard</b> can claim, so the money lands in the <b>vault</b> under the owner's policy. Refund paths on both sides (Base after T, BSV after H+6). Proven offline on a mock chain and an in-memory EVM; not run on Base Sepolia or mainnet yet.</p>
      {closed
        ? <p className="border-2 border-wood-dark bg-surface-3 p-2 text-[14px] leading-5">Harbor closed for the season: the maker is not answering. Quotes come back when <code>npm run maker</code> runs.</p>
        : (
          <div className="flex flex-wrap items-end gap-2">
            <label className="flex flex-col gap-1"><span className="label">USDC</span><input value={usdc} onChange={e => setUsdc(e.target.value)} className="w-24 border-2 border-ink bg-surface-2 px-2 py-1 counter text-[20px]" data-testid="rail-usdc" /></label>
            <PixelButton size="sm" loading={quote.isFetching} onClick={() => setAsked(String(Math.round(Number(usdc) * 1_000_000)))} data-testid="rail-quote">Ask the maker for a quote</PixelButton>
            {quote.data !== undefined && <span className="flex items-baseline gap-2" data-testid="rail-quote-result"><Counter value={quote.data.sats} size="s" unit="sat" tone="gold" /><span className="text-[14px] text-ink-muted">at {quote.data.satsPerUsdc} sat/USDC, spread {quote.data.spreadBps} bps, valid until {new Date(quote.data.expiresAt).toLocaleTimeString('en-GB', { hour12: false })}</span></span>}
            {quote.isError && <span className="text-[14px] text-danger-dark">{String((quote.error as Error).message)}</span>}
          </div>
        )}
      <p className="text-[14px] leading-5 text-ink-muted">At most 1 USDC and 1 000 sat per swap (PoC); fixed rate plus spread, no oracle. Locking USDC with MetaMask arrives with the maker's swap API (Track D, Faz 5 A).</p>
      <div>
        <p className="label text-ink-muted">Last Rail events</p>
        {rail.length === 0 ? <p className="text-[14px] text-ink-muted">No boat has crossed yet.</p> : rail.map(e => (
          <p key={e.id} className="flex flex-wrap items-center gap-2 border-b border-surface-3 py-1 text-[14px] leading-5"><Tag tone="info">{e.type.replace('rail_', '').replace('_', ' ')}</Tag>{e.txid !== undefined && <TxLink txid={e.txid} chars={4} />}{'quote' in e.data && <span>{formatInt(String((e.data as { quote: string }).quote))} sat for {Number((e.data as { amount: string }).amount) / 1_000_000} USDC</span>}</p>
        ))}
      </div>
    </div>
  )
}
