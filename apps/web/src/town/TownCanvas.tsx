/** The Phaser canvas (lazy chunk) with its React overlays: drawer and a small camera hint. */
import { useEffect, useRef, useState } from 'react'
import { useRuntime } from '../app-context'
import { store } from '../store'
import { LoadingState } from '../ui'
import { FxQueue } from './fx/queue'
import { TownDrawer } from './TownDrawer'

export default function TownCanvas () {
  const ref = useRef<HTMLDivElement>(null)
  const { bus } = useRuntime()
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [error, setError] = useState<string>()
  useEffect(() => {
    const parent = ref.current
    if (parent === null) return
    let game: import('phaser').Game | undefined
    let cancelled = false
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const fx = new FxQueue({ speed: store.getState().mode === 'replay' ? store.getState().settings.replaySpeed : 1, reducedMotion: reduced })
    void Promise.all([import('phaser'), import('./scenes/TownScene')]).then(([{ default: Phaser }, { TownScene }]) => {
      if (cancelled) return
      game = new Phaser.Game({
        type: Phaser.AUTO, parent, backgroundColor: '#1d1f2b',
        pixelArt: true, antialias: false, roundPixels: true, dom: { createContainer: true },
        scale: { mode: Phaser.Scale.RESIZE, width: parent.clientWidth, height: parent.clientHeight },
        scene: [new TownScene({ store, bus, fx })]
      })
      game.events.once('ready', () => setStatus('ready'))
      setStatus('ready')
    }).catch(err => { setStatus('error'); setError(String((err as Error).message ?? err)) })
    return () => { cancelled = true; fx.clear(); game?.destroy(true) }
  }, [bus])
  return (
    <div className="relative" data-testid="town">
      <div ref={ref} className="pixelated relative mx-auto overflow-hidden border-2 border-wood bg-ink shadow-hard" style={{ width: '100%', aspectRatio: '16 / 9' }} data-status={status} />
      {status === 'loading' && <div className="absolute inset-0 flex items-center justify-center"><LoadingState title="Building the town…" body="Phaser, atlas and tiles" /></div>}
      {status === 'error' && <div className="absolute inset-0 flex items-center justify-center bg-surface-2/80 p-6 font-display text-danger-dark">The town could not start: {error}</div>}
      <p className="label mt-2 text-ink-muted">drag to pan · wheel to zoom (2×–4×) · click a villager, the board or the workshop</p>
      <TownDrawer />
    </div>
  )
}
