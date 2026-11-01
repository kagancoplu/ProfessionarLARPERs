/**
 * The Phaser canvas (lazy chunk) with its React overlays: drawer and a small camera hint.
 * `fill`: the canvas takes its parent's whole box (no 16:9 frame, no button row) for the Town-only page (/town).
 */
import { useEffect, useRef, useState } from 'react'
import { useRuntime } from '../app-context'
import { store, useStore } from '../store'
import { LoadingState, PixelButton } from '../ui'
import { FxQueue } from './fx/queue'
import { TownDrawer } from './TownDrawer'
import { Narrator } from './Narrator'

export default function TownCanvas ({ fill = false }: { fill?: boolean }) {
  const ref = useRef<HTMLDivElement>(null)
  const { bus } = useRuntime()
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [error, setError] = useState<string>()
  const avatar = useStore(s => s.settings.avatar)
  useEffect(() => {
    const parent = ref.current
    if (parent === null) return
    let game: import('phaser').Game | undefined
    let cancelled = false
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches || store.getState().settings.reducedMotion
    const fx = new FxQueue({ speed: store.getState().mode === 'replay' ? store.getState().settings.replaySpeed : 1, reducedMotion: reduced })
    void Promise.all([import('phaser'), import('./scenes/TownScene')]).then(([{ default: Phaser }, { TownScene }]) => {
      if (cancelled) return
      game = new Phaser.Game({
        // headless automation (Playwright) has flaky WebGL framebuffers: draw with Canvas there, WebGL for people
        type: navigator.webdriver ? Phaser.CANVAS : Phaser.AUTO, parent, backgroundColor: '#1d1f2b',
        pixelArt: true, antialias: false, roundPixels: true, dom: { createContainer: true },
        // no window.focus() at boot: a page that hosts the Town in an iframe keeps its keyboard focus until the
        // visitor clicks into the game (the keys work as before at the top level, where the window has focus)
        autoFocus: false,
        // render mode (film/vclock.ts) steps 33 ms frames; Phaser's smoothing would run the clock at half speed
        ...(window.__vt !== undefined ? { fps: { smoothStep: false } } : {}),
        scale: { mode: Phaser.Scale.RESIZE, width: parent.clientWidth, height: parent.clientHeight },
        scene: [new TownScene({ store, bus, fx })]
      })
      game.events.once('ready', () => setStatus('ready'))
      setStatus('ready')
    }).catch(err => { setStatus('error'); setError(String((err as Error).message ?? err)) })
    return () => { cancelled = true; fx.clear(); game?.destroy(true) }
  }, [bus])
  return (
    <div className={fill ? 'relative h-full w-full' : 'relative'} data-testid="town">
      <div className={fill ? 'relative h-full w-full' : 'relative'}>
        <div ref={ref} className={fill ? 'pixelated relative h-full w-full overflow-hidden bg-ink' : 'pixelated relative mx-auto overflow-hidden border-2 border-wood bg-ink shadow-hard'} style={fill ? undefined : { width: '100%', aspectRatio: '16 / 9' }} data-status={status} />
        {status === 'loading' && <div className="absolute inset-0 flex items-center justify-center"><LoadingState title="Building the town…" body="Phaser, atlas and tiles" /></div>}
        {status === 'ready' && <Narrator />}
        {status === 'error' && <div className="absolute inset-0 flex items-center justify-center bg-surface-2/80 p-6 font-display text-danger-dark">The town could not start: {error}</div>}
      </div>
      {!fill && <div className="mt-2 flex flex-wrap items-center gap-3">
        <PixelButton size="sm" variant={avatar ? 'primary' : 'secondary'} onClick={() => store.getState().updateSettings({ avatar: !avatar })} data-testid="avatar-toggle">{avatar ? 'Walking · back to the map' : 'Walk the town'}</PixelButton>
        <p className="label text-ink-muted">{avatar ? 'WASD / arrows to walk · E to open what is in front of you · V to leave' : 'the view rests on the square · wheel to zoom (2×–4×) · click a villager, the board or the workshop · V to walk'}</p>
      </div>}
      <TownDrawer />
    </div>
  )
}
