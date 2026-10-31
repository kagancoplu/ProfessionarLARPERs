/**
 * Lock-in, signing rounds and broadcast (plan/phases/B-P2.md §3.2).
 *
 * The coordinator never holds funds or keys: it asks Track A's protocol for
 * the deterministic plan, collects each participant's SIGHASH_ALL signature
 * over WS, checks every signature against the template, and broadcasts only
 * a fully signed settlement. Participants that do not sign are blacklisted
 * and replaced from the waiting list; at most `maxRounds` rounds per attempt.
 * A lighthouse participant (A-P5 5.5, offline human) is not asked over WS:
 * the guard its record names co-signs instead (./lighthouse.ts), checked the same way.
 */
import { Transaction, UnlockingScript } from '@agentcoop/core/sdk'
import { isLighthouseRecord, type Offer, type SettlementPlan } from '@agentcoop/core'
import type { PoolView } from '../../../packages/overlay/src/views'
import { recordOf } from './candidates'
import type { HeightSource } from './chain'
import type { LighthouseDesk } from './lighthouse'
import type { Logger } from './log'
import type { OverlayLookup } from './overlay'
import type { SettlementProtocol } from './protocol'
import { inputIsValid } from './script'
import type { SpentChecker } from './spent'
import type { OfferSource } from './offers'
import type { CoordinatorStore } from './store'

export interface EngineDeps {
  overlay: OverlayLookup
  store: CoordinatorStore
  offers: OfferSource
  height: HeightSource
  protocol: SettlementProtocol
  spent: SpentChecker
  feed: { sendTo: (identity: string, msg: object | string) => number, broadcast: (poolId: string, msg: object) => void }
  log: Logger
  /** Lighthouse pledges and their guards; without it lighthouse pledges are left out of plans. */
  lighthouse?: LighthouseDesk
}

export interface EngineOptions {
  /** MASTER §3.2: ~60 s per round */
  roundTimeoutMs: number
  /** MASTER §3.2: at most 3 rounds */
  maxRounds: number
  tickMs: number
  /**
   * No round for this long after start(): participants' WS sessions die with the old process and
   * need time to reconnect, or the first round finds everyone "offline" and blacklists them all
   * (mainnet restart, 31.10). Default 0 (tests).
   */
  startupGraceMs?: number
}

export interface CoordinatorStatus {
  round: number
  signed: number
  total: number
  blacklist: Array<{ outpoint: string, reason: string }>
  lastRound?: { round: number, outcome: 'settled' | 'failed', missing: string[], txid?: string }
}

interface RoundState {
  poolId: string
  round: number
  plan: SettlementPlan
  offer: Offer
  template: Transaction
  /** input index → pledge */
  inputs: Map<number, { outpoint: string, participant: string, lighthouse?: true }>
  signed: Map<number, string>
  failed: Map<number, string>
  timer?: NodeJS.Timeout
  done: boolean
}

interface PoolProgress {
  attempts: number
  blacklist: Map<string, string>
  lastRound?: CoordinatorStatus['lastRound']
  failedAnnounced: boolean
  /** after maxRounds: the eligible pledge set we gave up on; a new pledge starts a fresh attempt */
  gaveUp?: { key?: string }
}

const outpointOfInput = (tx: Transaction, i: number): string =>
  `${tx.inputs[i].sourceTXID ?? tx.inputs[i].sourceTransaction!.id('hex')}_${tx.inputs[i].sourceOutputIndex}`

export class CoordinatorEngine {
  private readonly rounds = new Map<string, RoundState>()
  private readonly progress = new Map<string, PoolProgress>()
  private readonly starting = new Set<string>()
  private timer?: NodeJS.Timeout
  private ticking = false
  private again = false

  constructor (private readonly deps: EngineDeps, private readonly opts: EngineOptions) {}

  /** Restore blacklists, attempts and last rounds saved before a restart (B.P3). */
  async load (): Promise<void> {
    for (const { poolId, json } of await this.deps.store.allProgress()) {
      this.progress.set(poolId, {
        attempts: json.attempts ?? 0,
        blacklist: new Map(json.blacklist ?? []),
        ...(json.lastRound !== undefined ? { lastRound: json.lastRound } : {}),
        failedAnnounced: json.failedAnnounced === true,
        ...(json.gaveUp !== undefined ? { gaveUp: json.gaveUp } : {})
      })
    }
  }

  private persist (poolId: string): void {
    const p = this.progress.get(poolId)
    if (p === undefined) return
    const json = { attempts: p.attempts, blacklist: [...p.blacklist], lastRound: p.lastRound, failedAnnounced: p.failedAnnounced, gaveUp: p.gaveUp }
    this.deps.store.saveProgress(poolId, json).catch(e => this.deps.log('persist_failed', { poolId, error: String((e as Error).message ?? e) }))
  }

  private roundsFrom = 0

  start (): void {
    const grace = this.opts.startupGraceMs ?? 0
    this.roundsFrom = Date.now() + grace
    if (grace > 0) this.deps.log('startup_grace', { ms: grace })
    void this.tick()
    this.timer = setInterval(() => { void this.tick() }, this.opts.tickMs)
  }

  stop (): void {
    if (this.timer !== undefined) clearInterval(this.timer)
    for (const r of this.rounds.values()) if (r.timer !== undefined) clearTimeout(r.timer)
  }

  /** Pools with a signing round running or starting (API status `locking`). */
  locking (): Set<string> {
    return new Set([...this.rounds.keys(), ...this.starting])
  }

  status (poolId: string): CoordinatorStatus | undefined {
    const p = this.progress.get(poolId)
    const r = this.rounds.get(poolId)
    if (p === undefined && r === undefined) return undefined
    return {
      round: r?.round ?? p?.lastRound?.round ?? 0,
      signed: r?.signed.size ?? 0,
      total: r?.inputs.size ?? 0,
      blacklist: [...(p?.blacklist ?? new Map<string, string>())].map(([outpoint, reason]) => ({ outpoint, reason })),
      ...(p?.lastRound !== undefined ? { lastRound: p.lastRound } : {})
    }
  }

  /** Look at every open pool: announce missed deadlines, start rounds for full pools. A call during a tick runs one more. */
  async tick (): Promise<void> {
    if (this.ticking) { this.again = true; return }
    this.ticking = true
    try {
      do {
        this.again = false
        await this.tickOnce()
      } while (this.again)
    } finally {
      this.ticking = false
    }
  }

  private async tickOnce (): Promise<void> {
    try {
      const [pools, height] = await Promise.all([this.deps.overlay.pools(), this.deps.height.height()])
      for (const pool of pools) {
        if (pool.status !== 'open' || pool.invalidReason !== undefined) continue
        if (this.rounds.has(pool.poolId) || this.starting.has(pool.poolId)) continue
        const prog = this.prog(pool.poolId)
        if (height !== undefined && height >= Number(pool.terms.deadlineHeight)) {
          if (!prog.failedAnnounced) {
            prog.failedAnnounced = true
            this.deps.feed.broadcast(pool.poolId, { type: 'pool_failed', poolId: pool.poolId })
            this.deps.log('pool_failed', { poolId: pool.poolId, pledgedCredits: pool.pledgedCredits, target: pool.target, height })
            this.persist(pool.poolId)
          }
          continue
        }
        // Stored, or published on chain by the provider (B.P6b): looked up for every open pool so `hasOffer` is right early.
        const offer = await this.deps.offers.find(pool.poolId, pool)
        if (offer === undefined) continue
        if (BigInt(pool.pledgedCredits) < BigInt(pool.target)) continue
        if (Date.now() < this.roundsFrom) continue // startup grace: let participants reconnect first
        await this.startRound(pool, offer, height)
      }
    } catch (e) {
      this.deps.log('tick_failed', { error: String((e as Error).message ?? e) })
    }
  }

  private prog (poolId: string): PoolProgress {
    let p = this.progress.get(poolId)
    if (p === undefined) {
      p = { attempts: 0, blacklist: new Map(), failedAnnounced: false }
      this.progress.set(poolId, p)
    }
    return p
  }

  private async startRound (pool: PoolView, offer: Offer, height: number | undefined): Promise<void> {
    const { poolId } = pool
    const prog = this.prog(poolId)
    this.starting.add(poolId)
    try {
      const fresh = (await this.deps.overlay.pledgeCandidates(poolId)).filter(c => !prog.blacklist.has(c.view.outpoint))
      const spent = await this.deps.spent.spent(fresh.map(c => c.view.outpoint))
      for (const c of fresh) {
        if (spent.get(c.view.outpoint) === true) prog.blacklist.set(c.view.outpoint, 'spent on chain')
      }
      if (fresh.some(c => spent.get(c.view.outpoint) === true)) this.persist(poolId)
      // A lighthouse pledge can only be signed by its guard, with the human's signature this coordinator holds.
      const signable = await Promise.all(fresh.map(async c =>
        !isLighthouseRecord(recordOf(c.view, c.sourceTx)) || (await this.deps.lighthouse?.pledge(c.view.outpoint)) !== undefined))
      const eligible = fresh.filter((c, i) => !prog.blacklist.has(c.view.outpoint) && signable[i])
      const key = eligible.map(c => c.view.outpoint).join(',')
      if (prog.gaveUp !== undefined) {
        if (prog.gaveUp.key === undefined) { prog.gaveUp.key = key; this.persist(poolId) }
        if (prog.gaveUp.key === key) return // nothing new since we gave up
        prog.gaveUp = undefined
        prog.attempts = 0
        this.persist(poolId)
      }
      if (eligible.reduce((s, c) => s + BigInt(c.view.credits), 0n) < BigInt(pool.target)) return
      const creditSourceTx = await this.deps.overlay.poolTx(poolId)
      if (creditSourceTx === undefined) return

      const round = prog.attempts + 1
      let plan: SettlementPlan
      try {
        plan = await this.deps.protocol.planSettlement({ offer, creditSourceTx, pledges: eligible, round, exclude: [...prog.blacklist.keys()], height })
      } catch (e) {
        this.deps.log('plan_failed', { poolId, round, error: String((e as Error).message ?? e) })
        return
      }
      const template = Transaction.fromAtomicBEEF(plan.templateBEEF)
      template.inputs[0].unlockingScript = UnlockingScript.fromHex(offer.unlockingScriptHex)
      if (outpointOfInput(template, 0) !== poolId || !inputIsValid(template, 0)) {
        this.deps.log('offer_invalid_for_plan', { poolId, round })
        return
      }
      const inputs = new Map<number, { outpoint: string, participant: string, lighthouse?: true }>()
      for (const p of plan.participants) {
        const idx = template.inputs.findIndex((_, i) => i > 0 && outpointOfInput(template, i) === p.outpoint)
        if (idx < 1) {
          this.deps.log('plan_mismatch', { poolId, round, outpoint: p.outpoint })
          return
        }
        inputs.set(idx, { outpoint: p.outpoint, participant: p.participant, ...(p.mode === 'lighthouse' ? { lighthouse: true as const } : {}) })
      }

      const state: RoundState = { poolId, round, plan, offer, template, inputs, signed: new Map(), failed: new Map(), done: false }
      this.rounds.set(poolId, state)
      this.deps.log('round_start', { poolId, round, participants: inputs.size, pledgeListHash: plan.pledgeListHash })
      // The plan (template BEEF, ~3.5 kB per participant) is serialized once, not once per participant (B.P6b, 6.6).
      const head = `{"type":"sign_request","poolId":${JSON.stringify(poolId)},"round":${round},"plan":${JSON.stringify(plan)},"yourInputIndex":`
      for (const [idx, inp] of inputs) {
        if (inp.lighthouse === true) { void this.askGuard(state, idx, inp.outpoint); continue }
        const sent = this.deps.feed.sendTo(inp.participant, `${head}${idx}}`)
        if (sent === 0) state.failed.set(idx, 'offline')
      }
      state.timer = setTimeout(() => { void this.finish(poolId, round) }, this.opts.roundTimeoutMs)
      if (state.failed.size === inputs.size) void this.finish(poolId, round)
    } finally {
      this.starting.delete(poolId)
    }
  }

  /** sign_response / sign_reject from a WS session. Returns an error to send back, if any. */
  onParticipantMessage (identity: string | undefined, msg: any): string | undefined {
    const state = this.rounds.get(msg?.poolId)
    if (state === undefined || state.done || state.round !== msg.round) return 'no such round'
    if (identity === undefined) return 'say hello first'

    if (msg.type === 'sign_reject') {
      const mine = [...state.inputs].filter(([idx, inp]) => inp.participant === identity && !state.signed.has(idx) && !state.failed.has(idx))
      if (mine.length === 0) return 'no pending input of yours in this round'
      const reason = `rejected: ${String(msg.reason ?? '').slice(0, 200)}`
      for (const [idx] of mine) state.failed.set(idx, reason)
      this.deps.log('sign_reject', { poolId: state.poolId, round: state.round, participant: identity, reason })
    } else {
      const idx = msg.inputIndex
      const inp = state.inputs.get(idx)
      if (inp === undefined) return 'not a participant input'
      if (inp.lighthouse === true) return 'a lighthouse input is signed by its guard'
      if (inp.participant !== identity) {
        this.deps.log('sign_wrong_session', { poolId: state.poolId, round: state.round, inputIndex: idx, from: identity })
        return 'input belongs to another participant'
      }
      if (state.signed.has(idx) || state.failed.has(idx)) return 'input already resolved'
      this.resolveInput(state, idx, msg.unlockingScriptHex)
    }
    if (state.signed.size + state.failed.size === state.inputs.size) void this.finish(state.poolId, state.round)
    return undefined
  }

  /** Check an unlocking script in place: SIGHASH_ALL covers every input outpoint and output, not other inputs' unlocking scripts. */
  private resolveInput (state: RoundState, idx: number, hex: unknown, by = 'participant'): void {
    let unlock: UnlockingScript | undefined
    try { unlock = UnlockingScript.fromHex(String(hex)) } catch { unlock = undefined }
    if (unlock !== undefined) state.template.inputs[idx].unlockingScript = unlock
    if (unlock !== undefined && inputIsValid(state.template, idx)) {
      state.signed.set(idx, unlock.toHex())
      this.deps.log('sign_ok', { poolId: state.poolId, round: state.round, inputIndex: idx, ...(by !== 'participant' ? { by } : {}) })
    } else {
      state.template.inputs[idx].unlockingScript = new UnlockingScript([])
      state.failed.set(idx, by === 'participant' ? 'bad signature' : `bad signature (${by})`)
      this.deps.log('sign_bad', { poolId: state.poolId, round: state.round, inputIndex: idx, ...(by !== 'participant' ? { by } : {}) })
    }
  }

  /** Lighthouse input: the guard named in the pledge record co-signs (it checks the plan itself, as the human would). */
  private async askGuard (state: RoundState, idx: number, outpoint: string): Promise<void> {
    let hex: string | undefined
    let reason: string | undefined
    try {
      const pledge = await this.deps.lighthouse?.pledge(outpoint)
      if (pledge === undefined) throw new Error('no lighthouse pledge stored')
      hex = await this.deps.lighthouse!.cosign(pledge.record.guard, { plan: state.plan, inputIndex: idx, pledge })
    } catch (e) {
      reason = `guard: ${String((e as Error).message ?? e).slice(0, 200)}`
    }
    if (state.done || this.rounds.get(state.poolId) !== state || state.signed.has(idx) || state.failed.has(idx)) return
    if (hex !== undefined) this.resolveInput(state, idx, hex, 'guard')
    else {
      state.failed.set(idx, reason!)
      this.deps.log('guard_refused', { poolId: state.poolId, round: state.round, inputIndex: idx, outpoint, reason })
    }
    if (state.signed.size + state.failed.size === state.inputs.size) void this.finish(state.poolId, state.round)
  }

  private async finish (poolId: string, round: number): Promise<void> {
    const state = this.rounds.get(poolId)
    if (state === undefined || state.round !== round || state.done) return
    state.done = true
    if (state.timer !== undefined) clearTimeout(state.timer)
    for (const idx of state.inputs.keys()) {
      if (!state.signed.has(idx) && !state.failed.has(idx)) state.failed.set(idx, 'timeout')
    }
    const prog = this.prog(poolId)
    let missing: string[] = []

    if (state.failed.size === 0) {
      try {
        const tx = this.deps.protocol.assembleSettlement(state.plan, state.offer, state.signed)
        const txid = await this.deps.protocol.broadcast(tx)
        this.deps.log('broadcast', { poolId, round, txid })
        await this.submitWithRetry(poolId, tx.toBEEF())
        prog.lastRound = { round, outcome: 'settled', missing: [], txid }
        this.persist(poolId)
        this.rounds.delete(poolId)
        this.deps.feed.broadcast(poolId, { type: 'settled', poolId, txid })
        this.deps.log('settled', { poolId, round, txid, participants: state.inputs.size })
        return
      } catch (e) {
        this.deps.log('broadcast_failed', { poolId, round, error: String((e as Error).message ?? e) })
        const outpoints = [...state.inputs.values()].map(i => i.outpoint)
        const spent = await this.deps.spent.spent(outpoints)
        missing = outpoints.filter(o => spent.get(o) === true)
        for (const o of missing) prog.blacklist.set(o, 'spent on chain')
      }
    } else {
      for (const [idx, reason] of state.failed) {
        const { outpoint } = state.inputs.get(idx)!
        prog.blacklist.set(outpoint, reason)
        missing.push(outpoint)
      }
    }

    prog.attempts = round
    prog.lastRound = { round, outcome: 'failed', missing }
    if (round >= this.opts.maxRounds) prog.gaveUp = {}
    this.persist(poolId)
    this.rounds.delete(poolId)
    this.deps.feed.broadcast(poolId, { type: 'round_failed', poolId, round, missing })
    this.deps.log('round_failed', { poolId, round, missing, reasons: Object.fromEntries([...state.failed].map(([i, r]) => [state.inputs.get(i)!.outpoint, r])) })
    if (round >= this.opts.maxRounds) {
      this.deps.log('gave_up', { poolId, rounds: round })
      return
    }
    void this.tick() // next round from the waiting list
  }

  private async submitWithRetry (poolId: string, beef: number[]): Promise<void> {
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        await this.deps.overlay.submit(beef)
        return
      } catch (e) {
        this.deps.log('overlay_submit_failed', { poolId, attempt, error: String((e as Error).message ?? e) })
        await new Promise(resolve => setTimeout(resolve, 500 * attempt))
      }
    }
  }
}
