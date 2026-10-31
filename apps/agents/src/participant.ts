/**
 * The agent's side of a pool (MASTER §3.5 WS protocol, Track A builders):
 *
 *   pledge     buildPledge → submit to the overlay (tm_agentcoop)
 *   sign       on `sign_request`: verifySettlementPlan (my credits, my change,
 *              the provider's credits checked back to the deploy with
 *              verifyLineage) → signSettlementInput (SIGHASH_ALL) → `sign_response`;
 *              anything wrong → `sign_reject { reason }`
 *   settled    internalizeSettlement (my change back) + TokenKit.sync (my credits)
 *   failed     nothing was spent; the pledge coin stays mine and is withdrawn
 *              (cancelPledge) before the next pledge (one active pledge at a time)
 *
 * The agent must stay connected: the coordinator sends `sign_request` only to
 * sessions that proved the agent's identity in `hello` (B.P5a).
 *
 * restore() (after a restart): the active pledge lives only in memory, so a
 * restarted agent would answer its round with "no active pledge" and be
 * blacklisted (mainnet, 31.10). It takes the waiting pledge back from the
 * wallet's pledge basket: the record from the pledge tx, the pool from the coordinator.
 *
 * Vault mode (track C 3.2, Mandate Vault, Track D): the pledge coin comes from
 * the owner-funded vault (pledgeFromVault: the guard checks the owner's policy
 * at pledge time), the settlement input is signed agent + guard (VaultSigner:
 * the guard checks the plan, DvP and lineage again), and the change goes back
 * to the vault (internalizeVaultSettlement). The guard can refuse either step.
 * The pledge asks for vault-locked credits (record creditLock 'vault', A-P5
 * 5.3): the credits settle onto the vault script too (internalizeVaultCredits),
 * so the agent alone can never move them (FINAL-IDEA §8).
 */
import { WebSocket } from 'ws'
import { signHello } from '@agentcoop/coordinator/auth'
import { Beef, Transaction, type WalletInterface } from '@agentcoop/core/sdk'
import {
  buildPledge, cancelPledge, internalizeSettlement, internalizeVaultCredits, P2pkhWalletSigner, PLEDGE_BASKET, pledgeRecordOf, receivePkh, signSettlementInput, verifySettlementPlan,
  type KitQuery, type LineageOptions, type Offer, type PledgeInstructions, type PoolTerms, type SettlementPlan, type TokenKit
} from '@agentcoop/core'
import {
  CosignRejected, internalizeVaultSettlement, listVaultUtxos, pledgeFromVault, VaultSigner, type Cosigner
} from '@agentcoop/core/signers/VaultSigner'
import type { AgentLog } from './log'

export type PledgeStatus = 'pending' | 'signed' | 'settled' | 'failed' | 'left-out' | 'withdrawn'

export interface ActivePledge {
  poolId: string
  label: string
  outpoint: string
  credits: string
  tokenIndex: number
  instructions: PledgeInstructions
  status: PledgeStatus
  /** What the pool charges per credit (P / N): the market ask is based on it. */
  pricePerCredit: number
  /** Set for a pledge made from a Mandate Vault. */
  vaultId?: string
  /** A-P5 lighthouse pledge (participant-cli --lighthouse): signed once, its guard co-signs the round. */
  lighthouse?: true
  /** The last plan this agent signed (needed to take its change back). */
  plan?: SettlementPlan
  settledTxid?: string
}

export interface ParticipantOptions {
  wallet: WalletInterface
  kit: TokenKit
  coopApiUrl: string
  log: AgentLog
  /** verifyLineage source (tests: the mock chain). Default: Arcade. */
  lineage?: LineageOptions
  /** Reconnect when the coordinator drops the socket (retrying with backoff until close()). Default true. */
  reconnect?: boolean
  /** Live-feed events (Agent.emit). */
  emit?: (type: string, data: unknown, extra?: { txid?: string, poolId?: string }) => void
  /** Mandate Vault mode: pledges come from this vault and every signature needs the guard. */
  vault?: { vaultId: string, cosign: Cosigner }
}

const short = (txid: string): string => `${txid.slice(0, 12)}…`

export class PoolParticipant {
  active?: ActivePledge
  readonly history: ActivePledge[] = []
  private ws?: WebSocket
  private closed = false
  private reconnecting = false
  private identity?: string
  private readonly listeners = new Set<() => void>()

  constructor (private readonly opts: ParticipantOptions) {}

  async identityKey (): Promise<string> {
    this.identity ??= await this.opts.kit.identityKey()
    return this.identity
  }

  /** Open the coordinator WS and say a proven hello (subscribed to every pool; B.P5a: the coordinator's challenge is signed). */
  async connect (): Promise<void> {
    const identity = await this.identityKey()
    const host = new URL(this.opts.coopApiUrl).host
    const url = `${this.opts.coopApiUrl.replace(/^http/, 'ws')}/ws`
    const ws = new WebSocket(url)
    this.ws = ws
    await new Promise<void>((resolve, reject) => {
      ws.once('error', reject)
      ws.once('close', () => { reject(new Error('the coordinator closed the connection')) }) // no-op once resolved
      ws.on('message', d => {
        const msg = JSON.parse(d.toString()) as { type: string, [k: string]: any }
        if (msg.type === 'challenge') {
          void signHello(this.opts.wallet, host, String(msg.nonce))
            .then(sig => { ws.send(JSON.stringify({ type: 'hello', identity, poolIds: [], sig })) })
            .catch(reject)
          return
        }
        if (msg.type === 'hello_ack') resolve()
        void this.onMessage(msg).catch(e => { this.opts.log.info(`coordinator message ${msg.type} failed: ${(e as Error).message}`) })
      })
    })
    ws.on('error', () => {}) // a reset socket also emits 'close', which reconnects; an unhandled 'error' would end the process
    ws.on('close', () => { this.reconnectLater() })
  }

  /**
   * Keep trying to get back on the coordinator's WS (2 s, 4 s, … up to 30 s apart) until it works or
   * close() is called. A coordinator restart drops every session; one try while it was still down used
   * to leave the agent off the WS for good, so it was never asked to sign (mainnet, 31.10).
   */
  reconnectLater (attempt = 1): void {
    if (this.closed || this.opts.reconnect === false || this.reconnecting) return
    this.reconnecting = true
    setTimeout(() => {
      this.reconnecting = false
      if (this.closed) return
      this.connect()
        .then(() => { this.opts.log.info('Back on the coordinator\'s WS.') })
        .catch(() => { this.reconnectLater(attempt + 1) })
    }, Math.min(2_000 * attempt, 30_000))
  }

  close (): void {
    this.closed = true
    this.ws?.close()
  }

  /** Resolves when `predicate` holds (checked after every coordinator message). */
  async until (predicate: () => boolean, ms = 60_000): Promise<void> {
    if (predicate()) return
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => { this.listeners.delete(check); reject(new Error('timed out waiting for the pool')) }, ms)
      const check = (): void => { if (predicate()) { clearTimeout(timer); this.listeners.delete(check); resolve() } }
      this.listeners.add(check)
    })
  }

  /** On the coordinator's WS right now (needed to be asked to sign). */
  get connected (): boolean {
    return this.ws?.readyState === WebSocket.OPEN
  }

  /** True while a pledge is waiting for its pool. */
  get busy (): boolean {
    return this.active !== undefined && (this.active.status === 'pending' || this.active.status === 'signed')
  }

  /**
   * After a restart: take back the pledge still in the wallet (P2PKH pledges; settlement change in the
   * same basket is skipped). Its pool open → 'pending' (signs the next round); settled without it →
   * 'left-out'; failed or cancelled → 'failed' (both withdrawn before the next pledge). No-op when a
   * pledge is already active, in vault mode, or when there is none.
   */
  async restore (): Promise<ActivePledge | undefined> {
    if (this.active !== undefined || this.opts.vault !== undefined) return this.active
    const res = await this.opts.wallet.listOutputs({ basket: PLEDGE_BASKET, include: 'entire transactions', includeCustomInstructions: true, limit: 1000 })
    const beef = res.BEEF !== undefined ? Beef.fromBinary(Array.from(res.BEEF)) : undefined
    for (const o of res.outputs) {
      if (!o.spendable || o.customInstructions === undefined) continue
      let ins: PledgeInstructions & { change?: boolean }
      try { ins = JSON.parse(o.customInstructions) } catch { continue }
      if (ins.change === true || typeof ins.poolId !== 'string') continue
      const [txid, vout] = o.outpoint.split('.')
      const tx = beef?.findTxid(txid)?.tx
      const record = tx !== undefined ? pledgeRecordOf(tx) : undefined
      if (record === undefined || record.poolId !== ins.poolId) continue
      const r = await fetch(`${this.opts.coopApiUrl}/pools/${ins.poolId}`).catch(() => undefined)
      if (r?.ok !== true) continue
      const pool = await r.json() as { status: string, terms: PoolTerms }
      const status: PledgeStatus = pool.status === 'open' || pool.status === 'locking' ? 'pending' : pool.status === 'settled' ? 'left-out' : 'failed'
      this.active = {
        poolId: ins.poolId, label: pool.terms.label, outpoint: `${txid}_${vout}`, credits: record.credits, tokenIndex: Number(record.tokenIndex),
        instructions: ins, status, pricePerCredit: Number(pool.terms.priceSats) / Number(pool.terms.credits)
      }
      this.history.push(this.active)
      this.opts.log.info(`Restored my pledge of ${record.credits} credits to "${pool.terms.label}" from the wallet (${status}).`)
      return this.active
    }
    return undefined
  }

  /** Take over a pledge made earlier (e.g. by `participant-cli pledge` in another process) to sign its round. */
  adopt (pledge: ActivePledge): void {
    if (this.busy && this.active!.outpoint !== pledge.outpoint) throw new Error(`already following pledge ${this.active!.outpoint}`)
    this.active = pledge
    if (!this.history.includes(pledge)) this.history.push(pledge)
  }

  async pledge (terms: PoolTerms, credits: number): Promise<ActivePledge> {
    if (this.busy) throw new Error(`already pledged to ${this.active!.poolId}`)
    // A failed (or left-out) pledge's coin is still in the wallet: withdraw it first.
    // (A vault pledge coin stays on the vault script, spendable by the owner; nothing to withdraw.)
    const previous = this.active
    if (previous !== undefined && previous.vaultId === undefined && (previous.status === 'failed' || previous.status === 'left-out')) {
      const why = previous.status === 'failed' ? 'that pool failed' : 'it settled without me'
      const { txid, beef } = await cancelPledge(this.opts.wallet, previous.outpoint)
      await this.opts.kit.overlay.submit(beef) // the overlay learns of the withdrawal only from the tx (MASTER §3.4)
      previous.status = 'withdrawn'
      this.opts.log.decision(`Reusing my pledge coin: withdrew it from "${previous.label}" (${why}); only the registration fee is gone. https://whatsonchain.com/tx/${txid}`)
    }
    const me = await this.identityKey()
    const tokenIndex = await this.opts.kit.nextIndex(me)
    const p = this.opts.vault === undefined
      ? await buildPledge(this.opts.wallet, terms, String(credits), 'p2pkh', undefined, { tokenIndex })
      : await this.pledgeFromVault(terms, credits, tokenIndex) // the guard may refuse here (CosignRejected)
    await this.opts.kit.overlay.submit(p.beef)
    this.active = {
      poolId: terms.poolId, label: terms.label, outpoint: p.outpoint, credits: p.record.credits, tokenIndex, instructions: p.instructions as PledgeInstructions,
      status: 'pending', pricePerCredit: Number(terms.priceSats) / Number(terms.credits), vaultId: this.opts.vault?.vaultId
    }
    this.history.push(this.active)
    this.opts.emit?.('agent_payment', { kind: 'pledge', txid: p.txid, sats: p.satoshis }, { txid: p.txid, poolId: terms.poolId })
    this.opts.log.decision(`Pledged ${credits} credits to "${terms.label}": ${p.satoshis.toLocaleString('en-US')} sat stay ${this.opts.vault !== undefined ? 'in my owner\'s vault (the guard approved it)' : 'in my wallet'} as a pledge coin until settlement. https://whatsonchain.com/tx/${p.txid}`)
    return this.active
  }

  private async pledgeFromVault (terms: PoolTerms, credits: number, tokenIndex: number): ReturnType<typeof pledgeFromVault> {
    const { vaultId, cosign } = this.opts.vault!
    const [utxo] = await listVaultUtxos(this.opts.wallet, vaultId)
    if (utxo === undefined) throw new Error(`vault ${vaultId.slice(0, 12)}… has no spendable funds (the owner funds it)`)
    // The pool transaction from the overlay saves the guard a fetch.
    const [pool] = await this.opts.kit.overlay.lookup({ op: 'pool', poolId: terms.poolId } as unknown as KitQuery)
    return await pledgeFromVault(this.opts.wallet, { vaultId, utxo, terms, credits: String(credits), tokenIndex, cosign, poolBEEF: pool?.beef, creditLock: 'vault' })
  }

  private async onMessage (msg: { type: string, [k: string]: any }): Promise<void> {
    try {
      const a = this.active
      if (msg.type === 'sign_request') await this.onSignRequest(msg as unknown as { poolId: string, round: number, plan: SettlementPlan, yourInputIndex: number })
      else if (msg.type === 'settled') await this.onSettled(msg.poolId, msg.txid)
      else if (msg.type === 'pool_failed') this.onFailed(msg.poolId)
      else if (msg.type === 'round_failed' && a !== undefined && a.poolId === msg.poolId) {
        this.opts.log.info(`Round ${String(msg.round)} of "${a.label}" failed (missing: ${(msg.missing as string[]).length}); the coordinator retries.`)
      }
    } finally {
      for (const l of [...this.listeners]) l()
    }
  }

  private send (msg: object): void {
    this.ws?.send(JSON.stringify(msg))
  }

  private async onSignRequest (msg: { poolId: string, round: number, plan: SettlementPlan, yourInputIndex: number }): Promise<void> {
    const a = this.active
    if (a === undefined || a.poolId !== msg.poolId) {
      this.send({ type: 'sign_reject', poolId: msg.poolId, round: msg.round, reason: 'no active pledge of mine in this pool' })
      return
    }
    const res = await fetch(`${this.opts.coopApiUrl}/offers/${msg.poolId}`)
    if (!res.ok) {
      this.send({ type: 'sign_reject', poolId: msg.poolId, round: msg.round, reason: `offer not available (${res.status})` })
      return
    }
    const offer = await res.json() as Offer
    try {
      await verifySettlementPlan(msg.plan, offer, a.outpoint, {
        expectedCredits: a.credits,
        expectedCreditPkh: receivePkh(await this.identityKey(), a.tokenIndex),
        verifyLineage: true,
        lineage: this.opts.lineage
      })
    } catch (e) {
      const reason = (e as Error).message
      this.send({ type: 'sign_reject', poolId: msg.poolId, round: msg.round, reason })
      this.opts.emit?.('agent_decision', { action: 'reject', poolId: msg.poolId, reason }, { poolId: msg.poolId })
      this.opts.log.decision(`Refused to sign round ${msg.round} of "${a.label}": ${reason}`)
      return
    }
    const signer = this.opts.vault === undefined
      ? new P2pkhWalletSigner(this.opts.wallet, { protocolID: a.instructions.protocolID, keyID: a.instructions.keyID })
      : new VaultSigner(this.opts.wallet, {
        vaultId: this.opts.vault.vaultId,
        cosign: this.opts.vault.cosign,
        plan: msg.plan,
        context: { kind: 'settle', poolId: msg.poolId, expectedCredits: a.credits, tokenId: offer.terms.tokenId }
      })
    let unlock
    try {
      unlock = await signSettlementInput(msg.plan, msg.yourInputIndex, signer)
    } catch (e) {
      if (!(e instanceof CosignRejected)) throw e
      this.send({ type: 'sign_reject', poolId: msg.poolId, round: msg.round, reason: `guard: ${e.reason}` })
      this.opts.emit?.('agent_decision', { action: 'reject', poolId: msg.poolId, reason: `guard refused to co-sign: ${e.reason}` }, { poolId: msg.poolId })
      this.opts.log.decision(`The guard refused to co-sign round ${msg.round} of "${a.label}": ${e.reason}. Nothing is signed.`)
      return
    }
    this.send({ type: 'sign_response', poolId: msg.poolId, round: msg.round, inputIndex: msg.yourInputIndex, unlockingScriptHex: unlock.toHex() })
    a.plan = msg.plan
    a.status = 'signed'
    this.opts.emit?.('agent_decision', { action: 'sign', poolId: msg.poolId, credits: Number(a.credits), reason: `round ${msg.round}: whole settlement checked, provider credits traced to the deploy` }, { poolId: msg.poolId })
    const mine = msg.plan.participants.find(p => p.outpoint === a.outpoint)
    this.opts.log.info(`Round ${msg.round} of "${a.label}": checked the whole settlement (my ${a.credits} credits to my address, ${mine?.changeSats ?? '?'} sat change back, the provider's credits traced to the token deploy) → signed with SIGHASH_ALL${this.opts.vault !== undefined ? ' (agent + guard 2-of-2; the guard checked it too)' : ''}.`)
  }

  private async settlementTx (poolId: string, txid: string): Promise<Transaction> {
    for (let attempt = 0; attempt < 10; attempt++) {
      const [out] = await this.opts.kit.overlay.lookup({ op: 'settlement', poolId } as unknown as KitQuery)
      if (out !== undefined && out.txid === txid) return Transaction.fromBEEF(out.beef, txid)
      await new Promise(resolve => setTimeout(resolve, 300))
    }
    throw new Error(`settlement ${txid} is not on the overlay yet`)
  }

  private async onSettled (poolId: string, txid: string): Promise<void> {
    const a = this.active
    if (a === undefined || a.poolId !== poolId || a.status === 'settled') return
    a.settledTxid = txid
    if (a.plan === undefined || !a.plan.participants.some(p => p.outpoint === a.outpoint)) {
      a.status = 'left-out'
      this.opts.log.decision(`"${a.label}" settled without my pledge (wait list). My pledge coin was not touched.`)
      return
    }
    const tx = await this.settlementTx(poolId, txid)
    if (a.vaultId !== undefined) {
      await internalizeVaultSettlement(this.opts.wallet, tx, a.plan, a.outpoint, a.vaultId) // change back on the vault script
      // Credits locked to the vault (creditLock 'vault'): agent + guard, or the owner, move them.
      if (a.plan.participants.find(p => p.outpoint === a.outpoint)?.creditLock === 'vault') await internalizeVaultCredits(this.opts.wallet, tx, a.plan, a.outpoint, a.vaultId)
    } else await internalizeSettlement(this.opts.wallet, tx, a.plan, a.outpoint, a.instructions)
    await this.opts.kit.sync()
    a.status = 'settled'
    this.opts.log.decision(`Pool "${a.label}" filled. One settlement tx paid the provider and delivered every share: ${a.credits} credits are mine. https://whatsonchain.com/tx/${txid}`)
  }

  private onFailed (poolId: string): void {
    const a = this.active
    if (a === undefined || a.poolId !== poolId || (a.status !== 'pending' && a.status !== 'signed')) return
    a.status = 'failed'
    this.opts.log.decision(`Pool "${a.label}" failed (deadline passed before it filled). Nothing was spent: my pledge coin ${short(a.outpoint)} is still in my wallet; I keep buying at retail.`)
  }
}
