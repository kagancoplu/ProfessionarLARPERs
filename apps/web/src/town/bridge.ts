/**
 * store/bus ↔ Phaser (track-E §5.2). Subscribes to the store (agents, pools, theme, replay speed)
 * and to the bus (events → fx). Phaser never fetches and writes only ui.drawer.
 */
import type { EventBus } from '../events/bus'
import type { AppStoreApi } from '../store'
import { resolveTheme } from '../theme'
import { failedPoolFx, lockInFx, pledgeFx, redeemFx, settlementFx } from './fx/scenes'
import type { TownScene } from './scenes/TownScene'

export function activePool (s: ReturnType<AppStoreApi['getState']>): string | undefined {
  const ids = [...s.pools.order].reverse()
  return ids.find(id => { const st = s.pools.byId[id]?.status; return st === 'open' || st === 'locking' }) ?? ids[0]
}

export function attachBridge (town: TownScene, store: AppStoreApi, bus: EventBus): () => void {
  const sync = (): void => {
    if (!town.alive) return
    const s = store.getState()
    if (s.me.identityKey !== undefined && !town.villagers.has(s.me.identityKey)) town.addVillager(s.me.identityKey, 'visitor', 'you')
    for (const a of Object.values(s.agents.byIdentity)) {
      const v = town.addVillager(a.identity, a.profile, a.name)
      const pledged = Object.values(s.pools.byId).some(p => (p.status === 'open' || p.status === 'locking') && p.pledges?.some(x => x.participant === a.identity && !x.spent))
      if (pledged !== v.purseReserved) v.setPurse(pledged ? 'reserved' : 'idle')
    }
    const id = activePool(s)
    const pool = id !== undefined ? s.pools.byId[id] : undefined
    town.board.setPool(pool, pool?.height)
    town.setNight(resolveTheme(s.settings.theme, typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches) === 'night')
    town.setSpeed(s.mode === 'replay' ? s.settings.replaySpeed : 1)
  }
  sync()
  const unsubStore = store.subscribe(sync)
  const unsubBus = bus.subscribe(e => {
    if (!town.alive) return
    switch (e.type) {
      case 'pledge_added': {
        const v = town.villagers.get(e.data.pledge.participant)
        if (v !== undefined) void town.track(town.fx.parallel('pledge', pledgeFx(town, v, e.data.pledge.credits, e.data.pledge.coinSats)))
        break
      }
      case 'pool_update':
        if (e.data.status === 'locking') town.fx.enqueue('lock-in', lockInFx(town))
        break
      case 'settled':
        town.fx.enqueue('settlement', settlementFx(town, e.data.txid, store.getState().pools.byId[e.data.poolId]?.pledgeCount ?? 0))
        break
      case 'pool_failed':
        town.fx.enqueue('failed', failedPoolFx(town))
        break
      case 'agent_thought':
        if (e.agent !== undefined) void town.fx.parallel('thought', async () => { town.villagers.get(e.agent!)?.say(e.data.text, 'parchment') })
        break
      case 'agent_decision':
        if (e.agent !== undefined) {
          const v = town.villagers.get(e.agent)
          if (e.data.action === 'sign') v?.check()
          else if (e.data.action === 'reject') v?.say(`Refused: ${e.data.reason}`, 'danger')
          else if (e.data.action !== 'pledge') v?.say(`${e.data.action}: ${e.data.reason}`, 'parchment')
        }
        break
      case 'agent_injected':
        if (e.agent !== undefined) town.villagers.get(e.agent)?.say(`Someone whispers: “${e.data.text}”`, 'danger', 5000)
        break
      case 'cosign_denied': {
        const v = town.villagers.get(e.data.agent)
        v?.say(`The guard refused: ${e.data.reason}`, 'danger', 5000)
        break
      }
      case 'credits_redeemed': {
        const v = town.villagers.get(e.data.agent)
        if (v !== undefined) town.fx.enqueue('redeem', redeemFx(town, v, e.data.credits))
        break
      }
      case 'job_running': town.workshop.smoke(true); break
      case 'job_done': town.workshop.smoke(false); break
      default: break
    }
  })
  return () => { unsubStore(); unsubBus() }
}
