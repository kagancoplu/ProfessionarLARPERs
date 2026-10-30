/**
 * The Town's ground (E-V1): a 48×36 grid of terrain kinds, built from a few shapes so tests and the
 * walkability check share one source with the Tiled export (tools/town-map.mjs). Blob tilesets come from
 * Kenmi's autotile blocks (public/game/terrain/*.png); `SAME` says which neighbours a terrain treats as
 * itself when choosing its edge tile (cobble sits on sand, so sand sees cobble as sand).
 */
import { blobIndex, maskAt } from './autotile'

export const MAP_W = 48
export const MAP_H = 36
export const TILE = 16

export type Terrain = 'grass' | 'dirt' | 'sand' | 'cobble' | 'water'
export const TERRAINS: readonly Terrain[] = ['grass', 'dirt', 'sand', 'cobble', 'water']

const SAME: Record<Terrain, ReadonlySet<Terrain>> = {
  grass: new Set(['grass']),
  dirt: new Set(['dirt']),
  sand: new Set(['sand', 'cobble']),
  cobble: new Set(['cobble']),
  water: new Set(['water'])
}

export interface Rect { x: number, y: number, w: number, h: number }
export const PLAZA: Rect = { x: 17, y: 11, w: 15, h: 9 }        // sand ring
export const PLAZA_COBBLE: Rect = { x: 19, y: 12, w: 11, h: 7 }
export const POND: Rect = { x: 37, y: 28, w: 10, h: 7 }
export const FARM: Rect = { x: 3, y: 12, w: 9, h: 7 }
export const HOUSE_X = [5, 13, 21, 29]
export const ROAD_Y = 15      // the west gate road
export const SOUTH_ROAD_Y = 25

export const hash = (x: number, y: number): number => { let h = (x * 374761393 + y * 668265263) >>> 0; h = (h ^ (h >>> 13)) * 1274126177; return (h >>> 0) % 1000 }

export function buildTerrain (): Terrain[][] {
  const g: Terrain[][] = Array.from({ length: MAP_H }, () => Array.from({ length: MAP_W }, () => 'grass' as Terrain))
  const fill = (r: Rect, t: Terrain): void => { for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) if (g[y]?.[x] !== undefined) g[y]![x] = t }
  const hline = (x0: number, x1: number, y: number, t: Terrain, thick = 2): void => fill({ x: Math.min(x0, x1), y, w: Math.abs(x1 - x0) + 1, h: thick }, t)
  const vline = (x: number, y0: number, y1: number, t: Terrain, thick = 2): void => fill({ x, y: Math.min(y0, y1), w: thick, h: Math.abs(y1 - y0) + 1 }, t)
  // roads first, the plaza and pond paint over them
  hline(0, 18, ROAD_Y, 'dirt')                 // gate → plaza
  vline(10, 9, ROAD_Y, 'dirt')                 // coop hall door → gate road
  vline(34, 9, 11, 'dirt')                     // workshop door → plaza
  vline(23, 20, SOUTH_ROAD_Y, 'dirt')          // plaza → south road
  hline(4, 43, SOUTH_ROAD_Y, 'dirt')           // the houses' road
  vline(42, 16, SOUTH_ROAD_Y, 'dirt')          // east branch to the windmill
  for (const x of HOUSE_X) vline(x + 2, SOUTH_ROAD_Y + 2, SOUTH_ROAD_Y + 3, 'dirt', 2) // doorsteps
  vline(38, SOUTH_ROAD_Y - 6, SOUTH_ROAD_Y, 'dirt')   // harbor office
  fill(PLAZA, 'sand')
  fill(PLAZA_COBBLE, 'cobble')
  // the pond: a rounded blob, no 1-tile necks (Kenmi's water edges are whole tiles)
  fill(POND, 'water')
  for (const [x, y] of [[POND.x, POND.y], [POND.x + POND.w - 1, POND.y], [POND.x, POND.y + POND.h - 1], [POND.x + POND.w - 1, POND.y + POND.h - 1]]) g[y!]![x!] = 'grass'
  return g
}

export const TERRAIN = buildTerrain()

/** 0-based blob tile index for a non-grass cell, from its neighbourhood. */
export function tileIndexAt (grid: Terrain[][], x: number, y: number): number {
  const t = grid[y]![x]!
  return blobIndex(maskAt(x, y, (nx, ny) => { const n = grid[ny]?.[nx]; return n === undefined ? undefined : SAME[t].has(n) }))
}

export const isWalkable = (grid: Terrain[][], tx: number, ty: number): boolean => { const t = grid[ty]?.[tx]; return t !== undefined && t !== 'water' }


