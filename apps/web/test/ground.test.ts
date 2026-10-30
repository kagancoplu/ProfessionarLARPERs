import { describe, expect, it } from 'vitest'
import { MASKS, blobIndex, canonical, maskAt, N, E, W, NE } from '../src/town/map/autotile'
import { buildTerrain, MAP_H, MAP_W, PLAZA_COBBLE, POND, ROAD_Y, isWalkable, tileIndexAt } from '../src/town/map/terrain'
import { assignHouses, BOARD, HOUSES, POINTS, WORKSHOP } from '../src/town/layout'
import { PLACES, TREES } from '../src/town/map/places'

describe('autotile', () => {
  it('has the 47 blob masks and drops corner bits without both edges', () => {
    expect(MASKS).toHaveLength(47)
    expect(canonical(NE)).toBe(0)
    expect(canonical(N | E | NE)).toBe(N | E | NE)
    expect(blobIndex(255)).toBe(46)
    expect(blobIndex(0)).toBe(0)
  })
  it('reads a neighbourhood, out of bounds counting as same', () => {
    const grid = [[1, 1], [1, 0]]
    const same = (x: number, y: number): boolean | undefined => grid[y]?.[x] === undefined ? undefined : grid[y]![x] === 1
    expect(maskAt(0, 0, same)).toBe(canonical(255 & ~8))   // SE is the 0 cell
    expect(maskAt(1, 1, same)).toBe(255)   // every neighbour is 1 or out of bounds
    expect(maskAt(1, 0, same) & W).toBe(W)
  })
})

describe('town terrain and layout', () => {
  const g = buildTerrain()
  it('is 48×36, deterministic, with a cobbled square, a pond and the gate road', () => {
    expect(g).toHaveLength(MAP_H)
    expect(g.every(r => r.length === MAP_W)).toBe(true)
    expect(buildTerrain()).toEqual(g)
    expect(g[PLAZA_COBBLE.y]![PLAZA_COBBLE.x]).toBe('cobble')
    expect(g[ROAD_Y]![0]).toBe('dirt')
    expect(g[POND.y + 2]![POND.x + 2]).toBe('water')
    expect(isWalkable(g, POND.x + 2, POND.y + 2)).toBe(false)
    expect(isWalkable(g, 0, ROAD_Y)).toBe(true)
  })
  it('gives every non-grass cell a tile index in 0..46 and the plaza interior the full tile', () => {
    for (let y = 0; y < MAP_H; y++) for (let x = 0; x < MAP_W; x++) if (g[y]![x] !== 'grass') { const i = tileIndexAt(g, x, y); expect(i).toBeGreaterThanOrEqual(0); expect(i).toBeLessThan(47) }
    expect(tileIndexAt(g, PLAZA_COBBLE.x + 3, PLAZA_COBBLE.y + 3)).toBe(46)
  })
  it('places houses in slot order, the board and the workshop, and keeps trees off the roads', () => {
    expect(HOUSES).toHaveLength(4)
    expect(HOUSES.map(h => h.slot)).toEqual([1, 2, 3, 4])
    expect(BOARD.kind).toBe('board')
    expect(WORKSHOP.frame).toMatch(/^blacksmith/)
    expect(POINTS['square-centre']).toBeDefined()
    expect(PLACES.every(p => p.x >= 0 && p.x <= MAP_W * 16 && p.y >= 0 && p.y <= MAP_H * 16)).toBe(true)
    for (const t of TREES) { const tx = Math.floor(t.x / 16), ty = Math.floor(t.y / 16) - 1; expect(g[ty]?.[tx] ?? 'grass', `tree at ${tx},${ty}`).toBe('grass') }
  })
  it('assigns the first four agents to houses and the rest to the square (crowd mode)', () => {
    const m = assignHouses(['a', 'b', 'c', 'd', 'e'])
    expect([m.get('a'), m.get('d'), m.get('e')]).toEqual([0, 3, undefined])
  })
})
