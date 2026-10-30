/**
 * The guard at the village gate (Kenmi NPC "bruno" with the shield icon). Nods on an approved co-sign,
 * raises "!" and walks to the agent on a refusal. The stranger is the prompt injection: walks in from the
 * map edge, whispers to the agent, runs away when the guard steps in.
 */
import Phaser from 'phaser'
import { makeLabel } from './dom'
import { Villager } from './Villager'

export class Guard extends Villager {
  readonly post: { x: number, y: number }
  constructor (scene: Phaser.Scene, x: number, y: number) {
    super(scene, 'guard', 'visitor', 'guard', x, y, 'bruno')
    this.post = { x, y }
    this.home = { x, y }
    const badge = scene.add.image(0, -36, 'town', 'icon_other_0').setOrigin(0.5, 1).setVisible(false)
    this.add(badge)
    this.badge = scene.add.image(-9, -30, 'town', 'icon_other_0').setOrigin(0.5, 1).setVisible(false)
    this.add(this.badge)
  }

  private badge: Phaser.GameObjects.Image

  /** "✓ within policy": a short nod at the post. */
  approve (sats?: number): void {
    this.say(`✓ within policy${sats !== undefined ? ` · ${sats} sat` : ''}`, 'grass', 2200)
    this.scene.tweens.add({ targets: this.sprite, y: 2, duration: 90, yoyo: true, repeat: 2 })
  }

  /** 403: "!" and walk to the agent, say the reason, go back to the post. */
  async refuse (target: { x: number, y: number } | undefined, reason: string, speed: number): Promise<void> {
    this.busy = true
    try {
      this.say('!', 'danger', 1200)
      if (target !== undefined) await this.walkTo(target.x + 18, target.y + 4)
      this.say(`Refused: ${reason}`, 'danger', 4200)
      await new Promise(r => this.scene.time.delayedCall(1600 / speed, r))
    } finally {
      this.busy = false
      void this.goHome()
    }
  }
}

/** The suspicious stranger: appears for one injection, then leaves the map. */
export class Stranger extends Villager {
  constructor (scene: Phaser.Scene, x: number, y: number) {
    super(scene, `stranger-${Date.now()}`, 'visitor', 'stranger', x, y, 'villager_11')
    this.sprite.setTint(0x9a8fb0)
  }

  async whisper (target: { x: number, y: number }, text: string, speed: number): Promise<void> {
    this.busy = true
    await this.walkTo(target.x - 16, target.y + 2)
    this.say(`psst… “${text}”`, 'danger', 4500)
    await new Promise(r => this.scene.time.delayedCall(2600 / speed, r))
  }

  async flee (toX: number, toY: number): Promise<void> {
    this.say('…', 'parchment', 800)
    await this.walkTo(toX, toY)
    this.destroy()
  }
}

/** A gold chest in front of a house: the agent's vault. */
export class VaultChest extends Phaser.GameObjects.Container {
  readonly chest: Phaser.GameObjects.Sprite
  private label: Phaser.GameObjects.DOMElement
  constructor (scene: Phaser.Scene, x: number, y: number, readonly vaultId: string) {
    super(scene, x, y)
    this.chest = scene.add.sprite(0, 0, 'town', 'chest_gold_0').setOrigin(0.5, 1)
    this.label = makeLabel(scene, 0, -18, 'vault', { size: 6, tone: 'gold' })
    this.add([this.chest, this.label])
    this.setSize(16, 16)
    this.setInteractive(new Phaser.Geom.Rectangle(-8, -16, 16, 16), Phaser.Geom.Rectangle.Contains)
    this.setDepth(y)
    scene.add.existing(this)
  }
  setBalance (sats: number): void { this.label.setHTML(`vault · ${sats.toLocaleString('en-GB').replace(/,/g, ' ')} sat`); this.chest.setFrame(sats > 0 ? 'chest_gold_0' : 'chest_gold_5') }
  /** the owner withdrew: the chest opens and the gold leaves */
  open (): void {
    this.chest.setFrame('chest_gold_5')
    const coin = this.scene.add.image(this.x, this.y - 10, 'town', 'icon_res_12').setOrigin(0.5, 1).setDepth(this.y + 1)
    this.scene.tweens.add({ targets: coin, y: this.y - 60, alpha: 0, duration: 900, onComplete: () => coin.destroy() })
  }
}
