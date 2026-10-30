/** /owner — the agent owner: create a vault, fund it (T9), write the guard policy, watch decisions and refusals, withdraw alone (track-E §4.2 owner). */
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useFlows, useRuntime } from '../../app-context'
import type { GuardPolicy } from '../../api/types'
import { t } from '../../i18n/t'
import { useShallowStore, useStore } from '../../store'
import { selectAgents, selectDenials, selectPools, selectVaults } from '../../store/selectors'
import { TownDrawer } from '../../town/TownDrawer'
import { Counter, EmptyState, IdentityChip, PixelButton, Signboard, Tag, TxLink, formatInt } from '../../ui'
import { UnderTheHood } from '../../ui/UnderTheHood'
import { useMine } from '../../wallet/mine'
import type { MyVault } from '../../wallet/flows/types'

const input = 'border-2 border-ink bg-surface-2 px-2 py-1'
const DEFAULT_POLICY: GuardPolicy = { allowProviders: [], maxPerPoolSats: 5_000, weeklyCapSats: 30_000, maxFeeSats: 200, hotWalletDailySats: 2_000 }

function PolicyForm ({ vault }: { vault: MyVault }) {
  const flows = useFlows()
  const pools = useShallowStore(selectPools())
  const known = [...new Set(pools.map(p => p.terms.provider))]
  const status = useQuery({ queryKey: ['vault-status', vault.vaultId], queryFn: () => flows.vaultStatus(vault.vaultId), refetchInterval: 5_000, retry: 0 })
  const [draft, setDraft] = useState<GuardPolicy | undefined>()
  const [extra, setExtra] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const policy = draft ?? status.data?.policy ?? { ...DEFAULT_POLICY, allowProviders: known.slice(0, 1) }
  const set = (patch: Partial<GuardPolicy>): void => setDraft({ ...policy, ...patch })
  const toggle = (p: string): void => set({ allowProviders: policy.allowProviders.includes(p) ? policy.allowProviders.filter(x => x !== p) : [...policy.allowProviders, p] })
  const save = async (): Promise<void> => {
    setBusy(true); setError(undefined)
    try {
      const providers = [...new Set([...policy.allowProviders, ...extra.split(/[\s,]+/).filter(x => /^0[23][0-9a-f]{64}$/i.test(x))])]
      await flows.putPolicy(vault.agent, { ...policy, allowProviders: providers })
      setDraft(undefined); setExtra('')
      await status.refetch()
    } catch (err) { setError(String((err as Error).message)) } finally { setBusy(false) }
  }
  return (
    <div className="flex flex-col gap-2" data-testid="policy-form">
      <p className="label text-ink-muted">Policy {status.data?.policyUpdatedAt !== undefined && <span className="normal-case tracking-normal">· saved {new Date(status.data.policyUpdatedAt).toLocaleTimeString('en-GB', { hour12: false })}</span>}</p>
      <div>
        <span className="label">Allowed providers (payee is proven by key derivation, not trusted)</span>
        <div className="mt-1 flex flex-wrap gap-2">
          {known.map(p => <label key={p} className="flex items-center gap-1 text-[14px]"><input type="checkbox" checked={policy.allowProviders.includes(p)} onChange={() => toggle(p)} /> <IdentityChip identity={p} role="provider" compact /></label>)}
          {known.length === 0 && <span className="text-[14px] text-ink-muted">No provider on the overlay yet; paste an identity key below.</span>}
        </div>
        <input value={extra} onChange={e => setExtra(e.target.value)} placeholder="extra provider identity key(s), comma separated" className={`${input} mt-1 w-full mono text-[16px]`} data-testid="policy-extra" />
      </div>
      <div className="grid grid-cols-4 gap-2">
        {([['maxPerPoolSats', 'Max per pool (sat)'], ['weeklyCapSats', 'Weekly cap (sat)'], ['maxFeeSats', 'Max miner fee (sat)'], ['hotWalletDailySats', 'Hot wallet / day (sat)']] as const).map(([k, label]) => (
          <label key={k} className="flex flex-col gap-1"><span className="label">{label}</span><input type="number" min={0} value={policy[k]} onChange={e => set({ [k]: Number(e.target.value) } as Partial<GuardPolicy>)} className={`${input} counter text-[20px]`} data-testid={`policy-${k}`} /></label>
        ))}
      </div>
      <p className="text-[14px] leading-5 text-ink-muted">To stop the agent, set the weekly cap to 0: the guard then refuses every spend; your exit path stays open. No transaction: the PUT is signed with your identity (BRC-103).</p>
      {error !== undefined && <p className="text-[14px] leading-5 text-danger-dark">{error}</p>}
      <PixelButton size="sm" loading={busy} onClick={() => { void save() }} data-testid="save-policy">Save policy at the guard</PixelButton>
    </div>
  )
}

function VaultCard ({ vault }: { vault: MyVault }) {
  const flows = useFlows()
  const entry = useStore(s => s.vaults.byId[vault.vaultId])
  const agent = useStore(s => s.agents.byIdentity[vault.agent])
  const [amount, setAmount] = useState('20000')
  const [busy, setBusy] = useState<string>()
  const [error, setError] = useState<string>()
  const [last, setLast] = useState<string>()
  const run = async (label: string, fn: () => Promise<string | undefined>): Promise<void> => { setBusy(label); setError(undefined); try { setLast(await fn()) } catch (err) { setError(String((err as Error).message)) } finally { setBusy(undefined) } }
  const decisions = entry?.decisions ?? []
  const spent = decisions.filter(d => d.outcome === 'approved').reduce((a, d) => a + (d.sats ?? 0), 0)
  return (
    <Signboard title={<span className="flex items-center gap-2">Vault <span className="mono text-[16px]">{vault.vaultId.slice(0, 12)}…</span> · {agent?.name ?? 'agent'} <Tag tone={entry?.verified === true ? 'ok' : 'neutral'}>{entry?.verified === true ? 'verified' : 'registered'}</Tag></span>} data-testid="vault-card">
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-6">
          <div><p className="label text-ink-muted">Balance (chain)</p><span data-testid="vault-balance"><Counter value={entry?.balanceSats ?? 0} size="m" unit="sat" tone="gold" /></span></div>
          <div><p className="label text-ink-muted">Spent by the agent (approved)</p><Counter value={spent} size="s" unit="sat" /></div>
          <div><p className="label text-ink-muted">Agent · guard</p><div className="flex gap-2"><IdentityChip identity={vault.agent} role="agent" compact /><IdentityChip identity={vault.guard} role="guard" compact /></div></div>
        </div>
        <p className="text-[14px] leading-5 text-ink-muted">Script: <code>OP_IF &lt;you&gt; OP_CHECKSIG OP_ELSE 2 &lt;agent&gt; &lt;guard&gt; 2 OP_CHECKMULTISIG OP_ENDIF</code> ({vault.lockingScriptHex.length / 2} bytes). The agent needs the guard to spend; you never need anyone.</p>
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1"><span className="label">Fund (sat)</span><input type="number" min={1} value={amount} onChange={e => setAmount(e.target.value)} className={`${input} w-36 counter text-[20px]`} data-testid="fund-amount" /></label>
          <PixelButton loading={busy === 'fund'} onClick={() => { void run('fund', async () => (await flows.fundVault(vault.vaultId, Number(amount))).txid) }} data-testid="fund-vault">Fund in BSV Desktop (1 approval, T9)</PixelButton>
          <PixelButton variant="danger" loading={busy === 'withdraw'} disabled={(entry?.balanceSats ?? 0) === 0} onClick={() => { void run('withdraw', async () => (await flows.withdrawVault(vault.vaultId)).txid) }} data-testid="withdraw-vault">Withdraw everything (owner branch, 1 approval)</PixelButton>
        </div>
        <PolicyForm vault={vault} />
        <div>
          <p className="label text-ink-muted">Guard decisions for this vault</p>
          {decisions.length === 0 ? <p className="text-[14px] text-ink-muted">None yet. They appear when the agent spends (approved) or is refused (denied).</p> : (
            <table className="w-full border-collapse text-[14px] leading-5" data-testid="vault-decisions">
              <thead><tr className="label bg-surface-3 text-left text-[12px]"><th className="px-2 py-1">When</th><th className="px-2 py-1">Kind</th><th className="px-2 py-1 text-right">Sats</th><th className="px-2 py-1">Outcome</th><th className="px-2 py-1">Reason</th></tr></thead>
              <tbody>{decisions.slice(0, 12).map(d => (
                <tr key={d.id} className="border-b border-surface-3">
                  <td className="px-2 py-1 counter text-[18px] text-ink-muted">{new Date(d.ts).toLocaleTimeString('en-GB', { hour12: false })}</td>
                  <td className="px-2 py-1">{d.kind}</td>
                  <td className="px-2 py-1 text-right counter text-[18px]">{d.sats !== undefined ? formatInt(d.sats) : '—'}</td>
                  <td className="px-2 py-1"><Tag tone={d.outcome === 'denied' ? 'danger' : 'ok'}>{d.outcome}</Tag></td>
                  <td className="px-2 py-1">{d.reason ?? (d.txid !== undefined ? <TxLink txid={d.txid} chars={4} /> : '')}</td>
                </tr>
              ))}</tbody>
            </table>
          )}
        </div>
        {error !== undefined && <p className="text-[14px] leading-5 text-danger-dark">{error}</p>}
        {last !== undefined && <p className="text-[14px] leading-5">Last: <TxLink txid={last} /></p>}
      </div>
    </Signboard>
  )
}

export function OwnerPage () {
  const me = useStore(s => s.me)
  const { wallet } = useRuntime()
  const flows = useFlows()
  const agents = useShallowStore(selectAgents)
  const vaults = useShallowStore(selectVaults)
  const denials = useShallowStore(selectDenials)
  const myVaults = useMine(s => s.vaults)
  const [agent, setAgent] = useState<string>()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const pick = agent ?? agents.find(a => !vaults.some(v => v.agent === a.identity))?.identity ?? agents[0]?.identity
  const create = async (): Promise<void> => {
    if (pick === undefined) return
    setBusy(true); setError(undefined)
    try { await flows.createVault(pick) } catch (err) { setError(String((err as Error).message)) } finally { setBusy(false) }
  }
  if (me.status !== 'connected') {
    return <div className="mx-auto max-w-[1280px] p-6"><Signboard title="Owner console"><EmptyState sprite="chest" title="Connect BSV Desktop to give an agent a budget." body="You create a vault only you can empty; the agent spends from it only with the guard's co-signature, inside the policy you write." action={<PixelButton onClick={() => { void wallet.connect().catch(() => {}) }}>{t('wallet.connect')}</PixelButton>} /></Signboard></div>
  }
  return (
    <div className="mx-auto grid max-w-[1280px] grid-cols-[2fr_1fr] gap-6 p-6" data-testid="owner">
      <div className="flex flex-col gap-6">
        <Signboard title="1 · Create a vault for an agent">
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1"><span className="label">Agent</span>
              <select value={pick ?? ''} onChange={e => setAgent(e.target.value)} className={`${input} min-w-64`} data-testid="vault-agent">
                {agents.map(a => <option key={a.identity} value={a.identity}>{a.name} · {a.profile}{vaults.some(v => v.agent === a.identity) ? ' (has a vault)' : ''}</option>)}
              </select>
            </label>
            <PixelButton loading={busy} disabled={pick === undefined} onClick={() => { void create() }} data-testid="create-vault">Create (BSV Desktop derives your vault key)</PixelButton>
          </div>
          <p className="mt-2 text-[14px] leading-5 text-ink-muted">No transaction yet: the vault is a script (owner alone, or agent + guard). The guard must derive the same script before you fund it.</p>
          {error !== undefined && <p className="mt-2 text-[14px] leading-5 text-danger-dark">{error}</p>}
        </Signboard>
        {myVaults.length === 0
          ? <Signboard title="2 · My vaults"><p className="text-ink-muted text-[14px]">No vault created from this browser yet.</p></Signboard>
          : myVaults.map(v => <VaultCard key={v.vaultId} vault={v} />)}
        <Signboard title="Guard refusals in the village" tone={denials.length > 0 ? 'danger' : 'default'}>
          {denials.length === 0 ? <p className="text-ink-muted text-[14px]">No refusal yet. When an agent is talked into overspending, the guard's 403 lands here with its reason.</p> : (
            <ul className="m-0 list-none p-0 flex flex-col gap-1" data-testid="denials">{denials.slice(0, 8).map(d => (
              <li key={d.id} className="flex flex-wrap items-center gap-2 border-b border-surface-3 py-1 text-[14px] leading-5"><Tag tone="danger">403</Tag><IdentityChip identity={d.agent} role="agent" compact /><span>{d.kind}{d.sats !== undefined ? ` · ${formatInt(d.sats)} sat` : ''}</span><span className="text-danger-dark">{d.reason}</span><span className="counter text-[16px] text-ink-muted">{new Date(d.ts).toLocaleTimeString('en-GB', { hour12: false })}</span></li>
            ))}</ul>
          )}
        </Signboard>
      </div>
      <div className="flex flex-col gap-6">
        <UnderTheHood flows={['createVault', 'fundVault', 'putPolicy', 'withdrawVault']} />
        <Signboard title="Vaults in the village">
          {vaults.length === 0 ? <p className="text-ink-muted text-[14px]">None on the overlay.</p> : vaults.map(v => (
            <div key={v.vaultId} className="flex items-center justify-between gap-2 border-b border-surface-3 py-1 text-[14px] leading-5">
              <span className="flex items-center gap-2"><span className="mono text-[16px]">{v.vaultId.slice(0, 10)}…</span><IdentityChip identity={v.agent} role="agent" compact /></span>
              <span className="counter text-[18px]">{formatInt(v.balanceSats)} sat</span>
            </div>
          ))}
        </Signboard>
      </div>
      <TownDrawer />
    </div>
  )
}
