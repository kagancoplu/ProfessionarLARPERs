/**
 * End-to-end rehearsal on the mock chain (no mainnet state): overlay, coordinator, provider-api and guard in process,
 * the agents' SSE server, the relay into the LOCAL Supabase stack, the web (Vite) on the Supabase transport, and two
 * browsers. It wipes the local mirror tables first: never point it at the hosted project. Run from the repo root:
 *   supabase start
 *   eval "$(supabase status -o env | sed -E 's/^([A-Z_]+)=/export SB_\1=/')"
 *   npx tsx --import @agentcoop/core/register-sdk scripts/rehearsal-supabase.ts
 * Expected: both pages see the pool and the agents' pledges (same pledged credits as the coordinator), and the
 * reloaded page keeps them with no duplicate feed entries or replayed toasts. Screenshot: <tmpdir>/agentcoop-rehearsal.png
 */
import { spawn } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { chromium, type Page } from 'playwright'
import { startMockStack } from '../apps/agents/src/demo/harness'
import { startAgentsServer } from '../apps/agents/src/events'
import { watchCoordinator } from '../apps/relay/src/coordinator'
import { startRelay } from '../apps/relay/src/relay'
import { createSources } from '../apps/relay/src/sources'
import { followSse } from '../apps/relay/src/sse'
import { createSupabaseSink } from '../apps/relay/src/supabaseSink'

const SB = process.env.SB_API_URL ?? ''
if (!/^http:\/\/(127\.0\.0\.1|localhost)[:/]/.test(SB)) throw new Error('SB_API_URL must be the local Supabase stack (this script wipes the mirror tables)')
const ANON = process.env.SB_ANON_KEY ?? ''
const SECRET = process.env.SB_SECRET_KEY ?? ''
const PORT = 5189
const wait = async (ms: number): Promise<void> => await new Promise(r => setTimeout(r, ms))
const log = (...a: unknown[]): void => { console.log('[rehearsal]', ...a) }

async function main (): Promise<void> {
  const db = createClient(SB, SECRET, { auth: { persistSession: false } })
  for (const [t, k] of [['live_pools', 'pool_id'], ['live_pledges', 'outpoint'], ['live_listings', 'outpoint'], ['live_vaults', 'vault_id'], ['live_agents', 'identity'], ['live_health', 'service'], ['coop_events', 'uid']]) await db.from(t).delete().not(k, 'is', null)
  await db.from('live_ticks').delete().gt('id', 0)

  const stack = await startMockStack({ quiet: true })
  const agentsSrv = await startAgentsServer({ port: 18_093, events: stack.events, agents: () => stack.roster })
  const urls = { coop: stack.coopUrl, overlay: stack.overlayUrl, guard: stack.guardUrl, provider: stack.apiUrl, agents: agentsSrv.url, maker: 'http://127.0.0.1:9', arcade: 'http://127.0.0.1:9' }
  const relay = startRelay(urls, { sink: createSupabaseSink(SB, SECRET), sources: createSources(urls), followSse, watchCoordinator })
  const vite = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], {
    cwd: 'apps/web',
    env: { ...process.env, VITE_SUPABASE_URL: SB, VITE_SUPABASE_ANON_KEY: ANON, VITE_USE_PROXY: 'false', VITE_DATA_MODE: 'live', VITE_COOP_API_URL: urls.coop, VITE_OVERLAY_URL: urls.overlay, VITE_PROVIDER_API_URL: urls.provider, VITE_GUARD_URL: urls.guard, VITE_AGENTS_URL: urls.agents },
    stdio: 'ignore'
  })
  const base = `http://localhost:${PORT}`
  let up = false
  for (let i = 0; i < 60 && !up; i++) { try { up = (await fetch(base)).ok } catch {} if (!up) await wait(500) }
  log('vite up', up)

  const browser = await chromium.launch()
  const open = async (): Promise<Page> => {
    const p = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage()
    p.on('pageerror', e => log('pageerror', e.message.slice(0, 200)))
    p.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') log('console', m.type(), m.text().slice(0, 160)) })
    p.on('requestfailed', r => log('reqfail', r.url().slice(0, 120), r.failure()?.errorText))

    await p.goto(`${base}/?avatar=1`)
    await wait(10_000)
    await p.screenshot({ path: join(tmpdir(), 'agentcoop-rehearsal.png') })
    log('page', JSON.stringify(await p.evaluate(() => { const t = (window as any).__town; return { alive: t?.alive, avatar: t?.avatar?.enabled, villagers: [...t.villagers.keys()].map(String) } })))
    await p.waitForFunction(() => (window as any).__town?.avatar?.enabled === true, null, { timeout: 30_000 })
    return p
  }
  const a = await open()
  const b = await open()
  const state = async (p: Page, poolId: string) => await p.evaluate(id => {
    const s = (window as any).__town.deps.store.getState()
    const pool = s.pools.byId[id]
    return { status: pool?.status, pledged: pool?.pledgedCredits, pledges: pool?.pledges?.length ?? 0, feed: s.feed.map((e: any) => e.type), toasts: s.ui.toasts.length, peers: [...(window as any).__town.villagers.keys()].map(String).filter((k: string) => k.startsWith('peer:')).length }
  }, poolId)

  const pool = await stack.openPool({ credits: 40, priceSats: 1000, deadline: '+144', feeSats: 100, minCredits: 5, label: 'H100 · rehearsal' })
  const poolId = pool.poolId!
  log('pool opened', poolId.slice(0, 12))
  for (let i = 0; i < 40 && (await state(b, poolId)).status === undefined; i++) await wait(250)
  log('A sees', JSON.stringify((await state(a, poolId))).slice(0, 160))
  log('B sees', JSON.stringify((await state(b, poolId))).slice(0, 160))

  const t0 = Date.now()
  const finetune = await stack.agent('finetune')
  const evalAgent = await stack.agent('eval')
  await finetune.procurement.considerPools()
  await evalAgent.procurement.considerPools()
  for (let i = 0; i < 80; i++) { const s = await state(b, poolId); if (s.pledges > 0 && (s.status === 'settled' || i > 40)) break; await wait(500) }
  const sa = await state(a, poolId)
  const sb = await state(b, poolId)
  log(`after agents (${Date.now() - t0} ms): A`, JSON.stringify({ ...sa, feed: sa.feed.slice(-6) }))
  log('B', JSON.stringify({ ...sb, feed: sb.feed.slice(-6) }))
  const coop = await (await fetch(`${urls.coop}/pools/${poolId}`)).json() as { status: string, pledgedCredits: string }
  log('coordinator says', coop.status, coop.pledgedCredits)

  await b.reload()
  await b.waitForFunction(() => (window as any).__town?.avatar?.enabled === true, null, { timeout: 30_000 })
  await wait(1500)
  const sr = await state(b, poolId)
  const counts = sr.feed.reduce((m: Record<string, number>, t: string) => { m[t] = (m[t] ?? 0) + 1; return m }, {})
  log('B after reload', JSON.stringify({ status: sr.status, pledged: sr.pledged, pledges: sr.pledges, toasts: sr.toasts, peers: sr.peers, feedTypes: counts }))

  await browser.close()
  vite.kill()
  await relay.stop()
  await agentsSrv.close()
  await stack.close()
}

main().then(() => process.exit(0), err => { console.error('[rehearsal] failed', err); process.exit(1) })
