/** /market — the stalls: listings (cheapest per credit first), buy several in one sweep, sell your credits, cancel (track-E §4.2 market). */
import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useFlows, useRuntime } from '../../app-context'
import type { Listing } from '../../api/types'
import { t } from '../../i18n/t'
import { useShallowStore, useStore } from '../../store'
import { selectListings, selectPools } from '../../store/selectors'
import { TownDrawer } from '../../town/TownDrawer'
import { Counter, DemoPricingTag, EmptyState, IdentityChip, PixelButton, Scroll, Signboard, Tag, TxLink, formatInt } from '../../ui'
import { UnderTheHood } from '../../ui/UnderTheHood'

const input = 'border-2 border-ink bg-surface-2 px-2 py-1'
const perCredit = (l: Listing): number => Number(l.askSats) / Number(l.credits)

export function MarketPage () {
  const me = useStore(s => s.me)
  const { wallet } = useRuntime()
  const flows = useFlows()
  const listings = useShallowStore(selectListings)
  const pools = useShallowStore(selectPools())
  const retail = Number(pools[0]?.terms.retailSatsPerCredit ?? 50)
  const feedLen = useStore(s => s.feed.length)
  const credits = useQuery({ queryKey: ['my-credits', me.identityKey, Math.floor(feedLen / 3)], queryFn: () => flows.credits(), enabled: me.status === 'connected', retry: 0 })
  const [selected, setSelected] = useState<string[]>([])
  const [review, setReview] = useState(false)
  const [sell, setSell] = useState({ credits: '10', askSats: '300' })
  const [busy, setBusy] = useState<string>()
  const [error, setError] = useState<string>()
  const [last, setLast] = useState<string>()
  useEffect(() => { void flows.listings().catch(() => []) }, [flows])
  const run = async (label: string, fn: () => Promise<string | undefined>): Promise<void> => { setBusy(label); setError(undefined); try { setLast(await fn()) } catch (err) { setError(String((err as Error).message)) } finally { setBusy(undefined); void credits.refetch() } }
  const picked = listings.filter(l => selected.includes(l.outpoint))
  const total = picked.reduce((a, l) => a + Number(l.askSats), 0)
  const totalCredits = picked.reduce((a, l) => a + Number(l.credits), 0)
  const myCredits = credits.data?.reduce((a, b) => a + b.basket, 0n) ?? 0n
  const toggle = (o: string): void => setSelected(s => (s.includes(o) ? s.filter(x => x !== o) : [...s, o]))
  return (
    <div className="mx-auto grid max-w-[1280px] grid-cols-[2fr_1fr] gap-6 p-6" data-testid="market">
      <div className="flex flex-col gap-6">
        <Signboard title="Stalls · credits for sale" actions={<DemoPricingTag />}>
          {listings.length === 0 ? <EmptyState sprite="sack" title="The stalls are empty." body="Listings appear when an agent or a human puts spare credits up for sale. A sweep buys several in one transaction; the seller can be offline." /> : (
            <table className="w-full border-collapse text-[14px] leading-5" data-testid="listings">
              <thead><tr className="label bg-surface-3 text-left text-[12px]"><th className="px-2 py-1" /><th className="px-2 py-1 text-right">Credits</th><th className="px-2 py-1 text-right">Ask</th><th className="px-2 py-1 text-right">sat/credit</th><th className="px-2 py-1">Seller</th><th className="px-2 py-1">Outpoint</th><th /></tr></thead>
              <tbody>{listings.map(l => {
                const mineListing = l.seller === me.identityKey
                return (
                  <tr key={l.outpoint} className="border-b border-surface-3 hover:bg-surface-3" data-testid="listing-row">
                    <td className="px-2 py-1">{!mineListing && <input type="checkbox" checked={selected.includes(l.outpoint)} onChange={() => toggle(l.outpoint)} aria-label={`select listing ${l.outpoint}`} data-testid="listing-select" />}</td>
                    <td className="px-2 py-1 text-right counter text-[18px]">{formatInt(l.credits)}</td>
                    <td className="px-2 py-1 text-right counter text-[18px]">{formatInt(l.askSats)} sat</td>
                    <td className="px-2 py-1 text-right">{perCredit(l).toFixed(1)} <span className="text-ink-muted">vs {retail}</span> <Tag tone={perCredit(l) < retail ? 'ok' : 'warn'}>{Math.round(100 * (1 - perCredit(l) / retail))} %</Tag></td>
                    <td className="px-2 py-1"><IdentityChip identity={l.seller} role={mineListing ? 'me' : 'agent'} compact /></td>
                    <td className="px-2 py-1"><TxLink txid={l.outpoint.split(/[_.]/)[0]!} chars={4} /></td>
                    <td className="px-2 py-1">{mineListing && <PixelButton size="sm" variant="ghost" loading={busy === `cancel:${l.outpoint}`} onClick={() => { void run(`cancel:${l.outpoint}`, async () => (await flows.cancelListing(l.outpoint)).txid) }} data-testid="cancel-listing">cancel</PixelButton>}</td>
                  </tr>
                )
              })}</tbody>
            </table>
          )}
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <PixelButton disabled={picked.length === 0 || me.status !== 'connected'} onClick={() => setReview(true)} data-testid="buy-selected">Buy {picked.length > 0 ? `${picked.length} listing(s) · ${formatInt(total)} sat` : 'selected'}</PixelButton>
            {me.status !== 'connected' && <PixelButton variant="secondary" onClick={() => { void wallet.connect().catch(() => {}) }}>{t('wallet.connect')}</PixelButton>}
          </div>
        </Signboard>
        <Signboard title="Sell credits">
          {me.status !== 'connected' ? <p className="text-ink-muted text-[14px]">Connect BSV Desktop to list your credits.</p> : (
            <div className="flex flex-wrap items-end gap-3">
              <div><p className="label text-ink-muted">Your credits</p><span data-testid="market-credits"><Counter value={Number(myCredits)} size="s" /></span></div>
              <label className="flex flex-col gap-1"><span className="label">Credits</span><input type="number" min={1} value={sell.credits} onChange={e => setSell({ ...sell, credits: e.target.value })} className={`${input} w-28 counter text-[20px]`} data-testid="sell-credits" /></label>
              <label className="flex flex-col gap-1"><span className="label">Ask (sat, total)</span><input type="number" min={1} value={sell.askSats} onChange={e => setSell({ ...sell, askSats: e.target.value })} className={`${input} w-32 counter text-[20px]`} data-testid="sell-ask" /></label>
              <span className="text-[14px] text-ink-muted">{(Number(sell.askSats) / Math.max(1, Number(sell.credits))).toFixed(1)} sat/credit vs retail {retail} <DemoPricingTag /></span>
              <PixelButton loading={busy === 'list'} disabled={myCredits < BigInt(sell.credits || '0') || Number(sell.credits) < 1} onClick={() => { void run('list', async () => (await flows.listCredits(Number(sell.credits), Number(sell.askSats))).txid) }} data-testid="sell">List at the stall (2 approvals)</PixelButton>
            </div>
          )}
          <p className="mt-2 text-[14px] leading-5 text-ink-muted">Listing = your credits moved to a listing key + one SIGHASH_SINGLE|ANYONECANPAY signature ("the output at my index pays me the ask"). Buyers can sweep it while you are offline; cancelling is spending it back.</p>
        </Signboard>
        {error !== undefined && <p className="text-[14px] leading-5 text-danger-dark">{error}</p>}
        {last !== undefined && <p className="text-[14px] leading-5">Last: <TxLink txid={last} /></p>}
      </div>
      <UnderTheHood flows={['list', 'cancelListing', 'sweep']} />
      <Scroll open={review} title="Sweep the stall" id="sweep-review" onClose={() => setReview(false)} footer={<>
        <PixelButton variant="secondary" onClick={() => setReview(false)}>Cancel</PixelButton>
        <PixelButton loading={busy === 'sweep'} onClick={() => { void run('sweep', async () => { const r = await flows.sweep(picked.map(l => l.outpoint)); setSelected([]); setReview(false); return r.txid }) }} data-testid="sweep-confirm">{t('wallet.approveHint')}</PixelButton>
      </>}>
        <ul className="m-0 list-none p-0 flex flex-col gap-1 text-[14px] leading-5" data-testid="sweep-summary">
          {picked.map(l => <li key={l.outpoint}>{formatInt(l.credits)} credits for <b>{formatInt(l.askSats)} sat</b> → seller <span className="mono text-[16px]">{l.seller.slice(0, 10)}…</span></li>)}
          <li className="mt-1 border-t border-surface-3 pt-1"><b>{formatInt(total)} sat</b> in total, <b>{formatInt(totalCredits)} credits</b> to your bsv21 basket, one transaction</li>
          <li>Each listing is checked against its source transaction, and the credits' lineage back to the deploy (SPV) before anything is signed</li>
          <li>1 approval in BSV Desktop (<code>createAction</code>, SIGHASH_ALL)</li>
        </ul>
      </Scroll>
      <TownDrawer />
    </div>
  )
}
