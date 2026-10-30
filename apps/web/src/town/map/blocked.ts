/**
 * Where the avatar cannot walk (track-E P6): water, the lower part of every building, stalls, the well and the
 * fountain, tree trunks. Pure: computed once from the terrain grid and the places.
 */
import { PLACES, TREES, type Place } from './places'
import { MAP_H, MAP_W, TERRAIN, TILE, type Terrain } from './terrain'

/** footprint in tiles (width, height from the bottom) per kind; others do not block */
const FOOT: Partial<Record<Place['kind'], [number, number]>> = {
  house: [6, 4], coop: [5, 3], workshop: [10, 4], fisherman: [6, 3], windmill: [8, 3], stall: [3, 2], well: [2, 2], fountain: [2, 2],
  board: [2, 1], bench: [2, 1], barrel: [2, 1], prop: [1, 1], sign: [1, 1], scarecrow: [1, 1], tree: [1, 1], boat: [3, 2]
}

export function buildBlocked (grid: Terrain[][] = TERRAIN, places: Place[] = [...PLACES, ...TREES]): boolean[][] {
  const b: boolean[][] = Array.from({ length: MAP_H }, (_, y) => Array.from({ length: MAP_W }, (_, x) => grid[y]![x] === 'water'))
  for (const p of places) {
    const f = FOOT[p.kind]
    if (f === undefined) continue
    const [w, h] = f
    const cx = Math.floor(p.x / TILE), by = Math.ceil(p.y / TILE) - 1
    for (let ty = by - h + 1; ty <= by; ty++) for (let tx = cx - Math.floor(w / 2); tx < cx - Math.floor(w / 2) + w; tx++) if (b[ty]?.[tx] !== undefined) b[ty]![tx] = true
  }
  return b
}

export const BLOCKED = buildBlocked()

/** Can a foot point (world px) stand here? */
export const canStand = (blocked: boolean[][], x: number, y: number): boolean => {
  const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE)
  return tx >= 0 && ty >= 0 && tx < MAP_W && ty < MAP_H && blocked[ty]![tx] === false
}
