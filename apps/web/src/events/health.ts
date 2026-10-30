/** Independent health badge per service (track-E §7): /healthz every 30 s → `service_health` events. */
import { arcadeApi } from '../api/arcade'
import { agentsApi } from '../api/agents'
import { coopApi } from '../api/coop'
import { guardApi } from '../api/guard'
import { overlayApi } from '../api/overlay'
import { providerApi } from '../api/provider'
import type { ServiceName } from '../env'
import type { EventBus } from './bus'
import { makeEvent } from './types'

const CHECKS: Record<ServiceName, () => Promise<boolean>> = {
  coop: async () => (await coopApi.healthz()).ok,
  overlay: async () => (await overlayApi.healthz()).ok,
  provider: async () => (await providerApi.healthz()).ok,
  guard: async () => (await guardApi.healthz()).ok,
  agents: async () => (await agentsApi.healthz()).ok,
  arcade: async () => (await arcadeApi.height()) > 0
}

export async function checkService (service: ServiceName, bus: EventBus): Promise<boolean> {
  let ok = false
  let detail: string | undefined
  try { ok = await CHECKS[service]() } catch (err) { detail = String((err as Error).message ?? err) }
  bus.publish(makeEvent('web', 'service_health', { service, ok, ...(detail !== undefined ? { detail } : {}) }))
  return ok
}

export function startHealthPolling (bus: EventBus, services: ServiceName[], intervalMs = 30_000): { close: () => void, checkNow: () => Promise<void> } {
  const checkNow = async (): Promise<void> => { await Promise.all(services.map(s => checkService(s, bus))) }
  void checkNow()
  const timer = setInterval(() => { void checkNow() }, intervalMs)
  return { close: () => { clearInterval(timer) }, checkNow }
}
