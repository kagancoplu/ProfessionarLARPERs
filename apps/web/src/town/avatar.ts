/**
 * Avatar mode (track-E P6): the player's villager walks with WASD / arrows, the camera follows, `E` opens
 * the drawer of the nearest thing. No physics engine: the foot point is tested against map/blocked.ts.
 */
import Phaser from 'phaser'
import { BLOCKED, canStand } from './map/blocked'
import type { TownScene } from './scenes/TownScene'
import type { Villager } from './entities/Villager'
import { makeLabel } from './entities/dom'
import { isTypingTarget } from '../shell/shortcuts'

const SPEED = 56
const REACH = 30
/** keys the page must not see while walking (arrows would scroll it); released when the walk ends */
const CAPTURE = 'UP,DOWN,LEFT,RIGHT,W,A,S,D,E'
const typing = (): boolean => typeof document !== 'undefined' && isTypingTarget(document.activeElement)

export interface Target { label: string, x: number, y: number, open: () => void }

export class AvatarController {
  private keys?: Record<string, Phaser.Input.Keyboard.Key>
  private hint?: Phaser.GameObjects.DOMElement
  private near?: Target
  private readonly onE = (): void => { if (this.enabled && !typing()) this.near?.open() }
  enabled = false

  constructor (private readonly town: TownScene, readonly villager: Villager) {
    villager.player = true
    const kb = town.input.keyboard
    if (kb !== null) {
      // no capture yet: only while walking (enable), so the page keeps its arrows and letters otherwise
      this.keys = kb.addKeys({ up: 'UP', down: 'DOWN', left: 'LEFT', right: 'RIGHT', w: 'W', a: 'A', s: 'S', d: 'D', e: 'E' }, false) as Record<string, Phaser.Input.Keyboard.Key>
      this.keys.e!.on('down', this.onE)
    }
  }

  enable (on: boolean): void {
    if (this.enabled === on) return
    this.enabled = on
    const cam = this.town.cameras.main
    const kb = this.town.input.keyboard
    if (on) {
      kb?.addCapture(CAPTURE)
      cam.startFollow(this.villager, true, 0.12, 0.12)
      this.villager.setPurse('hidden')
    } else {
      kb?.removeCapture(CAPTURE)
      for (const k of Object.values(this.keys ?? {})) k.reset()
      cam.stopFollow()
      this.villager.stepAnim(0, 0)
      this.hint?.destroy(); this.hint = undefined; this.near = undefined
    }
  }

  /**
   * Targets the avatar can interact with right now, and what `E` does with each: the same drawer a click opens,
   * or a line from the player when there is nothing to open yet (never a drawer about something missing).
   */
  targets (): Target[] {
    const t = this.town
    const s = t.deps.store.getState()
    const me = (text: string) => (): void => { this.villager.say(text, 'parchment', 2600) }
    const out: Target[] = []
    const pool = t.board.poolId
    out.push({ label: 'Notice board', x: t.board.x, y: t.board.y + 8, open: pool !== undefined ? () => s.openDrawer('pool', pool) : me('No pool on the board yet.') })
    out.push({ label: 'Workshop', x: t.workshop.door.x, y: t.workshop.door.y, open: () => s.openDrawer('me', 'workshop') })
    out.push({ label: 'Harbor office', x: t.harbor.door.x, y: t.harbor.door.y, open: () => s.openDrawer('rail', 'harbor') })
    const firstVault = [...t.chests.keys()][0]
    out.push({ label: 'Coop hall', x: t.coop.door.x, y: t.coop.door.y, open: firstVault !== undefined ? () => s.openDrawer('vault', firstVault) : me('No vault in the coop yet.') })
    for (const h of t.houses) {
      const owner = h.owner
      if (owner === undefined) continue
      const agent = s.agents.byIdentity[owner]
      out.push({ label: `${agent?.name ?? 'villager'}'s house`, x: h.door.x, y: h.door.y, open: agent !== undefined ? () => s.openDrawer('agent', owner) : me('Nobody answers the door.') })
    }
    for (const c of t.chests.values()) out.push({ label: 'Vault chest', x: c.x, y: c.y + 6, open: () => s.openDrawer('vault', c.vaultId) })
    for (const st of t.stalls) { const op = st.outpoint; if (op !== undefined) out.push({ label: 'Market stall', x: st.front.x, y: st.front.y, open: () => s.openDrawer('listing', op) }) }
    // a keeper whose stall shows a listing opens that listing; otherwise the keeper talks about the vegetables
    t.keepers.forEach((k, i) => {
      const op = t.stalls[i]?.outpoint
      out.push({ label: `${k.label} (stall)`, x: k.x, y: k.y + 8, open: op !== undefined ? () => s.openDrawer('listing', op) : () => { k.emit('pointerup') } })
    })
    for (const v of t.villagers.values()) if (v !== this.villager && v.identity !== 'guard' && !v.decor) out.push({ label: v.label, x: v.x, y: v.y, open: () => t.interact(v) })
    return out
  }

  update (dtMs: number): void {
    if (!this.enabled || this.keys === undefined || this.villager.gone) return
    // typing in a field (the drawer's inputs) must not walk the villager
    if (typing()) { this.villager.stepAnim(0, 0); return }
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

  destroy (): void {
    this.enable(false)
    this.keys?.e?.off('down', this.onE)
    this.hint?.destroy()
    this.villager.player = false
  }
}
