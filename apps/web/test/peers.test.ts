import { describe, expect, it } from 'vitest'
import { canJoin, MAX_PLAYERS, MoveThrottle, peersFromPresence } from '../src/town/peers'

describe('MoveThrottle', () => {
  it('emits at most once per 1500 ms while moving and once on stop', () => {
    const t = new MoveThrottle()
    expect(t.next(0, { x: 0, y: 0 }, true)).toEqual({ x: 0, y: 0, stop: false })
    expect(t.next(500, { x: 20, y: 0 }, true)).toBeUndefined()
    expect(t.next(1500, { x: 40, y: 0 }, true)).toEqual({ x: 40, y: 0, stop: false })
    expect(t.next(1600, { x: 44.6, y: 0.2 }, false)).toEqual({ x: 45, y: 0, stop: true })
    expect(t.next(1700, { x: 44.6, y: 0.2 }, false)).toBeUndefined()
  })

  it('does not emit moves under 4 px', () => {
    const t = new MoveThrottle()
    t.next(0, { x: 100, y: 100 }, true)
    expect(t.next(2000, { x: 102, y: 100 }, true)).toBeUndefined()
    expect(t.next(4000, { x: 104, y: 100 }, true)).toEqual({ x: 104, y: 100, stop: false })
  })
})

describe('peersFromPresence', () => {
  it('drops self and takes the latest meta per key', () => {
    const peers = peersFromPresence({
      'me:1111': [{ name: 'me' }],
      '02bb:2222': [{ name: 'old' }, { name: 'Bob', at: [10, 20] }],
      'guest:3333': [{ name: 'Visitor 3333' }]
    }, 'me:1111')
    expect(peers).toEqual([{ key: '02bb:2222', name: 'Bob', at: [10, 20] }, { key: 'guest:3333', name: 'Visitor 3333' }])
  })

  it('keeps two tabs of one identity apart', () => {
    const peers = peersFromPresence({ '02ab:1111': [{ name: 'Ann' }], '02ab:2222': [{ name: 'Ann' }] }, 'guest:9999')
    expect(peers.map(p => p.key)).toEqual(['02ab:1111', '02ab:2222'])
  })
})

describe('canJoin', () => {
  it('refuses the ninth player', () => {
    expect(MAX_PLAYERS).toBe(8)
    expect(canJoin(7)).toBe(true)
    expect(canJoin(8)).toBe(false)
  })
})
