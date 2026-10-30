#!/usr/bin/env node
/**
 * Palette alignment for CC0 raster packs (track-E §6.2 step 2, Kenney Tiny Town):
 *   node tools/px.mjs <in.png> <out.png> [--palette day|night] [--scale N]
 * Every opaque pixel is snapped to the nearest palette colour (RGB distance); optional
 * nearest-neighbour integer downscale (e.g. 32→16) with --scale 2. Transparent pixels stay.
 *   node tools/px.mjs --extract <in.png>   prints the most used colours (to grow the palette)
 */
import { resolve, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import sharp from 'sharp'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const { PALETTE } = await import(pathToFileURL(resolve(root, 'assets/palette.ts')).href)
const args = process.argv.slice(2)
const flag = (name, dflt) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : dflt }
const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]

if (args[0] === '--extract') {
  const { data, info } = await sharp(args[1]).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const counts = new Map()
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 128) continue
    const key = '#' + [data[i], data[i + 1], data[i + 2]].map(v => v.toString(16).padStart(2, '0')).join('')
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  for (const [k, n] of [...counts].sort((a, b) => b[1] - a[1]).slice(0, 48)) console.log(k, n)
  console.log(`${counts.size} colours in ${info.width}×${info.height}`)
  process.exit(0)
}

const [input, output] = args.filter(a => !a.startsWith('--') && a !== flag('--palette') && a !== flag('--scale'))
if (!input || !output) { console.error('usage: px.mjs <in.png> <out.png> [--palette day|night] [--scale N] | --extract <in.png>'); process.exit(1) }
const which = flag('--palette', 'day')
const scale = Number(flag('--scale', '1'))
const palette = Object.values(PALETTE).map(p => hex(p[which]))

let img = sharp(input).ensureAlpha()
const meta = await img.metadata()
if (scale > 1) img = img.resize(Math.round(meta.width / scale), Math.round(meta.height / scale), { kernel: 'nearest' })
const { data, info } = await img.raw().toBuffer({ resolveWithObject: true })
for (let i = 0; i < data.length; i += 4) {
  if (data[i + 3] < 128) { data[i + 3] = 0; continue }
  data[i + 3] = 255
  let best = 0; let bestD = Infinity
  for (let p = 0; p < palette.length; p++) {
    const [r, g, b] = palette[p]
    const d = (r - data[i]) ** 2 + (g - data[i + 1]) ** 2 + (b - data[i + 2]) ** 2
    if (d < bestD) { bestD = d; best = p }
  }
  ;[data[i], data[i + 1], data[i + 2]] = palette[best]
}
await sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } }).png().toFile(output)
console.log(`px: ${input} → ${output} (${info.width}×${info.height}, palette ${which})`)
