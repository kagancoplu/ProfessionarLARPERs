/** /me — the human participant: join a pool, my pledges, my credits, redeem, run a job, return (track-E §4.2). */
import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useFlows, useRuntime } from '../../app-context'
import type { ProviderJob } from '../../api/types'
import { t } from '../../i18n/t'
import { useShallowStore, useStore } from '../../store'
import { selectPools } from '../../store/selectors'
import { TownDrawer } from '../../town/TownDrawer'
import { Counter, DemoPricingTag, EmptyState, PixelButton, Scroll, Signboard, SimulatedJobsTag, Tag, TxLink, formatInt } from '../../ui'
import { UnderTheHood } from '../../ui/UnderTheHood'
import { activePledge, useMine } from '../../wallet/mine'
import type { MyPledge } from '../../wallet/flows/types'

const pledgeCost = (price: string, credits: string, n: number, fee: string): { coin: number, fee: number } => ({ coin: Math.ceil(n * Number(price) / Number(credits)) + 1 + 300, fee: Number(fee) })

function JoinPool ({ poolId, onDone }: { poolId: string, onDone: () => void }) {
  const flows = useFlows()
  const pool = useStore(s => s.pools.byId[poolId])
  const [credits, setCredits] = useState(100)
  const [leave, setLeave] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  if (pool === undefined) return null
  const cost = pledgeCost(pool.terms.priceSats, pool.terms.credits, credits, pool.terms.feeSats)
  const join = async (): Promise<void> => {
    setBusy(true); setError(undefined)
    try { await (leave ? flows.lighthousePledge(poolId, credits) : flows.pledge(poolId, credits)); onDone() } catch (err) { setError(String((err as Error).message)) } finally { setBusy(false) }
  }
  return (
    <div className="flex flex-col gap-3" data-testid="join-form">
      <p><span className="font-display">{pool.terms.label}</span> · {formatInt(pool.pledgedCredits)}/{formatInt(pool.terms.credits)} credits pledged · {Number(pool.terms.priceSats) / Number(pool.terms.credits)} sat/credit <DemoPricingTag /></p>
      <label className="flex flex-col gap-1">
        <span className="label">Credits (GPU-hours), {pool.terms.minCredits}–{pool.terms.credits}</span>
        <input type="number" min={Number(pool.terms.minCredits)} max={Number(pool.terms.credits)} value={credits} onChange={e => setCredits(Number(e.target.value))} className="w-40 border-2 border-ink bg-surface-2 px-2 py-1 counter text-[24px]" data-testid="join-credits" />
      </label>
      <label className="flex items-start gap-2 text-[14px] leading-5" data-testid="join-leave">
        <input type="checkbox" checked={leave} onChange={e => setLeave(e.target.checked)} className="mt-1" />
        <span><b className="font-display">Sign now and leave</b> <span className="text-ink-muted">(lighthouse, A-P5)</span>: you sign once, binding your coin to <i>your</i> credits; the guard co-signs the settlement for you, so you do not wait for the 60-second round. Your coin stays withdrawable by you alone until then; no change comes back (the coin is exact).</span>
      </label>
      <ul className="m-0 list-none p-0 flex flex-col gap-1 text-[14px] leading-5">
        <li><b>{formatInt(cost.coin)} sat</b> pledge coin: locked to <i>your own</i> key, stays in your wallet until the settlement (includes a 300 sat buffer for your fee share)</li>
        <li><b>{formatInt(cost.fee)} sat</b> registration fee → the provider (non-refundable, anti-griefing)</li>
        <li>{leave ? <>2 approvals in BSV Desktop (<code>createAction</code> for the coin, fee and record; <code>createSignature</code> SINGLE|ANYONECANPAY for your credits)</> : <>1 approval in BSV Desktop (<code>createAction</code>, outputs: coin, fee, OP_RETURN record)</>}</li>
      </ul>
      {error !== undefined && <p className="text-[14px] leading-5 text-danger-dark">{error}</p>}
      <div className="flex gap-2"><PixelButton loading={busy} onClick={() => { void join() }} data-testid="join-confirm">{t('wallet.approveHint')}</PixelButton><PixelButton variant="secondary" onClick={onDone}>Cancel</PixelButton></div>
    </div>
  )
}

const STATUS_TONE = { pending: 'info', signed: 'warn', settled: 'ok', failed: 'danger', withdrawn: 'neutral', 'left-out': 'neutral' } as const

function MyPledges ({ onCancelled }: { onCancelled: () => void }) {
  const pledges = useMine(s => s.pledges)
  const flows = useFlows()
  const [busy, setBusy] = useState<string>()
  const cancel = async (p: MyPledge): Promise<void> => { setBusy(p.outpoint); try { await flows.cancelPledge(p.outpoint); onCancelled() } finally { setBusy(undefined) } }
  if (pledges.length === 0) return <p className="text-ink-muted text-[14px]">No pledges yet. Pick an open pool above.</p>
  return (
    <table className="w-full border-collapse text-[14px] leading-5" data-testid="my-pledges">
      <thead><tr className="label bg-surface-3 text-left text-[12px]"><th className="px-2 py-1">Pool</th><th className="px-2 py-1 text-right">Credits</th><th className="px-2 py-1 text-right">Coin</th><th className="px-2 py-1">State</th><th className="px-2 py-1">tx</th><th /></tr></thead>
      <tbody>{pledges.map(p => (
        <tr key={p.outpoint} className="border-b border-surface-3">
          <td className="px-2 py-1">{p.label}</td>
          <td className="px-2 py-1 text-right counter text-[18px]">{formatInt(p.credits)}</td>
          <td className="px-2 py-1 text-right counter text-[18px]">{formatInt(p.coinSats)} sat</td>
          <td className="px-2 py-1"><Tag tone={STATUS_TONE[p.status]}>{p.status}</Tag>{p.mode === 'lighthouse' && <Tag tone="info" title="Signed at pledge time; the guard co-signs the settlement">left</Tag>}</td>
          <td className="px-2 py-1"><TxLink txid={p.settledTxid ?? p.txid} chars={4} /></td>
          <td className="px-2 py-1">{(p.status === 'pending' || (p.mode === 'lighthouse' && p.status === 'signed')) && <PixelButton size="sm" variant="ghost" loading={busy === p.outpoint} onClick={() => { void cancel(p) }}>withdraw</PixelButton>}</td>
        </tr>
      ))}</tbody>
    </table>
  )
}

function Credits () {
  const flows = useFlows()
  const me = useStore(s => s.me.identityKey)
  const feedLen = useStore(s => s.feed.length)
  const credits = useQuery({ queryKey: ['my-credits', me, Math.floor(feedLen / 3)], queryFn: () => flows.credits(), enabled: me !== undefined, retry: 0, refetchInterval: 4_000 })
  const prepaid = useQuery({ queryKey: ['my-prepaid', me, Math.floor(feedLen / 3)], queryFn: () => flows.prepaid(), enabled: me !== undefined, retry: 0, refetchInterval: 4_000 })
  const [amount, setAmount] = useState(1)
  const [kind, setKind] = useState('eval')
  const [minutes, setMinutes] = useState(45)
  const [busy, setBusy] = useState<string>()
  const [error, setError] = useState<string>()
  const [job, setJob] = useState<ProviderJob>()
  const run = async (label: string, fn: () => Promise<void>): Promise<void> => { if (busy !== undefined) return; setBusy(label); setError(undefined); try { await fn() } catch (err) { setError(String((err as Error).message)) } finally { setBusy(undefined); void credits.refetch(); void prepaid.refetch() } }
  useEffect(() => {
    if (job === undefined || job.status === 'done' || job.status === 'failed') return
    const id = setInterval(() => { void flows.job(job.id).then(setJob).catch(() => {}) }, 800)
    return () => clearInterval(id)
  }, [job, flows])
  const total = (credits.data ?? []).reduce((a, b) => a + b.overlay, 0n)
  const minutesLeft = (prepaid.data ?? []).reduce((a, b) => a + b.prepaidMinutes, 0)
  const price = minutesLeft >= minutes ? 0 : Math.ceil(minutes * 50 / 60)
  return (
    <div className="flex flex-col gap-4" data-testid="my-credits">
      <div className="flex flex-wrap items-baseline gap-6">
        <span data-testid="credit-balance"><Counter value={total} size="m" unit="credits (GPU-hours) in my wallet" tone="gold" /></span>
        <span data-testid="prepaid-minutes"><Counter value={minutesLeft} size="m" unit="prepaid minutes at the provider" /></span>
      </div>
      {credits.isError && <p className="text-[14px] text-danger-dark">Could not read credits: {String((credits.error as Error).message)}</p>}
      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-2 border-2 border-surface-3 p-3">
          <p className="label">Use credits (redeem ≤ 20)</p>
          <p className="text-[14px] leading-5 text-ink-muted">Sends credits to the provider's token address; the provider verifies the lineage and books 60 prepaid minutes per credit. Short-lived, returnable.</p>
          <div className="flex items-center gap-2"><input type="number" min={1} max={20} value={amount} onChange={e => setAmount(Number(e.target.value))} aria-label="Credits to redeem" className="w-20 border-2 border-ink bg-surface-2 px-2 py-1 counter text-[20px]" data-testid="redeem-amount" /><PixelButton size="sm" loading={busy === 'redeem'} onClick={() => { void run('redeem', async () => { await flows.redeem(amount) }) }} data-testid="redeem">Redeem in BSV Desktop</PixelButton></div>
          <div className="flex items-center gap-2"><PixelButton size="sm" variant="secondary" loading={busy === 'return'} onClick={() => { void run('return', async () => { await flows.returnCredits(Math.max(1, Math.floor(minutesLeft / 60))) }) }} disabled={minutesLeft < 60}>Return unused whole credits</PixelButton></div>
        </div>
        <div className="flex flex-col gap-2 border-2 border-surface-3 p-3">
          <p className="label flex items-center gap-2">Run a job <SimulatedJobsTag /></p>
          <div className="flex items-center gap-2">
            <select aria-label="Job kind" value={kind} onChange={e => setKind(e.target.value)} className="border-2 border-ink bg-surface-2 px-2 py-1">{['finetune', 'eval', 'inference'].map(k => <option key={k} value={k}>{k}</option>)}</select>
            <input type="number" min={1} max={1440} value={minutes} onChange={e => setMinutes(Number(e.target.value))} aria-label="Job minutes" className="w-24 border-2 border-ink bg-surface-2 px-2 py-1 counter text-[20px]" data-testid="job-minutes" />
            <span className="text-[14px]">min</span>
          </div>
          <p className="text-[14px] leading-5">Price: {price === 0 ? <b>0 sat (prepaid minutes cover it)</b> : <b>{price} sat retail via 402 (BSV Desktop pays)</b>}</p>
          <PixelButton size="sm" loading={busy === 'job'} onClick={() => { void run('job', async () => { const r = await flows.runJob(kind, minutes); setJob(await flows.job(r.jobId)) }) }} data-testid="run-job">Run</PixelButton>
          {job !== undefined && (
            <div className="border-2 border-ink bg-surface-3 p-2 text-[14px] leading-5" data-testid="job-card">
              <div className="flex items-center gap-2"><Tag tone={job.status === 'done' ? 'ok' : job.status === 'failed' ? 'danger' : 'info'}>{job.status}</Tag><span className="mono">{job.id}</span></div>
              <pre className="m-0 mt-1 whitespace-pre-wrap font-counter text-[16px] leading-5">{job.log.join('\n')}</pre>
              {job.resultHash !== undefined && <p className="mt-1">Result hash: <span className="mono">{job.resultHash}</span></p>}
            </div>
          )}
        </div>
      </div>
      {error !== undefined && <p className="text-[14px] leading-5 text-danger-dark">{error}</p>}
    </div>
  )
}

export function ParticipantPage () {
  const me = useStore(s => s.me)
  const { wallet } = useRuntime()
  const pools = useShallowStore(selectPools(['open']))
  const active = useMine(activePledge)
  const [joining, setJoining] = useState<string>()
  const [tick, setTick] = useState(0)
  if (me.status !== 'connected') {
    return (
      <div className="mx-auto max-w-[1280px] p-6">
        <Signboard title="My pledges and credits">
          <EmptyState sprite="chest" title="Connect BSV Desktop to join a pool." body="Your pledge coin stays in your own wallet until the settlement. Nothing is ever held by anyone else." action={<PixelButton onClick={() => { void wallet.connect().catch(() => {}) }}>{t('wallet.connect')}</PixelButton>} />
        </Signboard>
      </div>
    )
  }
  return (
    <div className="mx-auto grid max-w-[1280px] grid-cols-[2fr_1fr] gap-6 p-6" data-testid="participant">
      <div className="flex flex-col gap-6">
        <Signboard title="Join a pool">
          {active !== undefined && <p className="mb-2 text-[14px] leading-5"><Tag tone="info">one active pledge at a time</Tag> You are in <b>{active.label}</b> ({active.status}). Withdraw it below to join another pool.</p>}
          {pools.length === 0 ? <EmptyState title="No open pool right now." body={t('states.noPools')} /> : (
            <ul className="m-0 list-none p-0 flex flex-col gap-2">
              {pools.map(p => (
                <li key={p.poolId} className="flex items-center justify-between gap-3 border-b border-surface-3 py-2">
                  <span><span className="font-display">{p.terms.label}</span> <span className="text-ink-muted text-[14px]">· {formatInt(p.pledgedCredits)}/{formatInt(p.terms.credits)} · {Number(p.terms.priceSats) / Number(p.terms.credits)} sat/credit</span> <DemoPricingTag /></span>
                  <PixelButton size="sm" disabled={active !== undefined} onClick={() => setJoining(p.poolId)} data-testid="join-pool">Join</PixelButton>
                </li>
              ))}
            </ul>
          )}
        </Signboard>
        <Signboard title="My pledges"><MyPledges onCancelled={() => setTick(tick + 1)} /></Signboard>
        <Signboard title="My credits"><Credits /></Signboard>
      </div>
      <UnderTheHood flows={['pledge', 'cancelPledge', 'sign', 'settled', 'redeem', 'job', 'return']} />
      <Scroll open={joining !== undefined} title="Join the pool" onClose={() => setJoining(undefined)} id="join-scroll">
        {joining !== undefined && <JoinPool poolId={joining} onDone={() => setJoining(undefined)} />}
      </Scroll>
      <TownDrawer />
    </div>
  )
}

