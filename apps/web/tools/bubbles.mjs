#!/usr/bin/env node
/**
 * Speech and thought bubbles for film mode (src/film): 9-slice bodies with rounded corners and their tails,
 * in the town labels' palette (outline, cream edge, parchment body). World pixels, like label.png.
 * Run: node tools/bubbles.mjs  →  public/ui/bubble.png, bubble-tail.png, bubble-thought.png, bubble-thought-tail.png
 */
import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { blank, savePng } from './packs/lib.mjs'

const out = resolve(process.cwd(), 'public/ui')
await mkdir(out, { recursive: true })
const PAL = { O: [0x3f, 0x28, 0x32], c: [0xf9, 0xe6, 0xcf], p: [0xfb, 0xf3, 0xdf] }
function draw (rows) {
  const h = rows.length, w = rows[0].length
  const img = blank(w, h)
  rows.forEach((row, y) => {
    if (row.length !== w) throw new Error(`row ${y} has ${row.length} columns, expected ${w}`)
    for (let x = 0; x < w; x++) {
      if (row[x] === '.') continue
      const [r, g, b] = PAL[row[x]]; const i = (y * w + x) * 4
      img.data[i] = r; img.data[i + 1] = g; img.data[i + 2] = b; img.data[i + 3] = 255
    }
  })
  return img
}
const body = 'OcpppppcO'
// speech: corners cut by one pixel, slice 3
await savePng(draw(['.OOOOOOO.', 'OcccccccO', body, body, body, body, body, 'OcccccccO', '.OOOOOOO.']), resolve(out, 'bubble.png'))
// the tail starts on the body's cream row and closes its outline (CSS: top = 100% + 1px, centred)
await savePng(draw(['cpppc', 'OpppO', '.OpO.', '..O..']), resolve(out, 'bubble-tail.png'))
// thought: rounder corners, and two puffs trailing down-left instead of a tail
await savePng(draw(['..OOOOO..', '.OcccccO.', body, body, body, body, body, '.OcccccO.', '..OOOOO..']), resolve(out, 'bubble-thought.png'))
await savePng(draw(['....OO..', '...OppO.', '...OppO.', '....OO..', '........', '.O......', 'OpO.....', '.O......']), resolve(out, 'bubble-thought-tail.png'))
console.log('bubbles: 4 PNGs → public/ui')
