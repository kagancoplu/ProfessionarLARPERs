/** Publishes `flow_step` events around each step of a flow, for the "Under the hood" panel. */
import type { EventBus } from '../../events/bus'
import { makeEvent } from '../../events/types'

export type Stamp = 'BRC-29' | 'BRC-100' | 'BRC-103' | 'BRC-105' | 'AtomicBEEF' | 'SPV' | 'SINGLE|ACP' | 'ALL' | '2-of-2' | 'internalizeAction' | '0-conf' | 'BSV-21' | 'OP_RETURN' | 'overlay' | 'lineage' | 'HTTP'

export interface Stepper {
  step: <T>(label: string, stamp: Stamp | undefined, fn: () => Promise<T>, extra?: (result: T) => { txid?: string, detail?: string }) => Promise<T>
  note: (label: string, stamp?: Stamp, detail?: string) => void
}

export function createStepper (bus: EventBus, flow: string): Stepper {
  const now = typeof performance !== 'undefined' ? () => performance.now() : () => Date.now()
  return {
    async step (label, stamp, fn, extra) {
      const t0 = now()
      bus.publish(makeEvent('web', 'flow_step', { flow, step: label, status: 'start', ...(stamp !== undefined ? { detail: stamp } : {}) }))
      try {
        const result = await fn()
        const x = extra?.(result) ?? {}
        bus.publish(makeEvent('web', 'flow_step', { flow, step: label, status: 'ok', ms: Math.round(now() - t0), ...(stamp !== undefined || x.detail !== undefined ? { detail: [stamp, x.detail].filter(Boolean).join(' · ') } : {}), ...(x.txid !== undefined ? { txid: x.txid } : {}) }, x.txid !== undefined ? { txid: x.txid } : {}))
        return result
      } catch (err) {
        bus.publish(makeEvent('web', 'flow_step', { flow, step: label, status: 'error', ms: Math.round(now() - t0), detail: String((err as Error).message ?? err) }))
        throw err
      }
    },
    note (label, stamp, detail) { bus.publish(makeEvent('web', 'flow_step', { flow, step: label, status: 'ok', detail: [stamp, detail].filter(Boolean).join(' · ') })) }
  }
}
