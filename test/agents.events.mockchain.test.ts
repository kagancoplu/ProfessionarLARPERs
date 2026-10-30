/**
 * Track C for Track E (MASTER §3.10): the agents' live feed (SSE /events,
 * /agents, /healthz) and provider-api CORS, so the web app can show agents'
 * decisions and call the provider from the browser.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { AgentEvents, startAgentsServer, type CoopEvent } from '../apps/agents/src/events'
import { startMockStack, type MockStack } from '../apps/agents/src/demo/harness'

/** Read SSE events from `url` until `count` arrived. */
async function readSse (url: string, count: number, headers: Record<string, string> = {}): Promise<CoopEvent[]> {
  const ctrl = new AbortController()
  const res = await fetch(url, { headers, signal: ctrl.signal })
  const reader = res.body!.getReader()
  const out: CoopEvent[] = []
  let buf = ''
  while (out.length < count) {
    const { value, done } = await reader.read()
    if (done) break
    buf += new TextDecoder().decode(value)
    let i
    while ((i = buf.indexOf('\n\n')) >= 0) {
      const block = buf.slice(0, i); buf = buf.slice(i + 2)
      const data = block.split('\n').find(l => l.startsWith('data: '))
      if (data !== undefined) out.push(JSON.parse(data.slice(6)))
    }
  }
  ctrl.abort()
  return out
}

describe('agents live feed server', () => {
  const events = new AgentEvents()
  let feed: { url: string, close: () => Promise<void> }

  beforeAll(async () => {
    feed = await startAgentsServer({ port: 0, events, agents: () => [{ name: 'eval', profile: 'eval', identity: '02' + 'a'.repeat(64), mode: 'p2pkh' }] })
  })
  afterAll(async () => { await feed?.close() })

  it('serves /healthz and /agents with CORS, and answers preflight', async () => {
    const h = await fetch(`${feed.url}/healthz`)
    expect(await h.json()).toEqual({ ok: true })
    expect(h.headers.get('access-control-allow-origin')).toBe('*')
    expect(await (await fetch(`${feed.url}/agents`)).json()).toEqual([{ name: 'eval', profile: 'eval', identity: '02' + 'a'.repeat(64), mode: 'p2pkh' }])
    expect((await fetch(`${feed.url}/events`, { method: 'OPTIONS' })).status).toBe(204)
  })

  it('streams CoopEvent envelopes, resuming after Last-Event-ID', async () => {
    for (const n of [1, 2, 3]) events.publish('agent_thought', { text: `line ${n}` }, { agent: '02' + 'a'.repeat(64) })
    const reading = readSse(`${feed.url}/events`, 3, { 'Last-Event-ID': 'agents:1' })
    await new Promise(resolve => setTimeout(resolve, 100))
    events.publish('agent_decision', { action: 'skip', reason: 'covered' })
    const got = await reading
    expect(got.map(e => e.id)).toEqual(['agents:2', 'agents:3', 'agents:4'])
    expect(got[0]).toMatchObject({ src: 'agents', type: 'agent_thought', data: { text: 'line 2' }, agent: '02' + 'a'.repeat(64) })
    expect(got[2]).toMatchObject({ type: 'agent_decision', data: { action: 'skip' } })
  })
})

describe('agents publish what they do (K1 flow)', () => {
  let stack: MockStack

  beforeAll(async () => { stack = await startMockStack({ quiet: true }) })
  afterAll(async () => { await stack?.close() })

  it('emits started, pledge decisions, pledge payments, signatures, redeems and jobs', async () => {
    await stack.openPool({ credits: 40, priceSats: 1000, deadline: '+144', feeSats: 100, minCredits: 5, label: 'H100 block · 40 GPU-hours' })
    const agents = [await stack.agent('finetune'), await stack.agent('eval'), await stack.agent('inference')]
    for (const a of agents) await a.procurement.considerPools()
    await Promise.all(agents.map(async a => { await a.participant.until(() => a.participant.active?.status === 'settled', 90_000) }))
    await agents[1].procurement.runJob({ kind: 'eval', minutes: 30 })
    const all = stack.events.since()
    const ofType = (t: string): CoopEvent[] => all.filter(e => e.type === t)
    expect(ofType('agent_started')).toHaveLength(3)
    expect(stack.roster.map(r => r.name)).toEqual(['finetune', 'eval', 'inference'])
    const pledges = ofType('agent_decision').filter(e => (e.data as { action: string }).action === 'pledge')
    expect(pledges.map(e => (e.data as { credits: number }).credits)).toEqual([17, 11, 12])
    expect(pledges.every(e => e.poolId !== undefined && e.agent !== undefined)).toBe(true)
    expect(ofType('agent_payment').filter(e => (e.data as { kind: string }).kind === 'pledge')).toHaveLength(3)
    expect(ofType('agent_decision').filter(e => (e.data as { action: string }).action === 'sign')).toHaveLength(3)
    expect(ofType('agent_decision').some(e => (e.data as { action: string }).action === 'redeem')).toBe(true)
    expect(ofType('agent_job').map(e => (e.data as { status: string }).status)).toEqual(['queued', 'done'])
    expect(ofType('agent_thought').length).toBeGreaterThan(10)
  })

  it('provider-api answers browser preflight and exposes the BRC-103/105 headers', async () => {
    const pre = await fetch(`${stack.apiUrl}/v1/jobs`, { method: 'OPTIONS' })
    expect(pre.status).toBe(204)
    expect(pre.headers.get('access-control-allow-origin')).toBe('*')
    expect(pre.headers.get('access-control-expose-headers')).toMatch(/x-bsv-payment-satoshis-required/)
    expect(pre.headers.get('access-control-expose-headers')).toMatch(/x-bsv-auth-identity-key/)
    expect(pre.headers.get('access-control-allow-headers')).toMatch(/x-bsv-payment/)
    expect((await fetch(`${stack.apiUrl}/healthz`)).headers.get('access-control-allow-origin')).toBe('*')
  })
})
