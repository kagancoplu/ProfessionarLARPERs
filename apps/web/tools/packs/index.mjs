#!/usr/bin/env node
/**
 * Pack pipeline (E-V1): assets/packs/Cute_Fantasy (raw, gitignored) → public/game/ (committed atlases).
 *   terrain/  blob tilesets composed from Kenmi's autotile blocks, grass fills, decor/fence tilesets
 *   town.png/json   buildings, props, trees (trimmed atlas)
 *   chars.png/json  premade NPCs + modular villagers, 6 anims × 6 frames
 * Run: npm -w apps/web run packs
 */
import { resolve } from 'node:path'
import { buildTerrain } from './terrain.mjs'
import { buildAtlas } from './atlas.mjs'
import { buildChars } from './chars.mjs'

const out = resolve(process.cwd(), 'public/game')
const terrain = await buildTerrain(resolve(out, 'terrain'))
const atlas = await buildAtlas(out)
const chars = await buildChars(out)
console.log(`packs: terrain ${terrain.join(', ')} · atlas ${atlas.frames} frames → ${atlas.files.join(', ')} · chars ${chars.chars} characters, ${chars.frames} frames → ${chars.files.join(', ')}`)
