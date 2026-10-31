/**
 * Village life that is not protocol (track-E polish): butterflies over the flowers, bees at the flower
 * barrels, cloud shadows drifting across, a passing shower now and then, wind wisps, fireflies at night.
 * Pure scenery: no event drives it and nothing in it means a transaction.
 */
import Phaser from 'phaser'
import { ensureAnim } from './entities/Buildings'
import { MAP_H, MAP_W, PLAZA, TILE } from './map/terrain'
import { PLACES } from './map/places'
import { DEPTH } from './game'

const W = MAP_W * TILE, H = MAP_H * TILE
const rand = (a: number, b: number): number => a + Math.random() * (b - a)

export class Ambient {
  private fireflies: Phaser.GameObjects.Image[] = []
  private rain?: Phaser.GameObjects.Particles.ParticleEmitter
  private shower?: Phaser.GameObjects.Rectangle
  private timers: Phaser.Time.TimerEvent[] = []
  night = false

  constructor (private readonly scene: Phaser.Scene, opts: { reducedMotion: boolean }) {
    if (opts.reducedMotion) return
    this.butterflies()
    this.bees()
    this.clouds()
    this.wind()
    this.makeFireflies()
    this.timers.push(scene.time.addEvent({ delay: 45_000, loop: true, callback: () => { if (Math.random() < 0.35) this.startShower() } }))
  }

  /** a few butterflies drifting between spots near the square and the houses' gardens */
  private butterflies (): void {
    const colours = ['blue', 'orange', 'red', 'pink']
    const around = [{ x: (PLAZA.x - 2) * TILE, y: (PLAZA.y + 2) * TILE }, { x: (PLAZA.x + PLAZA.w + 2) * TILE, y: (PLAZA.y + 6) * TILE }, { x: 8 * TILE, y: 22 * TILE }, { x: 30 * TILE, y: 33 * TILE }, { x: 44 * TILE, y: 18 * TILE }, { x: 20 * TILE, y: 6 * TILE }]
    for (const home of around) {
      const c = colours[Math.floor(Math.random() * colours.length)]!
      const b = this.scene.add.sprite(home.x, home.y, 'town', `butterfly_${c}_0`).setDepth(DEPTH.overlay - 2)
      b.play({ key: ensureAnim(this.scene, `butterfly_${c}`, 2, 7), startFrame: Math.floor(Math.random() * 2) })
      const hop = (): void => {
        const x = home.x + rand(-40, 40), y = home.y + rand(-30, 30)
        b.setFlipX(x < b.x)
        this.scene.tweens.add({ targets: b, x, y, duration: rand(2500, 5000), ease: 'Sine.InOut', onComplete: hop })
      }
      hop()
    }
  }

  /** bees buzzing in small loops over the flower barrels */
  private bees (): void {
    const key = ensureAnim(this.scene, 'bee', 4, 12)
    for (const p of PLACES.filter(p => p.frame.startsWith('barrel_flowers') || p.kind === 'crop').slice(0, 4)) {
      const b = this.scene.add.sprite(p.x, p.y - 18, 'town', 'bee_0').setScale(0.75).setDepth(DEPTH.overlay - 2)
      b.play(key)
      const buzz = (): void => {
        const x = p.x + rand(-12, 12), y = p.y - 18 + rand(-8, 8)
        b.setFlipX(x < b.x)
        this.scene.tweens.add({ targets: b, x, y, duration: rand(500, 1100), ease: 'Sine.InOut', onComplete: buzz })
      }
      buzz()
    }
  }

  /** big soft shadows of clouds sliding over the whole map, looping */
  private clouds (): void {
    for (let i = 0; i < 4; i++) {
      const c = this.scene.add.image(rand(-200, W), rand(0, H), 'town', `cloud_${i}`).setScale(3.2).setTint(0x101820).setAlpha(0.13).setDepth(DEPTH.overlay - 1)
      const drift = (): void => {
        const dur = rand(70_000, 110_000)
        this.scene.tweens.add({ targets: c, x: W + 220, duration: dur * ((W + 220 - c.x) / (W + 440)), onComplete: () => { c.setPosition(-220, rand(0, H)); drift() } })
      }
      drift()
    }
  }

  /** wind wisps across the grass every few seconds */
  private wind (): void {
    const key = ensureAnim(this.scene, 'wind', 14, 12)
    this.timers.push(this.scene.time.addEvent({ delay: 2_600, loop: true, callback: () => {
      const w = this.scene.add.sprite(rand(0, W), rand(0, H), 'town', 'wind_0').setAlpha(0.7).setDepth(DEPTH.overlay - 2)
      w.play({ key, repeat: 0 })
      this.scene.tweens.add({ targets: w, x: w.x + 40, duration: 1200 })
      w.once('animationcomplete', () => w.destroy())
    } }))
  }

  /** fireflies: tiny flickering lights, only at night */
  private makeFireflies (): void {
    for (let i = 0; i < 26; i++) {
      const f = this.scene.add.image(rand(0, W), rand(0, H), 'glow').setScale(0.06).setTint(0xd9ff7a).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0).setDepth(DEPTH.lights + 1)
      this.fireflies.push(f)
      const roam = (): void => { this.scene.tweens.add({ targets: f, x: f.x + rand(-30, 30), y: f.y + rand(-20, 20), duration: rand(2000, 4000), ease: 'Sine.InOut', onComplete: roam }) }
      roam()
      this.scene.tweens.add({ targets: f, scale: 0.1, duration: rand(400, 900), yoyo: true, repeat: -1 })
    }
  }

  setNight (on: boolean): void {
    this.night = on
    for (const f of this.fireflies) this.scene.tweens.add({ targets: f, alpha: on ? rand(0.5, 0.9) : 0, duration: 1500 })
  }

  /** a 20-second shower over the whole village */
  startShower (): void {
    if (this.rain !== undefined) return
    this.shower = this.scene.add.rectangle(0, 0, W, H, 0x1d2b3a, 0).setOrigin(0, 0).setDepth(DEPTH.overlay - 1)
    this.scene.tweens.add({ targets: this.shower, fillAlpha: 0.18, duration: 1500 })
    const emitter = this.scene.add.particles(0, 0, 'town', {
      frame: 'rain_drop_0', x: { min: 0, max: W }, y: -10, lifespan: { min: 900, max: 1400 }, speedY: { min: 280, max: 340 }, speedX: -30,
      quantity: 6, frequency: 25, alpha: { start: 1, end: 0.7 },
      deathCallback: (p: Phaser.GameObjects.Particles.Particle) => {
        if (Math.random() > 0.15) return
        const s = this.scene.add.sprite(p.x, p.y, 'town', 'rain_impact_0').setDepth(DEPTH.overlay - 1).setAlpha(0.7)
        s.play({ key: ensureAnim(this.scene, 'rain_impact', 7, 18), repeat: 0 })
        s.once('animationcomplete', () => s.destroy())
      }
    })
    emitter.setDepth(DEPTH.overlay)
    this.rain = emitter
    this.scene.time.delayedCall(20_000, () => this.stopShower())
  }

  stopShower (): void {
    const r = this.rain, sh = this.shower
    this.rain = undefined; this.shower = undefined
    r?.stop()
    this.scene.time.delayedCall(1600, () => r?.destroy())
    if (sh !== undefined) this.scene.tweens.add({ targets: sh, fillAlpha: 0, duration: 1500, onComplete: () => sh.destroy() })
  }

  destroy (): void { for (const t of this.timers) t.remove(); this.stopShower() }
}
