import Phaser from 'phaser'
import type { PoolEntry } from '../../store/types'
import { blocksToHuman } from '../../api/arcade'
import { formatInt } from '../../ui/Counter'
import { makeLabel } from './dom'
import { ensureAnim } from './Buildings'

/** The notice board (a hanging sign post) with a chest that fills as pledges arrive; one active pool at a time. */
export class Board extends Phaser.GameObjects.Container {
  readonly board: Phaser.GameObjects.Image
  readonly sack: Phaser.GameObjects.Sprite
  readonly hourglass: Phaser.GameObjects.Sprite
  private label: Phaser.GameObjects.DOMElement
  poolId?: string

  constructor (scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y)
    this.board = scene.add.image(0, 0, 'town', 'sign_post_0').setOrigin(0.5, 1)
    this.sack = scene.add.sprite(14, 0, 'town', 'chest_gold_0').setOrigin(0.5, 1)
    // a lit lantern on the post during the signing round
    this.hourglass = scene.add.sprite(-14, 0, 'town', 'lantern_0').setOrigin(0.5, 1).setVisible(false)
    this.label = makeLabel(scene, 0, -52, 'No pool on the board', { size: 6 })
    this.add([this.board, this.sack, this.hourglass, this.label])
    this.setSize(32, 48)
    this.setInteractive(new Phaser.Geom.Rectangle(-16, -48, 32, 48), Phaser.Geom.Rectangle.Contains)
    this.setDepth(y)
    scene.add.existing(this)
    ensureAnim(scene, 'lantern', 6, 6)
  }

  /** Where villagers stand to pledge. */
  get approach (): { x: number, y: number } { return { x: this.x, y: this.y + 14 } }

  setPool (pool: PoolEntry | undefined, height?: number): void {
    this.poolId = pool?.poolId
    this.scene.tweens.killTweensOf(this.board)
    this.board.setAlpha(1).setY(0)
    if (pool === undefined) { this.label.setHTML('No pool on the board'); this.sack.setFrame('chest_gold_0'); this.hourglass.setVisible(false); return }
    const target = Number(pool.terms.credits)
    const pledged = Number(pool.pledgedCredits)
    const ratio = target > 0 ? Math.min(1, pledged / target) : 0
    this.sack.setFrame(`chest_gold_${Math.round(ratio * 5)}`)
    const h = height ?? pool.height
    const left = h !== undefined ? Number(pool.terms.deadlineHeight) - h : undefined
    const when = pool.status === 'settled' ? 'settled' : pool.status === 'failed' ? 'did not fill' : pool.status === 'locking' ? 'signing round' : left !== undefined ? `Festival in ${blocksToHuman(left)}` : 'open'
    this.label.setHTML(`${pool.terms.label}<br>${formatInt(pledged)}/${formatInt(target)} credits · ${when}`)
    this.hourglass.setVisible(pool.status === 'locking')
    if (pool.status === 'locking') this.hourglass.play('anim_lantern', true)
    if (pool.status === 'failed') this.fade()
  }

  flyCredits (text: string): void {
    const t = makeLabel(this.scene, 10, -6, text, { tone: 'gold', size: 7 })
    this.add(t)
    this.scene.tweens.add({ targets: t, y: -30, alpha: 0, duration: 1400 / ((this.scene.registry.get('speed') as number) ?? 1), onComplete: () => t.destroy() })
  }

  fade (): void { this.scene.tweens.add({ targets: this.board, alpha: 0.45, y: 2, duration: 900 }) }
  shine (): void { this.scene.tweens.add({ targets: this.board, alpha: 0.6, duration: 150, yoyo: true, repeat: 3 }) }
}
