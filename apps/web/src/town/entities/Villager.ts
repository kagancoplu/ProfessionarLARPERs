import Phaser from 'phaser'
import { makeLabel, type LabelShape } from './dom'
import { findPath } from '../map/path'
import { ICONS } from '../../ui/icons.generated'

export type Profile = 'finetune' | 'eval' | 'inference' | 'visitor'
export type Facing = 'down' | 'side' | 'up'
const SPEED = 56 // px/s in world units
/** chars.json (tools/packs/chars.mjs): 8 premade NPCs + 12 modular villagers; 'you' is villager_00 */
/** handed out to agents in arrival order (bruno is the guard; chloe, buba, fin and jack keep the stalls) */
export const CHARS = ['bob', 'katy', 'mike', 'villager_01', 'villager_02', 'villager_03', 'villager_04', 'villager_05', 'villager_06', 'villager_07', 'villager_08', 'villager_09', 'villager_10', 'villager_11']
export const ANIMS = ['idle_down', 'idle_side', 'idle_up', 'walk_down', 'walk_side', 'walk_up'] as const

export function ensureCharAnims (scene: Phaser.Scene, char: string): void {
  for (const a of ANIMS) {
    const key = `${char}_${a}`
    if (scene.anims.exists(key)) continue
    scene.anims.create({ key, frames: scene.anims.generateFrameNames('chars', { prefix: `${key}_`, start: 0, end: 5 }), frameRate: a.startsWith('walk') ? 10 : 5, repeat: -1 })
  }
}

/** Origin y so that the feet (bottom of the trimmed idle frame) sit on the sprite's y. */
export function feetOrigin (scene: Phaser.Scene, char: string): number {
  const f = scene.textures.getFrame('chars', `${char}_idle_down_0`)
  if (f === undefined) return 0.78
  return Math.min(0.95, (f.y + f.cutHeight) / f.realHeight)
}

export class Villager extends Phaser.GameObjects.Container {
  readonly sprite: Phaser.GameObjects.Sprite
  readonly purse: Phaser.GameObjects.Sprite
  private nameLabel: Phaser.GameObjects.DOMElement
  private bubble?: Phaser.GameObjects.DOMElement
  private bubbleTimer?: Phaser.Time.TimerEvent
  private walkTween?: Phaser.Tweens.Tween
  private walkResolve?: () => void
  private wanderTimer?: Phaser.Time.TimerEvent
  private facing: Facing = 'down'
  home: { x: number, y: number }
  busy = false
  /** controlled by the keyboard (avatar mode): no wandering, no story walks */
  player = false
  /** scenery (stall keepers): not an agent, never opens an agent drawer */
  decor = false
  /** where an idle walk may go besides home (set by the scene: square, market, board) */
  wanderSpots: Array<{ x: number, y: number, say?: () => string | undefined }> = []
  slotIndex = 0
  purseReserved = false

  constructor (scene: Phaser.Scene, readonly identity: string, readonly profile: Profile, readonly label: string, x: number, y: number, readonly char: string) {
    super(scene, x, y)
    this.home = { x, y }
    ensureCharAnims(scene, char)
    this.sprite = scene.add.sprite(0, 0, 'chars', `${char}_idle_down_0`).setOrigin(0.5, feetOrigin(scene, char))
    this.purse = scene.add.sprite(9, -30, 'icons', ICONS.sack).setOrigin(0.5, 1).setVisible(false)
    this.nameLabel = makeLabel(scene, 0, -34, label, { size: 6 })
    this.add([this.sprite, this.purse, this.nameLabel])
    this.setSize(16, 28)
    this.setInteractive(new Phaser.Geom.Rectangle(-8, -28, 16, 28), Phaser.Geom.Rectangle.Contains)
    scene.add.existing(this)
    this.setDepth(y)
    this.idle()
    this.scheduleWander()
  }

  private idle (): void { this.sprite.play(`${this.char}_idle_${this.facing}`, true) }

  face (dx: number, dy: number): void {
    if (Math.abs(dx) >= Math.abs(dy)) { this.facing = 'side'; this.sprite.setFlipX(dx < 0) } else this.facing = dy < 0 ? 'up' : 'down'
  }

  /** Walk to (x, y) around houses and water (A* on the collision map, roads preferred); a new walkTo cancels
   *  the previous one (interruptible). Resolves on arrival or cancel. `pace` multiplies the walking speed (film mode). */
  walkTo (x: number, y: number, opts: { exact?: boolean, pace?: number } = {}): Promise<void> {
    if (this.player) return Promise.resolve()
    this.cancelWalk()
    const legs = findPath({ x: this.x, y: this.y }, { x, y })
    // `exact`: step the last bit onto a blocked spot on purpose (behind a stall's counter)
    const last = legs[legs.length - 1]
    if (opts.exact === true && (last === undefined || last.x !== x || last.y !== y)) legs.push({ x, y })
    return new Promise<void>(resolve => {
      this.walkResolve = resolve
      const next = (i: number): void => {
        const leg = legs[i]
        if (leg === undefined) { this.stopWalk(); resolve(); return }
        const dist = Phaser.Math.Distance.Between(this.x, this.y, leg.x, leg.y)
        this.face(leg.x - this.x, leg.y - this.y)
        this.sprite.play(`${this.char}_walk_${this.facing}`, true)
        this.walkTween = this.scene.tweens.add({
          targets: this, x: leg.x, y: leg.y, duration: Math.max(60, (dist / (SPEED * (opts.pace ?? 1))) * 1000) / ((this.scene.registry.get('speed') as number) ?? 1),
          onUpdate: () => { this.setDepth(this.y) },
          onComplete: () => { next(i + 1) }
        })
      }
      next(0)
    })
  }

  private cancelWalk (): void { this.walkTween?.stop(); this.walkTween = undefined; this.walkResolve?.(); this.walkResolve = undefined; this.idle() }
  private stopWalk (): void { this.walkTween = undefined; this.walkResolve = undefined; this.idle() }

  goHome (): Promise<void> { return this.walkTo(this.home.x, this.home.y) }

  /** Idle wandering around home while not busy. */
  private scheduleWander (): void {
    this.wanderTimer = this.scene.time.addEvent({
      delay: Phaser.Math.Between(2500, 6000), loop: true,
      callback: () => {
        if (this.busy || this.player || this.walkTween !== undefined) return
        if (Phaser.Math.Between(0, 2) === 0) { this.facing = (['down', 'side', 'up'] as const)[Phaser.Math.Between(0, 2)]!; this.sprite.setFlipX(Math.random() < 0.5); this.idle(); return }
        // half the time around home, otherwise somewhere in the village (the square, a stall, the board)
        const spot = Math.random() < 0.5 || this.wanderSpots.length === 0 ? undefined : this.wanderSpots[Phaser.Math.Between(0, this.wanderSpots.length - 1)]!
        if (spot === undefined) { void this.walkTo(this.home.x + Phaser.Math.Between(-28, 28), this.home.y + Phaser.Math.Between(-8, 14)); return }
        void this.walkTo(spot.x + Phaser.Math.Between(-6, 6), spot.y + Phaser.Math.Between(-2, 4)).then(() => {
          const line = spot.say?.()
          if (line !== undefined && !this.busy) this.say(line, 'parchment', 2600)
          this.facing = 'up'; this.idle()
        })
      }
    })
  }

  /** keyboard movement: play walk/idle for the direction the player pushes */
  stepAnim (dx: number, dy: number): void {
    if (dx === 0 && dy === 0) { if (this.sprite.anims.currentAnim?.key.includes('walk') === true) this.idle(); return }
    this.face(dx, dy)
    const key = `${this.char}_walk_${this.facing}`
    if (this.sprite.anims.currentAnim?.key !== key) this.sprite.play(key, true)
  }

  /** hide the name tag (a keeper steps back while an agent sells at its stall) */
  showName (on: boolean): void { this.nameLabel.setVisible(on) }
  /** where a bubble sits so it clears the name tag (world px above the feet) */
  get headTop (): number { return this.nameLabel.visible ? -34 - this.nameLabel.height - 3 : -32 }
  /** name tag font size in world px (film mode keeps it readable at every zoom) */
  setNameSize (px: number): void { (this.nameLabel.node as HTMLElement).style.fontSize = `${px}px`; this.nameLabel.updateSize() }

  /** `style` (film mode): bubble shape, size and height in world px; the default is the square label at -40 */
  say (text: string, tone: 'parchment' | 'danger' | 'gold' | 'grass' = 'parchment', ms = 4000, style: { shape?: LabelShape, size?: number, maxWidth?: number, y?: number } = {}): void {
    this.bubble?.destroy()
    this.bubbleTimer?.remove()
    this.bubble = makeLabel(this.scene, 0, style.y ?? -40, text, { tone, size: style.size ?? 6, font: 'body', maxWidth: style.maxWidth ?? 110, shape: style.shape })
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
