/**
 * Track C Faz 0: the simulated GPU provider's paid job API (BRC-105), end to
 * end with real wallet-toolbox wallets on the mock chain. Derived from the
 * kit's test/pay-per-request.e2e.test.ts.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { AuthFetch, P2PKH, PublicKey, Random, Utils } from '@agentcoop/core/sdk'
import type { Wallet } from '@bsv/wallet-toolbox'
import { createProviderApp } from '../apps/provider-api/src/app'
import { JobRunner, resultHash, type Job } from '../apps/provider-api/src/runner'
import type { Product } from '../apps/provider-api/src/products'
import { createMockChain, type MockChain } from './helpers/mockchain'
import { listen, type Listening } from './helpers/http'

const product: Product = {
  id: 'gpu-h100', label: 'H100 GPU-hour', unit: 'GPU-hour', retailSatsPerCredit: 50, minutesPerCredit: 60, tokenId: null,
  simulate: { minutesPerSecond: 600 }
}

let chain: MockChain
let provider: Wallet, agent: Wallet, stranger: Wallet
let runner: JobRunner
let api: Listening

const spendableSats = async (w: Wallet): Promise<number> =>
  (await w.listOutputs({ basket: 'default', limit: 1000 })).outputs.filter(o => o.spendable).reduce((s, o) => s + o.satoshis, 0)
const post = (body: unknown): { method: string, headers: Record<string, string>, body: string } => ({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })

beforeAll(async () => {
  chain = await createMockChain()
  ;[provider, agent, stranger] = await Promise.all([chain.makeWallet(), chain.makeWallet(), chain.makeWallet()])
  await chain.fund(agent)
  runner = new JobRunner({ products: [product] })
  api = await listen(createProviderApp({ wallet: provider, products: [product], runner }))
})

afterAll(async () => {
  runner?.stop()
  await api?.close()
  await chain?.close()
})

describe('provider-api: catalog and paid GPU jobs (BRC-105)', () => {
  let jobId: string

  it('serves the catalog for free, with the product read from configuration', async () => {
    const res = await new AuthFetch(agent).fetch(`${api.url}/v1/catalog`)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.provider.server).toBe(provider.identityKey)
    expect(body.products).toEqual([{ id: 'gpu-h100', label: 'H100 GPU-hour', unit: 'GPU-hour', retailSatsPerCredit: 50, minutesPerCredit: 60, tokenId: null, demoPricing: false }])
    expect(body.jobKinds).toEqual(['finetune', 'eval', 'inference'])
    expect(body.pools).toEqual([])
  })

  it('refuses an invalid job with 400 and charges nothing', async () => {
    const before = await spendableSats(provider)
    const res = await new AuthFetch(agent).fetch(`${api.url}/v1/jobs`, post({ kind: 'mining', minutes: 10 }))
    expect(res.status).toBe(400)
    expect((await res.json()).code).toBe('ERR_BAD_JOB')
    expect(await spendableSats(provider)).toBe(before)
  })

  it('prices a job per minute at the per-credit (GPU-hour) retail price: 402 → AuthFetch pays → the job runs; the provider is credited at once', async () => {
    const before = await spendableSats(provider)
    const res = await new AuthFetch(agent).fetch(`${api.url}/v1/jobs`, post({ kind: 'eval', minutes: 30 }))
    expect(res.status).toBe(202)
    const body = await res.json()
    expect(body.payment).toMatchObject({ method: 'sats', satoshis: 25 }) // 30 min × 50 sat / 60 min
    expect(await spendableSats(provider)).toBe(before + 25)
    jobId = body.jobId
  })

  it('reports the job with a GPU log and a reproducible result hash', async () => {
    await runner.wait(jobId)
    const res = await new AuthFetch(agent).fetch(`${api.url}/v1/jobs/${jobId}`)
    expect(res.status).toBe(200)
    const job = await res.json() as Job
    expect(job).toMatchObject({ id: jobId, owner: agent.identityKey, kind: 'eval', minutes: 30, status: 'done' })
    expect(job.log.length).toBeGreaterThan(3)
    expect(job.log[0]).toContain('eval · 30 min on H100 GPU-hour')
    expect(job.log.some(l => /batch \d+\/120 acc=/.test(l))).toBe(true)
    expect(job.resultHash).toBe(resultHash(job.id, job.log.slice(0, -1)))
  })

  it('keeps jobs private to the identity that paid', async () => {
    const res = await new AuthFetch(stranger).fetch(`${api.url}/v1/jobs/${jobId}`)
    expect(res.status).toBe(404)
  })

  it('answers 402 with the price, and refuses a replayed payment (409)', async () => {
    const probe = new AuthFetch(agent)
    ;(probe as any).handlePaymentAndRetry = async (_u: string, _c: unknown, r: Response) => r
    const challenge = await probe.fetch(`${api.url}/v1/jobs`, post({ kind: 'inference', minutes: 4 }))
    expect(challenge.status).toBe(402)
    expect(challenge.headers.get('x-bsv-payment-satoshis-required')).toBe('4') // ceil(4 × 50 / 60)
    const derivationPrefix = challenge.headers.get('x-bsv-payment-derivation-prefix')!
    const serverKey = challenge.headers.get('x-bsv-auth-identity-key')!
    // Pay it by hand, exactly as AuthFetch does (BRC-29 output 0 to the server).
    const derivationSuffix = Utils.toBase64(Random(32))
    const { publicKey } = await agent.getPublicKey({ protocolID: [2, '3241645161d8'], keyID: `${derivationPrefix} ${derivationSuffix}`, counterparty: serverKey })
    const created = await agent.createAction({
      description: 'Pay for a GPU job',
      outputs: [{ satoshis: 4, lockingScript: new P2PKH().lock(PublicKey.fromString(publicKey).toAddress()).toHex(), outputDescription: 'HTTP request payment' }],
      options: { randomizeOutputs: false }
    })
    const header = JSON.stringify({ derivationPrefix, derivationSuffix, transaction: Utils.toBase64(Array.from(created.tx!)) })
    const client = new AuthFetch(agent)
    const init = { ...post({ kind: 'inference', minutes: 4 }), headers: { 'Content-Type': 'application/json', 'x-bsv-payment': header } }
    const first = await client.fetch(`${api.url}/v1/jobs`, init)
    expect(first.status).toBe(202)
    const replay = await client.fetch(`${api.url}/v1/jobs`, init)
    expect(replay.status).toBe(409)
  })
})
