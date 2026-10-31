/**
 * /film — film mode (VIDEO.md): a segment of the demo video on a black 16:9 stage, outside the app shell
 * (films.ts: "The Pool" and the manifesto in the Town, "Why BSV" as a motion graphic).
 *   ?film=pool      which segment (default pool)
 *   &subs=1         narrator lines as subtitles (to rehearse the voice-over; leave off for the final take)
 *   &tc=1           timecode, current beat and late beats in the corner
 *   &autostart=1    roll at once instead of waiting for Space / click
 *   &render=1       frame-by-frame: tools/film-render.mjs steps the page's virtual clock (vclock.ts, window.__film)
 * The stage is 1920×1080 scaled to the window; record it full screen, or render it frame by frame.
 */
import { useEffect, useRef, useState } from 'react'
import { useRuntime } from '../app-context'
import { store } from '../store'
import { FxQueue } from '../town/fx/queue'
import type { TownScene } from '../town/scenes/TownScene'
import { Director, FILM_H, FILM_W } from './director'
import { FILMS, type Film } from './films'

export interface FilmHandle {
  ready: boolean
  started: boolean
  done: boolean
  error?: string
  duration: number
  /** film seconds since the roll */
  now: () => number
  begin: () => void
  /** render mode: advance the page's clock by `ms` and draw one frame */
  step: (ms: number) => Promise<void>
  late: Array<{ beat: string, by: number }>
  /** sound effects: what happened when (tools/film-make.mjs lays them on the soundtrack) */
  cues?: Array<{ t: number, name: string }>
  /** render mode: seconds to step before rolling (the app tour waits for the mock scenario) */
  preroll?: number
}
declare global { interface Window { __film?: FilmHandle } }

type Phase = 'loading' | 'ready' | 'rolling' | 'done' | 'error'

export default function FilmPage () {
  const params = new URLSearchParams(location.search)
  const name = params.get('film') ?? 'pool'
  const film = FILMS[name]
  const render = params.get('render') === '1'
  const autostart = params.get('autostart') === '1'
  const ref = useRef<HTMLDivElement>(null)
  const tcRef = useRef<HTMLDivElement>(null)
  const { bus } = useRuntime()
  const [line, setLine] = useState<string>()
  const [card, setCard] = useState(false)
  const [t, setT] = useState(0)
  const [phase, setPhase] = useState<Phase>('loading')
  const [error, setError] = useState<string>()
  const scale = useStageScale()

  useEffect(() => {
    const prevTheme = document.documentElement.dataset.theme
    document.documentElement.dataset.theme = 'day'
    return () => { if (prevTheme !== undefined) document.documentElement.dataset.theme = prevTheme }
  }, [])

  useEffect(() => {
    const parent = ref.current
    if (parent === null || film === undefined) return
    let cancelled = false
    const vt = render ? window.__vt : undefined
    let rollNow: () => void = () => {}
    const roll = new Promise<void>(resolve => { rollNow = resolve })
    const handle: FilmHandle = { ready: false, started: false, done: false, duration: film.duration, now: () => 0, begin: () => {}, step: async () => {}, late: [], cues: film.cues ?? [] }
    window.__film = handle
    const fail = (err: unknown): void => { handle.error = String((err as Error).message ?? err); setError(handle.error); setPhase('error') }
    const ready = async (now: () => number): Promise<void> => {
      handle.now = () => (handle.started ? now() : 0)
      handle.begin = () => {
        if (handle.started) return
        handle.started = true
        setPhase('rolling')
        // subtitles from narration.ts, on the page's clock
        for (const l of film.narration) { setTimeout(() => setLine(l.text), l.at * 1000); setTimeout(() => setLine(s => (s === l.text ? undefined : s)), (l.at + l.sec) * 1000) }
        rollNow()
      }
      // render mode: from here on the page's clock moves only when the renderer steps it (vclock.ts)
      if (vt !== undefined) { vt.freeze(); handle.step = async ms => { await vt.advance(ms) }; for (let i = 0; i < 5; i++) await handle.step(16) }
      handle.ready = true
      setPhase('ready')
      if (autostart) handle.begin()
    }

    let teardown = (): void => {}
    if (film.Scene !== undefined) {
      // a motion graphic: the film time, frame by frame
      void document.fonts.ready.then(async () => {
        if (cancelled) return
        let t0 = 0
        const frame = (): void => {
          if (cancelled) return
          const now = handle.started ? (performance.now() - t0) / 1000 : 0
          setT(now)
          if (tcRef.current !== null) tcRef.current.textContent = `${now.toFixed(1)} s`
          if (now >= film.duration && !handle.done) { handle.done = true; setPhase('done') }
          requestAnimationFrame(frame)
        }
        void roll.then(() => { t0 = performance.now() })
        requestAnimationFrame(frame)
        await ready(() => (performance.now() - t0) / 1000)
      }).catch(fail)
    } else {
      let game: import('phaser').Game | undefined
      const fx = new FxQueue({ speed: 1, reducedMotion: false })
      teardown = () => { fx.clear(); game?.destroy(true) }
      void Promise.all([import('phaser'), import('../town/scenes/TownScene'), document.fonts.ready]).then(async ([{ default: Phaser }, { TownScene: Scene }]) => {
        if (cancelled) return
        const town: TownScene = new Scene({ store, bus, fx, film: true })
        game = new Phaser.Game({
          type: params.get('canvas') === '1' ? Phaser.CANVAS : Phaser.WEBGL, parent, backgroundColor: '#000000',
          pixelArt: true, antialias: false, roundPixels: true, dom: { createContainer: true },
          // Phaser smooths the step for its first ~100 frames (half speed at 30 fps): a stepped render must not
          ...(render ? { fps: { smoothStep: false } } : {}),
          scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH, width: FILM_W, height: FILM_H },
          scene: [town]
        })
        // the scene is ready once create() has run (board and bell exist)
        while (!cancelled && (town.board === undefined || !town.alive)) await new Promise(r => setTimeout(r, 50))
        if (cancelled) return
        let beat = ''
        const d = new Director(town, {
          onBeat: b => { beat = b },
          onLate: (b, by) => { handle.late.push({ beat: b, by }); console.warn(`[film] "${b}" is ${by.toFixed(2)} s late`) },
          onCard: show => setCard(show)
        })
        handle.cues = d.cues
        town.events.on('postupdate', () => { if (tcRef.current !== null) tcRef.current.textContent = `${handle.started ? d.now().toFixed(1) : '0.0'} s · ${beat}${handle.late.length > 0 ? ` · late: ${handle.late.map(l => `${l.beat} +${l.by.toFixed(1)}`).join(', ')}` : ''}` })
        void (film.run as NonNullable<Film['run']>)(d, roll).then(() => { handle.done = true; setPhase('done') }).catch(fail)
        await ready(() => d.now())
      }).catch(fail)
    }
    return () => { cancelled = true; teardown(); if (window.__film === handle) delete window.__film }
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
  const Scene = film.Scene
  return (
    <div className="fixed inset-0 flex items-center justify-center bg-black" style={{ cursor: phase === 'rolling' || render ? 'none' : 'default' }} data-testid="film" data-phase={phase}>
      <div className="relative overflow-hidden" style={{ width: 'min(100vw, calc(100vh * 16 / 9))', aspectRatio: '16 / 9', containerType: 'inline-size' }}>
        <div ref={ref} className="pixelated absolute inset-0 overflow-hidden" />
        {Scene !== undefined && (
          // drawn at 1920×1080 and scaled to the stage
          <div className="absolute left-0 top-0 origin-top-left" style={{ width: FILM_W, height: FILM_H, transform: `scale(${scale})` }}><Scene t={t} /></div>
        )}
        <EndCard show={card} />
        {params.get('subs') === '1' && line !== undefined && (
          <div className="pointer-events-none absolute inset-x-0 bottom-[5%] flex justify-center px-[8%]" data-testid="film-subtitle">
            <p className="m-0 bg-black/70 px-[1.2cqw] py-[0.5cqw] text-center leading-tight text-[#f9e6cf]" style={{ fontFamily: 'var(--font-body)', fontSize: '1.9cqw' }}>{line}</p>
          </div>
        )}
        {params.get('tc') === '1' && <div ref={tcRef} className="pointer-events-none absolute left-[1%] top-[1%] bg-black/70 px-2 py-1 text-[#fee761]" style={{ fontFamily: 'var(--font-counter)', fontSize: '1.4cqw' }} />}
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

/** the 1920×1080 stage's scale in this window (the stage is min(100vw, 100vh·16/9) wide) */
function useStageScale (): number {
  const get = (): number => Math.min(window.innerWidth / FILM_W, window.innerHeight / FILM_H)
  const [scale, setScale] = useState(get)
  useEffect(() => { const on = (): void => setScale(get()); window.addEventListener('resize', on); return () => window.removeEventListener('resize', on) }, [])
  return scale
}

/** The last frame of the video: name, line, and a QR code to try the live demo. Fades in over the manifesto's town at dusk. */
function EndCard ({ show }: { show: boolean }) {
  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center" style={{ opacity: show ? 1 : 0, transition: 'opacity 700ms ease', background: 'rgba(29,31,43,.55)' }} data-testid="end-card">
      <div className="frame-parchment flex items-center gap-[3.2cqw] bg-surface-2 px-[3.6cqw] py-[2.4cqw]">
        <div className="flex flex-col items-start gap-[0.9cqw]">
          <p className="m-0 flex items-center gap-[1cqw] font-display" style={{ fontSize: '5cqw', lineHeight: 1 }}><span className="inline-block bg-gold" style={{ width: '3cqw', height: '3cqw', border: '0.3cqw solid #3f2832' }} />AgentCoop</p>
          <p className="m-0 font-display" style={{ fontSize: '2.3cqw' }}>Buy together. Hold nothing.</p>
          <p className="m-0 text-ink-muted" style={{ fontSize: '1.4cqw', maxWidth: '30cqw' }}>AI agents pooling GPU time on BSV · one transaction · 0 sat held by anyone</p>
          <p className="m-0" style={{ fontFamily: 'var(--font-counter)', fontSize: '1.6cqw' }}>professionar-larpe-rs.vercel.app</p>
          <p className="m-0 text-ink-muted" style={{ fontFamily: 'var(--font-counter)', fontSize: '1.25cqw' }}>github.com/kagancoplu/ProfessionarLARPERs</p>
        </div>
        <div className="flex flex-col items-center gap-[0.8cqw]">
          <span className="town-label town-label-gold" style={{ fontSize: '2.4cqw', padding: '0.3cqw 1.2cqw' }}>Try now</span>
          {/* public/ui/qr-live-demo.svg: the live demo's URL */}
          <img src="/ui/qr-live-demo.svg" alt="QR code: professionar-larpe-rs.vercel.app" style={{ width: '15cqw', height: '15cqw', imageRendering: 'pixelated', border: '0.3cqw solid #3f2832' }} />
        </div>
      </div>
    </div>
  )
}
