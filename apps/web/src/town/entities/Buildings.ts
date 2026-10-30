import Phaser from 'phaser'
import { makeLabel } from './dom'
import { COLORS } from '../colors'

export class Workshop extends Phaser.GameObjects.Container {
  private smokeTimer?: Phaser.Time.TimerEvent
  readonly sign: Phaser.GameObjects.DOMElement
  constructor (scene: Phaser.Scene, x: number, y: number, product = 'H100 GPU-hour') {
    super(scene, x, y)
    const img = scene.add.image(0, 0, 'atlas', 'workshop_0').setOrigin(0.5, 1)
    this.sign = makeLabel(scene, 0, -50, `Workshop · ${product}`, { size: 6, tone: 'ink' })
    this.add([img, this.sign])
    this.setSize(48, 48)
    this.setInteractive(new Phaser.Geom.Rectangle(-24, -48, 48, 48), Phaser.Geom.Rectangle.Contains)
    scene.add.existing(this)
  }
  get door (): { x: number, y: number } { return { x: this.x + 2, y: this.y + 6 } }
  smoke (on: boolean): void {
    if (!on) { this.smokeTimer?.remove(); this.smokeTimer = undefined; return }
    if (this.smokeTimer !== undefined) return
    this.smokeTimer = this.scene.time.addEvent({ delay: 450, loop: true, callback: () => {
      const puff = this.scene.add.rectangle(this.x - 13, this.y - 46, 3, 3, COLORS.stone).setOrigin(0.5, 1)
      this.scene.tweens.add({ targets: puff, y: this.y - 62, x: this.x - 10 + Phaser.Math.Between(-3, 3), alpha: 0, scale: 2, duration: 1600, onComplete: () => puff.destroy() })
    } })
  }
}

export class House extends Phaser.GameObjects.Container {
  readonly chest: Phaser.GameObjects.Sprite
  readonly window1: Phaser.GameObjects.Rectangle
  readonly window2: Phaser.GameObjects.Rectangle
  private nameLabel: Phaser.GameObjects.DOMElement
  owner?: string
  constructor (scene: Phaser.Scene, x: number, y: number, readonly slot: number) {
    super(scene, x, y)
    const img = scene.add.image(0, 0, 'atlas', `house_${slot % 3}`).setOrigin(0.5, 1)
    this.window1 = scene.add.rectangle(-8, -15, 3, 2, COLORS.lantern).setOrigin(0.5, 1).setVisible(false)
    this.window2 = scene.add.rectangle(7, -15, 3, 2, COLORS.lantern).setOrigin(0.5, 1).setVisible(false)
    this.chest = scene.add.sprite(14, 4, 'atlas', 'chest_0').setOrigin(0.5, 1).setVisible(false)
    this.nameLabel = makeLabel(scene, 0, -34, 'empty house', { size: 6 })
    this.add([img, this.window1, this.window2, this.chest, this.nameLabel])
    this.setSize(32, 32)
    this.setInteractive(new Phaser.Geom.Rectangle(-16, -32, 32, 32), Phaser.Geom.Rectangle.Contains)
    scene.add.existing(this)
  }
  get doorstep (): { x: number, y: number } { return { x: this.x, y: this.y + 10 } }
  setOwner (identity: string | undefined, name?: string): void { this.owner = identity; this.nameLabel.setHTML(name === undefined ? 'empty house' : `${name}'s house`) }
  setNight (on: boolean): void { this.window1.setVisible(on && this.owner !== undefined); this.window2.setVisible(on && this.owner !== undefined) }
  /** A credit chest lands at the door (settlement) or opens (redeem). */
  dropChest (): Promise<void> {
    this.chest.setVisible(true).setFrame('chest_0').setY(-20).setAlpha(0)
    return new Promise(resolve => { this.scene.tweens.add({ targets: this.chest, y: 4, alpha: 1, duration: 500, ease: 'Bounce.Out', onComplete: () => resolve() }) })
  }
  openChest (open: boolean): void { this.chest.setVisible(true).setFrame(open ? 'chest_1' : 'chest_0') }
}

export class Cart extends Phaser.GameObjects.Sprite {
  constructor (scene: Phaser.Scene) {
    super(scene, -60, 0, 'atlas', 'cart_0')
    this.setOrigin(0.5, 1).setVisible(false)
    scene.add.existing(this)
    if (!scene.anims.exists('cart_roll')) scene.anims.create({ key: 'cart_roll', frames: [{ key: 'atlas', frame: 'cart_0' }, { key: 'atlas', frame: 'cart_1' }], frameRate: 6, repeat: -1 })
  }
  ride (fromX: number, toX: number, y: number, ms: number): Promise<void> {
    this.setPosition(fromX, y).setVisible(true).play('cart_roll', true)
    return new Promise(resolve => { this.scene.tweens.add({ targets: this, x: toX, duration: ms, onComplete: () => { this.stop(); this.setVisible(false); resolve() } }) })
  }
}

export class Bell extends Phaser.GameObjects.Sprite {
  constructor (scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y, 'atlas', 'bell_0')
    this.setOrigin(0.5, 1)
    scene.add.existing(this)
    if (!scene.anims.exists('bell_ring')) scene.anims.create({ key: 'bell_ring', frames: [{ key: 'atlas', frame: 'bell_0' }, { key: 'atlas', frame: 'bell_1' }], frameRate: 8, repeat: 5 })
  }
  ring (): Promise<void> { return new Promise(resolve => { this.play('bell_ring', true); this.once('animationcomplete', () => { this.setFrame('bell_0'); resolve() }) }) }
}

export function placeStatic (scene: Phaser.Scene, frame: string, x: number, y: number): Phaser.GameObjects.Image {
  return scene.add.image(x, y, 'atlas', frame).setOrigin(0.5, 1)
}

/** A short parchment banner in the world (settlement summary). */
export function banner (scene: Phaser.Scene, x: number, y: number, html: string, ms: number): Promise<void> {
  const el = makeLabel(scene, x, y, html, { size: 7, tone: 'parchment', maxWidth: 220 })
  el.setDepth(1000)
  return new Promise(resolve => { scene.time.delayedCall(ms, () => { el.destroy(); resolve() }) })
}
