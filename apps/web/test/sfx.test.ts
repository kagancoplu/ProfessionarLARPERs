import { describe, expect, it } from 'vitest'
import { effectFor, SCORES, Sfx } from '../src/audio/sfx'
import { makeEvent } from '../src/events/types'

describe('sound effects (synthesised, no assets)', () => {
  it('maps the story events to effects and ignores the rest', () => {
    expect(effectFor(makeEvent('overlay', 'pledge_added', { pledge: {} as never, pledgedCredits: '1' }))).toBe('coin')
    expect(effectFor(makeEvent('coordinator', 'pool_settled', { poolId: 'p', txid: 't', participants: 3 }))).toBe('bell')
    expect(effectFor(makeEvent('guard', 'cosign_denied', { agent: 'a', kind: 'pay', reason: 'no' }))).toBe('shield')
    expect(effectFor(makeEvent('coordinator', 'sign_request', { poolId: 'p', round: 1, plan: {} as never, yourInputIndex: 0 }))).toBe('chime')
    expect(effectFor(makeEvent('web', 'flow_step', { flow: 'x', step: 'y', status: 'ok' }))).toBeUndefined()
  })
  it('every score is short and ordered', () => {
    for (const notes of Object.values(SCORES)) {
      expect(notes.length).toBeGreaterThan(0)
      let last = -1
      for (const n of notes) { expect(n.t).toBeGreaterThanOrEqual(last); last = n.t; expect(n.d).toBeLessThanOrEqual(0.8); expect(n.f).toBeGreaterThan(50) }
    }
  })
  it('stays silent without a context or when disabled', () => {
    const s = new Sfx()
    expect(() => s.play('coin')).not.toThrow()
    s.enabled = true
    expect(() => s.play('bell')).not.toThrow()
    expect(s.ready).toBe(false)
  })
})
