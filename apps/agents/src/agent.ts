/**
 * An AgentCoop agent: a wallet-toolbox wallet (its identity), an AuthFetch
 * client for the provider, and its workload profile. Its main job is the GPU
 * work in the profile; buying capacity is how it pays for that work.
 *
 * Faz 1 behaviour (no brain yet): before a job, if the agent holds credit
 * tokens and its prepaid balance at the provider does not cover the job, it
 * redeems the whole credits still missing (≤ one job, within the provider's
 * cap); then it submits the job, which is free from the prepaid balance or paid
 * at retail via 402. A gpu-h100 credit is one GPU-hour, used by the minute, so
 * what a job leaves over pays for the next one.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { WalletInterface } from '@agentcoop/core/sdk'
import { receivePkh, TokenKit, type OverlayClient } from '@agentcoop/core'
import { dataDir, network, requireEnv } from '@agentcoop/core/node/env'
import { openServerWallet } from '@agentcoop/core/node/serverWallet'
import { listVaultUtxos, type Cosigner } from '@agentcoop/core/signers/VaultSigner'
import { listVaultCredits, transferVaultCredits } from '@agentcoop/core'
import type { AgentEvents, EventExtra } from './events'
import { AgentLog } from './log'
import type { AgentProfile } from './profile'
import { ProviderClient, type Catalog, type CatalogProduct, type JobView } from './providerClient'
import type { JobNeed } from './workload'

export interface AgentOptions {
  wallet: WalletInterface
  profile: AgentProfile
  providerUrl: string
  /** Overlay for credit tokens; without it the agent can only pay retail. */
  overlay?: OverlayClient
  log?: AgentLog
  /** Where the weekly spend is kept (`<dir>/agents/<name>/state.json`). Omit to keep it in memory. */
  stateDir?: string
  /** Live feed for the web app (events.ts). */
  events?: AgentEvents
  /** Mandate Vault mode: the owner-funded vault the agent spends from (with the guard). */
  vaultId?: string
  /** Vault mode: the guard's co-signer, to redeem vault-locked credits (guard kind 'redeem'). */
  vaultCosign?: Cosigner
}

/** ISO week, e.g. "2026-W44": the owner's weekly budget resets with it. */
export function isoWeek (d = new Date()): string {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
  const day = t.getUTCDay() === 0 ? 7 : t.getUTCDay()
  t.setUTCDate(t.getUTCDate() + 4 - day)
  const week = Math.ceil(((t.getTime() - Date.UTC(t.getUTCFullYear(), 0, 1)) / 86_400_000 + 1) / 7)
  return `${t.getUTCFullYear()}-W${String(week).padStart(2, '0')}`
}

const minutesPerCredit = (product: CatalogProduct): number => product.minutesPerCredit ?? 1
const sat = (n: number): string => n.toLocaleString('en-US')

/** WALLET_AGENT_1_KEY → 'agent-1' (scripts/lib/env.ts keyVar, reversed). */
export const walletNameOf = (walletEnv: string): string => walletEnv.replace(/^WALLET_/, '').replace(/_KEY$/, '').toLowerCase().replace(/_/g, '-')

export class Agent {
  readonly wallet: WalletInterface
  readonly profile: AgentProfile
  readonly provider: ProviderClient
  readonly overlay?: OverlayClient
  readonly tokens?: TokenKit
  readonly log: AgentLog
  private identity?: string
  private cachedCatalog?: Catalog
  private readonly stateFile?: string
  readonly events?: AgentEvents
  readonly vaultId?: string
  readonly vaultCosign?: Cosigner
  private spend: { week: string, sats: number }

  constructor (opts: AgentOptions) {
    this.wallet = opts.wallet
    this.profile = opts.profile
    this.provider = new ProviderClient(opts.wallet, opts.providerUrl)
    this.overlay = opts.overlay
    this.tokens = opts.overlay === undefined ? undefined : new TokenKit(opts.wallet, opts.overlay)
    this.log = opts.log ?? new AgentLog(opts.profile.name)
    this.events = opts.events
    this.vaultId = opts.vaultId
    this.vaultCosign = opts.vaultCosign
    this.log.subscribe(text => { this.emit('agent_thought', { text }) })
    this.stateFile = opts.stateDir === undefined ? undefined : join(opts.stateDir, 'agents', opts.profile.name, 'state.json')
    this.spend = this.stateFile !== undefined && existsSync(this.stateFile)
      ? JSON.parse(readFileSync(this.stateFile, 'utf8')) as { week: string, sats: number }
      : { week: isoWeek(), sats: 0 }
  }

  /** Publish a live-feed event for this agent (no-op without a feed). Call identityKey() once first. */
  emit (type: string, data: unknown, extra: Omit<EventExtra, 'agent'> = {}): void {
    this.events?.publish(type, data, { ...extra, agent: this.identity })
  }

  /** Sats spent this ISO week on pledges and retail jobs (the owner's weekly budget). */
  spentThisWeekSats (): number {
    if (this.spend.week !== isoWeek()) this.spend = { week: isoWeek(), sats: 0 }
    return this.spend.sats
  }

  recordSpend (sats: number): void {
    this.spend = { week: isoWeek(), sats: this.spentThisWeekSats() + sats }
    if (this.stateFile !== undefined) {
      mkdirSync(dirname(this.stateFile), { recursive: true })
      writeFileSync(this.stateFile, JSON.stringify(this.spend))
    }
  }

  /** Spendable sats the agent can pledge: its vault in vault mode, otherwise its wallet's default basket. */
  async satsBalance (): Promise<number> {
    if (this.vaultId !== undefined) return (await listVaultUtxos(this.wallet, this.vaultId)).reduce((s, u) => s + u.satoshis, 0)
    const { outputs } = await this.wallet.listOutputs({ basket: 'default', limit: 10_000 })
    return outputs.filter(o => o.spendable).reduce((s, o) => s + o.satoshis, 0)
  }

  /**
   * Opens the agent's server wallet from the key in `profile.walletEnv`. The SQLite file is named after
   * that key (WALLET_AGENT_1_KEY → `data/wallets/agent-1.sqlite`), the same file Track D's `scripts/fund.ts`
   * and `infra/preflight.mjs` use; one key, one wallet database (else the agent does not see its funding).
   */
  static async open (profile: AgentProfile, opts: { providerUrl?: string, overlay?: OverlayClient, events?: AgentEvents, vaultId?: string, vaultCosign?: Cosigner } = {}): Promise<{ agent: Agent, close: () => Promise<void> }> {
    const { wallet, close } = await openServerWallet({
      name: walletNameOf(profile.walletEnv),
      rootKeyHex: requireEnv(profile.walletEnv),
      dataDir: dataDir(),
      chain: network(),
      arcadeUrl: process.env.ARCADE_URL
    })
    const agent = new Agent({
      wallet,
      profile,
      providerUrl: opts.providerUrl ?? process.env.PROVIDER_API_URL ?? 'http://localhost:8092',
      overlay: opts.overlay,
      log: new AgentLog(profile.name, dataDir()),
      stateDir: dataDir(),
      events: opts.events,
      vaultId: opts.vaultId,
      vaultCosign: opts.vaultCosign
    })
    return { agent, close }
  }

  async identityKey (): Promise<string> {
    this.identity ??= (await this.wallet.getPublicKey({ identityKey: true })).publicKey
    return this.identity
  }

  async catalog (refresh = false): Promise<Catalog> {
    if (refresh || this.cachedCatalog === undefined) this.cachedCatalog = await this.provider.catalog()
    return this.cachedCatalog
  }

  async product (): Promise<CatalogProduct> {
    let p = (await this.catalog()).products.find(x => x.id === this.profile.product)
    // A token minted after the agent started: ask the provider again rather than keep a stale catalog.
    if (p === undefined || p.tokenId === null) p = (await this.catalog(true)).products.find(x => x.id === this.profile.product)
    if (p === undefined) throw new Error(`provider does not sell ${this.profile.product}`)
    return p
  }

  /** Redeemed and not yet used, in GPU minutes. */
  async prepaidMinutes (): Promise<number> {
    const { balances } = await this.provider.balance()
    return balances.find(b => b.product === this.profile.product)?.prepaidUnits ?? 0
  }

  /** Credit tokens in the agent's wallet that the overlay vouches for (after a sync). */
  async ownedCredits (): Promise<bigint> {
    const product = await this.product()
    if (this.tokens === undefined || product.tokenId === null) return 0n
    await this.tokens.sync()
    const own = (await this.tokens.balances()).find(b => b.tokenId === product.tokenId)?.overlay ?? 0n
    return own + await this.vaultCredits(product.tokenId)
  }

  /** Vault mode: credits locked to the vault (settled with creditLock 'vault'), still unspent in the wallet's basket. */
  async vaultCredits (tokenId: string): Promise<bigint> {
    if (this.vaultId === undefined) return 0n
    return (await listVaultCredits(this.wallet, this.vaultId, tokenId)).reduce((s, c) => s + c.amt, 0n)
  }

  /** Send `credits` tokens to the provider-api and claim them as prepaid balance. */
  async redeem (credits: number): Promise<{ credits: number, prepaidMinutes: number, txid: string }> {
    const catalog = await this.catalog()
    const product = await this.product()
    if (this.tokens === undefined || this.overlay === undefined || product.tokenId === null) throw new Error('no credit tokens to redeem')
    // Check the cap before sending: tokens the provider refuses stay at its address.
    const mpc = minutesPerCredit(product)
    const prepaid = await this.prepaidMinutes()
    if (credits > catalog.credits.maxRedeem || prepaid + credits * mpc > catalog.credits.maxPending * mpc) {
      throw new Error(`redeeming ${credits} would break the provider's cap (≤ ${catalog.credits.maxRedeem} per redeem, ≤ ${catalog.credits.maxPending} credits prepaid; have ${prepaid} min)`)
    }
    const server = catalog.credits.redeemTo
    // Vault mode: credits locked to the vault go to the provider with agent + guard (guard 'redeem': the
    // provider must be one the owner allows, proven by creditPayees). The rest stays on the vault.
    if (this.vaultId !== undefined && this.vaultCosign !== undefined) {
      const [credit] = (await listVaultCredits(this.wallet, this.vaultId, product.tokenId)).filter(c => c.amt >= BigInt(credits))
      if (credit !== undefined) {
        const index = await this.tokens.nextIndex(server)
        const r = await transferVaultCredits(this.wallet, {
          vaultId: this.vaultId, credit, amt: BigInt(credits), toPkh: receivePkh(server, index), kind: 'redeem', cosign: this.vaultCosign,
          context: { creditPayees: [{ vout: 0, provider: server, index }] }
        })
        await this.overlay.submit(r.beef)
        const res = await this.provider.redeem(r.beef, 0)
        this.emit('agent_decision', { action: 'redeem', credits, reason: `from the vault (the guard approved it); prepaid now ${res.prepaidUnits} ${product.unit === 'GB' ? 'MB' : 'GPU-min'}` })
        this.emit('agent_payment', { kind: 'redeem', txid: r.txid }, { txid: r.txid })
        this.log.info(`Redeemed ${credits} vault-locked credit${credits === 1 ? '' : 's'} at the provider (agent + guard; prepaid now ${res.prepaidUnits} GPU-min). https://whatsonchain.com/tx/${r.txid}`)
        return { credits, prepaidMinutes: res.prepaidUnits, txid: r.txid }
      }
    }
    const { txid, recipientIndex } = await this.tokens.send(product.tokenId, BigInt(credits), server)
    // The output that pays the provider, found by its locking script (never by index).
    const pkh = receivePkh(server, recipientIndex)
    const out = (await this.overlay.lookup({ op: 'identity', identityKey: server, tokenId: product.tokenId }))
      .find(o => o.txid === txid && o.ctx.ownerPkh === pkh)
    if (out === undefined) throw new Error(`credit transfer ${txid} is not on the overlay yet`)
    const res = await this.provider.redeem(out.beef, out.vout)
    this.emit('agent_decision', { action: 'redeem', credits, reason: `prepaid now ${res.prepaidUnits} ${product.unit === 'GB' ? 'MB' : 'GPU-min'}` })
    this.emit('agent_payment', { kind: 'redeem', txid }, { txid })
    this.log.info(`Redeemed ${credits} ${product.unit} credit${credits === 1 ? '' : 's'} at the provider (prepaid now ${res.prepaidUnits} GPU-min). https://whatsonchain.com/tx/${txid}`)
    return { credits, prepaidMinutes: res.prepaidUnits, txid }
  }

  /** Run one job of the agent's own work, paying the cheapest way it knows (Faz 1: prepaid credits, else retail). */
  async runJob (need: JobNeed): Promise<JobView> {
    const product = await this.product()
    const catalog = await this.catalog()
    const mpc = minutesPerCredit(product)
    this.log.info(`Need: ${need.kind} job, ${need.minutes} GPU-min.`)

    if (product.tokenId !== null && this.tokens !== undefined) {
      const prepaid = await this.prepaidMinutes()
      if (prepaid < need.minutes) {
        const owned = Number(await this.ownedCredits())
        const missing = Math.ceil((need.minutes - prepaid) / mpc)
        const room = Math.min(catalog.credits.maxRedeem, Math.floor((catalog.credits.maxPending * mpc - prepaid) / mpc))
        if (owned >= missing && missing <= room) await this.redeem(missing)
        else if (owned > 0) this.log.info(`Holding ${owned} credits, but this job needs ${missing} more and the provider's cap allows ${room}: paying retail.`)
      }
    }

    const submitted = await this.provider.submitJob({ kind: need.kind, minutes: need.minutes, product: product.id })
    const p = submitted.payment
    this.emit('agent_job', { jobId: submitted.jobId, kind: need.kind, minutes: need.minutes, status: 'queued' })
    if (p.method === 'credits') {
      this.log.info(`Job ${submitted.jobId} paid from prepaid credits: ${p.minutes ?? p.units} GPU-min.`)
    } else {
      this.recordSpend(p.satoshis)
      this.emit('agent_decision', { action: 'retail', sats: p.satoshis, reason: `${need.minutes} GPU-min at retail (HTTP 402)` })
      this.emit('agent_payment', { kind: '402', txid: p.txid, sats: p.satoshis }, { txid: p.txid })
      this.log.info(`Job ${submitted.jobId} paid at retail: ${need.minutes} GPU-min at ${product.retailSatsPerCredit} sat/${product.unit} = ${sat(p.satoshis)} sat (HTTP 402, BRC-105). https://whatsonchain.com/tx/${p.txid}`)
    }
    const job = await this.provider.waitForJob(submitted.jobId)
    this.emit('agent_job', { jobId: job.id, kind: need.kind, minutes: need.minutes, status: 'done' })
    this.log.info(`Job ${job.id} done on ${job.log[0]?.split(' ')[0] ?? 'GPU'} · result ${job.resultHash?.slice(0, 16) ?? '?'}…`)
    return job
  }
}
