/**
 * Film mode (apps/web/VIDEO.md): a director that drives the Town's own entities from a script, so a demo
 * scene plays the same way in every take. Time is the scene's clock (Phaser's game loop), which the
 * frame-by-frame renderer (tools/film-render.mjs) steps itself, so a render lines up with the voice-over.
 * Framing: frame.ts.
 */
import Phaser from 'phaser'
import type { TownScene } from '../town/scenes/TownScene'
import type { Villager } from '../town/entities/Villager'
import type { LabelTone } from '../town/entities/dom'
import { makeLabel } from '../town/entities/dom'

export { FILM_H, FILM_W, ZOOM } from './frame'

/** screen px at 1080p that bubbles and name tags aim for, whatever the zoom */
const BUBBLE_PX = 27
const NAME_PX = 20
/** below this zoom name tags hide: in a wide shot of a crowd they would overlap */
const NAMES_FROM_ZOOM = 3.5

export interface CastSpec { id: string, name: string, char: string, at: { x: number, y: number }, house?: boolean, profile?: 'finetune' | 'eval' | 'inference' }
export interface NarrationLine { at: number, text: string, until: number }

export interface DirectorHooks {
  /** a narrator line starts (subtitles, VO timing); `undefined` clears */
  onNarrate?: (line: NarrationLine | undefined) => void
  /** a beat starts (timecode overlay) */
  onBeat?: (name: string, at: number) => void
  /** a beat was reached later than scheduled: the walk before it took longer than the script allows */
  onLate?: (beat: string, bySeconds: number) => void
}

export class Director {
  private t0 = 0
  private cast = new Map<string, Villager>()
  /** extra height above the name tag (a tag like AGENT) that bubbles must clear */
  private lift = new Map<Villager, number>()
  private tags = new Map<Villager, Phaser.GameObjects.DOMElement>()
  readonly late: Array<{ beat: string, by: number }> = []
  private narrationTimer?: Phaser.Time.TimerEvent

  constructor (readonly town: TownScene, private readonly hooks: DirectorHooks = {}) {
    // name tags keep their size on screen while the camera zooms
    let lastZoom = 0
    town.events.on('postupdate', () => {
      const z = town.cameras.main.zoom
      if (z === lastZoom) return
      lastZoom = z
      for (const v of this.cast.values()) { v.setNameSize(NAME_PX / z); v.showName(z >= NAMES_FROM_ZOOM) }
      // a tag sits on the name tag, or on the head when names are hidden
      for (const [v, el] of this.tags) el.setY(v.headTop + 1)
    })
  }

  get cam (): Phaser.Cameras.Scene2D.Camera { return this.town.cameras.main }

  /** seconds since `start()` on the scene's clock */
  now (): number { return (this.town.time.now - this.t0) / 1000 }

  start (): void { this.t0 = this.town.time.now }

  /** Wait until film time `sec` (the script's sync points with the voice-over). Late beats are reported, not skipped. */
  async at (sec: number, beat?: string): Promise<void> {
    const left = sec - this.now()
    if (left > 0) await this.wait(left)
    else if (left < -0.05 && beat !== undefined) { this.late.push({ beat, by: -left }); this.hooks.onLate?.(beat, -left) }
    if (beat !== undefined) this.hooks.onBeat?.(beat, sec)
  }

  wait (sec: number): Promise<void> {
    return new Promise(resolve => { this.town.time.delayedCall(sec * 1000, resolve) })
  }

  // ---- camera

  /** jump: centre on (x, y) at `zoom` */
  cut (x: number, y: number, zoom: number): void {
    this.cam.stopFollow()
    this.cam.setZoom(zoom)
    this.cam.centerOn(x, y)
  }

  /** pan and zoom together; resolves when both are done */
  move (x: number, y: number, zoom: number, sec: number, ease = 'Sine.easeInOut'): Promise<void> {
    const cam = this.cam
    cam.stopFollow()
    const ms = sec * 1000
    return new Promise(resolve => {
      let left = 2
      const done = (): void => { if (--left === 0) resolve() }
      // a cut-short effect must not hang the script: the timer is the fallback
      const fallback = this.town.time.delayedCall(ms + 200, () => { left = 1; done() })
      const finish = (): void => { done(); if (left === 0) fallback.remove(false) }
      cam.pan(x, y, ms, ease, true, (_c: unknown, p: number) => { if (p >= 1) finish() })
      if (cam.zoom === zoom) finish()
      else cam.zoomTo(zoom, ms, ease, true, (_c: unknown, p: number) => { if (p >= 1) finish() })
    })
  }

  /** keep a villager in frame (soft follow), optionally zooming to `zoom` */
  follow (v: Villager, zoom?: number, sec = 1): void {
    this.cam.startFollow(v, true, 0.06, 0.06, 0, 10)
    if (zoom !== undefined && zoom !== this.cam.zoom) this.cam.zoomTo(zoom, sec * 1000, 'Sine.easeInOut', true)
  }

  // ---- cast

  /** Put a villager on stage: no idle wandering, its own sprite, standing at `at`. */
  enter (spec: CastSpec): Villager {
    const v = this.town.addVillager(spec.id, spec.profile ?? 'inference', spec.name, { char: spec.char, house: spec.house ?? false })
    v.busy = true
    v.setPosition(spec.at.x, spec.at.y).setDepth(spec.at.y)
    v.home = { ...spec.at }
    v.showName(true)
    v.setNameSize(NAME_PX / this.cam.zoom)
    v.purse.setPosition(10, -12)
    this.cast.set(spec.id, v)
    return v
  }

  /** Cast someone who is already in the Town (the guard): same rules as `enter`. */
  adopt (id: string, v: Villager, at?: { x: number, y: number }): Villager {
    v.busy = true
    if (at !== undefined) { v.setPosition(at.x, at.y).setDepth(at.y); v.home = { ...at } }
    v.showName(true)
    v.setNameSize(NAME_PX / this.cam.zoom)
    this.cast.set(id, v)
    return v
  }

  get (id: string): Villager {
    const v = this.cast.get(id)
    if (v === undefined) throw new Error(`film: no one called ${id} on stage`)
    return v
  }

  walk (v: Villager, x: number, y: number, pace = 1.4): Promise<void> { return v.walkTo(x, y, { pace }) }

  /** turn to look at a point */
  look (v: Villager, x: number, y: number): void { v.face(x - v.x, y - v.y); v.sprite.play(`${v.char}_idle_${Math.abs(x - v.x) >= Math.abs(y - v.y) ? 'side' : y < v.y ? 'up' : 'down'}`, true) }

  // ---- words

  private bubbleStyle (v: Villager, shape: 'speech' | 'thought' = 'speech'): { size: number, maxWidth: number, y: number } {
    const z = this.cam.zoom
    // a thought's puffs hang 12 px below the bubble, a speech tail 4
    return { size: BUBBLE_PX / z, maxWidth: 620 / z, y: v.headTop - (this.lift.get(v) ?? 0) - (shape === 'thought' ? 8 : 0) }
  }

  say (v: Villager, text: string, sec = 3, tone: LabelTone = 'parchment'): void {
    v.say(text, tone === 'ink' ? 'parchment' : tone, sec * 1000, { shape: tone === 'parchment' ? 'speech' : 'box', ...this.bubbleStyle(v) })
  }

  think (v: Villager, text: string, sec = 3): void {
    v.say(text, 'parchment', sec * 1000, { shape: 'thought', ...this.bubbleStyle(v, 'thought') })
  }

  /** a one-glyph reaction over the head ("!", "…", "?") */
  emote (v: Villager, glyph: string, sec = 1.2, tone: 'gold' | 'parchment' | 'danger' = 'gold'): void {
    v.say(glyph, tone, sec * 1000, { size: (BUBBLE_PX * 1.3) / this.cam.zoom, maxWidth: 60, y: v.headTop - (this.lift.get(v) ?? 0) })
    v.sprite.setY(0)
    this.town.tweens.add({ targets: v.sprite, y: -2, duration: 90, yoyo: true, repeat: 1 })
  }

  /** a small tag that stays over a villager (e.g. AGENT) */
  tag (v: Villager, text: string, tone: LabelTone = 'gold'): Phaser.GameObjects.DOMElement {
    const el = makeLabel(this.town, 0, 0, text, { tone, size: 5 })
    v.add(el)
    el.setY(v.headTop + 1)
    this.lift.set(v, el.height)
    this.tags.set(v, el)
    return el
  }

  /** the narrator speaks (shown as a subtitle when asked; the voice-over is laid over the render) */
  narrate (text: string, sec: number): void {
    const at = this.now()
    this.narrationTimer?.remove()
    this.hooks.onNarrate?.({ at, text, until: at + sec })
    this.narrationTimer = this.town.time.delayedCall(sec * 1000, () => { this.hooks.onNarrate?.(undefined) })
  }

  // ---- props and effects

  /** a coin arcs from a villager to a point (a pledge into the board's chest, gold to the workshop) */
  coin (from: { x: number, y: number }, to: { x: number, y: number }, sec = 0.6): Promise<void> {
    const c = this.town.add.sprite(from.x, from.y - 16, 'icons', 4).setOrigin(0.5, 1).setDepth(950)
    const midY = Math.min(from.y, to.y) - 30
    return new Promise(resolve => {
      this.town.tweens.addCounter({
        from: 0, to: 1, duration: sec * 1000, ease: 'Sine.easeInOut',
        onUpdate: tw => { const t = tw.getValue() ?? 0; c.setPosition(Phaser.Math.Linear(from.x, to.x, t), (1 - t) * (1 - t) * (from.y - 16) + 2 * (1 - t) * t * midY + t * t * to.y) },
        onComplete: () => { c.destroy(); resolve() }
      })
    })
  }

  /** a gold credit chest drops in front of a villager; returns it so the script can open it */
  dropChest (v: Villager, dx = 0, dy = 12): Phaser.GameObjects.Sprite {
    const chest = this.town.add.sprite(v.x + dx, v.y + dy - 34, 'town', 'chest_gold_0').setOrigin(0.5, 1).setDepth(v.y + dy).setAlpha(0)
    this.town.tweens.add({ targets: chest, y: v.y + dy, alpha: 1, duration: 550, ease: 'Bounce.Out' })
    return chest
  }

  openChest (chest: Phaser.GameObjects.Sprite): Promise<void> {
    return new Promise(resolve => {
      let f = 0
      this.town.time.addEvent({ delay: 70, repeat: 5, callback: () => { chest.setFrame(`chest_gold_${Math.min(5, ++f)}`); if (f >= 5) resolve() } })
    })
  }

  /** the fountain lights up: a ring of light and sparks rising from the water */
  sparkle (x: number, y: number, sec = 2.4): void {
    const scene = this.town
    if (!scene.textures.exists('film_spark')) {
      const g = scene.make.graphics({ x: 0, y: 0 }, false)
      g.fillStyle(0xffffff, 1).fillRect(1, 0, 1, 3).fillRect(0, 1, 3, 1)
      g.generateTexture('film_spark', 3, 3)
      g.destroy()
    }
    const glow = scene.add.image(x, y - 14, 'glow').setTint(0xfee761).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0).setScale(0.4).setDepth(951)
    scene.tweens.add({ targets: glow, alpha: 0.9, scale: 1.6, duration: 450, yoyo: true, hold: sec * 1000 - 900, onComplete: () => glow.destroy() })
    const sparks = scene.add.particles(x, y - 18, 'film_spark', {
      speed: { min: 20, max: 60 }, angle: { min: 200, max: 340 }, gravityY: 40, lifespan: 900, quantity: 2, frequency: 40,
      tint: [0xfee761, 0xffffff, 0x00cdf9], alpha: { start: 1, end: 0 }, blendMode: Phaser.BlendModes.ADD
    }).setDepth(952)
    scene.time.delayedCall(sec * 1000, () => { sparks.stop() })
    scene.time.delayedCall(sec * 1000 + 1000, () => { sparks.destroy() })
  }

  /** a parchment in the world (the settlement summary); stays `sec` seconds */
  parchment (x: number, y: number, html: string, sec: number): void {
    const el = makeLabel(this.town, x, y, html, { size: BUBBLE_PX / this.cam.zoom, tone: 'parchment', maxWidth: 900 / this.cam.zoom })
    el.setDepth(960).setAlpha(0)
    ;(el.node as HTMLElement).style.textAlign = 'center'
    this.town.tweens.add({ targets: el, alpha: 1, duration: 300 })
    this.town.time.delayedCall(sec * 1000, () => { this.town.tweens.add({ targets: el, alpha: 0, duration: 300, onComplete: () => el.destroy() }) })
  }
}
