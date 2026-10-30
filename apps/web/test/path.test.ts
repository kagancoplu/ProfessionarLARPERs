import { describe, expect, it } from 'vitest'
import { BLOCKED, canStand } from '../src/town/map/blocked'
import { astar, findPath, lineClear, nearestFree } from '../src/town/map/path'
import { HOUSES } from '../src/town/layout'
import { POND, TERRAIN, TILE } from '../src/town/map/terrain'

const legsClear = (from: { x: number, y: number }, legs: Array<{ x: number, y: number }>): boolean => {
  let cur = from
  for (const p of legs) { if (!lineClear(BLOCKED, cur, p)) return false; cur = p }
  return true
}

describe('villager paths', () => {
  it('goes straight when nothing is in the way', () => {
    const a = { x: 2 * TILE + 8, y: 16 * TILE }, b = { x: 9 * TILE + 8, y: 16 * TILE }
    expect(findPath(a, b)).toEqual([b])
  })
  it('walks around a house instead of through it, every leg clear', () => {
    const h = HOUSES[1]!
    const a = { x: h.x, y: h.y + 20 }, b = { x: h.x, y: h.y - 9 * TILE }
    expect(lineClear(BLOCKED, a, b)).toBe(false)
    const legs = findPath(a, b)
    expect(legs.length).toBeGreaterThan(1)
    expect(legsClear(a, legs)).toBe(true)
  })
  it('goes around the pond', () => {
    const y = (POND.y + 3) * TILE + 8
    const a = { x: (POND.x - 2) * TILE, y }, b = { x: (POND.x + POND.w) * TILE + 8, y }
    const legs = findPath(a, b)
    expect(legsClear(a, legs)).toBe(true)
    expect(legs.at(-1)).toEqual(b)
  })
  it('targets inside a building end at the nearest free tile', () => {
    const h = HOUSES[0]!
    const inside = { x: h.x, y: h.y - 20 }
    expect(canStand(BLOCKED, inside.x, inside.y)).toBe(false)
    const end = findPath({ x: h.x, y: h.y + 24 }, inside).at(-1)!
    expect(canStand(BLOCKED, end.x, end.y)).toBe(true)
    expect(nearestFree(BLOCKED, { x: 0, y: 0 })).toEqual({ x: 0, y: 0 })
  })
  it('A* refuses unreachable goals', () => {
    const walled = BLOCKED.map(r => r.map(() => true))
    walled[0]![0] = false
    expect(astar(walled, TERRAIN, { x: 0, y: 0 }, { x: 5, y: 5 })).toBeUndefined()
  })
})
