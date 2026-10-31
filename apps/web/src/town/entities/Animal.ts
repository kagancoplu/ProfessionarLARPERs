/** Farm animals and ducks (Kenmi, 32×32): wander inside an area, face the way they walk, y-sorted. */
import Phaser from 'phaser'
import type { AnimalSpawn } from '../map/places'
import { TILE } from '../map/terrain'

const SPEED = 18

export class Animal extends Phaser.GameObjects.Sprite {
  private readonly area: { x0: number, y0: number, x1: number, y1: number }
  private readonly idleKey: string
  private readonly walkKey: string
  private timer?: Phaser.Time.TimerEvent
  private walking?: Phaser.Tweens.Tween

  constructor (scene: Phaser.Scene, spawn: AnimalSpawn) {
    super(scene, spawn.x * TILE, spawn.y * TILE, 'chars', `${spawn.char}_${spawn.swim === true ? 'swim_idle' : 'idle'}_0`)
    this.area = { x0: spawn.area.x * TILE, y0: spawn.area.y * TILE, x1: (spawn.area.x + spawn.area.w) * TILE, y1: (spawn.area.y + spawn.area.h) * TILE }
    this.idleKey = this.anim(spawn.char, spawn.swim === true ? 'swim_idle' : 'idle', 3)
    this.walkKey = this.anim(spawn.char, spawn.swim === true ? 'swim' : 'walk', spawn.swim === true ? 5 : 8)
    this.setOrigin(0.5, 0.8).setDepth(this.y)
    scene.add.existing(this)
    this.play(this.idleKey)
    this.timer = scene.time.addEvent({ delay: Phaser.Math.Between(1500, 5000), loop: true, callback: () => this.wander() })
    this.once('destroy', () => { this.timer?.remove(); this.walking?.stop() })
  }

  private anim (char: string, name: string, fps: number): string {
    const key = `${char}_${name}`
    // as many frames as the atlas has for this animation (ducks, swans and cows differ)
    let frames = 0
    while (this.scene.textures.get('chars').has(`${key}_${frames}`)) frames++
    if (!this.scene.anims.exists(key)) this.scene.anims.create({ key, frames: this.scene.anims.generateFrameNames('chars', { prefix: `${key}_`, start: 0, end: Math.max(0, frames - 1) }), frameRate: fps, repeat: -1 })
    return key
  }

  private wander (): void {
    if (this.walking !== undefined || Phaser.Math.Between(0, 2) === 0) return
    const x = Phaser.Math.Between(this.area.x0, this.area.x1), y = Phaser.Math.Between(this.area.y0, this.area.y1)
    const dist = Phaser.Math.Distance.Between(this.x, this.y, x, y)
    if (dist < 4) return
    this.setFlipX(x < this.x)
    this.play(this.walkKey, true)
    this.walking = this.scene.tweens.add({
      targets: this, x, y, duration: (dist / SPEED) * 1000,
      onUpdate: () => { this.setDepth(this.y) },
      onComplete: () => { this.walking = undefined; this.play(this.idleKey, true) }
    })
  }
}
