/**
 * Multiplayer Town rules (P7 over Supabase, plan/phases/SUPABASE-MVP.md). The free Realtime quota counts every
 * recipient, so a player sends where it is heading, not a position stream: at most one `move` per 1.5 s while
 * walking and one when it stops; the others walk there themselves on the same A* map.
 */
export const TOWN_CHANNEL = 'town:main'
export const MAX_PLAYERS = 8
export const MOVE_EVERY_MS = 1500
export const MIN_MOVE_PX = 4

export interface Move { x: number, y: number, stop: boolean }

export class MoveThrottle {
  private lastAt = Number.NEGATIVE_INFINITY
  private last?: { x: number, y: number }
  private moving = false

  /** The move to send now, if any. Coordinates are rounded to whole pixels. */
  next (now: number, pos: { x: number, y: number }, moving: boolean): Move | undefined {
    const x = Math.round(pos.x)
    const y = Math.round(pos.y)
    if (!moving) {
      if (!this.moving) return undefined
      this.moving = false
      this.last = { x, y }
      return { x, y, stop: true }
    }
    this.moving = true
    if (now - this.lastAt < MOVE_EVERY_MS) return undefined
    if (this.last !== undefined && Math.hypot(x - this.last.x, y - this.last.y) < MIN_MOVE_PX) return undefined
    this.lastAt = now
    this.last = { x, y }
    return { x, y, stop: false }
  }
}

export interface PeerMeta { name: string, at?: [number, number] }
export interface Peer { key: string, name: string, at?: [number, number] }

/** Other players from a Realtime presence state (key → metas, newest last), sorted by key. */
export function peersFromPresence (state: Record<string, PeerMeta[]>, selfKey: string): Peer[] {
  const out: Peer[] = []
  for (const [key, metas] of Object.entries(state)) {
    const meta = metas[metas.length - 1]
    if (key === selfKey || meta === undefined) continue
    out.push({ key, name: meta.name, ...(meta.at !== undefined ? { at: meta.at } : {}) })
  }
  return out.sort((a, b) => a.key.localeCompare(b.key))
}

/** Room for one more player while fewer than MAX_PLAYERS others are in town; otherwise watch. */
export function canJoin (peerCount: number): boolean { return peerCount < MAX_PLAYERS }

/**
 * When to decide join-or-watch: right after SUBSCRIBED the presence state is still empty (the server's
 * presence_state comes after the join reply), so the first sync after subscribing decides, or a timeout.
 */
export class JoinGate {
  private subscribed = false
  private decided = false

  onSubscribed (): void { this.subscribed = true }

  onSync (peerCount: number): 'join' | 'watch' | undefined { return this.subscribed ? this.decide(peerCount) : undefined }

  onTimeout (peerCount: number): 'join' | 'watch' | undefined { return this.subscribed ? this.decide(peerCount) : undefined }

  private decide (peerCount: number): 'join' | 'watch' | undefined {
    if (this.decided) return undefined
    this.decided = true
    return canJoin(peerCount) ? 'join' : 'watch'
  }
}
