/**
 * Everything that stands on the ground (E-V1), in tile units: buildings, props, trees, and the points the
 * stories use. Frames name public/game/town.json (Kenmi Cute Fantasy via tools/packs). `x, y` is the
 * bottom-centre tile corner (the sprite's origin is 0.5, 1), so y-sorting is a one-liner.
 */
import { HOUSE_X, MAP_H, MAP_W, PLAZA, PLAZA_COBBLE, POND, FARM, ROAD_Y, SOUTH_ROAD_Y, TERRAIN, TILE, hash } from './terrain'

export { HOUSE_X }

export type PlaceKind = 'house' | 'coop' | 'workshop' | 'stall' | 'board' | 'fountain' | 'well' | 'lantern' | 'bench' | 'barrel' | 'tree' | 'prop' | 'windmill' | 'fisherman' | 'sign' | 'bunting' | 'scarecrow' | 'hay' | 'boat' | 'crop'
export interface Place { kind: PlaceKind, frame: string, x: number, y: number, slot?: number, anim?: { frames: number, fps: number }, name?: string, door?: { dx: number, dy: number } }
export interface Point { name: string, x: number, y: number }

const px = (tx: number, ty: number): { x: number, y: number } => ({ x: tx * TILE, y: ty * TILE })

/** Houses for agents, slots 1..5 along the south road (door at the bottom-centre, 1 tile below). */
const HOUSE_FRAMES = ['house_wood1_red', 'house_stone2_blue', 'house_wood3_black', 'house_wood4_blue']

export const PLACES: Place[] = [
  // the hall of the cooperative (vaults, the guard) and the provider's workshop
  { kind: 'coop', frame: 'coop_red_0', name: 'Coop hall', ...px(11.5, 9), door: { dx: 0, dy: 1 } },
  { kind: 'workshop', frame: 'blacksmith_red_0', name: 'Workshop', ...px(35, 9), door: { dx: -2, dy: 1 } },
  ...HOUSE_X.map((tx, i) => ({ kind: 'house' as const, frame: `${HOUSE_FRAMES[i]}_0`, slot: i + 1, ...px(tx + 3, SOUTH_ROAD_Y + 2 + 7), door: { dx: 0, dy: 1 } })),
  { kind: 'fisherman', frame: 'fisherman_blue_0', name: 'Harbor office', ...px(39, SOUTH_ROAD_Y - 6), door: { dx: 0, dy: 1 } },
  { kind: 'windmill', frame: 'windmill_0', name: 'Mill', ...px(42, 13) },
  { kind: 'prop', frame: 'silo_0', ...px(46.5, 12) },
  // the square: notice board, fountain, market stalls, lanterns, benches, bunting
  { kind: 'board', frame: 'sign_post_0', name: 'Notice board', ...px(24.5, PLAZA.y + 1) },
  { kind: 'fountain', frame: 'fountain_0', anim: { frames: 8, fps: 8 }, ...px(24.5, PLAZA.y + 6) },
  { kind: 'stall', frame: 'stall_0', slot: 1, ...px(19.5, 24) }, { kind: 'stall', frame: 'stall_1', slot: 2, ...px(23.5, 24) },
  { kind: 'stall', frame: 'stall_2', slot: 3, ...px(27.5, 24) }, { kind: 'stall', frame: 'stall_3', slot: 4, ...px(31.5, 24) },
  { kind: 'well', frame: 'well_0', ...px(15, 13) },
  ...[[PLAZA.x + 1, PLAZA.y + 1], [PLAZA.x + PLAZA.w - 1, PLAZA.y + 1], [PLAZA.x + 1, PLAZA.y + PLAZA.h - 1], [PLAZA.x + PLAZA.w - 1, PLAZA.y + PLAZA.h - 1]].map(([tx, ty]) => ({ kind: 'lantern' as const, frame: 'lantern_0', anim: { frames: 6, fps: 6 }, ...px(tx! + 0.5, ty!) })),
  { kind: 'bench', frame: 'bench_wood_0', ...px(21, PLAZA.y + 8.5) }, { kind: 'bench', frame: 'bench_wood_0', ...px(28, PLAZA.y + 8.5) },
  { kind: 'bench', frame: 'bench_stone_0', ...px(PLAZA.x + 1.5, PLAZA.y + 5) },
  { kind: 'barrel', frame: 'barrel_0', ...px(33.5, 22) }, { kind: 'barrel', frame: 'barrel_flowers_1', ...px(17.5, 22) },
  { kind: 'bunting', frame: 'bunting_0', anim: { frames: 8, fps: 6 }, ...px(21, PLAZA.y) }, { kind: 'bunting', frame: 'bunting_0', anim: { frames: 8, fps: 6 }, ...px(28, PLAZA.y) },
  { kind: 'sign', frame: 'sign_0', ...px(2.5, ROAD_Y) },
  { kind: 'sign', frame: 'sign_2', ...px(36.5, SOUTH_ROAD_Y) },
  // farm
  { kind: 'scarecrow', frame: 'scarecrow_0', ...px(FARM.x + 4.5, FARM.y + 6.6) },
  { kind: 'hay', frame: 'hay_0', ...px(FARM.x + 0.5, FARM.y + 6.8) }, { kind: 'hay', frame: 'hay_1', ...px(FARM.x + 1.5, FARM.y + 6.8) },
  { kind: 'prop', frame: 'trough_0', ...px(FARM.x + 8, FARM.y + 6.8) },
  ...[0, 1, 2, 3].flatMap(i => [
    { kind: 'crop' as const, frame: 'wheat_0', ...px(FARM.x + 1.5 + i, FARM.y + 2.3) }, { kind: 'crop' as const, frame: 'tomato_0', ...px(FARM.x + 5.5 + i, FARM.y + 2.3) },
    { kind: 'crop' as const, frame: 'carrot_0', ...px(FARM.x + 1.5 + i, FARM.y + 4.3) }, { kind: 'crop' as const, frame: 'pumpkin_0', ...px(FARM.x + 5.5 + i, FARM.y + 4.3) }
  ]),
  { kind: 'boat', frame: 'boat_0', ...px(POND.x + 5, POND.y + 4.5) },
  { kind: 'prop', frame: 'stump_0', ...px(2, 23) }, { kind: 'prop', frame: 'campfire_0', anim: { frames: 8, fps: 8 }, ...px(34, 33) }
]

/** Trees: a deterministic ring at the borders plus a few inside, never on roads or buildings. */
const TREE_FRAMES = ['oak_big', 'oak_big', 'spruce_big', 'birch_big', 'oak_med', 'fruit_big']
export const TREES: Place[] = (() => {
  const out: Place[] = []
  const BIG = new Set<PlaceKind>(['house', 'coop', 'workshop', 'fisherman', 'windmill', 'stall', 'board', 'fountain'])
  const inRect = (r: { x: number, y: number, w: number, h: number }, tx: number, ty: number, pad: number): boolean => tx >= r.x - pad && tx < r.x + r.w + pad && ty >= r.y - pad && ty < r.y + r.h + pad
  const occupied = (tx: number, ty: number): boolean => PLACES.some(p => {
    const px = p.x / TILE, py = p.y / TILE
    const big = BIG.has(p.kind)
    return Math.abs(px - tx) < (big ? 6 : 2) && ty <= py + (big ? 3 : 1) && ty >= py - (big ? 9 : 3)
  }) || inRect(PLAZA, tx, ty, 1) || inRect(POND, tx, ty, 1) || inRect(FARM, tx, ty, 1) || (ty >= 20 && ty <= 24 && tx >= 16 && tx <= 34)
  for (let ty = 2; ty < MAP_H; ty += 1) for (let tx = 1; tx < MAP_W; tx += 1) {
    const edge = tx <= 3 || tx >= MAP_W - 4 || ty <= 2 || ty >= MAP_H - 3
    const h = hash(tx * 7, ty * 3)
    if (!(edge ? h < 520 : h < 75)) continue
    if (TERRAIN[ty]?.[tx] !== 'grass' || TERRAIN[ty - 1]?.[tx] !== 'grass' || TERRAIN[ty - 2]?.[tx] !== 'grass') continue
    if (occupied(tx, ty)) continue
    const gap = edge ? 2 : 3
    if (out.some(t => Math.abs(t.x / TILE - tx) < gap && Math.abs(t.y / TILE - ty) < gap)) continue
    out.push({ kind: 'tree', frame: `${TREE_FRAMES[(edge ? h : h * 3) % TREE_FRAMES.length]}_0`, ...px(tx + 0.5, ty + 1) })
  }
  return out
})()

/** Soil patches (farmland tileset block, 4×5 tiles) under the crops. */
export const SOIL: Array<{ x: number, y: number }> = [{ x: FARM.x + 1, y: FARM.y + 1 }, { x: FARM.x + 5, y: FARM.y + 1 }]

/** Wandering animals: `area` in tiles; ducks swim inside the pond. */
export interface AnimalSpawn { char: string, x: number, y: number, area: { x: number, y: number, w: number, h: number }, swim?: boolean }
export const ANIMALS: AnimalSpawn[] = [
  { char: 'chicken', x: FARM.x + 0.6, y: FARM.y + 1.5, area: { x: FARM.x, y: FARM.y, w: 1, h: 6 } },
  { char: 'chicken_b', x: FARM.x + 0.6, y: FARM.y + 4, area: { x: FARM.x, y: FARM.y, w: 1, h: 6 } },
  { char: 'chicken', x: FARM.x + 3, y: FARM.y + 6.5, area: { x: FARM.x + 2, y: FARM.y + 6, w: 6, h: 1 } },
  { char: 'sheep', x: 8, y: 23.5, area: { x: 5, y: 21, w: 8, h: 3 } },
  { char: 'cow', x: 15, y: 9, area: { x: 13, y: 7.5, w: 5, h: 2.5 } },
  { char: 'duck', x: POND.x + 2.5, y: POND.y + 2.5, area: { x: POND.x + 2, y: POND.y + 2, w: POND.w - 4, h: POND.h - 4 }, swim: true },
  { char: 'duck', x: POND.x + 6, y: POND.y + 4, area: { x: POND.x + 2, y: POND.y + 2, w: POND.w - 4, h: POND.h - 4 }, swim: true },
  { char: 'duck', x: POND.x + 4, y: POND.y + 5, area: { x: POND.x + 2, y: POND.y + 2, w: POND.w - 4, h: POND.h - 4 }, swim: true },
  { char: 'swan', x: POND.x + 7, y: POND.y + 3, area: { x: POND.x + 2, y: POND.y + 2, w: POND.w - 4, h: POND.h - 4 }, swim: true },
  { char: 'swan', x: POND.x + 3, y: POND.y + 2.5, area: { x: POND.x + 2, y: POND.y + 2, w: POND.w - 4, h: POND.h - 4 }, swim: true }
]

export const POINTS: Record<string, Point> = {
  'square-centre': { name: 'square-centre', x: (PLAZA_COBBLE.x + PLAZA_COBBLE.w / 2) * TILE, y: (PLAZA_COBBLE.y + PLAZA_COBBLE.h / 2 + 1.5) * TILE },
  'visitor-spawn': { name: 'visitor-spawn', x: 1.5 * TILE, y: (ROAD_Y + 1) * TILE },
  gate: { name: 'gate', x: 0, y: (ROAD_Y + 1) * TILE }
}

export const HOUSES = PLACES.filter(p => p.kind === 'house').sort((a, b) => (a.slot ?? 0) - (b.slot ?? 0))
export const BOARD = PLACES.find(p => p.kind === 'board')!
export const WORKSHOP = PLACES.find(p => p.kind === 'workshop')!
export const COOP = PLACES.find(p => p.kind === 'coop')!
export const STALLS = PLACES.filter(p => p.kind === 'stall').sort((a, b) => (a.slot ?? 0) - (b.slot ?? 0))
export const FOUNTAIN = PLACES.find(p => p.kind === 'fountain')!

/** Decor scatter on grass (tile ids into the decor / flowers tilesets), deterministic. */
export const DECOR_TUFTS = [18, 19, 20, 18, 19, 20, 9, 10, 11, 12, 13, 14, 0, 1, 2, 3, 4, 5, 15, 16]   // Outdoor_Decor rows 0-2: patches, tufts, mushrooms
export const FLOWER_IDS = [0, 1, 2, 3, 4, 10, 11, 12, 13, 14, 20, 21, 22, 23, 24, 40, 41, 42, 43, 44]   // Flowers sheet, left half: single flowers
export const PATH_DECOR = 3   // Path_Decoration tiles
export const WATER_DECOR = 3
