import { describe, expect, it } from 'vitest'
import { createBus } from '../src/events/bus'
import { makeEvent } from '../src/events/types'
import { parseJsonl } from '../src/replay/player'
import { Recorder, replayName, toJsonl } from '../src/replay/recorder'
import { createAppStore } from '../src/store'
import { DEFAULT_SETTINGS } from '../src/store/types'

describe('replay recorder', () => {
  it('records bus events (not flow steps or health), writes jsonl the player reads back', () => {
    const store = createAppStore('live', undefined, { ...DEFAULT_SETTINGS })
    const bus = createBus(store)
    const rec = new Recorder(bus)
    bus.publish(makeEvent('web', 'mode_changed', { mode: 'live' }))   // before start: not recorded
    rec.start()
    bus.publish(makeEvent('coordinator', 'pool_failed', { poolId: 'p1' }))
    bus.publish(makeEvent('web', 'flow_step', { flow: 'x', step: 'y', status: 'ok' }))
    bus.publish(makeEvent('web', 'service_health', { service: 'coop', ok: true }))
    bus.publish(makeEvent('maker', 'rail_funded_bsv', { txid: 'abc' }, { txid: 'abc' }))
    rec.end()
    expect(rec.events.map(e => e.type)).toEqual(['pool_failed', 'rail_funded_bsv'])
    const f = rec.file({ mode: 'live', urls: { coop: 'http://c' } })
    expect(f.name).toMatch(/^mainnet-\d{4}-\d{2}-\d{2}-\d{2}-\d{2}\.jsonl$/)
    expect(f.text.startsWith('# AgentCoop replay · mainnet-')).toBe(true)
    const back = parseJsonl(f.text)
    expect(back).toHaveLength(2)
    expect(back[1]?.type).toBe('rail_funded_bsv')
  })
  it('names mock recordings mock-*, and the header carries the URLs', () => {
    expect(replayName('mock', new Date('2026-10-31T01:02:00Z'))).toBe('mock-2026-10-31-01-02')
    expect(toJsonl([], { mode: 'mock', urls: { a: 'b' }, startedAt: 'now' }, 'x')).toBe('# AgentCoop replay · x · recorded now in mock mode · a=b\n')
  })
})
