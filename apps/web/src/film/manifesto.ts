/**
 * The manifesto (14 s, VIDEO.md): the square at dusk, the lanterns come on, the villagers of "The Pool" by the
 * fountain; then the end card. Lines in narration.ts (manifesto-1 0.8 s, manifesto-2 5.8 s).
 */
import type { Director } from './director'
import { ZOOM } from './frame'
import { duration } from './narration'

export const MANIFESTO_DURATION = duration('manifesto')

export async function manifesto (d: Director, roll: Promise<void>): Promise<void> {
  const town = d.town
  const f = { x: town.bell.x, y: town.bell.y }
  for (const k of [town.keepers[0], town.keepers[2]]) k?.destroy()
  for (const k of town.keepers) if (k.active) k.showName(false)
  const cast = [
    d.enter({ id: 'axel', name: 'Axel', char: 'villager_00', at: { x: f.x - 34, y: f.y + 14 } }),
    d.enter({ id: 'baker', name: 'Baker', char: 'chloe', at: { x: f.x + 30, y: f.y + 16 } }),
    d.enter({ id: 'farmer', name: 'Farmer', char: 'bob', at: { x: f.x - 52, y: f.y - 6 } }),
    d.enter({ id: 'fisher', name: 'Fisher', char: 'fin', at: { x: f.x + 50, y: f.y - 4 } }),
    d.enter({ id: 'agent', name: 'AI agent', char: 'mike', at: { x: f.x - 6, y: f.y + 30 } })
  ]
  for (const v of cast) { v.showName(false); d.look(v, f.x, f.y - 10) }
  d.cut(f.x, f.y - 70, ZOOM.wide)
  await roll
  d.start()
  town.setNight(true)
  void d.move(f.x, f.y - 20, ZOOM.medium, 9, 'Sine.easeInOut')
  await d.at(3.4)
  d.sparkle(f.x, f.y, 2.2)
  await d.at(6.0)
  for (const [i, v] of cast.entries()) town.time.delayedCall(i * 140, () => { d.emote(v, '♪', 1.2) })
  await d.at(10.0, 'end card')
  d.card(true)
  await d.at(MANIFESTO_DURATION, 'end')
}
