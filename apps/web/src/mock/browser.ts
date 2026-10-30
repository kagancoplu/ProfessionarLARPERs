/** Mock mode bootstrap: MSW worker + scenario + health = ok for every service. */
import type { EventBus } from '../events/bus'
import { makeEvent } from '../events/types'
import type { ServiceName } from '../env'
import { createHandlers } from './handlers'
import { MockScenario } from './scenario'
import { createMockWorld, type MockWorld } from './state'

export interface MockRuntime { world: MockWorld, scenario: MockScenario, stop: () => void }

export async function startMockMode (bus: EventBus, opts: { speed?: number, worker?: boolean } = {}): Promise<MockRuntime> {
  const world = createMockWorld()
  let stopWorker = (): void => {}
  if (opts.worker !== false && typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
    const { setupWorker } = await import('msw/browser')
    const worker = setupWorker(...createHandlers(world))
    await worker.start({ onUnhandledRequest: 'bypass', quiet: true, serviceWorker: { url: '/mockServiceWorker.js' } })
    stopWorker = () => { worker.stop() }
  }
  const services: ServiceName[] = ['coop', 'overlay', 'provider', 'guard', 'agents', 'arcade']
  for (const service of services) bus.publish(makeEvent('web', 'service_health', { service, ok: true, detail: 'mock' }))
  const scenario = new MockScenario({ bus, world, speed: opts.speed ?? 1, loop: true })
  scenario.start()
  return { world, scenario, stop: () => { scenario.stop(); stopWorker() } }
}
