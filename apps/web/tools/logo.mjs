#!/usr/bin/env node
/**
 * The AgentCoop logo (24×24 pixel art, the town's palette): a gold coin, and on it three villagers in the
 * village's shirt colours around one shared pool, the coop buying together. Writes public/ui/logo.svg and
 * public/favicon.svg. Run: node tools/logo.mjs
 */
import { writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const S = 24
const PAL = { O: '#3f2832', Y: '#fee761', y: '#feae34', o: '#dd5a08', c: '#f9e6cf', B: '#0098dc', b: '#00cdf9', G: '#33984b', R: '#ac353d', D: '#743f39' }
const g = Array.from({ length: S }, () => Array(S).fill('.'))
const set = (x, y, c) => { if (x >= 0 && y >= 0 && x < S && y < S) g[y][x] = c }
// the coin: outline ring, light from the top left
const cx = 11.5, cy = 11.5
for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
  const d = Math.hypot(x - cx, y - cy)
  if (d <= 11.6) {
    const lit = (x - cx) + (y - cy)
    g[y][x] = d > 10.6 ? 'O' : d > 9.3 ? (lit < -4 ? 'Y' : lit > 5 ? 'o' : 'y') : 'y'
  }
}
// a villager: round head, shoulders in a shirt colour, a dark outline
function villager (x, y, shirt) {
  const head = [[1, 0], [2, 0], [0, 1], [1, 1], [2, 1], [3, 1], [1, 2], [2, 2]]
  const body = [[0, 4], [1, 4], [2, 4], [3, 4], [-1, 5], [0, 5], [1, 5], [2, 5], [3, 5], [4, 5]]
  const cells = new Set([...head, ...body].map(([a, b]) => `${a},${b}`))
  for (const k of cells) { const [a, b] = k.split(',').map(Number); for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (!cells.has(`${a + dx},${b + dy}`)) set(x + a + dx, y + b + dy, 'O') }
  for (const [a, b] of head) set(x + a, y + b, 'c')
  for (const [a, b] of body) set(x + a, y + b, shirt)
}
villager(10, 3, 'B')
villager(4, 12, 'G')
villager(16, 12, 'R')
// the pool in the middle: a small blue well they all draw from
for (const [x, y, c] of [[11, 12, 'O'], [12, 12, 'O'], [10, 13, 'O'], [11, 13, 'b'], [12, 13, 'b'], [13, 13, 'O'], [10, 14, 'O'], [11, 14, 'B'], [12, 14, 'B'], [13, 14, 'O'], [11, 15, 'O'], [12, 15, 'O']]) set(x, y, c)
const rects = []
g.forEach((row, y) => row.forEach((c, x) => { if (c !== '.') rects.push(`<rect x="${x}" y="${y}" width="1" height="1" fill="${PAL[c]}"/>`) }))
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${S} ${S}" shape-rendering="crispEdges">${rects.join('')}</svg>\n`
for (const f of ['public/ui/logo.svg', 'public/favicon.svg']) await writeFile(resolve(process.cwd(), f), svg)
console.log('logo: public/ui/logo.svg, public/favicon.svg')
