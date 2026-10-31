import { describe, expect, it } from 'vitest'
import { acceptMove, canJoin, JoinGate, MAX_NAME, MAX_PLAYERS, MoveThrottle, peersFromPresence } from '../src/town/peers'

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

describe('JoinGate', () => {
  it('decides once, on the first presence sync after subscribing (the state is empty at SUBSCRIBED)', () => {
    const g = new JoinGate()
    expect(g.onSync(8)).toBeUndefined()
    g.onSubscribed()
    expect(g.onSync(8)).toBe('watch')
    expect(g.onSync(0)).toBeUndefined()
    const h = new JoinGate()
    h.onSubscribed()
    expect(h.onSync(2)).toBe('join')
  })

  it('decides on a timeout when no sync arrives', () => {
    const g = new JoinGate()
    g.onSubscribed()
    expect(g.onTimeout(0)).toBe('join')
    expect(g.onSync(9)).toBeUndefined()
  })
})

describe('F-8: the public channel is attacker-supplied', () => {
  const town = { w: 768, h: 576 }
  const present = new Set(['02bb:2222', 'guest:3333'])

  it('a move counts only from a player in presence, to a point inside the town', () => {
    expect(acceptMove({ key: '02bb:2222', name: 'ignored', to: [100.4, 200.6] }, present, 'me:1111', town)).toEqual({ key: '02bb:2222', to: [100, 201] })
    expect(acceptMove({ key: 'ghost:9999', to: [10, 10] }, present, 'me:1111', town)).toBeUndefined() // not in presence
    expect(acceptMove({ key: '02bb:2222', to: [10, 10] }, present, '02bb:2222', town)).toBeUndefined() // ourselves
    for (const to of [[-1, 10], [10, 577], [Number.NaN, 1], [1e308, 1], ['1', 2], [1], [1, 2, 3], 'x', null]) {
      expect(acceptMove({ key: '02bb:2222', to }, present, 'me:1111', town)).toBeUndefined()
    }
    for (const payload of [null, 'move', 42, []]) expect(acceptMove(payload, present, 'me:1111', town)).toBeUndefined()
  })

  it('presence names are trimmed, stripped of control characters and capped; bad positions are dropped', () => {
    const peers = peersFromPresence({
      'a:1': [{ name: `  ${'x'.repeat(100)}  `, at: [5, 5] }],
      'b:2': [{ name: '\u0000\u001b[31m', at: [Number.POSITIVE_INFINITY, 0] } as never],
      'c:3': [{ name: 42, at: [10, 9999] } as never]
    }, 'me:1111', town)
    expect(peers).toEqual([
      { key: 'a:1', name: 'x'.repeat(MAX_NAME), at: [5, 5] },
      { key: 'b:2', name: '[31m' },
      { key: 'c:3', name: 'Visitor' }
    ])
  })
})
