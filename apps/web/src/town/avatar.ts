/**
 * Avatar mode (track-E P6): the player's villager walks with WASD / arrows, the camera follows, `E` opens
 * the drawer of the nearest thing. No physics engine: the foot point is tested against map/blocked.ts.
 */
import Phaser from 'phaser'
import { BLOCKED, canStand } from './map/blocked'
import type { TownScene } from './scenes/TownScene'
import type { Villager } from './entities/Villager'
import { makeLabel } from './entities/dom'

const SPEED = 56
const REACH = 30

export interface Target { label: string, x: number, y: number, open: () => void }

export class AvatarController {
  private keys?: Record<string, Phaser.Input.Keyboard.Key>
  private hint?: Phaser.GameObjects.DOMElement
  private near?: Target
  enabled = false

  constructor (private readonly town: TownScene, readonly villager: Villager) {
    villager.player = true
    const kb = town.input.keyboard
    if (kb !== null) {
      this.keys = kb.addKeys({ up: 'UP', down: 'DOWN', left: 'LEFT', right: 'RIGHT', w: 'W', a: 'A', s: 'S', d: 'D', e: 'E' }) as Record<string, Phaser.Input.Keyboard.Key>
      this.keys.e!.on('down', () => { if (this.enabled) this.near?.open() })
    }
  }

  enable (on: boolean): void {
    this.enabled = on
    const cam = this.town.cameras.main
    if (on) { cam.startFollow(this.villager, true, 0.12, 0.12); this.villager.setPurse('hidden') } else { cam.stopFollow(); this.hint?.destroy(); this.hint = undefined; this.near = undefined }
  }

  /** targets the avatar can interact with right now */
  targets (): Target[] {
    const t = this.town
    const s = t.deps.store.getState()
    const out: Target[] = []
    out.push({ label: 'Notice board', x: t.board.x, y: t.board.y + 8, open: () => { if (t.board.poolId !== undefined) s.openDrawer('pool', t.board.poolId) } })
    out.push({ label: 'Workshop', x: t.workshop.door.x, y: t.workshop.door.y, open: () => s.openDrawer('me', 'workshop') })
    out.push({ label: 'Harbor office', x: t.harbor.door.x, y: t.harbor.door.y, open: () => s.openDrawer('rail', 'harbor') })
    const firstVault = [...t.chests.keys()][0]
    if (firstVault !== undefined) out.push({ label: 'Coop hall', x: t.coop.door.x, y: t.coop.door.y, open: () => s.openDrawer('vault', firstVault) })
    for (const h of t.houses) if (h.owner !== undefined) out.push({ label: `${s.agents.byIdentity[h.owner]?.name ?? 'villager'}'s house`, x: h.door.x, y: h.door.y, open: () => s.openDrawer('agent', h.owner!) })
    for (const c of t.chests.values()) out.push({ label: 'Vault chest', x: c.x, y: c.y + 6, open: () => s.openDrawer('vault', c.vaultId) })
    for (const st of t.stalls) if (st.outpoint !== undefined) out.push({ label: 'Market stall', x: st.front.x, y: st.front.y, open: () => s.openDrawer('listing', st.outpoint!) })
    for (const v of t.villagers.values()) if (v !== this.villager && v.identity !== 'guard') out.push({ label: v.label, x: v.x, y: v.y, open: () => s.openDrawer('agent', v.identity) })
    return out
  }

  update (dtMs: number): void {
    if (!this.enabled || this.keys === undefined) return
    const k = this.keys
    const dx = (k.right!.isDown || k.d!.isDown ? 1 : 0) - (k.left!.isDown || k.a!.isDown ? 1 : 0)
    const dy = (k.down!.isDown || k.s!.isDown ? 1 : 0) - (k.up!.isDown || k.w!.isDown ? 1 : 0)
    const v = this.villager
    if (dx !== 0 || dy !== 0) {
      const len = Math.hypot(dx, dy)
      const step = (SPEED * dtMs) / 1000
      const nx = v.x + (dx / len) * step, ny = v.y + (dy / len) * step
      // slide along walls: try the full move, then each axis
      if (canStand(BLOCKED, nx, ny)) v.setPosition(nx, ny)
      else if (canStand(BLOCKED, nx, v.y)) v.setPosition(nx, v.y)
      else if (canStand(BLOCKED, v.x, ny)) v.setPosition(v.x, ny)
      v.setDepth(v.y)
      v.stepAnim(dx, dy)
    } else v.stepAnim(0, 0)
    // nearest target within reach → hint
    let best: Target | undefined
    let bestD = REACH
    for (const t of this.targets()) { const d = Phaser.Math.Distance.Between(v.x, v.y, t.x, t.y); if (d < bestD) { bestD = d; best = t } }
    if (best?.label !== this.near?.label) {
      this.hint?.destroy(); this.hint = undefined
      if (best !== undefined) { this.hint = makeLabel(this.town, 0, -46, `E · ${best.label}`, { size: 6, tone: 'gold' }); v.add(this.hint) }
    }
    this.near = best
  }

  destroy (): void { this.hint?.destroy(); this.villager.player = false }
}
