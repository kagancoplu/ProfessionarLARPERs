/**
 * Ground layer of the Town (track-E §5.2): 60×34 tiles. Grass everywhere (two variants, deterministic),
 * a dirt square in the middle, a road from the gate (west edge) to the square and on to the workshop.
 * Tile ids: 1 grass A, 2 grass B, 3 dirt, 4 road (public/game/ground.png, tools/sprites.mjs).
 */
export const MAP_W = 60
export const MAP_H = 34
export const TILE_GRASS_A = 1
export const TILE_GRASS_B = 2
export const TILE_DIRT = 3
export const TILE_ROAD = 4

export const SQUARE = { x0: 22, y0: 12, x1: 38, y1: 22 }
export const ROAD_Y = 16

const hash = (x: number, y: number): number => { let h = (x * 374761393 + y * 668265263) >>> 0; h = (h ^ (h >>> 13)) * 1274126177; return (h >>> 0) % 100 }

export function buildGround (): number[][] {
  const rows: number[][] = []
  for (let y = 0; y < MAP_H; y++) {
    const row: number[] = []
    for (let x = 0; x < MAP_W; x++) {
      let id = hash(x, y) < 18 ? TILE_GRASS_B : TILE_GRASS_A
      if (x >= SQUARE.x0 && x <= SQUARE.x1 && y >= SQUARE.y0 && y <= SQUARE.y1) id = TILE_DIRT
      if ((y === ROAD_Y || y === ROAD_Y + 1) && (x < SQUARE.x0 || x > SQUARE.x1)) id = TILE_ROAD
      row.push(id)
    }
    rows.push(row)
  }
  return rows
}

export const isWalkable = (ground: number[][], tx: number, ty: number): boolean => {
  const id = ground[ty]?.[tx]
  return id !== undefined
}

/** Pixel centre of a tile (16 px tiles, unscaled world units). */
export const tileCentre = (tx: number, ty: number): { x: number, y: number } => ({ x: tx * 16 + 8, y: ty * 16 + 8 })
