/**
 * `?tour=main` (VIDEO.md): plays the app tour over the real app (mock mode). Mounted by AppShell, so it stays
 * through route changes. Same window.__film handle as the film page, plus `preroll`: the seconds the renderer
 * steps before it rolls, so the mock scenario is where the tour expects it (tourMain.ts TOUR_ALIGN_MS).
 *   &subs=1 subtitles · &tc=1 timecode · &autostart=1 roll at once · &render=1 frame by frame
 */
import { useEffect } from 'react'
import { useRuntime } from '../app-context'
import type { FilmHandle } from './FilmPage'
import { TourDirector } from './tour'
import { TOUR_ALIGN_MS, TOUR_DURATION, TOUR_FILES, tourMain, type Mainnet, type TourAssets } from './tourMain'

/** the tour's files, if tools/film-assets.mjs made them (a missing file is the SPA's HTML, not an error) */
async function loadAssets (): Promise<TourAssets> {
  const assets: TourAssets = { tx: {}, shots: {} }
  for (const k of ['settlement', 'sweep'] as Mainnet[]) {
    try { const r = await fetch(TOUR_FILES.tx(k)); if (r.ok && (r.headers.get('content-type') ?? '').includes('json')) assets.tx[k] = await r.json() } catch { /* no file */ }
    try { const r = await fetch(TOUR_FILES.shot(k), { method: 'HEAD' }); if (r.ok && (r.headers.get('content-type') ?? '').startsWith('image/')) assets.shots[k] = TOUR_FILES.shot(k) } catch { /* no file */ }
  }
  return assets
}

export default function TourRunner () {
  const { mock } = useRuntime()
  useEffect(() => {
    const params = new URLSearchParams(location.search)
    const render = params.get('render') === '1'
    const vt = render ? window.__vt : undefined
    let cancelled = false
    const d = new TourDirector({ subs: params.get('subs') === '1', tc: params.get('tc') === '1' })
    let rollNow: () => void = () => {}
    const roll = new Promise<void>(resolve => { rollNow = resolve })
    const handle: FilmHandle & { preroll: number, cues: TourDirector['cues'] } = {
      ready: false, started: false, done: false, duration: TOUR_DURATION, preroll: 0, cues: d.cues, late: d.late,
      now: () => (handle.started ? d.now() : 0),
      begin: () => { if (handle.started) return; handle.started = true; rollNow() },
      step: async () => {}
    }
    window.__film = handle
    void (async () => {
      // the Town canvas and the fonts first: the tour starts by shrinking the film into that canvas
      while (!cancelled && document.querySelector('[data-testid=town] canvas') === null) await new Promise(r => setTimeout(r, 50))
      await document.fonts.ready
      const assets = await loadAssets()
      if (cancelled) return
      const startedAt = mock?.scenario.startedAt ?? Date.now()
      handle.preroll = Math.max(0, (startedAt + TOUR_ALIGN_MS - Date.now()) / 1000)
      if (vt !== undefined) { vt.freeze(); handle.step = async ms => { await vt.advance(ms) } }
      void tourMain(d, mock, assets, roll).then(() => { handle.done = true }).catch(err => { handle.error = String((err as Error).message ?? err); console.error('[tour]', err) })
      handle.ready = true
      if (render) return
      // a live take: Space rolls, after waiting for the scenario to reach the tour's start
      const go = (e: KeyboardEvent): void => {
        if (e.key !== ' ') return
        e.preventDefault()
        window.removeEventListener('keydown', go)
        const wait = Math.max(0, startedAt + TOUR_ALIGN_MS - Date.now())
        setTimeout(() => handle.begin(), wait)
      }
      if (params.get('autostart') === '1') setTimeout(() => handle.begin(), Math.max(0, startedAt + TOUR_ALIGN_MS - Date.now()))
      else window.addEventListener('keydown', go)
    })()
    return () => { cancelled = true; d.destroy(); if (window.__film === handle) delete window.__film }
  }, [mock])
  return null
}
