/**
 * The guard (MASTER §3.7, plan/phases/D-P1.md §7): registers vaults, stores the
 * owners' policies and co-signs agent spends that pass the policy engine.
 *
 * Every method returns `{ status, body }` so the HTTP server stays thin and
 * tests (A's e2e, D-P1 §9) can run the guard in-process via inProcessCosigner.
 * /cosign requests are processed one at a time, so two concurrent requests
 * cannot both fit under the weekly cap.
 */
import { Utils, type WalletInterface } from '@agentcoop/core/sdk'
import { VAULT_PROTOCOL } from '@agentcoop/core'
import {
  isVaultId,
  toChecksigSignature,
  validateVaultRecord,
  vaultKeysForRecord,
  vaultLockingScript
} from '@agentcoop/core/scripts/vault'
import { CosignRejected, type CosignRequest, type CosignResponse, type Cosigner } from '@agentcoop/core/signers/VaultSigner'
import { decodeTxBEEF, evaluateCosign, validatePolicy, WEEK_MS } from './policy'
import { GuardStore, type Decision } from './store'

export interface GuardResult {
  status: number
  body: Record<string, unknown>
}

export interface GuardOptions {
  wallet: WalletInterface
  store?: GuardStore
  /** One readable line per decision. Default: console.log. */
  log?: (line: string) => void
  now?: () => number
  originator?: string
}

const IDENTITY_RE = /^0[23][0-9a-f]{64}$/
const short = (s: string | undefined): string => s === undefined ? '-' : `${s.slice(0, 10)}…`
const fail = (status: number, reason: string): GuardResult => ({ status, body: { reason } })

export class Guard {
  private queue: Promise<unknown> = Promise.resolve()

  private constructor (
    readonly identityKey: string,
    private readonly wallet: WalletInterface,
    readonly store: GuardStore,
    private readonly log: (line: string) => void,
    private readonly now: () => number,
    private readonly originator?: string
  ) {}

  static async create (opts: GuardOptions): Promise<Guard> {
    const { publicKey } = await opts.wallet.getPublicKey({ identityKey: true }, opts.originator)
    return new Guard(publicKey, opts.wallet, opts.store ?? new GuardStore(), opts.log ?? console.log, opts.now ?? Date.now, opts.originator)
  }

  /** PUT /vaults/:vaultId — the owner (authenticated identity) registers a vault naming this guard. */
  registerVault (authIdentity: string | undefined, vaultId: string, body: unknown): GuardResult {
    if (authIdentity === undefined) return fail(401, 'authentication required')
    const record = validateVaultRecord(body)
    if (record === null) return fail(400, 'invalid vault record')
    if (record.vaultId !== vaultId) return fail(400, 'vaultId in path and body differ')
    if (record.owner !== authIdentity) return fail(403, 'only the owner can register its vault')
    if (record.guard !== this.identityKey) return fail(400, 'the record names another guard')

    const keys = vaultKeysForRecord(record)
    const lockingScriptHex = vaultLockingScript(keys.ownerPub, keys.agentPub, keys.guardPub).toHex()
    const existing = this.store.getVault(vaultId)
    if (existing !== undefined) {
      if (existing.lockingScriptHex !== lockingScriptHex) return fail(409, 'vaultId already registered with other keys')
    } else {
      this.store.putVault({ record, lockingScriptHex, keys, registeredAt: new Date(this.now()).toISOString() })
      this.log(`[guard] REGISTER vault=${short(vaultId)} owner=${short(record.owner)} agent=${short(record.agent)}`)
    }
    return { status: 200, body: { vaultId, lockingScriptHex, guardPub: keys.guardPub } }
  }

  /** PUT /policies/:agentIdentity — stored for the (authenticated owner, agent) pair. */
  putPolicy (authIdentity: string | undefined, agent: string, body: unknown): GuardResult {
    if (authIdentity === undefined) return fail(401, 'authentication required')
    if (!IDENTITY_RE.test(agent)) return fail(400, 'agent must be an identity key')
    const policy = validatePolicy(body)
    if (policy === null) return fail(400, 'invalid policy: allowProviders (identity keys) and maxPerPoolSats, weeklyCapSats, maxFeeSats, hotWalletDailySats (integer sats ≥ 0)')
    if (this.store.vaultsOf(authIdentity, agent).length === 0) return fail(404, 'no vault of this owner for this agent')
    this.store.putPolicy(authIdentity, agent, policy, this.now())
    this.log(`[guard] POLICY owner=${short(authIdentity)} agent=${short(agent)} maxPerPool=${policy.maxPerPoolSats} weekly=${policy.weeklyCapSats} maxFee=${policy.maxFeeSats} allow=${policy.allowProviders.map(short).join(',')}`)
    return { status: 200, body: { owner: authIdentity, agent, policy } }
  }

  /** GET /vaults/:vaultId — for the vault's owner or agent. */
  getVault (authIdentity: string | undefined, vaultId: string): GuardResult {
    if (authIdentity === undefined) return fail(401, 'authentication required')
    if (!isVaultId(vaultId)) return fail(400, 'bad vaultId')
    const v = this.store.getVault(vaultId)
    if (v === undefined) return fail(404, 'unknown vault')
    if (authIdentity !== v.record.owner && authIdentity !== v.record.agent) return fail(403, 'only the owner or the agent')
    const now = this.now()
    return {
      status: 200,
      body: {
        record: v.record,
        lockingScriptHex: v.lockingScriptHex,
        policy: this.store.getPolicy(v.record.owner, v.record.agent) ?? null,
        spentLast7dSats: this.store.spentInWindow(v.record.owner, v.record.agent, now),
        windowStart: new Date(now - WEEK_MS).toISOString()
      }
    }
  }

  /** POST /cosign — policy checks, then the guard's signature over the sighash it computed. */
  async cosign (body: unknown): Promise<GuardResult> {
    const run = this.queue.then(async () => await this.cosignNow(body))
    this.queue = run.catch(() => {})
    return await run
  }

  private async cosignNow (body: unknown): Promise<GuardResult> {
    const req = body as Partial<CosignRequest> | null
    const kind = typeof req?.context?.kind === 'string' ? req.context.kind : '-'
    if (req === null || typeof req !== 'object' || typeof req.inputIndex !== 'number' || typeof req.agent !== 'string' ||
      typeof req.agentSignatureHex !== 'string' || req.context === null || typeof req.context !== 'object') {
      return this.decide({ decision: 'deny', kind, reason: 'bad request: txBEEF, inputIndex, agent, agentSignatureHex, context required' }, 400)
    }
    let tx
    try { tx = decodeTxBEEF(req.txBEEF) } catch (e) {
      return this.decide({ decision: 'deny', kind, agent: req.agent, reason: `bad request: ${(e as Error).message}` }, 400)
    }

    const now = this.now()
    const r = evaluateCosign({
      tx,
      inputIndex: req.inputIndex,
      agent: req.agent,
      agentSignatureHex: req.agentSignatureHex,
      context: req.context,
      findVault: s => this.store.findVaultByScript(s),
      policyFor: (o, a) => this.store.getPolicy(o, a),
      spentInWindow: (o, a, ex) => this.store.spentInWindow(o, a, now, ex)
    })
    if (!r.ok) {
      return this.decide({ decision: 'deny', kind, agent: req.agent, vaultId: r.vault?.record.vaultId, outpoint: r.vaultOutpoint, reason: r.reason }, r.status)
    }

    const { vaultId } = r.vault.record
    const { signature } = await this.wallet.createSignature({
      hashToDirectlySign: r.sighash,
      protocolID: VAULT_PROTOCOL,
      keyID: vaultId,
      counterparty: 'anyone'
    }, this.originator)
    this.store.recordSpend({ owner: r.vault.record.owner, agent: r.vault.record.agent, vaultId, outpoint: r.vaultOutpoint, outflowSats: r.outflowSats, at: new Date(now).toISOString() }, now)
    const res: CosignResponse = { signatureHex: Utils.toHex(toChecksigSignature(signature)), guardPub: r.vault.keys.guardPub }
    return this.decide({
      decision: 'allow', kind, agent: req.agent, vaultId, outpoint: r.vaultOutpoint, outflowSats: r.outflowSats, paidSats: r.paidSats, feeSats: r.feeSats
    }, 200, res as unknown as Record<string, unknown>)
  }

  private decide (d: Omit<Decision, 'at'>, status: number, ok?: Record<string, unknown>): GuardResult {
    const decision: Decision = { at: new Date(this.now()).toISOString(), ...d }
    this.store.logDecision(decision)
    const amounts = d.decision === 'allow' ? ` outflow=${d.outflowSats} paid=${d.paidSats} fee=${d.feeSats}` : ` reason="${d.reason}"`
    this.log(`[guard] ${d.decision.toUpperCase()} ${d.kind} agent=${short(d.agent)} vault=${short(d.vaultId)}${amounts}`)
    return ok !== undefined ? { status, body: ok } : fail(status, d.reason ?? 'denied')
  }
}

/** A Cosigner that calls a Guard in the same process (tests, A's e2e). */
export function inProcessCosigner (guard: Guard): Cosigner {
  return async (req) => {
    const { status, body } = await guard.cosign(JSON.parse(JSON.stringify(req)))
    if (status !== 200) throw new CosignRejected(status, String(body.reason))
    return body as unknown as CosignResponse
  }
}
