/**
 * The Town's stories (track-E §5.1): each is an FxJob over the scene's entities. They narrate the
 * protocol: the pledge coin never leaves the purse, the settlement is one cart ride, a failed pool
 * moves nothing.
 */
import type { FxContext } from './queue'
import type { TownScene } from '../scenes/TownScene'
import type { Villager } from '../entities/Villager'
import type { Stall } from '../entities/Buildings'
import { banner } from '../entities/Buildings'
import { shortHex } from '../../api/woc'
import { DEPTH } from '../game'
import { ICONS } from '../../ui/icons.generated'

export function pledgeFx (town: TownScene, v: Villager, credits: string, coinSats: number) {
  return async (ctx: FxContext): Promise<void> => {
    v.busy = true
    try {
      const to = town.board.approach
      if (!ctx.reducedMotion) await v.walkTo(to.x + (v.slotIndex % 2 === 0 ? -10 : 10), to.y + 4)
      if (ctx.cancelled()) return
      // the coin arcs into the sack, but the purse only glows: the sats stay in the wallet
      const coin = town.add.sprite(v.x, v.y - 14, 'icons', ICONS.coin).setOrigin(0.5, 1).setDepth(DEPTH.banner)
      await new Promise<void>(resolve => town.tweens.add({ targets: coin, x: town.board.x + 14, y: town.board.y - 6, duration: 500 / ctx.speed, ease: 'Quad.Out', onComplete: () => { coin.destroy(); resolve() } }))
      town.board.flyCredits(`+${credits} credits`)
      v.setPurse('reserved')
      v.say(`Pledged ${credits} credits. ${coinSats} sat reserved, still in my wallet.`, 'gold', 3500)
      await ctx.wait(700)
    } finally {
      v.busy = false
    }
  }
}

export function lockInFx (town: TownScene) {
  return async (ctx: FxContext): Promise<void> => {
    await town.settle()
    town.board.hourglass.setVisible(true).play('anim_lantern', true)
    const centre = town.squareCentre
    const vs = [...town.villagers.values()].filter(v => v.purseReserved)
    await Promise.all(vs.map((v, i) => { v.busy = true; return ctx.reducedMotion ? Promise.resolve() : v.walkTo(centre.x - 24 + i * 16, centre.y + 20) }))
    await ctx.wait(600)
  }
}

export function settlementFx (town: TownScene, txid: string, participants: number) {
  return async (ctx: FxContext): Promise<void> => {
    await town.settle()
    town.board.hourglass.setVisible(false)
    await town.bell.ring()
    if (ctx.cancelled()) return
    const y = town.squareCentre.y + 44
    const ride = town.cart.ride(town.squareCentre.x - 190, town.squareCentre.x + 190, y, 2600 / ctx.speed)
    // chests land at the participants' doors while the cart passes; gold flies to the workshop
    const vs = [...town.villagers.values()].filter(v => v.purseReserved)
    for (const [i, v] of vs.entries()) {
      await ctx.wait(400)
      const house = town.houseOf(v.identity)
      if (house !== undefined) void house.dropChest()
      const coin = town.add.sprite(v.x, v.y - 16, 'icons', ICONS.coin).setOrigin(0.5, 1).setDepth(DEPTH.banner)
      town.tweens.add({ targets: coin, x: town.workshop.door.x, y: town.workshop.door.y - 10, duration: 900 / ctx.speed, ease: 'Quad.In', onComplete: () => coin.destroy() })
      v.setPurse('idle')
      v.busy = false
      if (i === 0) town.workshop.sign.setHTML('Workshop · paid in full')
    }
    await ride
    town.board.shine()
    const link = txid.startsWith('mock_') ? `<span style="font-family:var(--font-counter)">${txid}</span>` : `<span style="font-family:var(--font-counter)">${shortHex(txid, 5)}</span>`
    await banner(town, town.squareCentre.x, town.squareCentre.y - 40, `1 transaction · ${participants} participants · 0 sat held by anyone<br>${link}`, 5000 / ctx.speed)
    for (const v of vs) void v.goHome()
  }
}

/** A sweep: the buyer walks to the stall, the crate goes with them, the stall empties. */
export function sweepFx (town: TownScene, stall: Stall, buyer: Villager | undefined, credits: string) {
  return async (ctx: FxContext): Promise<void> => {
    if (buyer !== undefined && !ctx.reducedMotion) { buyer.busy = true; await buyer.walkTo(stall.front.x, stall.front.y) }
    const crate = town.add.image(stall.x, stall.y - 6, 'town', 'chest_0').setOrigin(0.5, 1).setDepth(DEPTH.banner)
    stall.clear()
    const to = buyer ?? { x: stall.x, y: stall.y - 40 }
    await new Promise<void>(resolve => town.tweens.add({ targets: crate, x: to.x, y: to.y - 20, alpha: buyer !== undefined ? 1 : 0, duration: 500 / ctx.speed, onComplete: () => { crate.destroy(); resolve() } }))
    buyer?.say(`Bought ${credits} credits at the stall`, 'gold', 3000)
    if (buyer !== undefined) { buyer.busy = false; void buyer.goHome() }
  }
}

export function failedPoolFx (town: TownScene) {
  return async (ctx: FxContext): Promise<void> => {
    town.board.hourglass.setVisible(false)
    town.board.fade()
    const vs = [...town.villagers.values()]
    for (const v of vs) { v.setPurse(v.purseReserved ? 'idle' : 'hidden'); v.busy = false }
    const speaker = vs[0]
    speaker?.say('The pool did not fill. Nobody lost a satoshi.', 'parchment', 4000)
    await ctx.wait(1200)
    await banner(town, town.squareCentre.x, town.squareCentre.y - 40, 'Deadline passed · nothing was broadcast · every purse untouched', 3500 / ctx.speed)
  }
}

export function redeemFx (town: TownScene, v: Villager, credits: string) {
  return async (ctx: FxContext): Promise<void> => {
    v.busy = true
    try {
      const house = town.houseOf(v.identity)
      house?.openChest(true)
      if (!ctx.reducedMotion) await v.walkTo(town.workshop.door.x - 12, town.workshop.door.y + 4)
      v.say(`Redeemed ${credits} credit(s) at the workshop.`, 'grass', 3000)
      town.workshop.smoke(true)
      await ctx.wait(500)
    } finally { v.busy = false; void v.goHome() }
  }
}
