/**
 * The Town (E-V1): a Phaser scene over Kenmi's Cute Fantasy art. Reads the store through bridge.ts and
 * never fetches. Tiled map from public/game/map.json (ground + decor), buildings and props from
 * map/places.ts, villagers from chars.json. Everything that stands is depth-sorted by its y.
 */
import Phaser from 'phaser'
import type { AppStoreApi } from '../../store'
import type { EventBus } from '../../events/bus'
import { Bell, Cart, House, Stall, Workshop, placeAnimated, placeStatic, Building } from '../entities/Buildings'
import { Guard, Stranger, VaultChest } from '../entities/Guard'
import { Board } from '../entities/Board'
import { CHARS, Villager, type Profile } from '../entities/Villager'
import { FxQueue } from '../fx/queue'
import { BOARD, COOP, HOUSES, POINTS, STALLS, WORKSHOP } from '../layout'
import { ANIMALS, FOUNTAIN, PLACES, TREES } from '../map/places'
import { Animal } from '../entities/Animal'
import { MAP_H, MAP_W, TILE } from '../map/terrain'
import { attachBridge } from '../bridge'
import { DEPTH, ZOOM_DEFAULT, ZOOM_MAX, ZOOM_MIN } from '../game'

export interface TownDeps { store: AppStoreApi, bus: EventBus, fx: FxQueue }

const TERRAIN_KEYS = ['grass', 'dirt', 'sand', 'cobble', 'water', 'decor', 'flowers', 'fence', 'path_decor', 'water_decor', 'farmland']
const WATER_FRAMES = 8

export class TownScene extends Phaser.Scene {
  readonly villagers = new Map<string, Villager>()
  /** pledge walks in flight; settlement / lock-in wait for them */
  readonly inFlight = new Set<Promise<void>>()
  readonly houses: House[] = []
  readonly stalls: Stall[] = []
  readonly chests = new Map<string, VaultChest>()
  guard!: Guard
  board!: Board
  workshop!: Workshop
  coop!: Building
  cart!: Cart
  bell!: Bell
  private night!: Phaser.GameObjects.Rectangle
  private lamps: Phaser.GameObjects.Image[] = []
  private water?: Phaser.Tilemaps.Tileset
  map!: Phaser.Tilemaps.Tilemap
  private waterFrame = 0
  private detach?: () => void
  private dragStart?: { x: number, y: number, sx: number, sy: number }

  constructor (private readonly deps: TownDeps) { super('town') }

  get fx (): FxQueue { return this.deps.fx }
  /** false once the scene (or the game) is torn down; the bridge checks it before touching entities */
  get alive (): boolean { return this.sys !== undefined && this.sys.settings !== undefined && this.scene !== undefined && this.sys.isActive() }
  get squareCentre (): { x: number, y: number } { const p = POINTS['square-centre']!; return { x: p.x, y: p.y } }

  preload (): void {
    this.load.tilemapTiledJSON('map', '/game/map.json')
    for (const k of TERRAIN_KEYS) this.load.image(`t_${k}`, `/game/terrain/${k}.png`)
    for (let f = 0; f < WATER_FRAMES; f++) this.load.image(`t_water_${f}`, `/game/terrain/water_${f}.png`)
    this.load.atlas('town', '/game/town.png', '/game/town.json')
    this.load.atlas('chars', '/game/chars.png', '/game/chars.json')
  }

  create (): void {
    this.registry.set('speed', this.deps.fx.speed)
    this.makeGlowTexture()
    const map = this.make.tilemap({ key: 'map' })
    this.map = map
    if (import.meta.env.DEV) (window as unknown as { __town?: TownScene }).__town = this
    const sets = TERRAIN_KEYS.map(k => map.addTilesetImage(k, `t_${k}`)).filter((t): t is Phaser.Tilemaps.Tileset => t !== null)
    map.createLayer('ground', sets, 0, 0)?.setDepth(0)
    map.createLayer('decor', sets, 0, 0)?.setDepth(1)
    this.water = sets.find(s => s.name === 'water')
    this.time.addEvent({ delay: 180, loop: true, callback: () => this.tickWater() })

    // props, trees, buildings (depth = y)
    for (const p of [...PLACES, ...TREES]) {
      if (p.kind === 'house' || p.kind === 'workshop' || p.kind === 'coop' || p.kind === 'board' || p.kind === 'fountain' || p.kind === 'stall') continue
      if (p.anim !== undefined) placeAnimated(this, p.frame.replace(/_\d+$/, ''), p.anim.frames, p.anim.fps, p.x, p.y, Math.floor(p.x / 7))
      else placeStatic(this, p.frame, p.x, p.y)
      if (p.kind === 'lantern') this.lamps.push(this.add.image(p.x, p.y - 34, 'glow').setTint(0xffb347).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0).setDepth(DEPTH.lights))
    }
    const door = (p: { x: number, y: number, door?: { dx: number, dy: number } }) => ({ x: p.x + (p.door?.dx ?? 0) * TILE, y: p.y + (p.door?.dy ?? 1) * TILE })
    this.workshop = new Workshop(this, WORKSHOP.x, WORKSHOP.y, WORKSHOP.frame, door(WORKSHOP))
    this.coop = new Building(this, COOP.x, COOP.y, COOP.frame, 'Coop hall · vaults & guard', door(COOP))
    for (const h of HOUSES) this.houses.push(new House(this, h.x, h.y, h.frame, (h.slot ?? 1) - 1))
    for (const st of STALLS) this.stalls.push(new Stall(this, st.x, st.y, st.frame, (st.slot ?? 1) - 1))
    const gate = POINTS.gate!
    this.guard = new Guard(this, gate.x + 58, gate.y + 8)
    for (const a of ANIMALS) new Animal(this, a)
    this.board = new Board(this, BOARD.x, BOARD.y)
    this.bell = new Bell(this, FOUNTAIN.x, FOUNTAIN.y)
    this.cart = new Cart(this)
    this.night = this.add.rectangle(0, 0, MAP_W * TILE, MAP_H * TILE, 0x2b2d5e, 0.55).setOrigin(0, 0).setDepth(DEPTH.overlay).setBlendMode(Phaser.BlendModes.MULTIPLY).setVisible(false)

    const cam = this.cameras.main
    cam.setBounds(0, 0, MAP_W * TILE, MAP_H * TILE)
    cam.setZoom(ZOOM_DEFAULT)
    cam.centerOn(this.squareCentre.x, this.squareCentre.y - 8)
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => { this.dragStart = { x: p.x, y: p.y, sx: cam.scrollX, sy: cam.scrollY } })
    this.input.on('pointerup', () => { this.dragStart = undefined })
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (this.dragStart === undefined || !p.isDown) return
      cam.setScroll(Math.round(this.dragStart.sx - (p.x - this.dragStart.x) / cam.zoom), Math.round(this.dragStart.sy - (p.y - this.dragStart.y) / cam.zoom))
    })
    this.input.on('wheel', (_p: unknown, _o: unknown, _dx: number, dy: number) => { this.setZoom(cam.zoom + (dy > 0 ? -1 : 1)) })
    const open = (kind: 'pool' | 'agent' | 'workshop', id: string) => () => { if (kind === 'workshop') this.deps.store.getState().openDrawer('me', 'workshop'); else this.deps.store.getState().openDrawer(kind, id) }
    this.board.on('pointerup', () => { if (this.board.poolId !== undefined) open('pool', this.board.poolId)() })
    for (const st of this.stalls) st.on('pointerup', () => { if (st.outpoint !== undefined) this.deps.store.getState().openDrawer('listing', st.outpoint) })
    this.coop.on('pointerup', () => { const first = [...this.chests.keys()][0]; if (first !== undefined) this.deps.store.getState().openDrawer('vault', first) })
    this.workshop.on('pointerup', open('workshop', 'workshop'))
    this.detach = attachBridge(this, this.deps.store, this.deps.bus)
    const teardown = (): void => { this.detach?.(); this.detach = undefined; this.deps.fx.clear() }
    this.events.once('shutdown', teardown)
    this.events.once('destroy', teardown)
  }

  private tickWater (): void {
    if (this.water === undefined || !this.alive) return
    this.waterFrame = (this.waterFrame + 1) % WATER_FRAMES
    this.water.setImage(this.textures.get(`t_water_${this.waterFrame}`))
  }

  /** Soft radial light for lanterns and windows at night. */
  private makeGlowTexture (): void {
    if (this.textures.exists('glow')) return
    const size = 96
    const canvas = this.textures.createCanvas('glow', size, size)
    if (canvas === null) return
    const ctx = canvas.getContext()
    const g = ctx.createRadialGradient(size / 2, size / 2, 2, size / 2, size / 2, size / 2)
    g.addColorStop(0, 'rgba(255,255,255,0.9)'); g.addColorStop(0.45, 'rgba(255,255,255,0.35)'); g.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.fillStyle = g; ctx.fillRect(0, 0, size, size)
    canvas.refresh()
  }

  setZoom (z: number): void { this.cameras.main.setZoom(Phaser.Math.Clamp(Math.round(z), ZOOM_MIN, ZOOM_MAX)) }
  setNight (on: boolean): void { this.night.setVisible(on); for (const l of this.lamps) l.setAlpha(on ? 0.7 : 0); for (const h of this.houses) h.setNight(on) }
  setSpeed (speed: number): void { this.registry.set('speed', speed); this.deps.fx.speed = speed }

  focusOn (identity: string): void { const v = this.villagers.get(identity); if (v !== undefined) this.cameras.main.pan(v.x, v.y, 400) }

  houseOf (identity: string): House | undefined { return this.houses.find(h => h.owner === identity) }

  /** The vault chest of an agent, created in front of its house (or by the coop hall when it has no house). */
  chestFor (vaultId: string, agent: string): VaultChest {
    const existing = this.chests.get(vaultId)
    if (existing !== undefined) return existing
    const house = this.houseOf(agent)
    const spot = house !== undefined ? { x: house.x + house.img.width / 2 - 4, y: house.y + 8 } : { x: COOP.x + 40 + this.chests.size * 18, y: COOP.y + 6 }
    const chest = new VaultChest(this, spot.x, spot.y, vaultId)
    chest.on('pointerup', () => this.deps.store.getState().openDrawer('vault', vaultId))
    this.chests.set(vaultId, chest)
    return chest
  }

  /** The stall showing a listing, or a free one. */
  stallFor (outpoint: string): Stall | undefined { return this.stalls.find(s => s.outpoint === outpoint) ?? this.stalls.find(s => s.outpoint === undefined) }

  /** The prompt injection: a stranger comes in from the west edge and whispers to the agent. */
  async injection (agentIdentity: string, text: string, speed: number): Promise<void> {
    const v = this.villagers.get(agentIdentity)
    if (v === undefined) return
    const gate = POINTS.gate!
    const stranger = new Stranger(this, gate.x - 24, gate.y + 12)
    await stranger.whisper({ x: v.x, y: v.y }, text, speed)
    v.say('…the instruction says to pledge everything', 'parchment', 2500)
    this.pendingStranger = stranger
  }

  pendingStranger?: Stranger
  /** After the guard's refusal the stranger runs away. */
  strangerFlees (): void { const s = this.pendingStranger; this.pendingStranger = undefined; if (s !== undefined) { const gate = POINTS.gate!; void s.flee(gate.x - 40, gate.y + 12) } }

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
    const char = prof === 'visitor' ? 'villager_00' : CHARS[this.villagers.size % CHARS.length]!
    const v = new Villager(this, identity, prof, name, spot.x, spot.y, char)
    v.slotIndex = this.villagers.size
    v.on('pointerup', () => this.deps.store.getState().openDrawer('agent', identity))
    this.villagers.set(identity, v)
    return v
  }
}
