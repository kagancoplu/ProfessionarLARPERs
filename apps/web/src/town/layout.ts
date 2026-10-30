/**
 * Where things stand in the Town, in world pixels (16 px tiles, unscaled). Read from map/town.json's
 * object layer so Tiled stays the editor (P1 keeps the draft in code-friendly JSON).
 */
import townJson from './map/town.json'

export interface Placement { kind: string, name: string, x: number, y: number, w: number, h: number, slot?: number }
export interface Point { name: string, x: number, y: number }

interface TiledObject { id: number, name: string, type: string, x: number, y: number, width?: number, height?: number, point?: boolean, properties?: Array<{ name: string, value: unknown }> }
interface TiledLayer { name: string, type: string, objects?: TiledObject[] }

const layers = (townJson as { layers: TiledLayer[] }).layers

export const BUILDINGS: Placement[] = (layers.find(l => l.name === 'buildings')?.objects ?? []).map(o => ({
  kind: o.type, name: o.name, x: o.x, y: o.y, w: o.width ?? 16, h: o.height ?? 16,
  ...(o.properties?.find(p => p.name === 'slot') !== undefined ? { slot: Number(o.properties.find(p => p.name === 'slot')!.value) } : {})
}))

export const POINTS: Record<string, Point> = Object.fromEntries((layers.find(l => l.name === 'points')?.objects ?? []).map(o => [o.name, { name: o.name, x: o.x, y: o.y }]))

export const HOUSES: Placement[] = BUILDINGS.filter(b => b.kind === 'house').sort((a, b) => (a.slot ?? 0) - (b.slot ?? 0))
export const BOARD: Placement = BUILDINGS.find(b => b.kind === 'board') ?? { kind: 'board', name: 'board', x: 464, y: 240, w: 32, h: 32 }
export const WORKSHOP: Placement = BUILDINGS.find(b => b.kind === 'workshop') ?? { kind: 'workshop', name: 'workshop', x: 656, y: 112, w: 48, h: 48 }
export const STALL: Placement | undefined = BUILDINGS.find(b => b.kind === 'stall')
export const GATE: Placement | undefined = BUILDINGS.find(b => b.kind === 'gate')
export const HARBOR: Placement | undefined = BUILDINGS.find(b => b.kind === 'harbor')

/** Assign agents to houses by arrival order; more agents than houses share the square's edge (crowd mode). */
export function assignHouses (identities: string[], houses = HOUSES.length): Map<string, number | undefined> {
  const out = new Map<string, number | undefined>()
  identities.forEach((id, i) => { out.set(id, i < houses ? i : undefined) })
  return out
}
