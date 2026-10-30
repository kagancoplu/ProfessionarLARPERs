/**
 * Where things stand in the Town, in world pixels (16 px tiles, unscaled). Kept as the stable API for the
 * bridge and the stories; the data lives in map/places.ts (and is exported to public/game/map.json).
 */
import { BOARD as B, COOP as C, HOUSES as H, POINTS as P, STALLS as S, WORKSHOP as W, type Place, type Point } from './map/places'

export type { Place, Point }
export const HOUSES: Place[] = H
export const BOARD: Place = B
export const WORKSHOP: Place = W
export const COOP: Place = C
export const STALLS: Place[] = S
export const POINTS: Record<string, Point> = P

/** Assign agents to houses by arrival order; more agents than houses share the square's edge (crowd mode). */
export function assignHouses (identities: string[], houses = HOUSES.length): Map<string, number | undefined> {
  const out = new Map<string, number | undefined>()
  identities.forEach((id, i) => { out.set(id, i < houses ? i : undefined) })
  return out
}
