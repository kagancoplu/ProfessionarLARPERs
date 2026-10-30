#!/usr/bin/env node
/**
 * UI pixel assets (E-V1): public/ui/icons.png (16×16 strip: Kenmi icons + a few drawn in the same
 * outline style) with src/ui/icons.generated.ts, and the 9-slice frames used through CSS border-image
 * (public/ui/frame-*.png, btn-*.png, label*.png). Day/night variants where the parchment shows.
 * Run: npm -w apps/web run ui
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { KENMI, blank, blit, loadRaw, savePng } from './packs/lib.mjs'

const out = resolve(process.cwd(), 'public/ui')
await mkdir(out, { recursive: true })

/** Kenmi-style palette for drawn pieces (sampled from the pack: outline, cream, wood, gold, green, blue). */
const PAL = {
  K: '#000000', c: '#f9e6cf', O: '#3f2832',
  W: '#91533b', w: '#b86f50', d: '#743f39', D: '#602432',
  Y: '#fee761', y: '#feae34', o: '#dd5a08',
  P: '#f3e6c8', p: '#fbf3df', q: '#e7d6ae',
  N: '#222b35', n: '#2d3842', m: '#3a4855',
  B: '#0098dc', b: '#00cdf9', s: '#a2877c', S: '#7c6f6a',
  G: '#5ac54f', g: '#33984b', R: '#ac353d', r: '#80282e'
}
const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]
function draw (rows, map = {}) {
  const h = rows.length, w = rows[0].length
  const img = blank(w, h)
  rows.forEach((row, y) => {
    if (row.length !== w) throw new Error(`row ${y} has ${row.length} columns, expected ${w}: "${row}"`)
    for (let x = 0; x < w; x++) {
      const ch = map[row[x]] ?? row[x]
      if (ch === '.') continue
      const col = PAL[ch]; if (col === undefined) throw new Error(`unknown colour '${ch}'`)
      const [r, g, b] = hex(col); const i = (y * w + x) * 4
      img.data[i] = r; img.data[i + 1] = g; img.data[i + 2] = b; img.data[i + 3] = 255
    }
  })
  return img
}

// ---- drawn icons (16×16), Kenmi outline style: cream rim, black line
const DRAWN = {
  hourglass: [
    '................', '...cccccccccc...', '..cKKKKKKKKKKc..', '..cKwwwwwwwwKc..', '..cKKKKKKKKKKc..', '...cKYYYYYYKc...',
    '...cKyYYYYyKc...', '....cKyYYyKc....', '.....cKyyKc.....', '.....cKYyKc.....', '....cKY..YKc....', '...cKY....YKc...',
    '...cKYYYyYYKc...', '..cKKKKKKKKKKc..', '..cKwwwwwwwwKc..', '..cKKKKKKKKKKc..'],
  shield: [
    '................', '....cccccccc....', '...cKKKKKKKKc...', '..cKBBBBBBBBKc..', '..cKBbbBBBBBKc..', '..cKBbBBBBBBKc..',
    '..cKBBBBBBBBKc..', '..cKBBBBBBBBKc..', '..cKssBBBBssKc..', '...cKBBBBBBKc...', '...cKBBBBBBKc...', '....cKBBBBKc....',
    '.....cKBBKc.....', '......cKKc......', '.......cc.......', '................'],
  board: [
    '................', '..cccccccccccc..', '.cKKKKKKKKKKKKc.', '.cKwwwwwwwwwwKc.', '.cKwPPPPPPPPwKc.', '.cKwPKKPPKKPwKc.',
    '.cKwPPPPPPPPwKc.', '.cKwPKKKKKKPwKc.', '.cKwPPPPPPPPwKc.', '.cKwwwwwwwwwwKc.', '.cKKKKKKKKKKKKc.', '..ccccKddKcccc..',
    '......cKddKc....', '......cKddKc....', '......cKKKKc....', '.......cccc.....'],
  chest: [
    '................', '................', '...cccccccccc...', '..cKKKKKKKKKKc..', '..cKwwwYYwwwKc..', '..cKwwwYYwwwKc..',
    '..cKKKKKKKKKKc..', '..cKddddddddKc..', '..cKddKYYKddKc..', '..cKddKYYKddKc..', '..cKddddddddKc..', '..cKKKKKKKKKKc..',
    '...cccccccccc...', '................', '................', '................'],
  coin: [
    '................', '.....cccccc.....', '....cKKKKKKc....', '...cKYYYYYYKc...', '..cKYYyyyyYYKc..', '..cKYyYYYYyYKc..',
    '..cKYyYKKYyYKc..', '..cKYyYKYYyYKc..', '..cKYyYKKYyYKc..', '..cKYyYKYYyYKc..', '..cKYyYKKYyYKc..', '..cKYyYYYYyYKc..',
    '..cKYYoooo YYKc..'.replace(' ', ''), '...cKYYYYYYKc...', '....cKKKKKKc....', '.....cccccc.....'],
  sack: [
    '................', '......cccc......', '.....cKKKKc.....', '....cKwwwwKc....', '.....cKKKKc.....', '....cKWWWWKc....',
    '...cKWWwwWWKc...', '..cKWWwwwwWWKc..', '..cKWwwwwwwWKc..', '..cKWwwwwwwWKc..', '..cKWWwwwwWWKc..', '..cKWWWwwWWWKc..',
    '..cKWWWWWWWWKc..', '...cKKKKKKKKc...', '....cccccccc....', '................'],
  villager: [
    '................', '.....cccccc.....', '....cKKKKKKc....', '...cKWWWWWWKc...', '...cKWqqqqWKc...', '...cKWqKqKqWKc..'.slice(0, 16),
    '...cKqqqqqqKc...', '....cKqqqqKc....', '...cKKBBBBKKc...', '..cKqBBBBBBqKc..', '..cKqBBBBBBqKc..', '...cKBBBBBBKc...',
    '....cKDDDDKc....', '....cKD..DKc....', '....cKKccKKc....', '.....cc..cc.....']
}

// ---- Kenmi icons to pick (sheet, col, row)
const ICON_SHEETS = {
  res: 'Icons/Outline/Resources_Icons_Outline.png', other: 'Icons/Outline/Other_Icons_Outline.png',
  other2: 'Icons/Outline/Other_Icons_2_Outline.png', tool: 'Icons/Outline/Tool_Icons_Outline.png'
}
const KENMI_ICONS = {
  gold: ['res', 0, 2], ingot: ['res', 2, 2], credits: ['res', 2, 3], stone: ['res', 0, 0], iron: ['res', 2, 0],
  gem_red: ['res', 3, 2], gem_pink: ['res', 5, 3], wood: ['res', 0, 4], bone: ['res', 1, 4], acorn: ['res', 3, 5],
  flower: ['other', 0, 0], flower_blue: ['other', 4, 1], shell: ['other', 0, 2],
  sunflower: ['other2', 0, 0], honey: ['other2', 1, 0], egg: ['other2', 0, 4], strawberry: ['other2', 0, 3], potato: ['other2', 0, 2],
  axe: ['tool', 0, 0], pickaxe: ['tool', 1, 0], hoe: ['tool', 2, 0], can: ['tool', 3, 0], rod: ['tool', 4, 0]
}

const names = [...Object.keys(DRAWN), ...Object.keys(KENMI_ICONS)]
const strip = blank(16 * names.length, 16)
let i = 0
for (const [name, rows] of Object.entries(DRAWN)) { blit(strip, draw(rows), 0, 0, 16, 16, i * 16, 0); i++ }
const sheets = {}
for (const [name, [sheet, cx, cy]] of Object.entries(KENMI_ICONS)) {
  sheets[sheet] ??= await loadRaw(resolve(KENMI, ICON_SHEETS[sheet]))
  blit(strip, sheets[sheet], cx * 16, cy * 16, 16, 16, i * 16, 0); i++
}
await savePng(strip, resolve(out, 'icons.png'))
await writeFile(resolve(process.cwd(), 'src/ui/icons.generated.ts'), `// GENERATED by tools/ui.mjs — do not edit. 16×16 icons in public/ui/icons.png, left to right.
export const ICONS = ${JSON.stringify(Object.fromEntries(names.map((n, k) => [n, k])))} as const
export type IconName = keyof typeof ICONS
export const ICON_COUNT = ${names.length}
`)

// ---- 9-slice frames
const rep = (ch, n) => ch.repeat(n)
const mirror = (rows) => [...rows, ...[...rows].reverse().slice(1)]
// wood frame 24×24, slice 8: outer outline, highlight, planks with nails, inner outline; transparent centre
const woodTop = [
  rep('O', 24), 'O' + rep('w', 22) + 'O', 'Ow' + rep('W', 20) + 'wO', 'Ow' + 'WdW' + rep('W', 14) + 'WdW' + 'wO',
  'Ow' + rep('W', 20) + 'wO', 'Ow' + rep('W', 20) + 'wO', 'Ow' + rep('d', 20) + 'wO', 'OwWWWWW' + rep('O', 10) + 'WWWWWwO',
  'OwWWWWWO' + rep('.', 8) + 'OWWWWWwO', 'OwWWWWWO' + rep('.', 8) + 'OWWWWWwO', 'OwWdWWWO' + rep('.', 8) + 'OWWWdWwO', 'OwWWWWWO' + rep('.', 8) + 'OWWWWWwO'
]
await savePng(draw(mirror(woodTop)), resolve(out, 'frame-wood.png'))
// parchment panel 24×24, slice 8, filled centre (day / night)
const parchTop = (edge, body) => [
  rep('O', 24), 'O' + rep(edge, 22) + 'O', 'O' + edge + rep(body, 20) + edge + 'O', 'O' + edge + rep(body, 20) + edge + 'O',
  'O' + edge + rep(body, 20) + edge + 'O', 'O' + edge + rep(body, 20) + edge + 'O', 'O' + edge + rep(body, 20) + edge + 'O', 'O' + edge + rep(body, 20) + edge + 'O',
  'O' + edge + rep(body, 20) + edge + 'O', 'O' + edge + rep(body, 20) + edge + 'O', 'O' + edge + rep(body, 20) + edge + 'O', 'O' + edge + rep(body, 20) + edge + 'O'
]
await savePng(draw(mirror(parchTop('q', 'p'))), resolve(out, 'frame-parchment.png'))
await savePng(draw(mirror(parchTop('m', 'n'))), resolve(out, 'frame-parchment-night.png'))
// buttons 12×12, slice 4, filled: light top, body, dark bottom; pressed = flipped shading
const btn = (hi, body, lo, pressed = false) => {
  const top = [rep('O', 12), 'O' + rep(pressed ? lo : hi, 10) + 'O', 'O' + (pressed ? lo : hi) + rep(body, 8) + (pressed ? lo : hi) + 'O', 'O' + (pressed ? lo : hi) + rep(body, 8) + (pressed ? lo : hi) + 'O']
  const mid = ['O' + (pressed ? lo : hi) + rep(body, 8) + (pressed ? hi : lo) + 'O', 'O' + (pressed ? lo : hi) + rep(body, 8) + (pressed ? hi : lo) + 'O', 'O' + (pressed ? lo : hi) + rep(body, 8) + (pressed ? hi : lo) + 'O', 'O' + (pressed ? lo : hi) + rep(body, 8) + (pressed ? hi : lo) + 'O']
  const bot = ['O' + (pressed ? hi : lo) + rep(body, 8) + (pressed ? hi : lo) + 'O', 'O' + (pressed ? hi : lo) + rep(body, 8) + (pressed ? hi : lo) + 'O', 'O' + rep(pressed ? hi : lo, 10) + 'O', rep('O', 12)]
  return draw([...top, ...mid, ...bot])
}
await savePng(btn('Y', 'y', 'o'), resolve(out, 'btn-gold.png'))
await savePng(btn('Y', 'y', 'o', true), resolve(out, 'btn-gold-pressed.png'))
await savePng(btn('p', 'P', 'q'), resolve(out, 'btn-parchment.png'))
await savePng(btn('p', 'P', 'q', true), resolve(out, 'btn-parchment-pressed.png'))
await savePng(btn('m', 'n', 'N'), resolve(out, 'btn-parchment-night.png'))
await savePng(btn('m', 'n', 'N', true), resolve(out, 'btn-parchment-night-pressed.png'))
await savePng(btn('R', 'r', 'D'), resolve(out, 'btn-danger.png'))
await savePng(btn('R', 'r', 'D', true), resolve(out, 'btn-danger-pressed.png'))
// Town labels 9×9, slice 3 (world pixels; the Phaser DOM layer scales them with the camera)
const label = (edge, body) => draw([rep('O', 9), 'O' + rep(edge, 7) + 'O', 'O' + edge + rep(body, 5) + edge + 'O', 'O' + edge + rep(body, 5) + edge + 'O', 'O' + edge + rep(body, 5) + edge + 'O', 'O' + edge + rep(body, 5) + edge + 'O', 'O' + edge + rep(body, 5) + edge + 'O', 'O' + rep(edge, 7) + 'O', rep('O', 9)])
await savePng(label('c', 'p'), resolve(out, 'label.png'))
await savePng(label('m', 'n'), resolve(out, 'label-night.png'))
await savePng(label('y', 'Y'), resolve(out, 'label-gold.png'))
await savePng(label('R', 'r'), resolve(out, 'label-danger.png'))
await savePng(label('g', 'G'), resolve(out, 'label-grass.png'))
await savePng(draw([rep('O', 9), 'O' + rep('w', 7) + 'O', 'Ow' + rep('W', 5) + 'wO', 'Ow' + rep('W', 5) + 'wO', 'Ow' + rep('W', 5) + 'wO', 'Ow' + rep('W', 5) + 'wO', 'Ow' + rep('W', 5) + 'wO', 'O' + rep('d', 7) + 'O', rep('O', 9)]), resolve(out, 'label-wood.png'))
console.log(`ui: ${names.length} icons → public/ui/icons.png, frames and labels written`)
