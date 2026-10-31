/**
 * Track C Faz 0: the simulated GPU provider's paid job API (BRC-105), end to
 * end with real wallet-toolbox wallets on the mock chain. Derived from the
 * kit's test/pay-per-request.e2e.test.ts.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { AuthFetch, P2PKH, PrivateKey, PublicKey, Random, Utils } from '@agentcoop/core/sdk'
import type { Wallet } from '@bsv/wallet-toolbox'
import { mkdtempSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createProviderApp } from '../apps/provider-api/src/app'
import { FileReplayStore } from '../apps/provider-api/src/replayStore'
import { JobRunner, resultHash, type Job } from '../apps/provider-api/src/runner'
import type { Product } from '../apps/provider-api/src/products'
import { createMockChain, type MockChain } from './helpers/mockchain'
import { listen, type Listening } from './helpers/http'

const product: Product = {
  id: 'gpu-h100', label: 'H100 GPU-hour', unit: 'GPU-hour', retailSatsPerCredit: 50, minutesPerCredit: 60, tokenId: null,
  simulate: { minutesPerSecond: 600 }
}

let chain: MockChain
const replayDir = mkdtempSync(join(tmpdir(), 'agentcoop-replay-'))
let provider: Wallet, providerTwin: Wallet, agent: Wallet, stranger: Wallet
let runner: JobRunner
let api: Listening

const spendableSats = async (w: Wallet): Promise<number> =>
  (await w.listOutputs({ basket: 'default', limit: 1000 })).outputs.filter(o => o.spendable).reduce((s, o) => s + o.satoshis, 0)
const post = (body: unknown): { method: string, headers: Record<string, string>, body: string } => ({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })

beforeAll(async () => {
  chain = await createMockChain()
  // providerTwin: the same server key with its own wallet database, as a second process or host would have
  const providerKey = PrivateKey.fromRandom()
  ;[provider, providerTwin, agent, stranger] = await Promise.all([chain.makeWallet(providerKey), chain.makeWallet(providerKey), chain.makeWallet(), chain.makeWallet()])
  await chain.fund(agent)
  runner = new JobRunner({ products: [product] })
  api = await listen(createProviderApp({ wallet: provider, products: [product], runner, replayStore: new FileReplayStore(replayDir) }))
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
    expect(body.products).toEqual([{
      id: 'gpu-h100', label: 'H100 GPU-hour', unit: 'GPU-hour', retailSatsPerCredit: 50, minutesPerCredit: 60, tokenId: null, demoPricing: false,
      runner: 'gpu', kinds: ['finetune', 'eval', 'inference'], quantityField: 'minutes', unitsPerCredit: 60
    }])
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

  it('BL-30: lists my own jobs with their payments, newest first, and none of anyone else', async () => {
    const mine = await (await new AuthFetch(agent).fetch(`${api.url}/v1/jobs`)).json()
    expect(mine.total).toBeGreaterThanOrEqual(1)
    expect(mine.jobs.map((j: Job) => j.id)).toContain(jobId)
    expect(mine.jobs.every((j: Job) => j.owner === agent.identityKey)).toBe(true)
    const paid = mine.jobs.find((j: Job) => j.id === jobId)
    expect(paid.payment).toMatchObject({ method: 'sats' })
    const times = mine.jobs.map((j: Job) => j.createdAt)
    expect(times).toEqual([...times].sort().reverse())
    expect(await (await new AuthFetch(stranger).fetch(`${api.url}/v1/jobs`)).json()).toEqual({ jobs: [], total: 0 })
    expect((await new AuthFetch(agent).fetch(`${api.url}/v1/jobs?limit=0`)).status).toBe(400)
    expect((await (await new AuthFetch(agent).fetch(`${api.url}/v1/jobs?limit=1`)).json()).jobs).toHaveLength(1)
  })

  /** A 402 challenge from `url`, paid by hand exactly as AuthFetch does (BRC-29 output 0 to the server). */
  const paidRequest = async (url: string): Promise<{ method: string, headers: Record<string, string>, body: string }> => {
    const probe = new AuthFetch(agent)
    ;(probe as any).handlePaymentAndRetry = async (_u: string, _c: unknown, r: Response) => r
    const challenge = await probe.fetch(`${url}/v1/jobs`, post({ kind: 'inference', minutes: 4 }))
    expect(challenge.status).toBe(402)
    expect(challenge.headers.get('x-bsv-payment-satoshis-required')).toBe('4') // ceil(4 × 50 / 60)
    const derivationPrefix = challenge.headers.get('x-bsv-payment-derivation-prefix')!
    const serverKey = challenge.headers.get('x-bsv-auth-identity-key')!
    const derivationSuffix = Utils.toBase64(Random(32))
    const { publicKey } = await agent.getPublicKey({ protocolID: [2, '3241645161d8'], keyID: `${derivationPrefix} ${derivationSuffix}`, counterparty: serverKey })
    const created = await agent.createAction({
      description: 'Pay for a GPU job',
      outputs: [{ satoshis: 4, lockingScript: new P2PKH().lock(PublicKey.fromString(publicKey).toAddress()).toHex(), outputDescription: 'HTTP request payment' }],
      options: { randomizeOutputs: false }
    })
    const header = JSON.stringify({ derivationPrefix, derivationSuffix, transaction: Utils.toBase64(Array.from(created.tx!)) })
    return { ...post({ kind: 'inference', minutes: 4 }), headers: { 'Content-Type': 'application/json', 'x-bsv-payment': header } }
  }

  it('answers 402 with the price, and refuses a replayed payment (409)', async () => {
    const init = await paidRequest(api.url)
    const client = new AuthFetch(agent)
    const first = await client.fetch(`${api.url}/v1/jobs`, init)
    expect(first.status).toBe(202)
    const replay = await client.fetch(`${api.url}/v1/jobs`, init)
    expect(replay.status).toBe(409)
  })

  it('T-17: a payment taken by one provider process is refused by a second one sharing the replay store', async () => {
    const client = new AuthFetch(agent)
    // without a shared store, a second process with its own wallet database takes the same payment again
    const unshared = await listen(createProviderApp({ wallet: providerTwin, products: [product], runner }))
    try {
      const init = await paidRequest(api.url)
      expect((await client.fetch(`${api.url}/v1/jobs`, init)).status).toBe(202)
      expect((await new AuthFetch(agent).fetch(`${unshared.url}/v1/jobs`, init)).status).toBe(202) // the replay T-17 is about
    } finally { await unshared.close() }
    // with the shared store, the second process refuses it
    const shared = await listen(createProviderApp({ wallet: providerTwin, products: [product], runner, replayStore: new FileReplayStore(replayDir) }))
    try {
      const init = await paidRequest(api.url)
      expect((await client.fetch(`${api.url}/v1/jobs`, init)).status).toBe(202)
      expect((await new AuthFetch(agent).fetch(`${shared.url}/v1/jobs`, init)).status).toBe(409)
    } finally { await shared.close() }
  })
})

describe('FileReplayStore', () => {
  it('claims a txid once across instances; anything that is not a txid is never claimed', () => {
    const dir = mkdtempSync(join(tmpdir(), 'agentcoop-replay-'))
    const a = new FileReplayStore(dir)
    const b = new FileReplayStore(dir)
    const txid = 'ab'.repeat(32)
    expect(a.claim(txid)).toBe(true)
    expect(b.claim(txid)).toBe(false)
    expect(a.claim(txid.toUpperCase())).toBe(false)
    for (const bad of ['', '../../etc/passwd', 'ab'.repeat(31), `${'ab'.repeat(32)}/x`]) expect(a.claim(bad)).toBe(false)
    expect(readdirSync(dir)).toEqual([txid])
  })
})
