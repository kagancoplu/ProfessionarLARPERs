import Phaser from 'phaser'
import type { PoolEntry } from '../../store/types'
import { blocksToHuman } from '../../api/arcade'
import { formatInt } from '../../ui/Counter'
import { makeLabel } from './dom'

/** The notice board with its sack: one active pool at a time (the newest open/locking pool). */
export class Board extends Phaser.GameObjects.Container {
  readonly board: Phaser.GameObjects.Image
  readonly sack: Phaser.GameObjects.Image
  readonly hourglass: Phaser.GameObjects.Sprite
  private label: Phaser.GameObjects.DOMElement
  poolId?: string

  constructor (scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y)
    this.board = scene.add.image(0, 0, 'atlas', 'board_0').setOrigin(0.5, 1)
    this.sack = scene.add.image(14, 2, 'atlas', 'sack_0').setOrigin(0.5, 1)
    this.hourglass = scene.add.sprite(0, -34, 'atlas', 'hourglass_0').setOrigin(0.5, 1).setVisible(false)
    this.label = makeLabel(scene, 0, -36, 'No pool on the board', { size: 6 })
    this.add([this.board, this.sack, this.hourglass, this.label])
    this.setSize(32, 32)
    this.setInteractive(new Phaser.Geom.Rectangle(-16, -32, 32, 32), Phaser.Geom.Rectangle.Contains)
    scene.add.existing(this)
    if (!scene.anims.exists('hourglass_turn')) scene.anims.create({ key: 'hourglass_turn', frames: [{ key: 'atlas', frame: 'hourglass_0' }, { key: 'atlas', frame: 'hourglass_1' }], frameRate: 2, repeat: -1 })
  }

  /** Where villagers stand to pledge. */
  get approach (): { x: number, y: number } { return { x: this.x - 4, y: this.y + 12 } }

  setPool (pool: PoolEntry | undefined, height?: number): void {
    this.poolId = pool?.poolId
    this.scene.tweens.killTweensOf(this.board)
    this.board.setAlpha(1).setY(0)
    if (pool === undefined) { this.label.setHTML('No pool on the board'); this.sack.setFrame('sack_0'); this.hourglass.setVisible(false); return }
    const target = Number(pool.terms.credits)
    const pledged = Number(pool.pledgedCredits)
    const ratio = target > 0 ? Math.min(1, pledged / target) : 0
    this.sack.setFrame(`sack_${Math.round(ratio * 4)}`)
    const h = height ?? pool.height
    const left = h !== undefined ? Number(pool.terms.deadlineHeight) - h : undefined
    const when = pool.status === 'settled' ? 'settled' : pool.status === 'failed' ? 'did not fill' : pool.status === 'locking' ? 'signing round' : left !== undefined ? `Festival in ${blocksToHuman(left)}` : 'open'
    this.label.setHTML(`${pool.terms.label}<br>${formatInt(pledged)}/${formatInt(target)} credits · ${when}`)
    this.hourglass.setVisible(pool.status === 'locking')
    if (pool.status === 'locking') this.hourglass.play('hourglass_turn', true)
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
