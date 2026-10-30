/**
 * store/bus ↔ Phaser (track-E §5.2). Subscribes to the store (agents, pools, theme, replay speed)
 * and to the bus (events → fx). Phaser never fetches and writes only ui.drawer.
 */
import type { EventBus } from '../events/bus'
import type { AppStoreApi } from '../store'
import { resolveTheme } from '../theme'
import { failedPoolFx, lockInFx, pledgeFx, redeemFx, settlementFx, sweepFx } from './fx/scenes'
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
    for (const v of Object.values(s.vaults.byId)) town.chestFor(v.vaultId, v.agent).setBalance(v.balanceSats)
    const listings = Object.values(s.listings.byOutpoint)
    for (const st of town.stalls) if (st.outpoint !== undefined && s.listings.byOutpoint[st.outpoint] === undefined) st.clear()
    for (const l of listings) { const st = town.stallFor(l.outpoint); if (st !== undefined && st.outpoint !== l.outpoint) st.show(l.outpoint, l.credits, l.askSats) }
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
        if (e.agent !== undefined) town.fx.enqueue('injection', ctx => town.injection(e.agent!, e.data.text, ctx.speed))
        break
      case 'cosign_approved':
        town.guard.approve(e.data.sats)
        break
      case 'cosign_denied': {
        const v = town.villagers.get(e.data.agent)
        town.fx.enqueue('refusal', async ctx => { await town.guard.refuse(v !== undefined ? { x: v.x, y: v.y } : undefined, e.data.reason, ctx.speed); town.strangerFlees(); v?.say(`Nothing was sent. ${e.data.reason}`, 'danger', 4000) })
        break
      }
      case 'vault_spent':
        if (e.data.by === 'owner') town.chests.get(e.data.vault.vaultId)?.open()
        break
      case 'policy_updated':
        town.coop.sign.setHTML('Coop hall · policy updated')
        town.time.delayedCall(4000, () => town.coop.sign.setHTML('Coop hall · vaults & guard'))
        break
      case 'rail_funded_bsv':
        town.fx.enqueue('rail', ctx => town.boatCrossing([...store.getState().feed].reverse().find(x => x.type === 'rail_quote')?.data.quote as string | undefined, ctx.speed))
        break
      case 'rail_claimed': {
        const agent = e.agent
        const vault = agent !== undefined ? Object.values(store.getState().vaults.byId).find(v => v.agent === agent) : undefined
        town.boatClaim(vault?.vaultId)
        break
      }
      case 'listing_filled': {
        const buyer = e.data.buyer !== undefined ? town.villagers.get(e.data.buyer) : undefined
        const stall = town.stalls.find(s => s.outpoint === e.data.listing.outpoint)
        if (stall !== undefined) town.fx.enqueue('sweep', sweepFx(town, stall, buyer, e.data.listing.credits))
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
