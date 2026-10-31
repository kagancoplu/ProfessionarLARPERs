/** What a click in the Town (or a row in a console) opens: pool detail, agent card, transaction scroll. */
import { shortHex } from '../api/woc'
import { PoolDetail } from '../consoles/pools/PoolDetail'
import { RailCard } from '../consoles/RailCard'
import { store, useShallowStore, useStore } from '../store'
import { selectDrawer } from '../store/selectors'
import { Counter, Drawer, ErrorBoundary, ErrorState, IdentityChip, PixelButton, SimulatedJobsTag, Tag, TxLink, formatInt } from '../ui'
import { useNavigate } from 'react-router'

function AgentCard ({ identity }: { identity: string }) {
  const a = useStore(s => s.agents.byIdentity[identity])
  // a filtered array is new on every call: shallow-compared, or React re-renders forever and the page crashes
  const jobs = useShallowStore(s => Object.values(s.jobs.byId).filter(j => j.owner === identity))
  const vault = useStore(s => Object.values(s.vaults.byId).find(v => v.agent === identity))
  if (a === undefined) return <p>Unknown villager.</p>
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2"><IdentityChip identity={a.identity} role="agent" name={a.name} /><Tag tone={a.mode === 'vault' ? 'gold' : 'neutral'}>{a.mode ?? 'p2pkh'}</Tag></div>
      {vault !== undefined && <p className="text-[14px] leading-5">Vault {shortHex(vault.vaultId, 4)} · <Counter value={vault.balanceSats} size="s" unit="sat" /> {vault.policy !== undefined && `· max ${vault.policy.maxPerPoolSats} sat per pool`}</p>}
      {a.lastThought !== undefined && <p className="italic">“{a.lastThought.text}”</p>}
      {a.injected !== undefined && <p className="border-2 border-danger-dark bg-surface-3 p-2 text-[14px] leading-5">Injected prompt: “{a.injected.text}”</p>}
      <div>
        <p className="label text-ink-muted">Decisions</p>
        {a.decisions.length === 0 ? <p className="text-ink-muted text-[14px]">No decisions yet.</p> : (
          <ol className="m-0 list-none p-0 flex flex-col gap-1">{a.decisions.slice(0, 12).map((d, i) => (
            <li key={i} className="flex gap-2 border-b border-surface-3 py-1 text-[14px] leading-5"><Tag tone={d.action === 'reject' ? 'danger' : d.action === 'sign' ? 'ok' : 'neutral'}>{d.action}</Tag><span>{d.reason}</span></li>
          ))}</ol>
        )}
      </div>
      {jobs.length > 0 && <div><p className="label text-ink-muted flex items-center gap-2">GPU jobs <SimulatedJobsTag /></p>{jobs.map(j => <p key={j.jobId} className="text-[14px] leading-5">{j.kind} · {j.minutes} min · {j.status}{j.resultHash !== undefined && <span className="mono"> · {j.resultHash}</span>}</p>)}</div>}
    </div>
  )
}

function TxScroll ({ id }: { id: string }) {
  const tx = useStore(s => s.txs.find(t => t.id === id))
  if (tx === undefined) return <p>No such record.</p>
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2"><Tag tone="gold">{tx.kind}</Tag><span className="font-display">{tx.label}</span></div>
      <TxLink txid={tx.txid} chars={8} />
      {tx.actor !== undefined && <IdentityChip identity={tx.actor} role="unknown" />}
      <p className="text-[14px] leading-5 text-ink-muted">{new Date(tx.ts).toLocaleString()}</p>
    </div>
  )
}

function VaultCard ({ vaultId }: { vaultId: string }) {
  const v = useStore(s => s.vaults.byId[vaultId])
  const agent = useStore(s => (v !== undefined ? s.agents.byIdentity[v.agent] : undefined))
  if (v === undefined) return <p>No such vault.</p>
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2"><span className="mono">{shortHex(v.vaultId, 6)}</span><Tag tone={v.verified ? 'ok' : 'neutral'}>{v.verified ? 'verified' : 'registered'}</Tag>{v.paused === true && <Tag tone="warn">paused</Tag>}</div>
      <Counter value={v.balanceSats} size="m" unit="sat" tone="gold" />
      {(v.credits ?? []).map(c => <p key={c.tokenId} className="text-[14px] leading-5"><Counter value={c.amt} size="s" unit={c.sym ?? 'credits'} /> locked to the vault script: agent + guard to redeem or list, the owner alone to take out</p>)}
      <p className="text-[14px] leading-5">Agent {agent?.name ?? ''} <IdentityChip identity={v.agent} role="agent" compact /> · owner <IdentityChip identity={v.owner} role="owner" compact /> · guard <IdentityChip identity={v.guard} role="guard" compact /></p>
      <p className="text-[14px] leading-5 text-ink-muted">The owner alone can empty it; the agent spends only with the guard's co-signature inside the policy. Nobody else, ever.</p>
      <div>
        <p className="label text-ink-muted">Guard decisions</p>
        {v.decisions.length === 0 ? <p className="text-[14px] text-ink-muted">None yet.</p> : v.decisions.slice(0, 8).map(d => (
          <p key={d.id} className="flex gap-2 border-b border-surface-3 py-1 text-[14px] leading-5"><Tag tone={d.outcome === 'denied' ? 'danger' : 'ok'}>{d.outcome}</Tag><span>{d.kind}{d.sats !== undefined ? ` · ${formatInt(d.sats)} sat` : ''}{d.reason !== undefined ? ` · ${d.reason}` : ''}</span></p>
        ))}
      </div>
    </div>
  )
}

function ListingCard ({ outpoint }: { outpoint: string }) {
  const l = useStore(s => s.listings.byOutpoint[outpoint])
  const navigate = useNavigate()
  if (l === undefined) return <p>That listing is gone (swept or cancelled).</p>
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-baseline gap-2"><Counter value={l.credits} size="s" /><span className="text-ink-muted">credits for</span><Counter value={l.askSats} size="s" unit="sat" tone="gold" /></div>
      <p className="text-[14px] leading-5">{(Number(l.askSats) / Number(l.credits)).toFixed(1)} sat/credit · seller <IdentityChip identity={l.seller} role="agent" compact /></p>
      <p className="text-[14px] leading-5 text-ink-muted">Signed SIGHASH_SINGLE|ANYONECANPAY: anyone can sweep it while the seller is offline; the credits' lineage is verified before buying.</p>
      <TxLink txid={outpoint.split(/[_.]/)[0]!} chars={6} />
      <PixelButton size="sm" onClick={() => { store.getState().closeDrawer(); void navigate('/market') }}>Open the market</PixelButton>
    </div>
  )
}

function WorkshopCard () {
  const navigate = useNavigate()
  return (
    <div className="flex flex-col gap-3">
      <p>The provider's workshop. Credits are H100 GPU-hours; jobs are <SimulatedJobsTag />, payments and settlements are real.</p>
      <p className="text-[14px] leading-5 text-ink-muted">Mint credits, open a pool with one signed offer and collect the revenue in the provider console.</p>
      <PixelButton size="sm" onClick={() => { store.getState().closeDrawer(); void navigate('/provider') }}>Open the provider console</PixelButton>
    </div>
  )
}

export function TownDrawer () {
  const drawer = useStore(selectDrawer)
  const title = drawer === undefined ? '' : drawer.kind === 'pool' ? 'Pool' : drawer.kind === 'agent' ? 'Villager' : drawer.kind === 'tx' ? 'Transaction' : drawer.kind === 'me' ? 'Workshop' : drawer.kind === 'vault' ? 'Vault' : drawer.kind === 'listing' ? 'Stall' : drawer.kind === 'rail' ? 'Harbor office' : 'Details'
  return (
    <Drawer open={drawer !== undefined} title={title} onClose={() => store.getState().closeDrawer()}>
      {/* a card that throws stays inside the drawer: the Town keeps running behind it */}
      <ErrorBoundary resetKey={drawer === undefined ? '' : `${drawer.kind}:${drawer.id}`} fallback={err => <ErrorState title="This card could not be shown." body={err.message} />}>
        {drawer?.kind === 'pool' && <PoolDetail poolId={drawer.id} />}
        {drawer?.kind === 'agent' && <AgentCard identity={drawer.id} />}
        {drawer?.kind === 'tx' && <TxScroll id={drawer.id} />}
        {drawer?.kind === 'vault' && <VaultCard vaultId={drawer.id} />}
        {drawer?.kind === 'listing' && <ListingCard outpoint={drawer.id} />}
        {drawer?.kind === 'rail' && <RailCard />}
        {drawer?.kind === 'me' && <WorkshopCard />}
      </ErrorBoundary>
    </Drawer>
  )
}
