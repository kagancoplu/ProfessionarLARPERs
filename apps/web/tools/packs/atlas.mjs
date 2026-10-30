/** Props and buildings → public/game/town.png + town.json (Phaser 3 atlas, trimmed frames). Tilesets copied as-is. */
import { resolve } from 'node:path'
import { copyFile, mkdir, writeFile } from 'node:fs/promises'
import { packAsync } from 'free-tex-packer-core'
import { KENMI, crop, loadRaw, toPng } from './lib.mjs'
import { SPRITES, TILESETS } from './manifest.mjs'

export async function buildAtlas (outDir) {
  await mkdir(resolve(outDir, 'terrain'), { recursive: true })
  const images = []
  const cache = new Map()
  const load = async (f) => { if (!cache.has(f)) cache.set(f, await loadRaw(resolve(KENMI, f))); return cache.get(f) }
  for (const s of SPRITES) {
    const img = await load(s.file)
    const [x, y, w, h] = s.rect ?? [0, 0, img.w, img.h]
    const count = s.frames?.count ?? 1
    for (let i = 0; i < count; i++) {
      const cols = s.frames?.cols ?? count
      const fx = x + (i % cols) * (s.frames?.dx ?? 0), fy = y + Math.floor(i / cols) * (s.frames?.dy ?? 0)
      images.push({ path: `${s.name}_${i}.png`, contents: await toPng(crop(img, fx, fy, w, h)) })
    }
  }
  const files = await packAsync(images, {
    textureName: 'town', width: 2048, height: 2048, fixedSize: false, padding: 2, allowRotation: false,
    allowTrim: true, trimMode: 'trim', detectIdentical: true, exporter: 'Phaser3', removeFileExtension: true, prependFolderName: false
  })
  // JSON minified (the packer pretty-prints): Phaser reads it the same, the download is ~3× smaller
  for (const f of files) await writeFile(resolve(outDir, f.name), f.name.endsWith('.json') ? JSON.stringify(JSON.parse(f.buffer.toString())) : f.buffer)
  for (const t of TILESETS) await copyFile(resolve(KENMI, t.file), resolve(outDir, 'terrain', `${t.name}.png`))
  return { frames: images.length, files: files.map(f => f.name) }
}
