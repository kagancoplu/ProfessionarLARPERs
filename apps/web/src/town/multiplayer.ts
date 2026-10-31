/**
 * Multiplayer Town (track-E P7) over a public Supabase Realtime channel: Presence says who is in town (name, where
 * they stopped), Broadcast carries `move` destinations (peers.ts). Only in avatar mode with the Supabase transport;
 * cosmetic, so names are whatever each visitor announces (trimmed, ≤ 24 chars). Remote players are visitor villagers
 * `peer:<key>`; a `move` counts only from a player in presence, to a point inside the town (peers.ts, F-8).
 */
import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js'
import { getSupabase } from '../api/supabase'
import type { AppStoreApi } from '../store'
import { MAP_H, MAP_W, TILE } from './map/terrain'
import { acceptMove, JoinGate, MoveThrottle, peersFromPresence, TOWN_CHANNEL, type Bounds, type Move, type PeerMeta } from './peers'
import type { TownScene } from './scenes/TownScene'
import type { Villager } from './entities/Villager'

/** Per-tab id, so two tabs of one identity are two players. */
function tabId (): string {
  const fresh = (): string => [...crypto.getRandomValues(new Uint8Array(4))].map(b => b.toString(16).padStart(2, '0')).join('')
  try {
    const id = sessionStorage.getItem('agentcoop.tab') ?? fresh()
    sessionStorage.setItem('agentcoop.tab', id)
    return id
  } catch { return fresh() }
}

const TOWN: Bounds = { w: MAP_W * TILE, h: MAP_H * TILE }

export function attachMultiplayer (town: TownScene, store: AppStoreApi): () => void {
  const tab = tabId()
  let sb: SupabaseClient | undefined
  let channel: RealtimeChannel | undefined
  let selfKey = ''
  let joined = false
  let throttle = new MoveThrottle()
  let prev: { x: number, y: number } | undefined
  const peers = new Map<string, Villager>()

  const myName = (): string => {
    const s = store.getState()
    const id = s.me.identityKey
    if (id === undefined) return `Visitor ${tab.slice(0, 4)}`
    return s.agents.byIdentity[id]?.name ?? `${id.slice(0, 6)}…`
  }
  const peer = (key: string, name: string): Villager => {
    const existing = peers.get(key)
    if (existing !== undefined) return existing
    const v = town.addVillager(`peer:${key}`, 'visitor', name)
    v.busy = true // no idle wandering: it goes where its player goes
    peers.set(key, v)
    return v
  }
  const sync = (): void => {
    if (channel === undefined) return
    const now = peersFromPresence(channel.presenceState<PeerMeta>(), selfKey, TOWN)
    const keep = new Set(now.map(p => p.key))
    for (const key of [...peers.keys()]) if (!keep.has(key)) { town.removeVillager(`peer:${key}`); peers.delete(key) }
    for (const p of now) {
      const known = peers.has(p.key)
      const v = peer(p.key, p.name)
      if (!known && p.at !== undefined) v.setPosition(p.at[0], p.at[1]).setDepth(p.at[1])
    }
  }

  const join = async (): Promise<void> => {
    sb ??= await getSupabase()
    if (sb === undefined || channel !== undefined) return
    selfKey = `${store.getState().me.identityKey ?? 'guest'}:${tab}`
    throttle = new MoveThrottle()
    const ch = sb.channel(TOWN_CHANNEL, { config: { presence: { key: selfKey }, broadcast: { self: false } } })
    channel = ch
    const gate = new JoinGate()
    const others = (): number => peersFromPresence(ch.presenceState<PeerMeta>(), selfKey).length
    const decide = (d: 'join' | 'watch' | undefined): void => {
      if (d === 'watch') store.getState().pushToast({ kind: 'info', text: 'The town is full: watching the others' })
      if (d !== 'join' || channel !== ch) return
      const v = town.avatar?.villager
      void ch.track({ name: myName(), ...(v !== undefined ? { at: [Math.round(v.x), Math.round(v.y)] } : {}) })
      joined = true
    }
    ch.on('presence', { event: 'sync' }, () => { sync(); decide(gate.onSync(others())) })
    ch.on('broadcast', { event: 'move' }, ({ payload }) => {
      const m = acceptMove(payload, new Set(Object.keys(ch.presenceState())), selfKey, TOWN)
      if (m === undefined) return
      const v = peers.get(m.key) ?? peer(m.key, peersFromPresence(ch.presenceState<PeerMeta>(), selfKey, TOWN).find(p => p.key === m.key)?.name ?? 'Visitor')
      void v.walkTo(m.to[0], m.to[1])
    })
    ch.subscribe(status => {
      if (status !== 'SUBSCRIBED') return
      gate.onSubscribed()
      setTimeout(() => { decide(gate.onTimeout(others())) }, 1_500) // in case no presence sync arrives
    })
  }
  const leave = (): void => {
    if (channel !== undefined) void sb?.removeChannel(channel)
    channel = undefined
    joined = false
    for (const key of peers.keys()) town.removeVillager(`peer:${key}`)
    peers.clear()
  }

  const send = (m: Move): void => {
    if (channel === undefined) return
    void channel.send({ type: 'broadcast', event: 'move', payload: { key: selfKey, name: myName(), to: [m.x, m.y] } })
    if (m.stop) void channel.track({ name: myName(), at: [m.x, m.y] })
  }
  const onUpdate = (time: number): void => {
    const v = town.avatar?.villager
    if (!joined || v === undefined || town.avatar?.enabled !== true) return
    const pos = { x: v.x, y: v.y }
    const moving = prev !== undefined && (prev.x !== pos.x || prev.y !== pos.y)
    prev = pos
    const m = throttle.next(time, pos, moving)
    if (m !== undefined) send(m)
  }
  town.events.on('update', onUpdate)

  if (store.getState().settings.avatar) void join()
  const unsubscribe = store.subscribe((s, before) => {
    if (s.settings.avatar === before.settings.avatar) return
    if (s.settings.avatar) void join(); else leave()
  })

  return () => { unsubscribe(); town.events.off('update', onUpdate); leave() }
}
