import { createHash } from 'node:crypto'
import { afterEach, describe, expect, it } from 'vitest'
import { WebSocketServer } from 'ws'
import { createSources, publicDetail } from '../src/sources'
import { watchCoordinator } from '../src/coordinator'

const ctx = (o: unknown): number[] => [...Buffer.from(JSON.stringify(o), 'utf8')]

function recordingFetch (answer: unknown) {
  const bodies: unknown[] = []
  const urls: string[] = []
  const impl = (async (url: string, init?: RequestInit) => {
    urls.push(url)
    if (init?.body !== undefined) bodies.push(JSON.parse(String(init.body)))
    return new Response(JSON.stringify(answer), { status: 200, headers: { 'content-type': 'application/json' } })
  }) as unknown as typeof fetch
  return { impl, bodies, urls }
}

const URLS = { coop: 'http://coop', overlay: 'http://overlay', guard: 'http://guard', provider: 'http://provider', agents: 'http://agents', maker: 'http://maker', arcade: 'http://arcade' }

describe('sources', () => {
  it('decodes the overlay lookup contexts of vaults', async () => {
    const f = recordingFetch({ type: 'output-list', outputs: [{ beef: [], outputIndex: 0, context: ctx({ vaultId: 'v1', scriptHex: '63ab' }) }] })
    const s = createSources(URLS, f.impl)
    expect(await s.vaults()).toEqual([{ vaultId: 'v1', scriptHex: '63ab' }])
    expect(f.urls[0]).toBe('http://overlay/lookup')
    expect(f.bodies[0]).toEqual({ service: 'ls_agentcoop', query: { op: 'vaults' } })
  })

  it('looks vault credits up by sha256 of the vault script', async () => {
    const f = recordingFetch({ type: 'output-list', outputs: [{ beef: [], outputIndex: 0, context: ctx({ tokenId: 't_0', amt: '3', spent: false }) }] })
    const s = createSources(URLS, f.impl)
    expect(await s.vaultCredits('63ab')).toEqual([{ tokenId: 't_0', amt: '3', spent: false }])
    expect(f.bodies[0]).toEqual({ service: 'ls_agentcoop', query: { op: 'vaultCredits', vaultHash: createHash('sha256').update(Buffer.from('63ab', 'hex')).digest('hex') } })
  })

  it('poolsWithPledges reads every pool\'s pledges with all=1, so withdrawn and settled pledges stay with spent=true', async () => {
    const urls: string[] = []
    const impl = (async (url: string) => {
      urls.push(url)
      const body = url.endsWith('/pools') ? [{ poolId: 'a_0', status: 'open' }] : [{ outpoint: 'x_1', spent: true, spendingTxid: 'cc' }]
      return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } })
    }) as unknown as typeof fetch
    const s = createSources(URLS, impl)
    expect(await s.poolsWithPledges()).toEqual([{ poolId: 'a_0', status: 'open', pledges: [{ outpoint: 'x_1', spent: true, spendingTxid: 'cc' }] }])
    expect(urls).toEqual(['http://coop/pools', 'http://coop/pools/a_0/pledges?all=1'])
  })

  it('probe reports a failing service and never throws; the error text stays in the log (F-8)', async () => {
    const logged: string[] = []
    const s = createSources(URLS, (async () => { throw new TypeError('fetch failed: connect ECONNREFUSED 10.0.0.7:8091') }) as unknown as typeof fetch, l => { logged.push(l) })
    expect(await s.probe('guard')).toEqual({ service: 'guard', ok: false, detail: 'unreachable' })
    expect(logged).toEqual(['probe guard: fetch failed: connect ECONNREFUSED 10.0.0.7:8091'])
  })

  it('F-8: a public detail never carries the URL or host, only the class of failure', async () => {
    const answer = (status: number): typeof fetch => (async () => new Response('{}', { status })) as unknown as typeof fetch
    expect((await createSources(URLS, answer(503)).probe('coop')).detail).toBe('HTTP 503')
    const timeout = (async () => { throw new DOMException('The operation was aborted due to timeout', 'TimeoutError') }) as unknown as typeof fetch
    expect((await createSources(URLS, timeout).probe('agents')).detail).toBe('timeout')
    const notJson = (async () => new Response('<html>', { status: 200 })) as unknown as typeof fetch
    expect((await createSources(URLS, notJson).probe('provider')).detail).toBe('bad answer')
    for (const e of [new Error('http://internal.host:8093/healthz: HTTP 500'), new Error('getaddrinfo ENOTFOUND guard.internal')]) {
      expect(publicDetail(e)).not.toMatch(/internal|http:|:\d{4}/)
    }
  })
})

describe('watchCoordinator', () => {
  let wss: WebSocketServer | undefined
  afterEach(() => { wss?.close() })

  it('answers the challenge with an unsigned hello (watcher) and passes messages on', async () => {
    wss = new WebSocketServer({ port: 0 })
    const port = (wss.address() as { port: number }).port
    const hellos: unknown[] = []
    wss.on('connection', ws => {
      ws.on('message', raw => {
        hellos.push(JSON.parse(String(raw)))
        ws.send(JSON.stringify({ type: 'pool_update', poolId: 'a_0', pledgedCredits: '5', status: 'open' }))
      })
      ws.send(JSON.stringify({ type: 'challenge', nonce: 'n1' }))
    })
    const got: unknown[] = []
    const w = watchCoordinator(`ws://localhost:${port}/ws`, msg => got.push(msg))
    for (let i = 0; i < 100 && got.length === 0; i++) await new Promise(r => setTimeout(r, 10))
    w.close()
    expect(hellos).toEqual([{ type: 'hello', poolIds: [] }])
    expect(got).toEqual([{ type: 'pool_update', poolId: 'a_0', pledgedCredits: '5', status: 'open' }])
  })
})
