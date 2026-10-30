/**
 * Typed client for the provider API (MASTER §3.6). Uses the SDK's AuthFetch:
 * every request is mutually authenticated (BRC-103/104) and a 402 challenge is
 * paid automatically from the agent's wallet (BRC-105).
 */
import { AuthFetch, type WalletInterface } from '@agentcoop/core/sdk'

export interface CatalogProduct {
  id: string
  label: string
  unit: string
  retailSatsPerCredit: number
  /** GPU products only. */
  minutesPerCredit?: number
  tokenId: string | null
  demoPricing?: boolean
  runner?: 'gpu' | 'proxy'
  kinds?: string[]
  /** Job request field for the quantity: 'minutes' (gpu) or 'mb' (proxy). */
  quantityField?: 'minutes' | 'mb'
  unitsPerCredit?: number
}
export interface Catalog {
  provider: { name: string, server: string }
  products: CatalogProduct[]
  jobKinds: string[]
  maxJobMinutes: number
  credits: { maxRedeem: number, maxPending: number, redeemTo: string }
  /** Set when prices are illustrative (FINAL-IDEA §9). */
  pricingNote?: string
  pools: unknown[]
  poolsSource: string
}
export interface JobView {
  id: string
  kind: string
  minutes: number
  status: 'queued' | 'running' | 'done'
  payment: { method: 'credits', units: number, minutes?: number, tokenId: string } | { method: 'sats', satoshis: number, txid: string }
  log: string[]
  resultHash?: string
}

export class ProviderError extends Error {
  constructor (readonly status: number, readonly code: string, description: string) {
    super(`provider answered ${status} ${code}: ${description}`)
    this.name = 'ProviderError'
  }
}

export class ProviderClient {
  private readonly http: AuthFetch

  constructor (wallet: WalletInterface, readonly baseUrl: string) {
    this.http = new AuthFetch(wallet)
  }

  private async call<T> (method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
    const res = await this.http.fetch(`${this.baseUrl}${path}`, body === undefined
      ? { method }
      : { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    const json = await res.json().catch(() => ({})) as Record<string, unknown>
    if (!res.ok) throw new ProviderError(res.status, String(json.code ?? 'ERR_UNKNOWN'), String(json.description ?? res.statusText))
    return json as T
  }

  async catalog (): Promise<Catalog> {
    return await this.call('GET', '/v1/catalog')
  }

  /** Paid by the prepaid credit balance when it covers the job, otherwise at retail via 402. */
  async submitJob (job: { kind: string, product?: string, minutes?: number, mb?: number }): Promise<{ jobId: string, status: string, payment: JobView['payment'] }> {
    return await this.call('POST', '/v1/jobs', job)
  }

  /** Prepaid balance at the provider, in GPU minutes (one credit = minutesPerCredit minutes). */
  async balance (): Promise<{ identity: string, balances: Array<{ product: string, tokenId: string, unit: string, unitsPerCredit: number, prepaidUnits: number, minutesPerCredit?: number, prepaidMinutes?: number, returnableCredits: number }>, limits: { maxRedeem: number, maxPending: number } }> {
    return await this.call('GET', '/v1/credits/balance')
  }

  /** Claim a BSV-21 transfer to the provider-api's token address as prepaid credits. */
  async redeem (beef: number[], outputIndex: number): Promise<{ outpoint: string, product: string, credits: number, prepaidUnits: number, prepaidMinutes?: number, lineageDepth: number }> {
    return await this.call('POST', '/v1/credits/redeem', { beef, outputIndex })
  }

  /** Get unused whole credits back as tokens. */
  async returnCredits (credits: number, product?: string): Promise<{ txid: string, credits: number, prepaidUnits: number, prepaidMinutes?: number }> {
    return await this.call('POST', '/v1/credits/return', { credits, product })
  }

  async job (id: string): Promise<JobView> {
    return await this.call('GET', `/v1/jobs/${id}`)
  }

  async waitForJob (id: string, { pollMs = 250, timeoutMs = 10 * 60_000 } = {}): Promise<JobView> {
    const deadline = Date.now() + timeoutMs
    for (;;) {
      const job = await this.job(id)
      if (job.status === 'done') return job
      if (Date.now() > deadline) throw new Error(`job ${id} did not finish in ${timeoutMs} ms`)
      await new Promise(resolve => setTimeout(resolve, pollMs))
    }
  }
}
