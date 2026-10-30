/**
 * 47-tile blob autotiling (shared with tools/packs/terrain.mjs, which lays the tiles out in this order,
 * 8 per row). A cell's mask names which of its 8 neighbours are the same terrain; corner bits only count
 * when both adjacent edges are set.
 */
export const N = 1, NE = 2, E = 4, SE = 8, S = 16, SW = 32, W = 64, NW = 128

export function canonical (m: number): number {
  let c = m & (N | E | S | W)
  if ((m & NE) !== 0 && (m & N) !== 0 && (m & E) !== 0) c |= NE
  if ((m & SE) !== 0 && (m & S) !== 0 && (m & E) !== 0) c |= SE
  if ((m & SW) !== 0 && (m & S) !== 0 && (m & W) !== 0) c |= SW
  if ((m & NW) !== 0 && (m & N) !== 0 && (m & W) !== 0) c |= NW
  return c
}

export const MASKS: readonly number[] = [...new Set(Array.from({ length: 256 }, (_, i) => canonical(i)))].sort((a, b) => a - b)
const INDEX = new Map(MASKS.map((m, i) => [m, i]))

/** Tile index (0..46) inside a blob tileset for a neighbourhood mask. */
export const blobIndex = (mask: number): number => INDEX.get(canonical(mask)) ?? 46

const OFFSETS: ReadonlyArray<readonly [number, number, number]> = [[0, -1, N], [1, -1, NE], [1, 0, E], [1, 1, SE], [0, 1, S], [-1, 1, SW], [-1, 0, W], [-1, -1, NW]]

/** Neighbourhood mask of (x, y); `same(nx, ny)` says whether a neighbour counts as the same terrain (out of bounds counts as same). */
export function maskAt (x: number, y: number, same: (nx: number, ny: number) => boolean | undefined): number {
  let m = 0
  for (const [dx, dy, bit] of OFFSETS) { const s = same(x + dx, y + dy); if (s === undefined || s) m |= bit }
  return canonical(m)
}
