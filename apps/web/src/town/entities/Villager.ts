import Phaser from 'phaser'
import { makeLabel } from './dom'

export type Profile = 'finetune' | 'eval' | 'inference' | 'visitor'
const SPEED = 80 // px/s in world units

export class Villager extends Phaser.GameObjects.Container {
  readonly sprite: Phaser.GameObjects.Sprite
  readonly purse: Phaser.GameObjects.Sprite
  private nameLabel: Phaser.GameObjects.DOMElement
  private bubble?: Phaser.GameObjects.DOMElement
  private bubbleTimer?: Phaser.Time.TimerEvent
  private walkTween?: Phaser.Tweens.Tween
  private walkResolve?: () => void
  private wanderTimer?: Phaser.Time.TimerEvent
  home: { x: number, y: number }
  busy = false
  slotIndex = 0
  purseReserved = false

  constructor (scene: Phaser.Scene, readonly identity: string, readonly profile: Profile, readonly label: string, x: number, y: number) {
    super(scene, x, y)
    this.home = { x, y }
    const key = `villager_${profile}`
    this.sprite = scene.add.sprite(0, 0, 'atlas', `${key}_0`).setOrigin(0.5, 1)
    this.purse = scene.add.sprite(7, -20, 'atlas', 'coin_0').setOrigin(0.5, 1).setVisible(false)
    this.nameLabel = makeLabel(scene, 0, -26, label, { size: 6 })
    this.add([this.sprite, this.purse, this.nameLabel])
    this.setSize(16, 24)
    this.setInteractive(new Phaser.Geom.Rectangle(-8, -24, 16, 24), Phaser.Geom.Rectangle.Contains)
    scene.add.existing(this)
    this.ensureAnims()
    this.scheduleWander()
  }

  private ensureAnims (): void {
    const key = `villager_${this.profile}`
    if (!this.scene.anims.exists(`${key}_walk`)) {
      this.scene.anims.create({ key: `${key}_walk`, frames: [{ key: 'atlas', frame: `${key}_1` }, { key: 'atlas', frame: `${key}_2` }], frameRate: 6, repeat: -1 })
    }
  }

  face (dx: number): void { this.sprite.setFlipX(dx < 0) }

  /** Walk to (x, y); a new walkTo cancels the previous one (interruptible). Resolves on arrival or cancel. */
  walkTo (x: number, y: number): Promise<void> {
    this.cancelWalk()
    const dist = Phaser.Math.Distance.Between(this.x, this.y, x, y)
    this.face(x - this.x)
    this.sprite.play(`villager_${this.profile}_walk`, true)
    return new Promise<void>(resolve => {
      this.walkResolve = resolve
      this.walkTween = this.scene.tweens.add({
        targets: this, x, y, duration: Math.max(120, (dist / SPEED) * 1000) / (this.scene.registry.get('speed') as number ?? 1),
        onComplete: () => { this.stopWalk(); resolve() }
      })
    })
  }

  private cancelWalk (): void { this.walkTween?.stop(); this.walkTween = undefined; this.walkResolve?.(); this.walkResolve = undefined; this.sprite.stop(); this.sprite.setFrame(`villager_${this.profile}_0`) }
  private stopWalk (): void { this.walkTween = undefined; this.walkResolve = undefined; this.sprite.stop(); this.sprite.setFrame(`villager_${this.profile}_0`) }

  goHome (): Promise<void> { return this.walkTo(this.home.x, this.home.y) }

  /** Idle wandering around home while not busy. */
  private scheduleWander (): void {
    this.wanderTimer = this.scene.time.addEvent({
      delay: Phaser.Math.Between(2500, 6000), loop: true,
      callback: () => {
        if (this.busy || this.walkTween !== undefined) return
        const x = this.home.x + Phaser.Math.Between(-28, 28)
        const y = this.home.y + Phaser.Math.Between(-10, 18)
        void this.walkTo(x, y)
      }
    })
  }

  say (text: string, tone: 'parchment' | 'danger' | 'gold' | 'grass' = 'parchment', ms = 4000): void {
    this.bubble?.destroy()
    this.bubbleTimer?.remove()
    this.bubble = makeLabel(this.scene, 0, -32, text, { tone, size: 6, font: 'body', maxWidth: 110 })
    this.add(this.bubble)
    this.bubbleTimer = this.scene.time.delayedCall(ms / ((this.scene.registry.get('speed') as number) ?? 1), () => { this.bubble?.destroy(); this.bubble = undefined })
  }

  /** Purse: visible and glowing while a pledge is reserved (the sats never left the wallet). */
  setPurse (state: 'hidden' | 'idle' | 'reserved'): void {
    this.purseReserved = state === 'reserved'
    this.purse.setVisible(state !== 'hidden')
    this.scene.tweens.killTweensOf(this.purse)
    this.purse.setAlpha(1).setScale(1)
    if (state === 'reserved') this.scene.tweens.add({ targets: this.purse, alpha: 0.35, scale: 1.3, duration: 500, yoyo: true, repeat: -1 })
  }

  /** The "I verified and signed" tick during a signing round. */
  check (): void { this.say('✓ verified, signed', 'grass', 1800) }

  destroy (fromScene?: boolean): void { this.wanderTimer?.remove(); this.bubbleTimer?.remove(); super.destroy(fromScene) }
}
