/** MSW handlers answering the REST shapes of MASTER §3.5–§3.8 from the mock world. */
import { HttpResponse, http } from 'msw'
import type { OverlayQuery } from '../api/overlay'
import type { MockWorld } from './state'
import { MOCK_IDS } from './data'

const encode = (ctx: unknown): number[] => Array.from(new TextEncoder().encode(JSON.stringify(ctx)))
const outputList = (ctxs: unknown[]) => HttpResponse.json({ type: 'output-list', outputs: ctxs.map((ctx, i) => ({ beef: [], outputIndex: i, context: encode(ctx) })) })

export function createHandlers (world: MockWorld) {
  return [
    // coordinator (§3.5)
    http.get('*/pools', () => HttpResponse.json([...world.pools.values()])),
    http.get('*/pools/:poolId', ({ params }) => {
      const pool = world.pools.get(String(params.poolId))
      return pool === undefined ? HttpResponse.json({ code: 'POOL_NOT_FOUND', error: 'pool is not on the overlay' }, { status: 404 }) : HttpResponse.json(pool)
    }),
    http.get('*/pools/:poolId/pledges', ({ params, request }) => {
      const all = new URL(request.url).searchParams.get('all') === '1'
      const pledges = world.pledges.get(String(params.poolId)) ?? []
      return HttpResponse.json(all ? pledges : pledges.filter(p => !p.spent && p.valid))
    }),
    http.get('*/listings', () => HttpResponse.json([...world.listings.values()])),
    // maker (D.P3 Coop Rail): quotes only; the swap has no HTTP API yet
    http.get('*/quote', ({ request }) => {
      const u = new URL(request.url)
      const raw = u.searchParams.get('amount') ?? ''
      if (!/^[1-9]\d{0,15}$/.test(raw)) return HttpResponse.json({ reason: 'amount: USDC base units (6 decimals), a positive integer' }, { status: 400 })
      if (BigInt(raw) > 1_000_000n) return HttpResponse.json({ reason: 'at most 1000000 base units per swap (PoC)' }, { status: 400 })
      const sats = Number((BigInt(raw) * 2_000n) / 1_000_000n * 9_850n / 10_000n)
      return HttpResponse.json({ dir: 'usdc-bsv', usdc: raw, sats, satsPerUsdc: 2_000, spreadBps: 150, expiresAt: new Date(Date.now() + 120_000).toISOString(), maker: { evm: '0xmaker', bsv: MOCK_IDS.providerServer }, htlc: '0xhtlc', token: '0xusdc', terms: { hash: 'sha256', minBaseTimeoutLeftS: 3600, bsvRefundBlocks: 6, landsIn: 'vault (agent + guard claim)' } })
    }),
    http.get('*/metrics', () => HttpResponse.json({ settlements: [...world.pools.values()].filter(p => p.status === 'settled').length, custodiedSats: 0, custodyCheck: 'ok (mock)' })),
    // overlay (§3.8)
    http.get('*/listTopicManagers', () => HttpResponse.json({ tm_agentcoop: { name: 'tm_agentcoop (mock)' } })),
    http.post('*/lookup', async ({ request }) => {
      const body = await request.json() as { service?: string, query?: OverlayQuery }
      const q = body.query
      if (q === undefined) return HttpResponse.json({ message: 'no query' }, { status: 400 })
      switch (q.op) {
        case 'pools': return outputList([...world.pools.values()].filter(p => q.status === undefined || p.status === q.status))
        case 'pool': { const p = world.pools.get(q.poolId); return outputList(p === undefined ? [] : [p]) }
        case 'pledges': return outputList((world.pledges.get(q.poolId) ?? []).filter(p => (q.includeSpent === true || !p.spent) && (q.includeInvalid === true || p.valid)))
        case 'vaults': return outputList([...world.vaults.values()].filter(v => q.owner === undefined || v.owner === q.owner))
        case 'vault': { const v = world.vaults.get(q.vaultId); return outputList(v === undefined ? [] : [v]) }
        case 'listings': return outputList([...world.listings.values()])
        default: return outputList([])
      }
    }),
    // provider (§3.6)
    http.get('*/v1/catalog', () => HttpResponse.json({ ...world.catalog, pools: [...world.pools.values()].filter(p => p.status === 'open') })),
    http.get('*/v1/jobs/:id', ({ params }) => HttpResponse.json({ id: params.id, owner: '', product: 'gpu-h100', kind: 'eval', minutes: 45, status: 'done', log: ['[mock] 8×H100 allocated', '[mock] eval batch 1/3', '[mock] done'], resultHash: 'mock_result_9f2c', payment: { method: 'credits', minutes: 45 } })),
    // guard (§3.7)
    http.get('*/policies/:agent', ({ params }) => {
      const p = world.policies.get(String(params.agent))
      return p === undefined ? HttpResponse.json({ reason: 'no policy' }, { status: 404 }) : HttpResponse.json({ owner: p.owner, agent: params.agent, policy: p.policy, updatedAt: p.updatedAt })
    }),
    http.put('*/policies/:agent', async ({ params, request }) => {
      const policy = await request.json() as MockWorld['policies'] extends Map<string, infer V> ? V extends { policy: infer P } ? P : never : never
      const prev = world.policies.get(String(params.agent))
      world.policies.set(String(params.agent), { owner: prev?.owner ?? '', policy, updatedAt: new Date().toISOString() })
      return HttpResponse.json({ ok: true })
    }),
    http.get('*/decisions', ({ request }) => {
      const url = new URL(request.url)
      const agent = url.searchParams.get('agent')
      const limit = Number(url.searchParams.get('limit') ?? 50)
      const decisions = world.decisions.filter(d => agent === null || agent === '' || d.agent === agent).slice(0, limit)
      return HttpResponse.json({ ...(agent !== null ? { agent } : {}), decisions })
    }),
    // agents (§3.10)
    http.get('*/agents', () => HttpResponse.json(world.agents)),
    // arcade (§20)
    http.get('*/chaintracks/v2/height', () => HttpResponse.json({ height: world.height })),
    // health, by service (the proxy path or the port tells them apart)
    http.get('*/healthz', ({ request }) => {
      const u = request.url
      if (u.includes('/api/coop') || u.includes(':8090')) return HttpResponse.json({ ok: true, overlay: true, height: world.height, engine: true })
      if (u.includes('/api/guard') || u.includes(':8091')) return HttpResponse.json({ ok: true, identityKey: world.vaults.values().next().value?.guard ?? '', network: 'main' })
      return HttpResponse.json({ ok: true })
    })
  ]
}
