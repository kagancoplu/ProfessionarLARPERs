/**
 * The Town (track-E §5): a Phaser scene that reads the store through bridge.ts and never fetches.
 * 16 px tiles, 3× scale (zoom), DOM labels for crisp text.
 */
import Phaser from 'phaser'
import type { AppStoreApi } from '../../store'
import type { EventBus } from '../../events/bus'
import { Bell, Cart, House, Workshop, placeStatic } from '../entities/Buildings'
import { Board } from '../entities/Board'
import { Villager, type Profile } from '../entities/Villager'
import { FxQueue } from '../fx/queue'
import { BOARD, GATE, HOUSES, POINTS, STALL, WORKSHOP } from '../layout'
import { buildGround, MAP_H, MAP_W, SQUARE } from '../map/ground'
import { attachBridge } from '../bridge'
import { COLORS } from '../colors'

export interface TownDeps { store: AppStoreApi, bus: EventBus, fx: FxQueue }

export class TownScene extends Phaser.Scene {
  readonly villagers = new Map<string, Villager>()
  /** pledge walks in flight; settlement / lock-in wait for them */
  readonly inFlight = new Set<Promise<void>>()
  readonly houses: House[] = []
  board!: Board
  workshop!: Workshop
  cart!: Cart
  bell!: Bell
  private night!: Phaser.GameObjects.Rectangle
  private detach?: () => void
  private dragStart?: { x: number, y: number, sx: number, sy: number }

  constructor (private readonly deps: TownDeps) { super('town') }

  get fx (): FxQueue { return this.deps.fx }
  /** false once the scene (or the game) is torn down; the bridge checks it before touching entities */
  get alive (): boolean { return this.sys !== undefined && this.sys.settings !== undefined && this.scene !== undefined && this.sys.isActive() }
  get squareCentre (): { x: number, y: number } { const p = POINTS['square-centre']; return p !== undefined ? { x: p.x, y: p.y } : { x: ((SQUARE.x0 + SQUARE.x1) / 2) * 16, y: ((SQUARE.y0 + SQUARE.y1) / 2) * 16 } }

  preload (): void {
    this.load.atlas('atlas', '/game/atlas.png', '/game/atlas.json')
    this.load.image('ground', '/game/ground.png')
  }

  create (): void {
    this.registry.set('speed', this.deps.fx.speed)
    const map = this.make.tilemap({ data: buildGround(), tileWidth: 16, tileHeight: 16 })
    const tiles = map.addTilesetImage('ground', 'ground', 16, 16, 0, 0, 1)
    if (tiles !== null) map.createLayer(0, tiles, 0, 0)
    // trees along the top and bottom edges, deterministic
    for (let x = 24; x < MAP_W * 16; x += 56) { placeStatic(this, 'tree_0', x, 40); placeStatic(this, 'tree_0', x + 20, MAP_H * 16 - 16) }
    if (GATE !== undefined) placeStatic(this, 'gate_0', GATE.x + GATE.w / 2, GATE.y + GATE.h)
    if (STALL !== undefined) placeStatic(this, 'stall_0', STALL.x + STALL.w / 2, STALL.y + STALL.h)
    this.workshop = new Workshop(this, WORKSHOP.x + WORKSHOP.w / 2, WORKSHOP.y + WORKSHOP.h)
    for (const h of HOUSES) this.houses.push(new House(this, h.x + h.w / 2, h.y + h.h, (h.slot ?? 1) - 1))
    this.board = new Board(this, BOARD.x + BOARD.w / 2, BOARD.y + BOARD.h)
    this.bell = new Bell(this, this.board.x - 22, this.board.y - 20)
    this.cart = new Cart(this)
    this.night = this.add.rectangle(0, 0, MAP_W * 16, MAP_H * 16, COLORS.nightSky, 0.45).setOrigin(0, 0).setDepth(900).setVisible(false)

    const cam = this.cameras.main
    cam.setBounds(0, 0, MAP_W * 16, MAP_H * 16)
    cam.setZoom(2)
    cam.centerOn(this.squareCentre.x, this.squareCentre.y)
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => { this.dragStart = { x: p.x, y: p.y, sx: cam.scrollX, sy: cam.scrollY } })
    this.input.on('pointerup', () => { this.dragStart = undefined })
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (this.dragStart === undefined || !p.isDown) return
      cam.setScroll(this.dragStart.sx - (p.x - this.dragStart.x) / cam.zoom, this.dragStart.sy - (p.y - this.dragStart.y) / cam.zoom)
    })
    this.input.on('wheel', (_p: unknown, _o: unknown, _dx: number, dy: number) => { this.setZoom(cam.zoom + (dy > 0 ? -1 : 1)) })
    const open = (kind: 'pool' | 'agent' | 'workshop', id: string) => () => { if (kind === 'workshop') this.deps.store.getState().openDrawer('me', 'workshop'); else this.deps.store.getState().openDrawer(kind, id) }
    this.board.on('pointerup', () => { if (this.board.poolId !== undefined) open('pool', this.board.poolId)() })
    this.workshop.on('pointerup', open('workshop', 'workshop'))
    this.detach = attachBridge(this, this.deps.store, this.deps.bus)
    const teardown = (): void => { this.detach?.(); this.detach = undefined; this.deps.fx.clear() }
    this.events.once('shutdown', teardown)
    this.events.once('destroy', teardown)
  }

  setZoom (z: number): void { this.cameras.main.setZoom(Phaser.Math.Clamp(Math.round(z), 2, 4)) }
  setNight (on: boolean): void { this.night.setVisible(on); for (const h of this.houses) h.setNight(on) }
  setSpeed (speed: number): void { this.registry.set('speed', speed); this.deps.fx.speed = speed }

  focusOn (identity: string): void { const v = this.villagers.get(identity); if (v !== undefined) this.cameras.main.pan(v.x, v.y, 400) }

  houseOf (identity: string): House | undefined { return this.houses.find(h => h.owner === identity) }

  track (p: Promise<void>): Promise<void> { this.inFlight.add(p); return p.finally(() => { this.inFlight.delete(p) }) }
  settle (): Promise<void> { return Promise.all([...this.inFlight]).then(() => {}) }

  /** Add a villager for an agent: a free house or the square's edge (crowd mode). */
  addVillager (identity: string, profile: string, name: string): Villager {
    const existing = this.villagers.get(identity)
    if (existing !== undefined) return existing
    const prof: Profile = profile === 'finetune' || profile === 'eval' || profile === 'inference' ? profile : 'visitor'
    const house = prof === 'visitor' ? undefined : this.houses.find(h => h.owner === undefined)
    const visitorSpawn = POINTS['visitor-spawn']
    const spot = house !== undefined ? house.doorstep : prof === 'visitor' && visitorSpawn !== undefined ? { x: visitorSpawn.x, y: visitorSpawn.y } : { x: this.squareCentre.x - 60 + this.villagers.size * 14, y: this.squareCentre.y + 70 }
    house?.setOwner(identity, name)
    const v = new Villager(this, identity, prof, name, spot.x, spot.y)
    v.slotIndex = this.villagers.size
    v.on('pointerup', () => this.deps.store.getState().openDrawer('agent', identity))
    this.villagers.set(identity, v)
    return v
  }
}
