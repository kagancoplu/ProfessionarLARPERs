/**
 * "The Pool" (~48 s): the opening of the demo video. Axel needs 50 GPU-hours, the workshop sells 1000; the
 * village pools at the notice board, one transaction settles it, the camera pulls back to the whole town.
 * Times are film seconds; NARRATION is the voice-over script (VIDEO.md), shown as subtitles with `&subs=1`.
 */
import type { Director } from './director'
import { ZOOM } from './frame'

export const POOL_DURATION = 48

/** The narrator's lines, in order: start second, text, how long the subtitle stays. */
export const NARRATION: ReadonlyArray<{ at: number, text: string, sec: number }> = [
  { at: 0.6, text: 'Compute is sold wholesale. Most of us only need a slice.', sec: 4.6 },
  { at: 10.6, text: 'So Axel posts a pool on the notice board.', sec: 3.8 },
  { at: 16, text: 'Everyone pledges only what they need, and nobody hands their money to anyone. Even AI agents can join, within the budget their owner set.', sec: 10 },
  { at: 30.8, text: 'When the pool fills, one Bitcoin transaction pays the provider and delivers everyone\'s share. All at once, or not at all.', sec: 8.6 },
  { at: 43.5, text: 'Now let\'s look behind the town.', sec: 3 }
]

const TARGET = 1000

/** `roll` resolves when the camera rolls: the stage is set before it, the clock starts after it. */
export async function pool (d: Director, roll: Promise<void>): Promise<void> {
  const town = d.town
  const board = town.board
  const fountain = { x: town.bell.x, y: town.bell.y }
  const chest = { x: board.x + 14, y: board.y - 6 }
  const shop = town.workshop

  // ---- stage: who stands where before the first frame
  // two stall keepers share a sprite with our baker and fisher: they take the day off
  for (const k of [town.keepers[0], town.keepers[2]]) k?.destroy()
  for (const k of town.keepers) if (k.active) k.showName(false)
  const axel = d.enter({ id: 'axel', name: 'Axel', char: 'villager_00', at: { x: fountain.x - 32, y: fountain.y + 10 }, house: true })
  const baker = d.enter({ id: 'baker', name: 'Baker', char: 'chloe', at: { x: 472, y: 402 }, house: true })
  const farmer = d.enter({ id: 'farmer', name: 'Farmer', char: 'bob', at: { x: 212, y: 248 }, house: true })
  const agent = d.enter({ id: 'agent', name: 'AI agent', char: 'mike', at: { x: town.coop.door.x, y: town.coop.door.y } })
  const fisher = d.enter({ id: 'fisher', name: 'Fisher', char: 'fin', at: { x: 652, y: 222 }, house: true })
  const guard = d.adopt('guard', town.guard, { x: town.coop.door.x - 14, y: town.coop.door.y + 6 })
  d.tag(agent, 'AGENT')
  // where everyone stands at the board, clear of the chest so it can be seen filling
  const slot = { axel: { x: 364, y: 208 }, farmer: { x: 342, y: 219 }, agent: { x: 320, y: 209 }, guard: { x: 304, y: 221 }, baker: { x: 428, y: 208 }, fisher: { x: 452, y: 219 } }
  const label = (n: number, extra = ''): string => `GPU pool · H100<br>${n.toLocaleString('en-GB')} / ${TARGET.toLocaleString('en-GB')} GPU-hours${extra}`
  board.setLabelSize(6)
  let total = 0
  const pledge = async (v: typeof axel, amount: number): Promise<void> => {
    d.look(v, board.x, board.y)
    await d.coin(v, chest)
    total += amount
    board.flyCredits(`+${amount}`)
    board.showProgress(label(total, total >= TARGET ? ' · full!' : ''), total, TARGET, total >= TARGET ? 'locking' : 'open')
    v.setPurse('reserved')
  }

  d.cut(axel.x + 22, axel.y - 22, ZOOM.close)
  await roll
  d.start()

  // ---- 1. the hook (0–10 s): Axel at the fountain, the workshop only sells wholesale
  d.narrate(NARRATION[0]!.text, NARRATION[0]!.sec)
  await d.at(0.8, 'hook')
  d.think(axel, 'I need 50 GPU-hours…', 2.6)
  await d.at(3.0)
  shop.sign.setHTML('Workshop · H100 GPU-hours<br>wholesale only · min. 1000')
  await d.at(3.4, 'workshop sign')
  await d.move(shop.x, shop.y - shop.img.height * 0.55, ZOOM.close, 0.9)
  await d.at(5.8)
  await d.move(axel.x + 22, axel.y - 22, ZOOM.close, 0.9)
  d.look(axel, shop.x, shop.y)
  d.say(axel, '…but they only sell 1000.', 2.4)
  await d.at(9.2)
  d.look(axel, axel.x, axel.y + 20)
  d.emote(axel, '…', 0.9, 'parchment')

  // ---- 2. the idea (10–15 s): a pool on the notice board
  await d.at(10.1, 'idea')
  d.emote(axel, '!', 0.8)
  await d.at(10.6)
  d.narrate(NARRATION[1]!.text, NARRATION[1]!.sec)
  d.think(axel, 'What if we buy it together?', 2.2)
  await d.at(11.4)
  d.follow(axel, ZOOM.medium, 1.4)
  await d.walk(axel, slot.axel.x, slot.axel.y)
  board.showProgress(label(0), 0, TARGET)
  board.flyCredits('new pool')
  await d.at(12.8)
  await pledge(axel, 50)
  d.say(axel, 'Pledged 50. The coins stay in my wallet.', 2.6)

  // ---- 3. the village joins (15–28 s): baker, farmer, the agent and its guard, fisher
  await d.at(14.6, 'village')
  void d.move(board.x, board.y + 10, ZOOM.medium, 1.2)
  const bakerIn = d.walk(baker, slot.baker.x, slot.baker.y, 1.7)
  d.narrate(NARRATION[2]!.text, NARRATION[2]!.sec)
  await Promise.all([bakerIn, d.at(17.0, 'baker')])
  d.say(baker, '200 for my bakery\'s AI!', 2.4)
  await pledge(baker, 200)

  const farmerIn = d.walk(farmer, slot.farmer.x, slot.farmer.y, 1.7)
  await d.at(18.4)
  const agentIn = Promise.all([d.walk(agent, slot.agent.x, slot.agent.y, 1.5), d.walk(guard, slot.guard.x, slot.guard.y, 1.5)])
  await Promise.all([farmerIn, d.at(19.6, 'farmer')])
  d.say(farmer, '150 for crop forecasts.', 2.4)
  await pledge(farmer, 150)

  await Promise.all([agentIn, d.at(21.8, 'agent')])
  d.say(agent, 'My owner set my budget: 300.', 2.0)
  const fisherIn = d.walk(fisher, slot.fisher.x, slot.fisher.y, 1.8)
  // the guard co-signs only what the owner's policy allows
  await d.at(23.9)
  d.say(guard, '✓ within policy', 1.6, 'grass')
  town.tweens.add({ targets: guard.sprite, y: 2, duration: 90, yoyo: true, repeat: 2 })
  await pledge(agent, 300)

  await Promise.all([fisherIn, d.at(25.6, 'fisher')])
  d.say(fisher, '300, and that fills it!', 2.1)
  await pledge(fisher, 300)
  board.shine()
  await d.at(27.8)
  for (const [i, v] of [axel, baker, farmer, agent, fisher].entries()) town.time.delayedCall(i * 110, () => { d.emote(v, '♪', 0.9) })

  // ---- 4. one transaction (28–39 s): the fountain lights up, the horse crosses, a chest for everyone
  await d.at(28.8, 'settlement')
  const crowd = [farmer, agent, axel, baker, fisher]
  void d.move(fountain.x, fountain.y - 34, ZOOM.wide, 1.6)
  await d.at(30.0)
  for (const v of [...crowd, guard]) d.look(v, v.x, v.y + 20)
  await d.at(30.6)
  d.sparkle(fountain.x, fountain.y, 2.6)
  void town.bell.ring()
  d.narrate(NARRATION[3]!.text, NARRATION[3]!.sec)
  await d.at(31.0)
  void town.cart.ride(fountain.x - 230, fountain.x + 230, fountain.y + 48, 3000)
  const chests = new Map<typeof axel, ReturnType<Director['dropChest']>>()
  for (const [i, v] of crowd.entries()) {
    await d.wait(0.35)
    void d.coin(v, shop.door, 0.9)
    chests.set(v, d.dropChest(v))
    v.setPurse('hidden')
    if (i === 0) shop.sign.setHTML('Workshop · paid in full ✓')
  }
  board.showProgress('GPU pool · H100<br>settled ✓', TARGET, TARGET)
  await d.at(34.1, 'summary')
  d.parchment(fountain.x, fountain.y - 2, '1 transaction · 5 participants<br>0 sat held by anyone', 4.6)

  // ---- 5. the payoff and the pull-back (39–48 s)
  await d.at(39.0, 'payoff')
  await d.move(axel.x + 4, axel.y - 24, ZOOM.close, 1.1)
  await d.openChest(chests.get(axel)!)
  d.say(axel, '50 GPU-hours. Exactly what I needed.', 3)
  for (const v of [baker, farmer, fisher, agent, guard]) void d.walk(v, v.home.x, v.home.y, 1.2)
  await d.at(43.5, 'pull-back')
  d.narrate(NARRATION[4]!.text, NARRATION[4]!.sec)
  await d.move(384, 288, ZOOM.map, 3.0)
  await d.at(POOL_DURATION, 'end')
}
