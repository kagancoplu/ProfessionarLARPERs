/**
 * /film — film mode (VIDEO.md): the Town alone on a black 16:9 stage, played by a script (films.ts).
 *   ?film=pool      which script (default pool)
 *   &subs=1         narrator lines as subtitles (to rehearse the voice-over; leave off for the final take)
 *   &tc=1           timecode, current beat and late beats in the corner
 *   &autostart=1    roll at once instead of waiting for Space / click
 *   &render=1       frame-by-frame: tools/film-render.mjs steps the game clock itself (window.__film)
 * The canvas is 1920×1080 scaled to the window; record it full screen, or render it frame by frame.
 */
import { useEffect, useRef, useState } from 'react'
import { useRuntime } from '../app-context'
import { store } from '../store'
import { FxQueue } from '../town/fx/queue'
import type { TownScene } from '../town/scenes/TownScene'
import { Director, FILM_H, FILM_W, type NarrationLine } from './director'
import { FILMS } from './films'

export interface FilmHandle {
  ready: boolean
  started: boolean
  done: boolean
  error?: string
  duration: number
  /** film seconds since the roll */
  now: () => number
  begin: () => void
  /** render mode: advance the game clock by `ms` and draw one frame */
  step: (ms: number) => void
  late: Array<{ beat: string, by: number }>
}
declare global { interface Window { __film?: FilmHandle } }

/** Render mode: Date.now and performance.now follow the frames, not the wall clock (Phaser's tweens read Date.now). */
function virtualClock (): { freeze: () => void, advance: (ms: number) => number } {
  const realPerf = performance.now.bind(performance)
  const realDate = Date.now.bind(Date)
  const p0 = realPerf(), d0 = realDate()
  let frozen = false, v = 0
  performance.now = () => (frozen ? p0 + v : realPerf())
  Date.now = () => (frozen ? d0 + v : realDate())
  return { freeze: () => { v = realPerf() - p0; frozen = true }, advance: ms => { v += ms; return p0 + v } }
}

export default function FilmPage () {
  const params = new URLSearchParams(location.search)
  const name = params.get('film') ?? 'pool'
  const film = FILMS[name]
  const subs = params.get('subs') === '1'
  const tc = params.get('tc') === '1'
  const render = params.get('render') === '1'
  const autostart = params.get('autostart') === '1'
  const ref = useRef<HTMLDivElement>(null)
  const tcRef = useRef<HTMLDivElement>(null)
  const { bus } = useRuntime()
  const [line, setLine] = useState<NarrationLine>()
  const [phase, setPhase] = useState<'loading' | 'ready' | 'rolling' | 'done' | 'error'>('loading')
  const [error, setError] = useState<string>()

  useEffect(() => {
    const prevTheme = document.documentElement.dataset.theme
    document.documentElement.dataset.theme = 'day'
    return () => { if (prevTheme !== undefined) document.documentElement.dataset.theme = prevTheme }
  }, [])

  useEffect(() => {
    const parent = ref.current
    if (parent === null || film === undefined) return
    let game: import('phaser').Game | undefined
    let cancelled = false
    const clock = render ? virtualClock() : undefined
    const fx = new FxQueue({ speed: 1, reducedMotion: false })
    let beat = ''
    let rollNow: () => void = () => {}
    const roll = new Promise<void>(resolve => { rollNow = resolve })
    const handle: FilmHandle = { ready: false, started: false, done: false, duration: film.duration, now: () => 0, begin: () => {}, step: () => {}, late: [] }
    window.__film = handle

    void Promise.all([import('phaser'), import('../town/scenes/TownScene'), document.fonts.ready]).then(async ([{ default: Phaser }, { TownScene: Scene }]) => {
      if (cancelled) return
      const town: TownScene = new Scene({ store, bus, fx, film: true })
      game = new Phaser.Game({
        type: params.get('canvas') === '1' ? Phaser.CANVAS : Phaser.WEBGL, parent, backgroundColor: '#000000',
        pixelArt: true, antialias: false, roundPixels: true, dom: { createContainer: true },
        scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH, width: FILM_W, height: FILM_H },
        scene: [town]
      })
      // the scene is ready once create() has run (board and bell exist)
      while (!cancelled && (town.board === undefined || !town.alive)) await new Promise(r => setTimeout(r, 50))
      if (cancelled || game === undefined) return
      const g = game
      const d = new Director(town, {
        onNarrate: l => setLine(l),
        onBeat: b => { beat = b },
        onLate: (b, by) => { handle.late.push({ beat: b, by }); console.warn(`[film] "${b}" is ${by.toFixed(2)} s late`) }
      })
      town.events.on('postupdate', () => { if (tcRef.current !== null) tcRef.current.textContent = `${handle.started ? d.now().toFixed(1) : '0.0'} s · ${beat}${handle.late.length > 0 ? ` · late: ${handle.late.map(l => `${l.beat} +${l.by.toFixed(1)}`).join(', ')}` : ''}` })
      handle.now = () => (handle.started ? d.now() : 0)
      handle.begin = () => { if (handle.started) return; handle.started = true; setPhase('rolling'); rollNow() }
      if (clock !== undefined) {
        g.loop.sleep()
        clock.freeze()
        handle.step = ms => { const t = clock.advance(ms); g.step(t, ms) }
      }
      void film.run(d, roll).then(() => { handle.done = true; setPhase('done') }).catch(err => { handle.error = String((err as Error).message ?? err); setError(handle.error); setPhase('error') })
      // let the stage settle (fonts in the DOM labels, the first camera cut) before anyone rolls
      if (clock !== undefined) for (let i = 0; i < 5; i++) handle.step(16)
      handle.ready = true
      setPhase('ready')
      if (autostart) handle.begin()
    }).catch(err => { setError(String((err as Error).message ?? err)); setPhase('error') })

    return () => { cancelled = true; fx.clear(); game?.destroy(true); if (window.__film === handle) delete window.__film }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bus, film])

  useEffect(() => {
    if (phase !== 'ready' || render) return
    const go = (e: KeyboardEvent | MouseEvent): void => { if (e instanceof KeyboardEvent && e.key !== ' ' && e.key !== 'Enter') return; e.preventDefault(); window.__film?.begin() }
    window.addEventListener('keydown', go)
    window.addEventListener('click', go)
    return () => { window.removeEventListener('keydown', go); window.removeEventListener('click', go) }
  }, [phase, render])

  if (film === undefined) return <div className="p-6 font-display">No film called “{name}”. Try /film?film={Object.keys(FILMS).join(' | ')}</div>
  return (
    <div className="fixed inset-0 flex items-center justify-center bg-black" style={{ cursor: phase === 'rolling' || render ? 'none' : 'default' }} data-testid="film" data-phase={phase}>
      <div className="relative" style={{ width: 'min(100vw, calc(100vh * 16 / 9))', aspectRatio: '16 / 9', containerType: 'inline-size' }}>
        <div ref={ref} className="pixelated absolute inset-0 overflow-hidden" />
        {subs && line !== undefined && (
          <div className="pointer-events-none absolute inset-x-0 bottom-[5%] flex justify-center px-[8%]" data-testid="film-subtitle">
            <p className="m-0 bg-black/70 px-[1.2cqw] py-[0.5cqw] text-center leading-tight text-[#f9e6cf]" style={{ fontFamily: 'var(--font-body)', fontSize: '1.9cqw' }}>{line.text}</p>
          </div>
        )}
        {tc && <div ref={tcRef} className="pointer-events-none absolute left-[1%] top-[1%] bg-black/70 px-2 py-1 text-[#fee761]" style={{ fontFamily: 'var(--font-counter)', fontSize: '1.4cqw' }} />}
        {phase === 'ready' && !render && !autostart && (
          <div className="absolute inset-0 flex items-center justify-center">
            <p className="town-label m-0 px-4 py-2" style={{ fontSize: '1.6cqw' }}>{film.title} · {film.duration} s · press Space or click to roll</p>
          </div>
        )}
        {phase === 'loading' && <p className="absolute inset-0 m-0 flex items-center justify-center font-display text-[#f9e6cf]">Setting the stage…</p>}
        {phase === 'error' && <p className="absolute inset-0 m-0 flex items-center justify-center p-6 font-display text-danger">Film stopped: {error}</p>}
      </div>
    </div>
  )
}
