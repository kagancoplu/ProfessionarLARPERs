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
 */
import { WebSocket } from 'ws'
import { signHello } from '@agentcoop/coordinator/auth'
import { Transaction, type WalletInterface } from '@agentcoop/core/sdk'
import {
  buildPledge, cancelPledge, internalizeSettlement, P2pkhWalletSigner, receivePkh, signSettlementInput, verifySettlementPlan,
  type KitQuery, type LineageOptions, type Offer, type PledgeInstructions, type PoolTerms, type SettlementPlan, type TokenKit
} from '@agentcoop/core'
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
  /** Reconnect when the coordinator drops the socket. Default true. */
  reconnect?: boolean
}

const short = (txid: string): string => `${txid.slice(0, 12)}…`

export class PoolParticipant {
  active?: ActivePledge
  readonly history: ActivePledge[] = []
  private ws?: WebSocket
  private closed = false
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
    ws.on('close', () => {
      if (this.closed || this.opts.reconnect === false) return
      setTimeout(() => { void this.connect().catch(() => {}) }, 2000)
    })
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

  /** Take over a pledge made earlier (e.g. by `participant-cli pledge` in another process) to sign its round. */
  adopt (pledge: ActivePledge): void {
    if (this.busy && this.active!.outpoint !== pledge.outpoint) throw new Error(`already following pledge ${this.active!.outpoint}`)
    this.active = pledge
    if (!this.history.includes(pledge)) this.history.push(pledge)
  }

  async pledge (terms: PoolTerms, credits: number): Promise<ActivePledge> {
    if (this.busy) throw new Error(`already pledged to ${this.active!.poolId}`)
    // A failed (or left-out) pledge's coin is still in the wallet: withdraw it first.
    const previous = this.active
    if (previous !== undefined && (previous.status === 'failed' || previous.status === 'left-out')) {
      const why = previous.status === 'failed' ? 'that pool failed' : 'it settled without me'
      const { txid, beef } = await cancelPledge(this.opts.wallet, previous.outpoint)
      await this.opts.kit.overlay.submit(beef) // the overlay learns of the withdrawal only from the tx (MASTER §3.4)
      previous.status = 'withdrawn'
      this.opts.log.decision(`Reusing my pledge coin: withdrew it from "${previous.label}" (${why}); only the registration fee is gone. https://whatsonchain.com/tx/${txid}`)
    }
    const me = await this.identityKey()
    const tokenIndex = await this.opts.kit.nextIndex(me)
    const p = await buildPledge(this.opts.wallet, terms, String(credits), 'p2pkh', undefined, { tokenIndex })
    await this.opts.kit.overlay.submit(p.beef)
    this.active = {
      poolId: terms.poolId, label: terms.label, outpoint: p.outpoint, credits: p.record.credits, tokenIndex, instructions: p.instructions,
      status: 'pending', pricePerCredit: Number(terms.priceSats) / Number(terms.credits)
    }
    this.history.push(this.active)
    this.opts.log.decision(`Pledged ${credits} credits to "${terms.label}": ${p.satoshis.toLocaleString('en-US')} sat stay in my wallet as a pledge coin until settlement. https://whatsonchain.com/tx/${p.txid}`)
    return this.active
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
      this.opts.log.decision(`Refused to sign round ${msg.round} of "${a.label}": ${reason}`)
      return
    }
    const unlock = await signSettlementInput(msg.plan, msg.yourInputIndex, new P2pkhWalletSigner(this.opts.wallet, { protocolID: a.instructions.protocolID, keyID: a.instructions.keyID }))
    this.send({ type: 'sign_response', poolId: msg.poolId, round: msg.round, inputIndex: msg.yourInputIndex, unlockingScriptHex: unlock.toHex() })
    a.plan = msg.plan
    a.status = 'signed'
    const mine = msg.plan.participants.find(p => p.outpoint === a.outpoint)
    this.opts.log.info(`Round ${msg.round} of "${a.label}": checked the whole settlement (my ${a.credits} credits to my address, ${mine?.changeSats ?? '?'} sat change back, the provider's credits traced to the token deploy) → signed with SIGHASH_ALL.`)
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
    await internalizeSettlement(this.opts.wallet, tx, a.plan, a.outpoint, a.instructions)
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
