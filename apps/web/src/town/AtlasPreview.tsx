/** Proof that the sprite pipeline reaches Phaser: loads public/game/atlas.{png,json} and lays the frames out at 3×. */
import { useEffect, useRef, useState } from 'react'
import { PALETTE } from '../../assets/palette'
import { COLORS } from './colors'
import { gameConfig, SCALE } from './game'

export default function AtlasPreview () {
  const ref = useRef<HTMLDivElement>(null)
  const [status, setStatus] = useState('starting Phaser…')
  useEffect(() => {
    const parent = ref.current
    if (parent === null) return
    let game: import('phaser').Game | undefined
    let cancelled = false
    void import('phaser').then(({ default: Phaser }) => {
      if (cancelled) return
      class Preview extends Phaser.Scene {
        preload (): void { this.load.atlas('atlas', '/game/atlas.png', '/game/atlas.json') }
        create (): void {
          const frames = this.textures.get('atlas').getFrameNames()
          let x = 16
          let y = 16
          for (const name of frames) {
            const img = this.add.image(x, y, 'atlas', name).setOrigin(0, 0).setScale(SCALE)
            this.add.text(x, y + img.displayHeight + 2, name, { fontFamily: 'VT323', fontSize: '16px', color: PALETTE.K!.day })
            x += Math.max(img.displayWidth, 48) + 24
            if (x > 860) { x = 16; y += 140 }
          }
          setStatus(`${frames.length} frames from the atlas, ${SCALE}×`)
        }
      }
      game = new Phaser.Game({ ...gameConfig(parent, [Preview], Phaser), backgroundColor: COLORS.parchment, width: 960, height: 300 })
    })
    return () => { cancelled = true; game?.destroy(true) }
  }, [])
  return (
    <div>
      <p className="label text-ink-muted mb-2" data-testid="atlas-status">{status}</p>
      <div ref={ref} className="pixelated border-2 border-wood" style={{ width: 960, height: 300 }} />
    </div>
  )
}
