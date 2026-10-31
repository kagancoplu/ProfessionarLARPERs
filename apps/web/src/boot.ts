/**
 * Bootstrap for the three modes (track-E §2.3): one bus, one store, one wallet controller.
 *   live   → coordinator WS + either the Supabase mirror (transport 'supabase', falls back to direct) or
 *            health polling, overlay SSE (+ derive), guard/agents envelope SSE, polls (transport 'direct')
 *   mock   → MSW worker + scenario + mock Desktop
 *   replay → ReplayPlayer over public/replays/<name>.jsonl
 * The UI never changes between modes; only adapters and the WalletInterface do.
 */
import { coopApi } from './api/coop'
import { agentsApi } from './api/agents'
import { guardApi } from './api/guard'
import { makerApi } from './api/maker'
import { overlayApi } from './api/overlay'
import { getSupabase } from './api/supabase'
import { createLiveClient } from './api/supabaseLiveClient'
import { startSfx } from './audio'
import { invalidateFor, queryClient } from './api/queries'
import type { AppRuntime } from './app-context'
import { env, wsUrl } from './env'
import { createBus } from './events/bus'
import { startCoordinatorFeed } from './events/adapters/coordinatorWs'
import { startEnvelopeSse } from './events/adapters/envelopeSse'
import { startOverlaySse } from './events/adapters/overlaySse'
import { startSupabaseLive } from './events/adapters/supabaseLive'
import { startHealthPolling } from './events/health'
import { startLivePolling } from './events/livePoll'
import { makeEvent } from './events/types'
import { MOCK_IDS } from './mock/data'
import { createMockWallet } from './mock/wallet'
import { ReplayPlayer } from './replay/player'
import { store } from './store'
import { WalletController, realWalletFactory } from './wallet/client'
import { createLiveFlows } from './wallet/flows/live'
import { createMockFlows } from './wallet/flows/mock'
import type { FlowsApi } from './wallet/flows/types'
import { coordinatorHost, signHello } from './wallet/hello'
import { mine } from './wallet/mine'
import type { CoordinatorFeed } from './events/adapters/coordinatorWs'

export async function bootstrap (): Promise<AppRuntime & { stop: () => void }> {
  store.getState().setMode(env.mode, env.replayName)
  // presenter mode (track-E 5.1): ?presenter=1 → bigger, quieter, stage-skip keys in replay
  if (typeof location !== 'undefined' && new URLSearchParams(location.search).get('presenter') === '1') store.getState().updateSettings({ presenter: true })
  if (typeof location !== 'undefined' && new URLSearchParams(location.search).get('avatar') === '1') store.getState().updateSettings({ avatar: true })
  const bus = createBus(store)
  const stops: Array<() => void> = []
  bus.subscribe(e => { invalidateFor(queryClient, e) })
  // sound: synthesised effects, off by default, unlocked on the first gesture (track-E §5.3)
  stops.push(startSfx(bus, store))

  const factory = env.mode === 'mock' ? () => createMockWallet({ identityKey: MOCK_IDS.me, network: env.network === 'main' ? 'mainnet' : 'testnet' }) : realWalletFactory
  const wallet = new WalletController({ store, bus, factory, expectedNetwork: env.network })
  let feed: CoordinatorFeed | undefined
  let flows: FlowsApi
  const runtime: AppRuntime & { stop: () => void } = { bus, wallet, get flows () { return flows }, get feed () { return feed }, stop: () => { for (const s of stops) s() } }
  // my pledges/pools follow the connected identity; a settlement of my pool is taken in automatically
  stops.push(store.subscribe((s, prev) => { if (s.me.identityKey !== prev.me.identityKey) mine.getState().load(s.me.identityKey) }))
  stops.push(bus.subscribe(e => { if (e.type === 'settled') void flows.afterSettlement(e.data.poolId, e.data.txid).catch(err => store.getState().pushToast({ kind: 'error', text: `After the settlement: ${String((err as Error).message)}` })) }))

  if (env.mode === 'mock') {
    const { startMockMode } = await import('./mock/browser')
    const mock = await startMockMode(bus)
    runtime.mock = mock
    flows = createMockFlows({ world: mock.world, bus, store, getWallet: () => wallet.wallet })
    stops.push(mock.stop)
    bus.publish(makeEvent('web', 'mode_changed', { mode: 'mock' }))
    return runtime
  }

  if (env.mode === 'replay') {
    const replay = new ReplayPlayer({ bus, speed: store.getState().settings.replaySpeed })
    runtime.replay = replay
    flows = createLiveFlows({ env, store, bus, getWallet: () => wallet.wallet, getFeed: () => undefined })
    bus.publish(makeEvent('web', 'mode_changed', { mode: 'replay', replayName: env.replayName ?? 'mock-demo' }))
    void replay.load(`/replays/${env.replayName ?? 'mock-demo'}.jsonl`).then(() => replay.play()).catch(err => {
      store.getState().pushToast({ kind: 'error', text: `Replay not found: ${String((err as Error).message)}` })
    })
    stops.push(() => replay.pause())
    return runtime
  }

  // live: the coordinator's WS and the wallet flows are direct in both transports (signing rounds, settled → afterSettlement)
  const status = (service: 'coop' | 'overlay' | 'guard' | 'agents' | 'maker') => (ok: boolean, detail?: string) => {
    const current = store.getState().health[service]
    if (current.ok === ok && current.detail === detail) return
    bus.publish(makeEvent('web', 'service_health', { service, ok, ...(detail !== undefined ? { detail } : {}) }))
  }
  feed = startCoordinatorFeed({
    url: wsUrl(env.urls.coop), bus, onStatus: status('coop'), identity: () => store.getState().me.identityKey,
    // B-P5a: prove the identity over the coordinator's nonce so sign_requests reach this browser
    prove: async nonce => { const w = wallet.wallet; if (w === undefined) throw new Error('no wallet'); return await signHello(w, coordinatorHost(env.urls.coop), nonce) }
  })
  const liveFeed = feed
  stops.push(liveFeed.close)
  flows = createLiveFlows({ env, store, bus, getWallet: () => wallet.wallet, getFeed: () => liveFeed })
  // the services' own streams and polls (transport 'direct', or the fallback when the Supabase mirror is unavailable)
  let direct = false
  const startDirect = (): void => {
    if (direct) return
    direct = true
    const health = startHealthPolling(bus, ['coop', 'overlay', 'provider', 'guard', 'agents', 'arcade', 'maker'])
    stops.push(health.close)
    const overlay = startOverlaySse({ url: `${env.urls.overlay}/agentcoop/events`, bus, store, coop: coopApi, onStatus: status('overlay') })
    stops.push(overlay.close)
    stops.push(startEnvelopeSse('guard', guardApi.eventsUrl, bus, status('guard')).close)
    stops.push(startEnvelopeSse('agents', agentsApi.eventsUrl, bus, status('agents')).close)
    stops.push(startEnvelopeSse('maker', makerApi.eventsUrl, bus, status('maker')).close)
    // listings, the agents' roster and vaults have no stream of their own
    stops.push(startLivePolling(bus, store, { listings: () => coopApi.listings(), agents: () => agentsApi.list(), vaults: () => overlayApi.vaults(), vaultCredits: h => overlayApi.vaultCredits(h) }))
  }
  // transport 'supabase' (plan/phases/SUPABASE-MVP.md): one connection to the relay's mirror instead of the streams above
  const sb = await getSupabase()
  if (sb === undefined) { store.getState().setTransport('direct'); startDirect() }
  else {
    store.getState().setTransport('mirror')
    let live: { close: () => void } | undefined
    const fallBack = (why: string): void => {
      if (direct) return
      live?.close()
      console.warn(`[live] Supabase mirror unavailable (${why}); using the services directly`)
      store.getState().pushToast({ kind: 'warn', text: 'Live mirror unavailable: reading the services directly' })
      store.getState().setTransport('direct')
      startDirect()
    }
    const started = startSupabaseLive({ client: createLiveClient(sb), bus, store, onStale: () => fallBack('no ticks from the relay') })
    live = started
    stops.push(started.close)
    started.ready.catch(err => fallBack(String((err as Error).message ?? err)))
  }
  // a wallet connection announces itself to the coordinator so sign_requests arrive
  stops.push(store.subscribe((s, prev) => {
    if (s.me.identityKey !== undefined && s.me.identityKey !== prev.me.identityKey) liveFeed.hello(s.me.identityKey, mine.getState().pledges.filter(p => p.status === 'pending' || p.status === 'signed').map(p => p.poolId))
  }))
  bus.publish(makeEvent('web', 'mode_changed', { mode: 'live' }))
  return runtime
}
