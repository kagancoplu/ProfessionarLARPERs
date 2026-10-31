/**
 * Pure reducers: (StoreData, CoopEvent) → StoreData. No I/O, no Date.now() (the event's `ts`
 * is the clock), so live, mock and replay produce identical state for identical events.
 */
import type { AnyCoopEvent, CoopEvent } from '../events/types'
import type { ApiPool, PledgeView } from '../api/types'
import { applyHistory } from './history'
import { FEED_LIMIT, SIGN_REQUEST_MS, TOAST_LIMIT, type AgentEntry, type Notification, type PoolEntry, type StoreData, type Toast, type TxKind, type TxRecord } from './types'

const TX_LABELS: Record<TxKind, string> = {
  T1: 'Credit token deployed',
  T2: 'Pool announced, credits reserved',
  T3: 'Pledge',
  T4: 'Pledge cancelled',
  T5: 'Settlement (delivery versus payment)',
  T6: 'Credits redeemed / returned',
  T7: 'Retail 402 payment',
  T8: 'Market sweep',
  T9: 'Vault funded / owner withdrawal',
  T10: 'Guard co-signed spend',
  T11: 'Coop Rail (BSV side)'
}

const short = (s: string | undefined, n = 6): string => (s === undefined ? '' : s.length > 2 * n ? `${s.slice(0, n)}…${s.slice(-n)}` : s)

/** The on-chain record an event stands for, if any (FINAL-IDEA §7). */
export function txFromEvent (e: AnyCoopEvent): TxRecord | undefined {
  const base = (kind: TxKind, txid: string, extra: { actor?: string, poolId?: string, label?: string } = {}): TxRecord => ({
    id: `${kind}:${txid}`, kind, label: extra.label ?? TX_LABELS[kind], txid, ts: e.ts, src: e.src,
    ...(extra.actor !== undefined ? { actor: extra.actor } : {}),
    ...(extra.poolId !== undefined ? { poolId: extra.poolId } : {})
  })
  switch (e.type) {
    case 'mint_done': return base('T1', e.data.txid, { label: `Credit token ${e.data.sym} deployed`, actor: e.agent })
    case 'pool_opened': return base('T2', e.data.pool.txid, { actor: e.data.pool.terms.provider, poolId: e.data.pool.poolId, label: `Pool announced: ${e.data.pool.terms.label}` })
    case 'pledge_added': return base('T3', e.data.pledge.txid, { actor: e.data.pledge.participant, poolId: e.data.pledge.poolId, label: `Pledge of ${e.data.pledge.credits} credits` })
    case 'pledge_cancelled': return base('T4', e.data.txid, { actor: e.data.pledge.participant, poolId: e.data.pledge.poolId })
    case 'settled': return base('T5', e.data.txid, { poolId: e.data.poolId })
    case 'pool_settled': return base('T5', e.data.txid, { poolId: e.data.poolId, label: `Settlement: ${e.data.participants} participants, 1 transaction` })
    case 'credits_redeemed': return base('T6', e.data.txid, { actor: e.data.agent, label: `${e.data.credits} credits redeemed` })
    case 'agent_payment':
      if (e.data.kind === '402') return base('T7', e.data.txid, { actor: e.agent, label: `Retail 402 payment${e.data.sats !== undefined ? ` · ${e.data.sats} sat` : ''}` })
      if (e.data.kind === 'sweep') return base('T8', e.data.txid, { actor: e.agent })
      if (e.data.kind === 'redeem') return base('T6', e.data.txid, { actor: e.agent })
      return base('T3', e.data.txid, { actor: e.agent })
    case 'listing_filled': return base('T8', e.data.txid, { actor: e.data.buyer, label: `Listing swept: ${e.data.listing.credits} credits for ${e.data.listing.askSats} sat` })
    case 'vault_funded': return base('T9', e.data.txid, { actor: e.data.vault.owner, label: `Vault funded: ${e.data.vault.balanceSats} sat` })
    case 'vault_spent': return e.data.by === 'owner'
      ? base('T9', e.data.txid, { actor: e.data.vault.owner, label: 'Owner withdrew from the vault' })
      : base('T10', e.data.txid, { actor: e.data.vault.agent })
    case 'cosign_approved': return e.data.txid === undefined ? undefined : base('T10', e.data.txid, { actor: e.data.agent, poolId: e.data.poolId })
    case 'rail_funded_bsv': return base('T11', e.data.txid, { label: 'Coop Rail: maker funded the BSV HTLC' })
    case 'rail_claimed': return base('T11', e.data.txid, { label: 'Coop Rail: agent + guard claimed (preimage revealed)' })
    default: return undefined
  }
}

const touchPool = (d: StoreData, poolId: string, patch: (p: PoolEntry | undefined) => PoolEntry | undefined): StoreData => {
  const next = patch(d.pools.byId[poolId])
  if (next === undefined) return d
  const byId = { ...d.pools.byId, [poolId]: next }
  const order = d.pools.order.includes(poolId) ? d.pools.order : [...d.pools.order, poolId]
  return { ...d, pools: { byId, order } }
}

const touchAgent = (d: StoreData, identity: string, ts: string, patch: (a: AgentEntry) => AgentEntry): StoreData => {
  const current: AgentEntry = d.agents.byIdentity[identity] ?? { name: short(identity), profile: 'unknown', identity, decisions: [], lastSeen: ts }
  return { ...d, agents: { byIdentity: { ...d.agents.byIdentity, [identity]: patch({ ...current, lastSeen: ts }) } } }
}

const pushToast = (d: StoreData, toast: Omit<Toast, 'id' | 'ts'>, ts: string, id: string): StoreData => {
  const toasts = [...d.ui.toasts, { ...toast, id, ts }].slice(-TOAST_LIMIT)
  return { ...d, ui: { ...d.ui, toasts } }
}

const pushNotification = (d: StoreData, n: Omit<Notification, 'read'>): StoreData => {
  if (d.notifications.some(x => x.id === n.id)) return d
  return { ...d, notifications: [{ ...n, read: false }, ...d.notifications].slice(0, 100) }
}

function mergePledge (pledges: PledgeView[] | undefined, pledge: PledgeView): PledgeView[] {
  const list = pledges ?? []
  const i = list.findIndex(p => p.outpoint === pledge.outpoint)
  if (i < 0) return [...list, pledge]
  return list.map((p, j) => (j === i ? pledge : p))
}

export function poolEntryFromApi (pool: ApiPool, ts: string, previous?: PoolEntry): PoolEntry {
  return { ...previous, ...pool, ...(previous?.pledges !== undefined ? { pledges: previous.pledges } : {}), updatedAt: ts }
}

/** Apply one event: the state, then the session history (charts, pool timelines, leaderboard). */
export function applyEventToData (data: StoreData, e: AnyCoopEvent): StoreData {
  const d = applyState(data, e)
  const history = applyHistory(data, d.history, e)
  return history === d.history ? d : { ...d, history }
}

function applyState (data: StoreData, e: AnyCoopEvent): StoreData {
  let d: StoreData = {
    ...data,
    feed: [...data.feed, e].slice(-FEED_LIMIT),
    counters: { eventsSeen: data.counters.eventsSeen + 1 }
  }
  const tx = txFromEvent(e)
  if (tx !== undefined && !d.txs.some(t => t.id === tx.id)) d = { ...d, txs: [tx, ...d.txs] }

  switch (e.type) {
    case 'pool_update':
      return touchPool(d, e.data.poolId, p => (p === undefined ? undefined : { ...p, pledgedCredits: e.data.pledgedCredits, status: e.data.status, updatedAt: e.ts }))
    case 'pool_opened':
      return touchPool(d, e.data.pool.poolId, p => poolEntryFromApi(e.data.pool, e.ts, p))
    case 'pledge_added': {
      const { pledge } = e.data
      d = touchPool(d, pledge.poolId, p => {
        if (p === undefined) return undefined
        const known = p.pledges?.some(x => x.outpoint === pledge.outpoint) ?? false
        return {
          ...p,
          pledges: mergePledge(p.pledges, pledge),
          pledgedCredits: e.data.pledgedCredits ?? (known ? p.pledgedCredits : String(BigInt(p.pledgedCredits) + BigInt(pledge.credits))),
          pledgeCount: known ? p.pledgeCount : p.pledgeCount + 1,
          updatedAt: e.ts
        }
      })
      return touchAgent(d, pledge.participant, e.ts, a => a)
    }
    case 'pledge_cancelled': {
      const { pledge } = e.data
      return touchPool(d, pledge.poolId, p => (p === undefined ? undefined : {
        ...p,
        pledges: (p.pledges ?? []).map(x => (x.outpoint === pledge.outpoint ? { ...x, spent: true, spendingTxid: e.data.txid, valid: false } : x)),
        pledgedCredits: String(BigInt(p.pledgedCredits) - BigInt(pledge.credits) < 0n ? 0n : BigInt(p.pledgedCredits) - BigInt(pledge.credits)),
        updatedAt: e.ts
      }))
    }
    case 'settled':
      d = touchPool(d, e.data.poolId, p => (p === undefined ? undefined : { ...p, status: 'settled', settledTxid: e.data.txid, updatedAt: e.ts }))
      d = { ...d, notifications: d.notifications.filter(n => !(n.kind === 'sign_request' && n.poolId === e.data.poolId)) }
      return pushToast(d, { kind: 'success', text: `Settled in one transaction · ${short(e.data.txid)}` }, e.ts, `toast:${e.id}`)
    case 'pool_settled': {
      const pool = d.pools.byId[e.data.poolId]
      let savings = 0
      if (pool !== undefined) {
        savings = Number(pool.terms.retailSatsPerCredit) * Number(pool.terms.credits) - Number(pool.terms.priceSats)
        if (!Number.isFinite(savings) || savings < 0) savings = 0
      }
      d = touchPool(d, e.data.poolId, p => (p === undefined ? undefined : { ...p, status: 'settled', settledTxid: e.data.txid, updatedAt: e.ts }))
      return {
        ...d,
        metrics: {
          ...d.metrics,
          settlements: d.metrics.settlements + 1,
          participants: d.metrics.participants + e.data.participants,
          feeSats: d.metrics.feeSats + (e.data.feeSats ?? 0),
          villageSavingsSats: d.metrics.villageSavingsSats + savings
        }
      }
    }
    case 'pool_failed':
      d = touchPool(d, e.data.poolId, p => (p === undefined ? undefined : { ...p, status: 'failed', updatedAt: e.ts }))
      d = { ...d, metrics: { ...d.metrics, failedPools: d.metrics.failedPools + 1 } }
      return pushToast(d, { kind: 'info', text: 'Pool did not fill. Nobody lost a satoshi.' }, e.ts, `toast:${e.id}`)
    case 'pool_cancelled':
      return touchPool(d, e.data.poolId, p => (p === undefined ? undefined : { ...p, status: 'cancelled', spendingTxid: e.data.txid, updatedAt: e.ts }))
    case 'round_failed':
      d = touchPool(d, e.data.poolId, p => (p === undefined ? undefined : { ...p, status: 'open', updatedAt: e.ts }))
      return pushToast(d, { kind: 'warn', text: `Signing round ${e.data.round} failed: ${e.data.missing.length} missing signature(s)` }, e.ts, `toast:${e.id}`)
    case 'sign_request': {
      const expiresAt = new Date(new Date(e.ts).getTime() + SIGN_REQUEST_MS).toISOString()
      d = touchPool(d, e.data.poolId, p => (p === undefined ? undefined : { ...p, status: 'locking', updatedAt: e.ts }))
      return pushNotification(d, {
        id: `sign:${e.data.poolId}:${e.data.round}`, kind: 'sign_request', title: 'Sign request',
        body: `Pool ${short(e.data.poolId)} · round ${e.data.round} · input #${e.data.yourInputIndex}`,
        ts: e.ts, expiresAt, poolId: e.data.poolId
      })
    }
    case 'listing_added':
      return { ...d, listings: { byOutpoint: { ...d.listings.byOutpoint, [e.data.listing.outpoint]: e.data.listing } } }
    case 'listing_filled':
    case 'listing_cancelled': {
      const { [e.data.listing.outpoint]: _gone, ...rest } = d.listings.byOutpoint
      return { ...d, listings: { byOutpoint: rest } }
    }
    case 'vault_funded':
    case 'vault_spent': {
      const prev = d.vaults.byId[e.data.vault.vaultId]
      return { ...d, vaults: { byId: { ...d.vaults.byId, [e.data.vault.vaultId]: { ...prev, ...e.data.vault, decisions: prev?.decisions ?? [] } } } }
    }
    case 'vault_registered': {
      const prev = d.vaults.byId[e.data.vaultId]
      const entry = prev ?? { vaultId: e.data.vaultId, owner: e.data.owner, agent: e.data.agent, guard: '', scriptHex: '', verified: false, balanceSats: 0, utxos: [], decisions: [] }
      return { ...d, vaults: { byId: { ...d.vaults.byId, [e.data.vaultId]: entry } } }
    }
    case 'vault_credits': {
      const prev = d.vaults.byId[e.data.vaultId]
      if (prev === undefined) return d
      return { ...d, vaults: { byId: { ...d.vaults.byId, [e.data.vaultId]: { ...prev, credits: e.data.credits } } } }
    }
    case 'vault_paused':
    case 'vault_resumed': {
      const paused = e.type === 'vault_paused'
      const byId = Object.fromEntries(Object.entries(d.vaults.byId).map(([id, v]) => [id, v.agent === e.data.agent ? { ...v, paused } : v]))
      return { ...d, vaults: { byId } }
    }
    case 'cosign_approved':
    case 'cosign_denied': {
      const denied = e.type === 'cosign_denied'
      const decision = {
        id: e.id, ts: e.ts, agent: e.data.agent, kind: e.data.kind, outcome: denied ? 'denied' as const : 'approved' as const,
        ...(e.data.vaultId !== undefined ? { vaultId: e.data.vaultId } : {}),
        ...(e.data.poolId !== undefined ? { poolId: e.data.poolId } : {}),
        ...(e.data.sats !== undefined ? { sats: e.data.sats } : {}),
        ...(denied ? { reason: e.data.reason } : {}),
        ...(!denied && e.data.txid !== undefined ? { txid: e.data.txid } : {})
      }
      if (e.data.vaultId !== undefined) {
        const prev = d.vaults.byId[e.data.vaultId]
        const entry = prev ?? { vaultId: e.data.vaultId, owner: '', agent: e.data.agent, guard: '', scriptHex: '', verified: false, balanceSats: 0, utxos: [], decisions: [] }
        d = { ...d, vaults: { byId: { ...d.vaults.byId, [e.data.vaultId]: { ...entry, decisions: [decision, ...entry.decisions].slice(0, 100) } } } }
      }
      d = touchAgent(d, e.data.agent, e.ts, a => a)
      if (!denied) return d
      d = { ...d, metrics: { ...d.metrics, deniedByGuard: d.metrics.deniedByGuard + 1 } }
      d = pushNotification(d, { id: `deny:${e.id}`, kind: 'error', title: 'Guard refused', body: e.data.reason, ts: e.ts })
      return pushToast(d, { kind: 'error', text: `Guard refused: ${e.data.reason}` }, e.ts, `toast:${e.id}`)
    }
    case 'policy_updated':
      return { ...d, vaults: { byId: Object.fromEntries(Object.entries(d.vaults.byId).map(([id, v]) => [id, v.agent === e.data.agent ? { ...v, policyUpdatedAt: e.ts } : v])) } }
    case 'agent_started':
      return touchAgent(d, e.data.identity, e.ts, a => ({ ...a, name: e.data.name, profile: e.data.profile, ...(e.data.mode !== undefined ? { mode: e.data.mode } : {}), ...(e.data.vaultId !== undefined ? { vaultId: e.data.vaultId } : {}) }))
    case 'agent_thought':
      return e.agent === undefined ? d : touchAgent(d, e.agent, e.ts, a => ({ ...a, lastThought: { text: e.data.text, ts: e.ts } }))
    case 'agent_decision': {
      if (e.agent === undefined) return d
      const decision = { ...e.data, ts: e.ts }
      return touchAgent(d, e.agent, e.ts, a => ({ ...a, lastDecision: decision, decisions: [decision, ...a.decisions].slice(0, 50) }))
    }
    case 'agent_injected':
      return e.agent === undefined ? d : touchAgent(d, e.agent, e.ts, a => ({ ...a, injected: { text: e.data.text, ts: e.ts } }))
    case 'agent_job': {
      const prev = d.jobs.byId[e.data.jobId]
      const job = { jobId: e.data.jobId, owner: e.agent ?? prev?.owner ?? '', kind: e.data.kind, minutes: e.data.minutes, status: e.data.status, ts: e.ts, ...(prev?.resultHash !== undefined ? { resultHash: prev.resultHash } : {}) }
      return { ...d, jobs: { byId: { ...d.jobs.byId, [e.data.jobId]: job } } }
    }
    case 'job_queued':
    case 'job_running':
    case 'job_done': {
      const status = e.type === 'job_queued' ? 'queued' as const : e.type === 'job_running' ? 'running' as const : 'done' as const
      const prev = d.jobs.byId[e.data.jobId]
      const job = {
        ...prev, jobId: e.data.jobId, owner: e.data.owner, kind: e.data.kind, minutes: e.data.minutes, status, ts: e.ts,
        ...(e.type === 'job_running' && e.data.progress !== undefined ? { progress: e.data.progress } : {}),
        ...(e.type === 'job_done' && e.data.resultHash !== undefined ? { resultHash: e.data.resultHash } : {})
      }
      return { ...d, jobs: { byId: { ...d.jobs.byId, [e.data.jobId]: job } } }
    }
    case 'wallet_connected':
      return { ...d, me: { status: 'connected', identityKey: e.data.identityKey, network: e.data.network === 'testnet' ? 'testnet' : 'mainnet', connectedAt: e.ts } }
    case 'wallet_disconnected':
      return { ...d, me: { status: 'idle' } }
    case 'service_health':
      return { ...d, health: { ...d.health, [e.data.service]: { ok: e.data.ok, checkedAt: e.ts, ...(e.data.detail !== undefined ? { detail: e.data.detail } : {}) } } }
    case 'mode_changed':
      return { ...d, mode: e.data.mode, ...(e.data.replayName !== undefined ? { replayName: e.data.replayName } : {}) }
    case 'error':
      return pushToast(d, { kind: 'error', text: e.data.error }, e.ts, `toast:${e.id}`)
    default:
      return d
  }
}

/** Type-erased entry used by the store (events read from the wire are validated structurally). */
export function applyUnknownEvent (data: StoreData, e: CoopEvent): StoreData {
  return applyEventToData(data, e as AnyCoopEvent)
}
