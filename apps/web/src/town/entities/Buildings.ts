/** Buildings and props from the Kenmi atlas (public/game/town.json). Origin (0.5, 1), depth = y. */
import Phaser from 'phaser'
import { makeLabel } from './dom'
import { DEPTH } from '../game'

export function ensureAnim (scene: Phaser.Scene, prefix: string, frames: number, fps: number): string {
  const key = `anim_${prefix}`
  if (!scene.anims.exists(key)) scene.anims.create({ key, frames: scene.anims.generateFrameNames('town', { prefix: `${prefix}_`, start: 0, end: frames - 1 }), frameRate: fps, repeat: -1 })
  return key
}

export function placeStatic (scene: Phaser.Scene, frame: string, x: number, y: number): Phaser.GameObjects.Image {
  return scene.add.image(x, y, 'town', frame).setOrigin(0.5, 1).setDepth(y)
}

export function placeAnimated (scene: Phaser.Scene, prefix: string, frames: number, fps: number, x: number, y: number, offset = 0): Phaser.GameObjects.Sprite {
  const s = scene.add.sprite(x, y, 'town', `${prefix}_0`).setOrigin(0.5, 1).setDepth(y)
  s.play({ key: ensureAnim(scene, prefix, frames, fps), startFrame: offset % frames })
  return s
}

/** A labelled building: image + sign; `door` is where villagers stand (world px). */
export class Building extends Phaser.GameObjects.Container {
  readonly img: Phaser.GameObjects.Image
  readonly sign: Phaser.GameObjects.DOMElement
  constructor (scene: Phaser.Scene, x: number, y: number, frame: string, label: string, readonly door: { x: number, y: number }) {
    super(scene, x, y)
    this.img = scene.add.image(0, 0, 'town', frame).setOrigin(0.5, 1)
    this.sign = makeLabel(scene, 0, -this.img.height - 4, label, { size: 6, tone: 'ink' })
    this.add([this.img, this.sign])
    this.setSize(this.img.width, this.img.height)
    this.setInteractive(new Phaser.Geom.Rectangle(-this.img.width / 2, -this.img.height, this.img.width, this.img.height), Phaser.Geom.Rectangle.Contains)
    this.setDepth(y)
    scene.add.existing(this)
  }
}

export class Workshop extends Building {
  private smokeSprite?: Phaser.GameObjects.Sprite
  constructor (scene: Phaser.Scene, x: number, y: number, frame: string, door: { x: number, y: number }, product = 'H100 GPU-hour') {
    super(scene, x, y, frame, `Workshop · ${product}`, door)
  }
  smoke (on: boolean): void {
    if (!on) { this.smokeSprite?.destroy(); this.smokeSprite = undefined; return }
    if (this.smokeSprite !== undefined) return
    // the forge chimney is on the left third of the blacksmith's roof
    this.smokeSprite = this.scene.add.sprite(this.x - this.img.width * 0.19, this.y - this.img.height + 4, 'town', 'smoke_0').setOrigin(0.5, 1).setDepth(this.y + 1).setAlpha(0.9)
    this.smokeSprite.play(ensureAnim(this.scene, 'smoke', 5, 6))
  }
}

export class House extends Building {
  readonly chest: Phaser.GameObjects.Sprite
  readonly glow: Phaser.GameObjects.Image
  owner?: string
  constructor (scene: Phaser.Scene, x: number, y: number, frame: string, readonly slot: number) {
    super(scene, x, y, frame, 'empty house', { x, y: y + 12 })
    this.chest = scene.add.sprite(this.img.width / 2 - 6, 2, 'town', 'chest_gold_0').setOrigin(0.5, 1).setVisible(false)
    this.add(this.chest)
    // warm window light at night (additive glow over the door and the ground floor)
    this.glow = scene.add.image(x, y - this.img.height * 0.22, 'glow').setScale(1.1, 0.7).setTint(0xffb347).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0).setDepth(DEPTH.lights)
  }
  get doorstep (): { x: number, y: number } { return this.door }
  setOwner (identity: string | undefined, name?: string): void { this.owner = identity; this.sign.setHTML(name === undefined ? 'empty house' : `${name}'s house`) }
  setNight (on: boolean): void { this.glow.setAlpha(on && this.owner !== undefined ? 0.55 : 0) }
  /** A credit chest lands at the door (settlement) or opens (redeem). */
  dropChest (): Promise<void> {
    this.chest.setVisible(true).setFrame('chest_gold_0').setY(-24).setAlpha(0)
    return new Promise(resolve => { this.scene.tweens.add({ targets: this.chest, y: 2, alpha: 1, duration: 500, ease: 'Bounce.Out', onComplete: () => resolve() }) })
  }
  openChest (open: boolean): void { this.chest.setVisible(true).setFrame(open ? 'chest_gold_5' : 'chest_gold_0') }
  destroy (fromScene?: boolean): void { this.glow.destroy(); super.destroy(fromScene) }
}

/** The settlement rides through the square on a horse (Kenmi's mount): one transaction, one trip. */
export class Cart extends Phaser.GameObjects.Sprite {
  constructor (scene: Phaser.Scene) {
    super(scene, -60, 0, 'chars', 'horse_walk_side_0')
    this.setOrigin(0.5, 0.8).setVisible(false)
    scene.add.existing(this)
    if (!scene.anims.exists('horse_walk_side')) scene.anims.create({ key: 'horse_walk_side', frames: scene.anims.generateFrameNames('chars', { prefix: 'horse_walk_side_', start: 0, end: 5 }), frameRate: 10, repeat: -1 })
  }
  ride (fromX: number, toX: number, y: number, ms: number): Promise<void> {
    this.setPosition(fromX, y).setVisible(true).setFlipX(toX < fromX).setDepth(y).play('horse_walk_side', true)
    return new Promise(resolve => { this.scene.tweens.add({ targets: this, x: toX, duration: ms, onComplete: () => { this.stop(); this.setVisible(false); resolve() } }) })
  }
}

/** The square's fountain stands in for the bell: it sparkles when a settlement lands. */
export class Bell extends Phaser.GameObjects.Sprite {
  constructor (scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y, 'town', 'fountain_0')
    this.setOrigin(0.5, 1).setDepth(y)
    scene.add.existing(this)
    this.play(ensureAnim(scene, 'fountain', 8, 8))
  }
  ring (): Promise<void> {
    return new Promise(resolve => {
      this.scene.tweens.add({ targets: this, scaleX: 1.15, scaleY: 1.15, duration: 120, yoyo: true, repeat: 3, onComplete: () => { this.setScale(1); resolve() } })
    })
  }
}

/** A market stall: empty, or showing a listing (crate + price label). */
export class Stall extends Phaser.GameObjects.Container {
  readonly img: Phaser.GameObjects.Image
  readonly crate: Phaser.GameObjects.Image
  private label: Phaser.GameObjects.DOMElement
  outpoint?: string
  constructor (scene: Phaser.Scene, x: number, y: number, frame: string, readonly slot: number) {
    super(scene, x, y)
    this.img = scene.add.image(0, 0, 'town', frame).setOrigin(0.5, 1)
    this.crate = scene.add.image(0, -6, 'town', 'chest_0').setOrigin(0.5, 1).setVisible(false)
    this.label = makeLabel(scene, 0, -52, '', { size: 6, tone: 'gold' })
    this.label.setVisible(false)
    this.add([this.img, this.crate, this.label])
    this.setSize(48, 48)
    this.setInteractive(new Phaser.Geom.Rectangle(-24, -48, 48, 48), Phaser.Geom.Rectangle.Contains)
    this.setDepth(y)
    scene.add.existing(this)
  }
  get front (): { x: number, y: number } { return { x: this.x, y: this.y + 10 } }
  show (outpoint: string, credits: string, askSats: string): void {
    this.outpoint = outpoint
    this.crate.setVisible(true)
    this.label.setHTML(`${credits} credits · ${Number(askSats).toLocaleString('en-GB').replace(/,/g, ' ')} sat`).setVisible(true)
  }
  clear (): void { this.outpoint = undefined; this.crate.setVisible(false); this.label.setVisible(false) }
}

/** A short parchment banner in the world (settlement summary). */
export function banner (scene: Phaser.Scene, x: number, y: number, html: string, ms: number): Promise<void> {
  const el = makeLabel(scene, x, y, html, { size: 7, tone: 'parchment', maxWidth: 220 })
  el.setDepth(DEPTH.banner)
  return new Promise(resolve => { scene.time.delayedCall(ms, () => { el.destroy(); resolve() }) })
}
