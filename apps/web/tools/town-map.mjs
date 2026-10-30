#!/usr/bin/env node
/**
 * Tiled map export (E-V1): src/town/map/{terrain,places}.ts → public/game/map.json. Phaser loads it
 * (tilemapTiledJSON) and Tiled opens it (tilesets point at public/game/terrain/*.png). Run with tsx:
 *   npm -w apps/web run map
 */
import { writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import sharp from 'sharp'
import { MAP_H, MAP_W, TERRAIN, FARM, PLAZA, POND, tileIndexAt, hash } from '../src/town/map/terrain.ts'
import { PLACES, TREES, POINTS, SOIL, DECOR_TUFTS, FLOWER_IDS, PATH_DECOR, WATER_DECOR } from '../src/town/map/places.ts'

const root = resolve(process.cwd())
const terrainDir = resolve(root, 'public/game/terrain')
const TILESETS = ['grass', 'dirt', 'sand', 'cobble', 'water', 'decor', 'flowers', 'fence', 'path_decor', 'water_decor', 'farmland']

let gid = 1
const sets = []
const first = {}
for (const name of TILESETS) {
  const m = await sharp(resolve(terrainDir, `${name}.png`)).metadata()
  const columns = m.width / 16, rows = m.height / 16
  first[name] = gid
  sets.push({ firstgid: gid, name, tilewidth: 16, tileheight: 16, tilecount: columns * rows, columns, image: `terrain/${name}.png`, imagewidth: m.width, imageheight: m.height, margin: 0, spacing: 0 })
  gid += columns * rows
}

const ground = []
const decor = []
const inRect = (r, x, y) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h
const BIG = new Set(['house', 'coop', 'workshop', 'fisherman', 'windmill', 'stall', 'board', 'fountain', 'well'])
const nearPlace = (x, y) => PLACES.some(p => { const px = p.x / 16, py = p.y / 16; const big = BIG.has(p.kind); return x >= px - (big ? 3.5 : 1) && x <= px + (big ? 3.5 : 1) && y <= py && y >= py - (big ? 8 : 2) })
for (let y = 0; y < MAP_H; y++) for (let x = 0; x < MAP_W; x++) {
  const t = TERRAIN[y][x]
  const h = hash(x, y)
  if (t === 'grass') ground.push(first.grass) // one grass shade; variety comes from the decor layer (Kenmi's other shades are different biomes)
  else ground.push(first[t] + tileIndexAt(TERRAIN, x, y))
  // decoration: flowers and tufts on open grass, blotches on dirt, lilies on water
  let d = 0
  if (t === 'grass' && !nearPlace(x, y) && !inRect(FARM, x, y)) {
    const r = hash(x * 3 + 1, y * 5 + 2)
    if (r < 150) d = first.decor + DECOR_TUFTS[r % DECOR_TUFTS.length]
    else if (r < 230) d = first.flowers + FLOWER_IDS[r % FLOWER_IDS.length]
  } else if (t === 'dirt' && hash(x + 9, y + 7) < 70) d = first.path_decor + (hash(x, y + 1) % PATH_DECOR)
  else if (t === 'water' && hash(x + 2, y + 2) < 120 && tileIndexAt(TERRAIN, x, y) === 46) d = first.water_decor + (hash(x, y + 3) % WATER_DECOR)
  decor.push(d)
}
// soil patches (farmland tileset: 4×5 block at columns 0-3, rows 0-4)
for (const s of SOIL) for (let ty = 0; ty < 5; ty++) for (let tx = 0; tx < 4; tx++) decor[(s.y + ty) * MAP_W + s.x + tx] = first.farmland + ty * 7 + tx
// farm fence: rectangle with a gap on the east side (toward the gate road)
const F = first.fence
const fence = (x, y, id) => { if (x >= 0 && x < MAP_W && y >= 0 && y < MAP_H) decor[y * MAP_W + x] = F + id }
for (let x = FARM.x; x < FARM.x + FARM.w; x++) { fence(x, FARM.y - 1, 2); fence(x, FARM.y + FARM.h, 2) }
for (let y = FARM.y; y < FARM.y + FARM.h; y++) { fence(FARM.x - 1, y, 4); if (y < FARM.y + 2 || y > FARM.y + 4) fence(FARM.x + FARM.w, y, 4) }
fence(FARM.x - 1, FARM.y - 1, 5); fence(FARM.x + FARM.w, FARM.y - 1, 7); fence(FARM.x - 1, FARM.y + FARM.h, 13); fence(FARM.x + FARM.w, FARM.y + FARM.h, 15)
fence(FARM.x + FARM.w, FARM.y + 1, 8); fence(FARM.x + FARM.w, FARM.y + 5, 0)

const objects = [...PLACES, ...TREES].map((p, i) => ({ id: i + 1, name: p.name ?? p.kind, type: p.kind, x: p.x, y: p.y, point: true, properties: [{ name: 'frame', type: 'string', value: p.frame }, ...(p.slot !== undefined ? [{ name: 'slot', type: 'int', value: p.slot }] : [])] }))
const points = Object.values(POINTS).map((p, i) => ({ id: 1000 + i, name: p.name, type: 'point', x: p.x, y: p.y, point: true }))

const map = {
  type: 'map', version: '1.10', tiledversion: '1.12.2', orientation: 'orthogonal', renderorder: 'right-down', infinite: false,
  width: MAP_W, height: MAP_H, tilewidth: 16, tileheight: 16, nextlayerid: 5, nextobjectid: 2000, tilesets: sets,
  layers: [
    { id: 1, name: 'ground', type: 'tilelayer', width: MAP_W, height: MAP_H, x: 0, y: 0, opacity: 1, visible: true, data: ground },
    { id: 2, name: 'decor', type: 'tilelayer', width: MAP_W, height: MAP_H, x: 0, y: 0, opacity: 1, visible: true, data: decor },
    { id: 3, name: 'places', type: 'objectgroup', draworder: 'topdown', x: 0, y: 0, opacity: 1, visible: true, objects },
    { id: 4, name: 'points', type: 'objectgroup', draworder: 'topdown', x: 0, y: 0, opacity: 1, visible: true, objects: points }
  ],
  properties: [{ name: 'generated', type: 'string', value: 'tools/town-map.mjs — edit src/town/map/*.ts, not this file' }]
}
await writeFile(resolve(root, 'public/game/map.json'), JSON.stringify(map))
console.log(`map: ${MAP_W}×${MAP_H}, ${sets.length} tilesets, ${objects.length} places, decor ${decor.filter(d => d !== 0).length}`)
