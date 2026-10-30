/**
 * The guard (MASTER §3.7, plan/phases/D-P1.md §7): registers vaults, stores the
 * owners' policies and co-signs agent spends that pass the policy engine.
 *
 * Every method returns `{ status, body }` so the HTTP server stays thin and
 * tests (A's e2e, D-P1 §9) can run the guard in-process via inProcessCosigner.
 * /cosign requests are processed one at a time, so two concurrent requests
 * cannot both fit under the weekly cap.
 */
import { Utils, type Transaction, type WalletInterface } from '@agentcoop/core/sdk'
import { arcadeTxFetcher, parseOutpoint, VAULT_PROTOCOL, verifyLineage, type LineageCache, type LineageOptions, type TxFetcher } from '@agentcoop/core'
import {
  isVaultId,
  toChecksigSignature,
  validateVaultRecord,
  vaultKeysForRecord,
  vaultLockingScript
} from '@agentcoop/core/scripts/vault'
import { CosignRejected, type CosignRequest, type CosignResponse, type Cosigner } from '@agentcoop/core/signers/VaultSigner'
import { decodeTxBEEF, evaluateCosign, inputOutpoint, validatePolicy, WEEK_MS, type CosignAllowed, type CosignDenied } from './policy'
import { errorReason, findPledgeRecord, poolFactsFromTx, txFromBytes, type PoolFacts } from './pool'
import { evaluateSettle } from './settle'
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
  /** Where the guard fetches transactions it is not given (pool transactions, lineage). Default: Arcade, then WhatsOnChain. */
  fetchTx?: TxFetcher
  arcadeUrl?: string
}

interface Prepared {
  kind: string
  req?: CosignRequest
  tx?: Transaction
  pledgePool?: PoolFacts | { error: string }
  error?: { status: 400 | 403, reason: string }
}

const IDENTITY_RE = /^0[23][0-9a-f]{64}$/
const short = (s: string | undefined): string => s === undefined ? '-' : `${s.slice(0, 10)}…`
const fail = (status: number, reason: string): GuardResult => ({ status, body: { reason } })

export class Guard {
  private queue: Promise<unknown> = Promise.resolve()
  /** verifyLineage results for the guard's lifetime: a pool checked at pledge time is instant in the settlement round (D-P2 §4.6). */
  readonly lineageCache: LineageCache = new Map()
  private readonly fetchTx: TxFetcher

  private constructor (
    readonly identityKey: string,
    private readonly wallet: WalletInterface,
    readonly store: GuardStore,
    private readonly log: (line: string) => void,
    private readonly now: () => number,
    private readonly originator: string | undefined,
    fetchTx: TxFetcher
  ) {
    this.fetchTx = fetchTx
  }

  static async create (opts: GuardOptions): Promise<Guard> {
    const { publicKey } = await opts.wallet.getPublicKey({ identityKey: true }, opts.originator)
    return new Guard(publicKey, opts.wallet, opts.store ?? new GuardStore(), opts.log ?? console.log, opts.now ?? Date.now, opts.originator,
      opts.fetchTx ?? arcadeTxFetcher(opts.arcadeUrl))
  }

  private get lineage (): LineageOptions { return { fetchTx: this.fetchTx, cache: this.lineageCache } }

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
        hotLast24hSats: this.store.hotSpent(v.record.owner, v.record.agent, now),
        windowStart: new Date(now - WEEK_MS).toISOString()
      }
    }
  }

  /**
   * POST /cosign — policy checks, then the guard's signature over the sighash it computed.
   * Network work (the pledge's pool transaction, lineage) runs first, outside the queue;
   * the policy decision, the signature and the ledger update run one request at a time.
   */
  async cosign (body: unknown): Promise<GuardResult> {
    const prepared = await this.prepare(body)
    const run = this.queue.then(async () => await this.cosignNow(prepared))
    this.queue = run.catch(() => {})
    return await run
  }

  private async prepare (body: unknown): Promise<Prepared> {
    const req = body as Partial<CosignRequest> | null
    const kind = typeof req?.context?.kind === 'string' ? req.context.kind : '-'
    if (req === null || typeof req !== 'object' || typeof req.inputIndex !== 'number' || typeof req.agent !== 'string' ||
      typeof req.agentSignatureHex !== 'string' || req.context === null || typeof req.context !== 'object') {
      return { kind, error: { status: 400, reason: 'bad request: txBEEF or plan, inputIndex, agent, agentSignatureHex, context required' } }
    }
    const request = req as CosignRequest
    if (kind === 'settle') {
      // Warm the lineage cache (normally already done at pledge time).
      const poolId = (request.plan as { poolId?: unknown } | undefined)?.poolId
      if (typeof poolId === 'string') await verifyLineage(poolId, this.lineage).catch(() => undefined)
      return { kind, req: request }
    }
    let tx: Transaction
    try { tx = decodeTxBEEF(request.txBEEF) } catch (e) {
      return { kind, req: request, error: { status: 400, reason: `bad request: ${(e as Error).message}` } }
    }
    const found = findPledgeRecord(tx)
    if (found === null || found === 'invalid') return { kind, req: request, tx }
    return { kind, req: request, tx, pledgePool: await this.poolFacts(found.record.poolId, request.context.poolBEEF) }
  }

  /** 2.1b P3 + P6: the pool transaction (given or fetched, bound by txid), its terms and nonce, and the offer's lineage. */
  private async poolFacts (poolId: string, poolBEEF: unknown): Promise<PoolFacts | { error: string }> {
    const { txid } = parseOutpoint(poolId)
    let poolTx: Transaction
    try {
      poolTx = poolBEEF !== undefined ? txFromBytes(poolBEEF, txid) : await this.fetchTx(txid)
    } catch (e) {
      return { error: `pool transaction not available: ${errorReason(e)}` }
    }
    let pool: PoolFacts
    try { pool = poolFactsFromTx(poolTx, poolId) } catch (e) { return { error: errorReason(e) } }
    const l = await verifyLineage(poolId, this.lineage).catch((e: unknown) => ({ ok: false, reason: errorReason(e), depth: 0 }))
    return { ...pool, lineage: l }
  }

  private async cosignNow (p: Prepared): Promise<GuardResult> {
    const { kind, req } = p
    if (p.error !== undefined || req === undefined) {
      return this.decide({ decision: 'deny', kind, agent: req?.agent, reason: p.error?.reason ?? 'bad request' }, p.error?.status ?? 400)
    }
    const now = this.now()
    const common = {
      agent: req.agent,
      agentSignatureHex: req.agentSignatureHex,
      context: req.context,
      findVault: (s: string) => this.store.findVaultByScript(s),
      policyFor: (o: string, a: string) => this.store.getPolicy(o, a),
      spentInWindow: (o: string, a: string, ex: string[]) => this.store.spentInWindow(o, a, now, ex),
      poolSpent: (o: string, a: string, poolId: string, ex: string[]) => this.store.poolSpent(o, a, poolId, now, ex),
      hotSpent: (o: string, a: string, ex: string[]) => this.store.hotSpent(o, a, now, ex)
    }
    let r: CosignAllowed | CosignDenied
    if (kind === 'settle') {
      r = await evaluateSettle({
        ...common,
        plan: req.plan,
        inputIndex: req.inputIndex,
        reservationFor: (o, a, inputs) => this.store.findReservation(o, a, inputs, now),
        lineage: this.lineage
      })
    } else {
      const tx = p.tx!
      r = evaluateCosign({ ...common, tx, inputIndex: req.inputIndex, pledgePool: p.pledgePool, reservationKey: this.reservationOf(tx, req.inputIndex, now) })
    }
    if (!r.ok) {
      return this.decide({ decision: 'deny', kind, agent: req.agent, vaultId: r.vault?.record.vaultId, outpoint: r.vaultOutpoint, reason: r.reason }, r.status)
    }

    const { vaultId, owner, agent } = r.vault.record
    const { signature } = await this.wallet.createSignature({
      hashToDirectlySign: r.sighash,
      protocolID: VAULT_PROTOCOL,
      keyID: vaultId,
      counterparty: 'anyone'
    }, this.originator)
    const at = new Date(now).toISOString()
    for (const entry of r.entries) this.store.recordSpend({ owner, agent, vaultId, at, ...entry }, now)
    const res: CosignResponse = { signatureHex: Utils.toHex(toChecksigSignature(signature)), guardPub: r.vault.keys.guardPub }
    return this.decide({
      decision: 'allow',
      kind: r.pledge !== undefined ? 'pay/pledge' : r.hotSats > 0 ? 'pay/hot' : kind,
      agent: req.agent,
      vaultId,
      outpoint: r.vaultOutpoint,
      outflowSats: r.outflowSats,
      paidSats: r.paidSats,
      feeSats: r.feeSats,
      ...(r.pledge !== undefined ? { poolId: r.pledge.poolId, committedSats: r.pledge.coinSats } : kind === 'settle' ? { poolId: r.entries[0].poolId } : {}),
      ...(r.hotSats > 0 ? { hotSats: r.hotSats } : {})
    }, 200, res as unknown as Record<string, unknown>)
  }

  /** A vault input that spends a pledge coin (out0 of a pledge tx) resolves that pledge's reservation. */
  private reservationOf (tx: Transaction, inputIndex: number, now: number): string | undefined {
    const input = tx.inputs[inputIndex]
    const src = input?.sourceTransaction
    if (src === undefined || input.sourceOutputIndex !== 0) return undefined
    const found = findPledgeRecord(src)
    if (found === null || found === 'invalid') return undefined
    const vault = this.store.findVaultByScript(src.outputs[0].lockingScript.toHex())
    if (vault === undefined) return undefined
    return this.store.findReservation(vault.record.owner, vault.record.agent, src.inputs.map((_, k) => inputOutpoint(src, k)), now)
  }

  private decide (d: Omit<Decision, 'at'>, status: number, ok?: Record<string, unknown>): GuardResult {
    const decision: Decision = { at: new Date(this.now()).toISOString(), ...d }
    this.store.logDecision(decision)
    const extra = `${d.poolId !== undefined ? ` pool=${short(d.poolId)}` : ''}${d.committedSats !== undefined ? ` committed=${d.committedSats}` : ''}${d.hotSats !== undefined ? ` hot=${d.hotSats}` : ''}`
    const amounts = d.decision === 'allow' ? ` outflow=${d.outflowSats} paid=${d.paidSats} fee=${d.feeSats}${extra}` : ` reason="${d.reason}"`
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
