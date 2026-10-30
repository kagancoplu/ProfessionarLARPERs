/** Characters: premade NPCs + modular villagers → public/game/chars.png + chars.json. 6 anims × 6 frames each. */
import { resolve } from 'node:path'
import { mkdir, writeFile } from 'node:fs/promises'
import { packAsync } from 'free-tex-packer-core'
import { KENMI, blank, blit, crop, loadRaw, toPng } from './lib.mjs'
import { NPCS, VILLAGERS } from './manifest.mjs'

export const CELL = 64
export const ANIMS = ['idle_down', 'idle_side', 'idle_up', 'walk_down', 'walk_side', 'walk_up']
export const FRAMES = 6

export async function buildChars (outDir) {
  await mkdir(outDir, { recursive: true })
  const images = []
  const cache = new Map()
  const load = async (f) => { if (!cache.has(f)) cache.set(f, await loadRaw(resolve(KENMI, f))); return cache.get(f) }
  const push = async (name, sheet) => {
    for (const [row, anim] of ANIMS.entries()) for (let i = 0; i < FRAMES; i++) {
      images.push({ path: `${name}_${anim}_${i}.png`, contents: await toPng(crop(sheet, i * CELL, row * CELL, CELL, CELL)) })
    }
  }
  for (const n of NPCS) await push(n.name, await load(n.file))
  for (const v of VILLAGERS) {
    const sheet = blank(CELL * FRAMES, CELL * ANIMS.length)
    for (const layer of v.layers) { const l = await load(layer); blit(sheet, l, 0, 0, sheet.w, sheet.h, 0, 0) }
    await push(v.name, sheet)
  }
  const files = await packAsync(images, {
    textureName: 'chars', width: 2048, height: 2048, fixedSize: false, padding: 2, allowRotation: false,
    allowTrim: true, trimMode: 'trim', detectIdentical: true, exporter: 'Phaser3', removeFileExtension: true, prependFolderName: false
  })
  for (const f of files) await writeFile(resolve(outDir, f.name), f.buffer)
  return { chars: NPCS.length + VILLAGERS.length, frames: images.length, files: files.map(f => f.name) }
}
