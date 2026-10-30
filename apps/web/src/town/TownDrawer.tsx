/** What a click in the Town (or a row in a console) opens: pool detail, agent card, transaction scroll. */
import { shortHex } from '../api/woc'
import { PoolDetail } from '../consoles/pools/PoolDetail'
import { store, useStore } from '../store'
import { selectDrawer } from '../store/selectors'
import { Counter, Drawer, IdentityChip, SimulatedJobsTag, Tag, TxLink } from '../ui'

function AgentCard ({ identity }: { identity: string }) {
  const a = useStore(s => s.agents.byIdentity[identity])
  const jobs = useStore(s => Object.values(s.jobs.byId).filter(j => j.owner === identity))
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

export function TownDrawer () {
  const drawer = useStore(selectDrawer)
  const title = drawer === undefined ? '' : drawer.kind === 'pool' ? 'Pool' : drawer.kind === 'agent' ? 'Villager' : drawer.kind === 'tx' ? 'Transaction' : drawer.kind === 'me' ? 'Workshop' : 'Details'
  return (
    <Drawer open={drawer !== undefined} title={title} onClose={() => store.getState().closeDrawer()}>
      {drawer?.kind === 'pool' && <PoolDetail poolId={drawer.id} />}
      {drawer?.kind === 'agent' && <AgentCard identity={drawer.id} />}
      {drawer?.kind === 'tx' && <TxScroll id={drawer.id} />}
      {drawer?.kind === 'me' && <div className="flex flex-col gap-2"><p>The provider's workshop. Credits are H100 GPU-hours; jobs are <SimulatedJobsTag />, payments and settlements are real.</p><p className="text-ink-muted text-[14px]">The provider console (mint, open a pool, revenue) arrives in Phase 2.</p></div>}
    </Drawer>
  )
}
