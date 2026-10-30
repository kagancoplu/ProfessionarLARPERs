import { describe, expect, it } from 'vitest'
import { BLOCKED, canStand } from '../src/town/map/blocked'
import { BOARD, HOUSES, WORKSHOP } from '../src/town/layout'
import { FOUNTAIN } from '../src/town/map/places'
import { MAP_H, MAP_W, PLAZA_COBBLE, POND, ROAD_Y, TILE } from '../src/town/map/terrain'

describe('avatar collision map', () => {
  it('blocks water and building footprints, leaves roads and the plaza open', () => {
    expect(BLOCKED).toHaveLength(MAP_H)
    expect(canStand(BLOCKED, (POND.x + 3) * TILE + 8, (POND.y + 3) * TILE + 8)).toBe(false)
    expect(canStand(BLOCKED, WORKSHOP.x, WORKSHOP.y - 8)).toBe(false)
    expect(canStand(BLOCKED, HOUSES[0]!.x, HOUSES[0]!.y - 20)).toBe(false)
    expect(canStand(BLOCKED, FOUNTAIN.x, FOUNTAIN.y - 4)).toBe(false)
    expect(canStand(BLOCKED, 8 * TILE, (ROAD_Y + 1) * TILE)).toBe(true)
    expect(canStand(BLOCKED, (PLAZA_COBBLE.x + 2) * TILE, (PLAZA_COBBLE.y + 2) * TILE)).toBe(true)
    expect(canStand(BLOCKED, BOARD.x, BOARD.y + 12)).toBe(true)
  })
  it('refuses the outside of the map', () => {
    expect(canStand(BLOCKED, -1, 10)).toBe(false)
    expect(canStand(BLOCKED, MAP_W * TILE + 1, 10)).toBe(false)
    expect(canStand(BLOCKED, 10, MAP_H * TILE + 1)).toBe(false)
  })
})
