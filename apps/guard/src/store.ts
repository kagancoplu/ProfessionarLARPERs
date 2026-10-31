/**
 * Guard state: vault registrations, owner policies, the spending ledger
 * (data/guard/state.json, written atomically) and the decision log
 * (data/guard/decisions.jsonl). Without a directory everything stays in memory (tests).
 *
 * Ledger (D-P2 §4.8): one entry per key. A key is the vault input ("txid.vout",
 * only one transaction spending it can be mined) or `reserve:<vault input>` for
 * a pledge coin committed to a pool. The first spend of that pledge coin
 * (settlement, cancel) replaces the reservation; later ones keep the largest.
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { WEEK_MS, type GuardPolicy, type RegisteredVault } from './policy'

export type LedgerKind = 'pay' | 'pledge' | 'reserve' | 'settle' | 'resolve'

export interface LedgerEntry {
  owner: string
  agent: string
  vaultId: string
  /** Ledger key: the vault input ("txid.vout") or `reserve:<vault input>`. D-P1 name kept for stored state. */
  outpoint: string
  /** What the vault loses (counts against weeklyCapSats). */
  outflowSats: number
  at: string
  /** Absent in D-P1 entries (= 'pay'). */
  kind?: LedgerKind
  /** Pool this entry commits sats to, and how many (counts against maxPerPoolSats). */
  poolId?: string
  poolSats?: number
  /** Sats sent to the agent's hot wallet (counts against hotWalletDailySats over 24 h). */
  hotSats?: number
}

/** What the policy engine asks the guard to record. */
export type LedgerDraft = Omit<LedgerEntry, 'owner' | 'agent' | 'vaultId' | 'at'>

export const DAY_MS = 24 * 60 * 60 * 1000
export const reserveKey = (vaultOutpoint: string): string => `reserve:${vaultOutpoint}`

export interface Decision {
  /** Sequence number in data/guard/decisions.jsonl (GET /decisions `id`). */
  id?: number
  at: string
  decision: 'allow' | 'deny'
  kind: string
  agent?: string
  vaultId?: string
  outpoint?: string
  reason?: string
  outflowSats?: number
  paidSats?: number
  feeSats?: number
  poolId?: string
  /** 2.1b: the pledge coin committed to the pool. */
  committedSats?: number
  hotSats?: number
  /** 'rail': sats a claim brought into the vault. */
  inflowSats?: number
  /** 'redeem' / 'list' (D-P2b): the credits moved. */
  credits?: { tokenId: string, amount: string, delivered?: string, kept?: string, askSats?: number }
  /** BL-35: the transaction that carried this co-signature, reported after broadcast and checked to spend `outpoint`. */
  txid?: string
}

interface GuardState {
  v: 1
  vaults: Record<string, RegisteredVault>
  policies: Record<string, { policy: GuardPolicy, updatedAt: string }>
  ledger: LedgerEntry[]
}

const policyKey = (owner: string, agent: string): string => `${owner}:${agent}`

export class GuardStore {
  private state: GuardState = { v: 1, vaults: {}, policies: {}, ledger: [] }
  readonly decisions: Decision[] = []

  private seq = 0

  constructor (private readonly dir?: string) {
    if (dir === undefined) return
    mkdirSync(dir, { recursive: true })
    if (existsSync(this.statePath)) this.state = JSON.parse(readFileSync(this.statePath, 'utf8')) as GuardState
    const log = join(dir, 'decisions.jsonl')
    if (existsSync(log)) {
      const lines = readFileSync(log, 'utf8').split('\n').filter(l => l.trim() !== '')
      this.seq = lines.length
      lines.slice(-1000).forEach((l, i) => { this.decisions.push({ id: lines.length - Math.min(lines.length, 1000) + i + 1, ...JSON.parse(l) as Decision }) })
    }
    // txids come later than their decision: a separate append-only file, so decisions.jsonl line numbers stay the ids
    const links = join(dir, 'decision-txids.jsonl')
    if (existsSync(links)) {
      for (const l of readFileSync(links, 'utf8').split('\n').filter(x => x.trim() !== '')) {
        const { id, txid } = JSON.parse(l) as { id: number, txid: string }
        const d = this.decisions.find(x => x.id === id)
        if (d !== undefined) d.txid = txid
      }
    }
  }

  private get statePath (): string { return join(this.dir!, 'state.json') }

  private save (): void {
    if (this.dir === undefined) return
    const tmp = `${this.statePath}.tmp`
    writeFileSync(tmp, JSON.stringify(this.state, null, 2))
    renameSync(tmp, this.statePath)
  }

  getVault (vaultId: string): RegisteredVault | undefined { return this.state.vaults[vaultId] }

  findVaultByScript (lockingScriptHex: string): RegisteredVault | undefined {
    return Object.values(this.state.vaults).find(v => v.lockingScriptHex === lockingScriptHex)
  }

  vaultsOfAgent (agent: string): RegisteredVault[] {
    return Object.values(this.state.vaults).filter(v => v.record.agent === agent)
  }

  vaultsOf (owner: string, agent: string): RegisteredVault[] {
    return Object.values(this.state.vaults).filter(v => v.record.owner === owner && v.record.agent === agent)
  }

  putVault (v: RegisteredVault): void {
    this.state.vaults[v.record.vaultId] = v
    this.save()
  }

  getPolicy (owner: string, agent: string): GuardPolicy | undefined { return this.state.policies[policyKey(owner, agent)]?.policy }

  /** Policies stored for `agent` (by any owner), most recently updated first. */
  policiesOf (agent: string): Array<{ owner: string, agent: string, policy: GuardPolicy, updatedAt: string }> {
    return Object.entries(this.state.policies)
      .map(([k, v]) => ({ owner: k.split(':')[0], agent: k.split(':')[1], ...v }))
      .filter(p => p.agent === agent)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  }

  putPolicy (owner: string, agent: string, policy: GuardPolicy, now: number): void {
    this.state.policies[policyKey(owner, agent)] = { policy, updatedAt: new Date(now).toISOString() }
    this.save()
  }

  /** Entries of (owner, agent) since `since`, one per key (the largest, for D-P1 state with duplicates). */
  private window (owner: string, agent: string, since: number, exclude: string | string[] = []): LedgerEntry[] {
    const ex = new Set(Array.isArray(exclude) ? exclude : [exclude])
    const byKey = new Map<string, LedgerEntry>()
    for (const l of this.state.ledger) {
      if (l.owner !== owner || l.agent !== agent || ex.has(l.outpoint) || Date.parse(l.at) < since) continue
      const prev = byKey.get(l.outpoint)
      if (prev === undefined || l.outflowSats > prev.outflowSats) byKey.set(l.outpoint, l)
    }
    return [...byKey.values()]
  }

  /** Outflow of (owner, agent) within the last 7 days, one entry per key. */
  spentInWindow (owner: string, agent: string, now: number, exclude: string | string[] = []): number {
    return this.window(owner, agent, now - WEEK_MS, exclude).reduce((s, l) => s + l.outflowSats, 0)
  }

  /** Sats (owner, agent) committed to `poolId` within the last 7 days (fees, reservations, settlements). */
  poolSpent (owner: string, agent: string, poolId: string, now: number, exclude: string | string[] = []): number {
    return this.window(owner, agent, now - WEEK_MS, exclude).filter(l => l.poolId === poolId).reduce((s, l) => s + (l.poolSats ?? 0), 0)
  }

  /** Sats sent to the agent's hot wallet within the last 24 hours. */
  hotSpent (owner: string, agent: string, now: number, exclude: string | string[] = []): number {
    return this.window(owner, agent, now - DAY_MS, exclude).reduce((s, l) => s + (l.hotSats ?? 0), 0)
  }

  /** The reservation key among `vaultOutpoints` (the inputs of a pledge transaction), if the guard reserved one. */
  findReservation (owner: string, agent: string, vaultOutpoints: string[], now: number): string | undefined {
    const since = now - WEEK_MS
    const keys = new Set(vaultOutpoints.map(reserveKey))
    return this.state.ledger.find(l => l.owner === owner && l.agent === agent && keys.has(l.outpoint) && Date.parse(l.at) >= since)?.outpoint
  }

  /**
   * Record a co-signed spend. Same key: a reservation is replaced by its first
   * resolution (settlement or cancel); otherwise the larger amounts are kept
   * (a second signature for the same vault input is not counted twice).
   */
  recordSpend (entry: LedgerEntry, now: number): void {
    const since = now - WEEK_MS
    const kept = this.state.ledger.filter(l => Date.parse(l.at) >= since && l.outpoint !== entry.outpoint)
    const same = this.state.ledger.filter(l => Date.parse(l.at) >= since && l.outpoint === entry.outpoint)
    let next = entry
    if (same.length > 0 && !(same.every(l => l.kind === 'reserve') && entry.kind !== 'reserve')) {
      const max = (f: (l: LedgerEntry) => number | undefined): number => Math.max(...[...same, entry].map(l => f(l) ?? 0))
      const prev = same.reduce((a, b) => (b.outflowSats > a.outflowSats ? b : a))
      next = {
        ...prev,
        ...(entry.outflowSats >= prev.outflowSats ? entry : {}),
        outflowSats: max(l => l.outflowSats),
        ...(max(l => l.poolSats) > 0 ? { poolSats: max(l => l.poolSats) } : {}),
        ...(max(l => l.hotSats) > 0 ? { hotSats: max(l => l.hotSats) } : {})
      }
    } else if (same.length > 0) {
      next = { ...entry, poolId: entry.poolId ?? same[0].poolId } // resolution keeps the reservation's pool
    }
    kept.push(next)
    this.state.ledger = kept
    this.save()
  }

  decision (id: number): Decision | undefined { return this.decisions.find(d => d.id === id) }

  /** Record the txid of decision `id` (checked by the caller). */
  linkTxid (id: number, txid: string, at: string): void {
    const d = this.decision(id)
    if (d === undefined) return
    d.txid = txid
    if (this.dir !== undefined) appendFileSync(join(this.dir, 'decision-txids.jsonl'), `${JSON.stringify({ id, txid, at })}\n`)
  }

  logDecision (d: Decision): Decision {
    const entry = { id: ++this.seq, ...d }
    this.decisions.push(entry)
    if (this.decisions.length > 1000) this.decisions.shift()
    if (this.dir !== undefined) appendFileSync(join(this.dir, 'decisions.jsonl'), `${JSON.stringify(d)}\n`)
    return entry
  }
}
