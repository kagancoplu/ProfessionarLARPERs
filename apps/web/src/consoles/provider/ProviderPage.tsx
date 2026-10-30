/** /provider — mint credits, open a pool, my pools, cancel, revenue (track-E §4.2 provider). */
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useFlows, useRuntime } from '../../app-context'
import { t } from '../../i18n/t'
import { useShallowStore, useStore } from '../../store'
import { selectPools } from '../../store/selectors'
import { TownDrawer } from '../../town/TownDrawer'
import { Counter, DemoPricingTag, EmptyState, PixelButton, Signboard, Tag, TxLink, formatInt } from '../../ui'
import { UnderTheHood } from '../../ui/UnderTheHood'
import { useMine } from '../../wallet/mine'

const num = (v: string): number => Number(v)

export function ProviderPage () {
  const me = useStore(s => s.me)
  const { wallet } = useRuntime()
  const flows = useFlows()
  const tokenId = useMine(s => s.tokenId)
  const myPools = useShallowStore(selectPools()).filter(p => p.terms.provider === me.identityKey)
  const [sym, setSym] = useState('GPUH')
  const [amt, setAmt] = useState('100000')
  const [draft, setDraft] = useState({ label: '8×H100 · 1 week', credits: '1000', priceSats: '25000', feeSats: '100', minCredits: '50', deadlineBlocks: '60' })
  const [busy, setBusy] = useState<string>()
  const [error, setError] = useState<string>()
  const [last, setLast] = useState<string>()
  const revenue = useQuery({ queryKey: ['revenue', me.identityKey], queryFn: () => flows.revenue(), enabled: me.status === 'connected', retry: 0 })
  const run = async (label: string, fn: () => Promise<string | undefined>): Promise<void> => { setBusy(label); setError(undefined); try { setLast(await fn()) } catch (err) { setError(String((err as Error).message)) } finally { setBusy(undefined); void revenue.refetch() } }
  const perCredit = num(draft.priceSats) / Math.max(1, num(draft.credits))
  if (me.status !== 'connected') {
    return <div className="mx-auto max-w-[1280px] p-6"><Signboard title="Provider workshop"><EmptyState sprite="board" title="Connect BSV Desktop to run the workshop." body="Mint your credit token, open a pool with one signed offer, collect revenue. Every signature is yours." action={<PixelButton onClick={() => { void wallet.connect().catch(() => {}) }}>{t('wallet.connect')}</PixelButton>} /></Signboard></div>
  }
  return (
    <div className="mx-auto grid max-w-[1280px] grid-cols-[2fr_1fr] gap-6 p-6" data-testid="provider">
      <div className="flex flex-col gap-6">
        <Signboard title="1 · Mint credits (BSV-21)">
          {tokenId !== undefined
            ? <p className="text-[14px] leading-5">Your credit token: <span className="mono">{tokenId}</span> <Tag tone="ok">minted</Tag><br /><span className="text-ink-muted">Write it into <code>apps/provider-api/products/gpu-h100.json</code> (<code>tokenId</code>) so the provider API accepts redeems.</span></p>
            : (
              <div className="flex flex-wrap items-end gap-3">
                <label className="flex flex-col gap-1"><span className="label">Symbol</span><input value={sym} onChange={e => setSym(e.target.value.toUpperCase())} maxLength={8} className="w-28 border-2 border-ink bg-surface-2 px-2 py-1" data-testid="mint-sym" /></label>
                <label className="flex flex-col gap-1"><span className="label">Units (1 = 1 GPU-hour)</span><input value={amt} onChange={e => setAmt(e.target.value)} className="w-32 border-2 border-ink bg-surface-2 px-2 py-1 counter text-[20px]" /></label>
                <PixelButton loading={busy === 'mint'} onClick={() => { void run('mint', async () => (await flows.mint({ sym, amt: BigInt(amt || '0'), dec: 0 })).txid) }} data-testid="mint">Mint in BSV Desktop</PixelButton>
              </div>
            )}
        </Signboard>
        <Signboard title="2 · Open a pool" actions={<DemoPricingTag />}>
          <div className="grid grid-cols-3 gap-3">
            {([['label', 'Label', 'text'], ['credits', 'Credits (N)', 'number'], ['priceSats', 'Block price (sat)', 'number'], ['feeSats', 'Registration fee (sat)', 'number'], ['minCredits', 'Min pledge', 'number'], ['deadlineBlocks', 'Deadline (+blocks)', 'number']] as const).map(([k, label, type]) => (
              <label key={k} className="flex flex-col gap-1"><span className="label">{label}</span><input type={type} value={draft[k]} onChange={e => setDraft({ ...draft, [k]: e.target.value })} className={`border-2 border-ink bg-surface-2 px-2 py-1 ${type === 'number' ? 'counter text-[20px]' : ''}`} data-testid={`pool-${k}`} /></label>
            ))}
          </div>
          <p className="mt-2 text-[14px] leading-5"><b>{perCredit.toFixed(1)} sat/credit</b> vs retail 50 → {Math.round(100 * (1 - perCredit / 50))} % off <DemoPricingTag /> · deadline ≈ {Math.round(num(draft.deadlineBlocks) * 10 / 60)} h · 2 approvals in BSV Desktop (reserve + announce, offer SIGHASH_SINGLE|ANYONECANPAY) + 1 to publish the offer on chain</p>
          <PixelButton className="mt-2" loading={busy === 'openPool'} disabled={tokenId === undefined} onClick={() => { void run('openPool', async () => (await flows.openPool({ label: draft.label, credits: num(draft.credits), priceSats: num(draft.priceSats), feeSats: num(draft.feeSats), minCredits: num(draft.minCredits), deadlineBlocks: num(draft.deadlineBlocks) })).txid) }} data-testid="open-pool">Open the pool in BSV Desktop</PixelButton>
        </Signboard>
        <Signboard title="3 · My pools">
          {myPools.length === 0 ? <p className="text-ink-muted text-[14px]">No pool of yours on the overlay yet.</p> : (
            <table className="w-full border-collapse text-[14px] leading-5" data-testid="my-pools">
              <thead><tr className="label bg-surface-3 text-left text-[12px]"><th className="px-2 py-1">Pool</th><th className="px-2 py-1">Status</th><th className="px-2 py-1 text-right">Pledged</th><th className="px-2 py-1">tx</th><th /></tr></thead>
              <tbody>{myPools.map(p => (
                <tr key={p.poolId} className="border-b border-surface-3">
                  <td className="px-2 py-1">{p.terms.label}</td>
                  <td className="px-2 py-1"><Tag tone={p.status === 'settled' ? 'ok' : p.status === 'open' ? 'info' : p.status === 'locking' ? 'warn' : 'danger'}>{p.status}</Tag></td>
                  <td className="px-2 py-1 text-right counter text-[18px]">{formatInt(p.pledgedCredits)}/{formatInt(p.terms.credits)}</td>
                  <td className="px-2 py-1"><TxLink txid={p.settledTxid ?? p.txid} chars={4} /></td>
                  <td className="px-2 py-1">{p.status === 'open' && <PixelButton size="sm" variant="ghost" loading={busy === `cancel:${p.poolId}`} onClick={() => { void run(`cancel:${p.poolId}`, async () => (await flows.cancelPool(p.poolId)).txid) }}>cancel</PixelButton>}</td>
                </tr>
              ))}</tbody>
            </table>
          )}
        </Signboard>
        <Signboard title="4 · Revenue (pledge fees + settlements, your Desktop wallet)">
          <div className="flex flex-wrap items-center gap-4">
            <Counter value={revenue.data?.satoshis ?? 0} size="s" unit={`sat in ${revenue.data?.outputs ?? 0} output(s)`} tone="gold" />
            <PixelButton size="sm" variant="secondary" loading={busy === 'sync'} onClick={() => { void run('sync', async () => { const r = await flows.syncRevenue(); return r.added === 0 ? undefined : `synced ${r.added}` }) }}>Sync from the overlay</PixelButton>
            <PixelButton size="sm" loading={busy === 'sweep'} onClick={() => { void run('sweep', async () => (await flows.sweepRevenue())?.txid) }}>Sweep into my balance (BSV Desktop)</PixelButton>
          </div>
          <p className="mt-2 text-[14px] leading-5 text-ink-muted">Retail 402 revenue lands in the provider-api server wallet, not here.</p>
        </Signboard>
        {error !== undefined && <p className="text-[14px] leading-5 text-danger-dark">{error}</p>}
        {last !== undefined && last.startsWith('mock_') && <p className="text-[14px] leading-5">Last: <TxLink txid={last} /></p>}
        {last !== undefined && !last.startsWith('mock_') && last.length === 64 && <p className="text-[14px] leading-5">Last: <TxLink txid={last} /></p>}
      </div>
      <UnderTheHood flows={['mint', 'openPool', 'cancelPool', 'syncRevenue', 'sweepRevenue']} />
      <TownDrawer />
    </div>
  )
}
