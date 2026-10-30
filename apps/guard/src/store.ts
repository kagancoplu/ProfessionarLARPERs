/**
 * Guard state: vault registrations, owner policies, the spending ledger
 * (data/guard/state.json, written atomically) and the decision log
 * (data/guard/decisions.jsonl). Without a directory everything stays in memory (tests).
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { WEEK_MS, type GuardPolicy, type RegisteredVault } from './policy'

export interface LedgerEntry {
  owner: string
  agent: string
  vaultId: string
  /** The vault input ("txid.vout"): only one transaction spending it can ever be mined. */
  outpoint: string
  outflowSats: number
  at: string
}

export interface Decision {
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

  constructor (private readonly dir?: string) {
    if (dir === undefined) return
    mkdirSync(dir, { recursive: true })
    if (existsSync(this.statePath)) this.state = JSON.parse(readFileSync(this.statePath, 'utf8')) as GuardState
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

  vaultsOf (owner: string, agent: string): RegisteredVault[] {
    return Object.values(this.state.vaults).filter(v => v.record.owner === owner && v.record.agent === agent)
  }

  putVault (v: RegisteredVault): void {
    this.state.vaults[v.record.vaultId] = v
    this.save()
  }

  getPolicy (owner: string, agent: string): GuardPolicy | undefined { return this.state.policies[policyKey(owner, agent)]?.policy }

  putPolicy (owner: string, agent: string, policy: GuardPolicy, now: number): void {
    this.state.policies[policyKey(owner, agent)] = { policy, updatedAt: new Date(now).toISOString() }
    this.save()
  }

  /** Outflow of (owner, agent) within the last 7 days, the largest entry per vault outpoint. */
  spentInWindow (owner: string, agent: string, now: number, excludeOutpoint?: string): number {
    const since = now - WEEK_MS
    const byOutpoint = new Map<string, number>()
    for (const l of this.state.ledger) {
      if (l.owner !== owner || l.agent !== agent || l.outpoint === excludeOutpoint || Date.parse(l.at) < since) continue
      byOutpoint.set(l.outpoint, Math.max(byOutpoint.get(l.outpoint) ?? 0, l.outflowSats))
    }
    return [...byOutpoint.values()].reduce((s, v) => s + v, 0)
  }

  /** Record a co-signed spend. A second signature for the same vault input keeps the larger outflow (one entry per outpoint). */
  recordSpend (entry: LedgerEntry, now: number): void {
    const since = now - WEEK_MS
    const kept = this.state.ledger.filter(l => Date.parse(l.at) >= since && !(l.outpoint === entry.outpoint && l.outflowSats <= entry.outflowSats))
    if (!kept.some(l => l.outpoint === entry.outpoint)) kept.push(entry)
    this.state.ledger = kept
    this.save()
  }

  logDecision (d: Decision): void {
    this.decisions.push(d)
    if (this.decisions.length > 1000) this.decisions.shift()
    if (this.dir !== undefined) appendFileSync(join(this.dir, 'decisions.jsonl'), `${JSON.stringify(d)}\n`)
  }
}
