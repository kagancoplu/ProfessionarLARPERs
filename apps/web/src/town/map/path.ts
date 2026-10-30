/**
 * Paths for the villagers (pure, tested): A* over the collision map with 8 neighbours (no corner cutting),
 * roads cheaper than grass so people keep to the paths, then string-pulled to as few straight legs as the
 * map allows. World pixels in and out; the last point is the exact target when it is standable.
 */
import { BLOCKED } from './blocked'
import { MAP_H, MAP_W, TERRAIN, TILE, type Terrain } from './terrain'

export interface Pt { x: number, y: number }

const ROAD: ReadonlySet<Terrain> = new Set(['dirt', 'sand', 'cobble'])
const cost = (tx: number, ty: number, grid: Terrain[][]): number => (ROAD.has(grid[ty]![tx]!) ? 1 : 1.6)
const free = (b: boolean[][], tx: number, ty: number): boolean => tx >= 0 && ty >= 0 && tx < MAP_W && ty < MAP_H && b[ty]![tx] === false
const tileOf = (p: Pt): Pt => ({ x: Math.floor(p.x / TILE), y: Math.floor(p.y / TILE) })
const centre = (t: Pt): Pt => ({ x: t.x * TILE + TILE / 2, y: t.y * TILE + TILE / 2 })

/** The free tile nearest to t (spiral search), or t itself. */
export function nearestFree (b: boolean[][], t: Pt): Pt {
  if (free(b, t.x, t.y)) return t
  for (let r = 1; r < 8; r++) {
    let best: Pt | undefined
    let bestD = Infinity
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== r || !free(b, t.x + dx, t.y + dy)) continue
      const d = dx * dx + dy * dy
      if (d < bestD) { bestD = d; best = { x: t.x + dx, y: t.y + dy } }
    }
    if (best !== undefined) return best
  }
  return t
}

/** Is the straight segment a→b (world px) clear of blocked tiles? Sampled every 4 px. */
export function lineClear (b: boolean[][], a: Pt, c: Pt): boolean {
  const dist = Math.hypot(c.x - a.x, c.y - a.y)
  const steps = Math.max(1, Math.ceil(dist / 4))
  for (let i = 0; i <= steps; i++) {
    const x = a.x + ((c.x - a.x) * i) / steps, y = a.y + ((c.y - a.y) * i) / steps
    if (!free(b, Math.floor(x / TILE), Math.floor(y / TILE))) return false
  }
  return true
}

/** A* from a to b (tiles); undefined when unreachable. */
export function astar (b: boolean[][], grid: Terrain[][], from: Pt, to: Pt): Pt[] | undefined {
  const key = (t: Pt): number => t.y * MAP_W + t.x
  const h = (t: Pt): number => { const dx = Math.abs(t.x - to.x), dy = Math.abs(t.y - to.y); return Math.max(dx, dy) + 0.414 * Math.min(dx, dy) }
  const g = new Map<number, number>([[key(from), 0]])
  const came = new Map<number, number>()
  const open: Array<{ t: Pt, f: number }> = [{ t: from, f: h(from) }]
  const closed = new Set<number>()
  while (open.length > 0) {
    let bi = 0
    for (let i = 1; i < open.length; i++) if (open[i]!.f < open[bi]!.f) bi = i
    const { t } = open.splice(bi, 1)[0]!
    const k = key(t)
    if (closed.has(k)) continue
    if (t.x === to.x && t.y === to.y) {
      const path: Pt[] = [t]
      let c = k
      while (came.has(c)) { c = came.get(c)!; path.unshift({ x: c % MAP_W, y: Math.floor(c / MAP_W) }) }
      return path
    }
    closed.add(k)
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue
      const n = { x: t.x + dx, y: t.y + dy }
      if (!free(b, n.x, n.y)) continue
      if (dx !== 0 && dy !== 0 && (!free(b, t.x + dx, t.y) || !free(b, t.x, t.y + dy))) continue // no corner cutting
      const nk = key(n)
      if (closed.has(nk)) continue
      const ng = g.get(k)! + cost(n.x, n.y, grid) * (dx !== 0 && dy !== 0 ? 1.414 : 1)
      if (ng < (g.get(nk) ?? Infinity)) { g.set(nk, ng); came.set(nk, k); open.push({ t: n, f: ng + h(n) }) }
    }
  }
  return undefined
}

/** World path from a to b: straight when clear, else A* string-pulled. Always ends at b if b is standable. */
export function findPath (a: Pt, b: Pt, blocked: boolean[][] = BLOCKED, grid: Terrain[][] = TERRAIN): Pt[] {
  if (lineClear(blocked, a, b)) return [b]
  const start = nearestFree(blocked, tileOf(a)), goal = nearestFree(blocked, tileOf(b))
  const tiles = astar(blocked, grid, start, goal)
  if (tiles === undefined) return [b]
  const pts = tiles.map(centre)
  const goalPt = free(blocked, tileOf(b).x, tileOf(b).y) ? b : pts[pts.length - 1]!
  pts[pts.length - 1] = goalPt
  // string pulling: from the current point, jump to the farthest point still in line of sight
  const out: Pt[] = []
  let cur = a
  let i = 0
  while (i < pts.length) {
    let j = pts.length - 1
    while (j > i && !lineClear(blocked, cur, pts[j]!)) j--
    out.push(pts[j]!)
    cur = pts[j]!
    i = j + 1
  }
  return out
}
