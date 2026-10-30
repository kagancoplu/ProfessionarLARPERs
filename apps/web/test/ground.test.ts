import { describe, expect, it } from 'vitest'
import { buildGround, MAP_H, MAP_W, ROAD_Y, SQUARE, TILE_DIRT, TILE_GRASS_A, TILE_GRASS_B, TILE_ROAD } from '../src/town/map/ground'
import { assignHouses, BOARD, HOUSES, POINTS, WORKSHOP } from '../src/town/layout'

describe('town ground and layout', () => {
  it('is 60×34, deterministic, with a dirt square and a road reaching it from the gate', () => {
    const g = buildGround()
    expect(g).toHaveLength(MAP_H)
    expect(g.every(r => r.length === MAP_W)).toBe(true)
    expect(buildGround()).toEqual(g)
    expect(g[SQUARE.y0]![SQUARE.x0]).toBe(TILE_DIRT)
    expect(g[ROAD_Y]![0]).toBe(TILE_ROAD)
    expect(g[ROAD_Y]![SQUARE.x0 - 1]).toBe(TILE_ROAD)
    const ids = new Set(g.flat())
    expect([...ids].every(id => [TILE_GRASS_A, TILE_GRASS_B, TILE_DIRT, TILE_ROAD].includes(id))).toBe(true)
    expect(ids.has(TILE_GRASS_B)).toBe(true)
  })
  it('reads buildings and points from the Tiled draft', () => {
    expect(HOUSES).toHaveLength(3)
    expect(HOUSES.map(h => h.slot)).toEqual([1, 2, 3])
    expect(BOARD.kind).toBe('board')
    expect(WORKSHOP.w).toBe(48)
    expect(POINTS['square-centre']).toBeDefined()
  })
  it('assigns the first three agents to houses and the rest to the square (crowd mode)', () => {
    const m = assignHouses(['a', 'b', 'c', 'd'])
    expect([m.get('a'), m.get('b'), m.get('c'), m.get('d')]).toEqual([0, 1, 2, undefined])
  })
})
