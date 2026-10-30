/**
 * Terrain blob tilesets from Kenmi's 3×3 + 2×2 autotile blocks (RPG-Maker A2 layout): every one of the
 * 47 edge/corner combinations is composed from 8×8 quadrants, optionally over a fill tile, into an
 * opaque 16×16 tile. Output: public/game/terrain/<name>.png (8 columns) + the mask→index table used by
 * src/town/map/autotile.ts and by the Tiled export (wang set).
 */
import { resolve } from 'node:path'
import { mkdir, writeFile } from 'node:fs/promises'
import { KENMI, blank, blit, loadRaw, savePng } from './lib.mjs'

const T = 16, Q = 8
export const N = 1, NE = 2, E = 4, SE = 8, S = 16, SW = 32, W = 64, NW = 128

/** Drop corner bits whose two adjacent edges are not both set (they do not change the tile). */
export function canonical (m) {
  let c = m & (N | E | S | W)
  if ((m & NE) && (m & N) && (m & E)) c |= NE
  if ((m & SE) && (m & S) && (m & E)) c |= SE
  if ((m & SW) && (m & S) && (m & W)) c |= SW
  if ((m & NW) && (m & N) && (m & W)) c |= NW
  return c
}
export const MASKS = [...new Set(Array.from({ length: 256 }, (_, i) => canonical(i)))].sort((a, b) => a - b) // 47
export const INDEX_OF = Object.fromEntries(MASKS.map((m, i) => [m, i]))

/**
 * One quadrant of the composed tile. `block` = top-left tile coords of the 3×3, `inner` = top-left of the 2×2.
 * q: 0 TL, 1 TR, 2 BL, 3 BR. Returns [tileX, tileY] in the source sheet.
 */
function source (mask, q, block, inner) {
  const [bx, by] = block; const [ix, iy] = inner
  const vert = q < 2 ? N : S, horiz = (q === 0 || q === 2) ? W : E
  const diag = q === 0 ? NW : q === 1 ? NE : q === 2 ? SW : SE
  const hasV = (mask & vert) !== 0, hasH = (mask & horiz) !== 0, hasD = (mask & diag) !== 0
  const col = q === 0 || q === 2 ? 0 : 2, row = q < 2 ? 0 : 2
  if (hasV && hasH) {
    if (hasD) return [bx + 1, by + 1]
    // inner corner: the diagonally opposite tile of the 2×2 block
    return [ix + (col === 0 ? 1 : 0), iy + (row === 0 ? 1 : 0)]
  }
  if (!hasV && hasH) return [bx + 1, by + row]
  if (hasV && !hasH) return [bx + col, by + 1]
  return [bx + col, by + row]
}

/** Compose the 47 tiles of one terrain. fill: 16×16 image drawn under each tile (or null). */
/** Masks that are exactly one of the 13 source tiles (whole-tile copy keeps the artist's edge detail, e.g. water foam). */
function wholeTile (mask, block, inner) {
  const ALL = 255
  const [bx, by] = block; const [ix, iy] = inner
  const table = [
    [ALL & ~(N | NE | NW) & ~(W | SW), [bx, by]], [ALL & ~(N | NE | NW), [bx + 1, by]], [ALL & ~(N | NE | NW) & ~(E | SE), [bx + 2, by]],
    [ALL & ~(W | NW | SW), [bx, by + 1]], [ALL, [bx + 1, by + 1]], [ALL & ~(E | NE | SE), [bx + 2, by + 1]],
    [ALL & ~(S | SE | SW) & ~(W | NW), [bx, by + 2]], [ALL & ~(S | SE | SW), [bx + 1, by + 2]], [ALL & ~(S | SE | SW) & ~(E | NE), [bx + 2, by + 2]],
    [ALL & ~SE, [ix, iy]], [ALL & ~SW, [ix + 1, iy]], [ALL & ~NE, [ix, iy + 1]], [ALL & ~NW, [ix + 1, iy + 1]]
  ]
  const hit = table.find(([m]) => canonical(m) === mask)
  return hit === undefined ? null : hit[1]
}

export function composeBlob (sheet, block, inner, fill) {
  const out = blank(8 * T, 6 * T)
  MASKS.forEach((mask, i) => {
    const dx = (i % 8) * T, dy = Math.floor(i / 8) * T
    if (fill !== null) blit(out, fill, 0, 0, T, T, dx, dy)
    const whole = wholeTile(mask, block, inner)
    if (whole !== null) { blit(out, sheet, whole[0] * T, whole[1] * T, T, T, dx, dy); return }
    for (let q = 0; q < 4; q++) {
      const [tx, ty] = source(mask, q, block, inner)
      const qx = (q === 1 || q === 3) ? Q : 0, qy = q >= 2 ? Q : 0
      blit(out, sheet, tx * T + qx, ty * T + qy, Q, Q, dx + qx, dy + qy)
    }
  })
  return out
}

const G = (p) => resolve(KENMI, p)

/** Terrain definitions: which Kenmi sheet, where the 3×3 and 2×2 blocks are, what fills the inside. */
export const TERRAINS = [
  { name: 'dirt', sheet: 'Tiles/Grass/Grass_Tiles_1.png', block: [3, 0], inner: [3, 3], fill: 'Tiles/Grass/Path_Middle.png' },
  { name: 'sand', sheet: 'Tiles/Grass/Grass_Tiles_1.png', block: [0, 5], inner: [0, 8], fill: null },
  { name: 'stone', sheet: 'Tiles/Grass/Grass_Tiles_1.png', block: [3, 5], inner: [3, 8], fill: 'Tiles/Cobble_Road/Cobble_Road_1.png', fillAt: [1, 1] },
  { name: 'cobble', sheet: 'Tiles/Cobble_Road/Cobble_Road_1.png', block: [0, 0], inner: [0, 3], fill: null },
  { name: 'water', sheet: 'Tiles/Water/Water_Tile_1.png', block: [0, 0], inner: [0, 3], fill: null, anim: { sheet: 'Tiles/Water/Water_Tile_1_Anim.png', frames: 8, frameW: 48 } }
]

export async function buildTerrain (outDir) {
  await mkdir(outDir, { recursive: true })
  const made = []
  for (const t of TERRAINS) {
    const sheet = await loadRaw(G(t.sheet))
    let fill = null
    if (t.fill !== null) {
      const f = await loadRaw(G(t.fill))
      const [fx, fy] = t.fillAt ?? [0, 0]
      fill = blank(T, T); blit(fill, f, fx * T, fy * T, T, T, 0, 0)
    }
    await savePng(composeBlob(sheet, t.block, t.inner, fill), resolve(outDir, `${t.name}.png`))
    made.push(t.name)
    if (t.anim !== undefined) {
      const anim = await loadRaw(G(t.anim.sheet))
      for (let f = 0; f < t.anim.frames; f++) {
        const frame = blank(t.anim.frameW, anim.h); blit(frame, anim, f * t.anim.frameW, 0, t.anim.frameW, anim.h, 0, 0)
        await savePng(composeBlob(frame, t.block, t.inner, fill), resolve(outDir, `${t.name}_${f}.png`))
      }
    }
  }
  // grass fills: 4 shades, 4 columns
  const grass = blank(4 * T, T)
  for (let i = 0; i < 4; i++) blit(grass, await loadRaw(G(`Tiles/Grass/Grass_${i + 1}_Middle.png`)), 0, 0, T, T, i * T, 0)
  await savePng(grass, resolve(outDir, 'grass.png'))
  await writeFile(resolve(outDir, 'masks.json'), JSON.stringify({ masks: MASKS, columns: 8 }))
  return made
}
