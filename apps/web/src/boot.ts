/**
 * Bootstrap for the three modes (track-E §2.3): one bus, one store, one wallet controller.
 *   live   → health polling, coordinator WS, overlay SSE (+ derive), guard/agents envelope SSE
 *   mock   → MSW worker + scenario + mock Desktop
 *   replay → ReplayPlayer over public/replays/<name>.jsonl
 * The UI never changes between modes; only adapters and the WalletInterface do.
 */
import { coopApi } from './api/coop'
import { agentsApi } from './api/agents'
import { guardApi } from './api/guard'
import { invalidateFor, queryClient } from './api/queries'
import type { AppRuntime } from './app-context'
import { env, wsUrl } from './env'
import { createBus } from './events/bus'
import { startCoordinatorFeed } from './events/adapters/coordinatorWs'
import { startEnvelopeSse } from './events/adapters/envelopeSse'
import { startOverlaySse } from './events/adapters/overlaySse'
import { startHealthPolling } from './events/health'
import { makeEvent } from './events/types'
import { MOCK_IDS } from './mock/data'
import { createMockWallet } from './mock/wallet'
import { ReplayPlayer } from './replay/player'
import { store } from './store'
import { WalletController, realWalletFactory } from './wallet/client'

export async function bootstrap (): Promise<AppRuntime & { stop: () => void }> {
  store.getState().setMode(env.mode, env.replayName)
  const bus = createBus(store)
  const stops: Array<() => void> = []
  bus.subscribe(e => { invalidateFor(queryClient, e) })

  const factory = env.mode === 'mock' ? () => createMockWallet({ identityKey: MOCK_IDS.me, network: env.network === 'main' ? 'mainnet' : 'testnet' }) : realWalletFactory
  const wallet = new WalletController({ store, bus, factory, expectedNetwork: env.network })
  const runtime: AppRuntime & { stop: () => void } = { bus, wallet, stop: () => { for (const s of stops) s() } }

  if (env.mode === 'mock') {
    const { startMockMode } = await import('./mock/browser')
    const mock = await startMockMode(bus)
    runtime.mock = mock
    stops.push(mock.stop)
    bus.publish(makeEvent('web', 'mode_changed', { mode: 'mock' }))
    return runtime
  }

  if (env.mode === 'replay') {
    const replay = new ReplayPlayer({ bus, speed: store.getState().settings.replaySpeed })
    runtime.replay = replay
    bus.publish(makeEvent('web', 'mode_changed', { mode: 'replay', replayName: env.replayName ?? 'mock-demo' }))
    void replay.load(`/replays/${env.replayName ?? 'mock-demo'}.jsonl`).then(() => replay.play()).catch(err => {
      store.getState().pushToast({ kind: 'error', text: `Replay not found: ${String((err as Error).message)}` })
    })
    stops.push(() => replay.pause())
    return runtime
  }

  // live
  const health = startHealthPolling(bus, ['coop', 'overlay', 'provider', 'guard', 'agents', 'arcade'])
  stops.push(health.close)
  const status = (service: 'coop' | 'overlay' | 'guard' | 'agents') => (ok: boolean, detail?: string) => {
    const current = store.getState().health[service]
    if (current.ok === ok && current.detail === detail) return
    bus.publish(makeEvent('web', 'service_health', { service, ok, ...(detail !== undefined ? { detail } : {}) }))
  }
  const feed = startCoordinatorFeed({ url: wsUrl(env.urls.coop), bus, onStatus: status('coop'), identity: () => store.getState().me.identityKey })
  stops.push(feed.close)
  const overlay = startOverlaySse({ url: `${env.urls.overlay}/agentcoop/events`, bus, store, coop: coopApi, onStatus: status('overlay') })
  stops.push(overlay.close)
  stops.push(startEnvelopeSse('guard', guardApi.eventsUrl, bus, status('guard')).close)
  stops.push(startEnvelopeSse('agents', agentsApi.eventsUrl, bus, status('agents')).close)
  // a wallet connection announces itself to the coordinator so sign_requests arrive
  stops.push(store.subscribe((s, prev) => {
    if (s.me.identityKey !== undefined && s.me.identityKey !== prev.me.identityKey) feed.hello(s.me.identityKey)
  }))
  bus.publish(makeEvent('web', 'mode_changed', { mode: 'live' }))
  return runtime
}
