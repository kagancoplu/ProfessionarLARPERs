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
  private spend: { week: string, sats: number }

  constructor (opts: AgentOptions) {
    this.wallet = opts.wallet
    this.profile = opts.profile
    this.provider = new ProviderClient(opts.wallet, opts.providerUrl)
    this.overlay = opts.overlay
    this.tokens = opts.overlay === undefined ? undefined : new TokenKit(opts.wallet, opts.overlay)
    this.log = opts.log ?? new AgentLog(opts.profile.name)
    this.stateFile = opts.stateDir === undefined ? undefined : join(opts.stateDir, 'agents', opts.profile.name, 'state.json')
    this.spend = this.stateFile !== undefined && existsSync(this.stateFile)
      ? JSON.parse(readFileSync(this.stateFile, 'utf8')) as { week: string, sats: number }
      : { week: isoWeek(), sats: 0 }
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

  /** Spendable sats in the wallet's default basket. */
  async satsBalance (): Promise<number> {
    const { outputs } = await this.wallet.listOutputs({ basket: 'default', limit: 10_000 })
    return outputs.filter(o => o.spendable).reduce((s, o) => s + o.satoshis, 0)
  }

  /** Opens the agent's server wallet (`data/wallets/agent-<name>.sqlite`) from the key in `profile.walletEnv`. */
  static async open (profile: AgentProfile, opts: { providerUrl?: string, overlay?: OverlayClient } = {}): Promise<{ agent: Agent, close: () => Promise<void> }> {
    const { wallet, close } = await openServerWallet({
      name: `agent-${profile.name}`,
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
      stateDir: dataDir()
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
    const p = (await this.catalog()).products.find(x => x.id === this.profile.product)
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
    return (await this.tokens.balances()).find(b => b.tokenId === product.tokenId)?.overlay ?? 0n
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
    const { txid, recipientIndex } = await this.tokens.send(product.tokenId, BigInt(credits), server)
    // The output that pays the provider, found by its locking script (never by index).
    const pkh = receivePkh(server, recipientIndex)
    const out = (await this.overlay.lookup({ op: 'identity', identityKey: server, tokenId: product.tokenId }))
      .find(o => o.txid === txid && o.ctx.ownerPkh === pkh)
    if (out === undefined) throw new Error(`credit transfer ${txid} is not on the overlay yet`)
    const res = await this.provider.redeem(out.beef, out.vout)
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
    if (p.method === 'credits') {
      this.log.info(`Job ${submitted.jobId} paid from prepaid credits: ${p.minutes ?? p.units} GPU-min.`)
    } else {
      this.recordSpend(p.satoshis)
      this.log.info(`Job ${submitted.jobId} paid at retail: ${need.minutes} GPU-min at ${product.retailSatsPerCredit} sat/${product.unit} = ${sat(p.satoshis)} sat (HTTP 402, BRC-105). https://whatsonchain.com/tx/${p.txid}`)
    }
    const job = await this.provider.waitForJob(submitted.jobId)
    this.log.info(`Job ${job.id} done on ${job.log[0]?.split(' ')[0] ?? 'GPU'} · result ${job.resultHash?.slice(0, 16) ?? '?'}…`)
    return job
  }
}
