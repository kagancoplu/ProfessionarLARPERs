#!/usr/bin/env node
/**
 * Renders one segment of the demo video frame by frame into an MP4 (VIDEO.md → Film mode):
 *   npm -w apps/web run film:render                    → film-out/pool.mp4 (+ pool.cues.json)
 *   SEG=tour npm -w apps/web run film:render           → the app tour (needs public/_film from film-assets.mjs)
 *   SEG=why | SEG=manifesto …                          → the motion graphic, the closing scene
 * The page's clock only moves when this script steps it (src/film/vclock.ts), so every frame is on time even on a
 * slow machine and the render lines up with the voice-over to the frame. Starts its own mock dev server unless
 * BASE is set; that server runs without hot reload (FILM_RENDER=1 in vite.config.ts), so editing src/ is safe.
 * Env: SEG (pool | tour | why | manifesto; FILM is the old name), FPS (30), SUBS=1 (burn in subtitles), OUT
 *      (film-out), BASE (http://…), GPU=1 (the machine's GPU instead of SwiftShader), CRF (14), CHROMIUM (a
 *      Chromium binary, when Playwright's own browser is not installed). Needs ffmpeg on the PATH.
 */
import { spawn } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import { createServer } from 'node:net'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { chromium } from '@playwright/test'

const seg = process.env.SEG ?? process.env.FILM ?? 'pool'
/** the film segments play on /film at 1920×1080; the tour plays in the app at 1440×810 shown at 4/3 (1920×1080
 *  pixels), so the app's UI reads like a laptop screen and not a wall of small text */
const SEGMENTS = {
  pool: { path: '/film?film=pool', w: 1920, h: 1080, dpr: 1 },
  why: { path: '/film?film=why', w: 1920, h: 1080, dpr: 1 },
  manifesto: { path: '/film?film=manifesto', w: 1920, h: 1080, dpr: 1 },
  tour: { path: '/?tour=main&presenter=1', w: 1440, h: 810, dpr: 4 / 3 }
}
const spec = SEGMENTS[seg]
if (spec === undefined) throw new Error(`no segment ${seg}: ${Object.keys(SEGMENTS).join(', ')}`)
const fps = Number(process.env.FPS ?? 30)
const outDir = resolve(process.cwd(), process.env.OUT ?? 'film-out')
const file = resolve(outDir, `${seg}${process.env.SUBS === '1' ? '-subs' : ''}.mp4`)
const crf = process.env.CRF ?? '14'
await mkdir(outDir, { recursive: true })

let server
let base = process.env.BASE
if (base === undefined) {
  // a free port of our own: a dev server left on a fixed port would be reused, hot reload and all
  const port = await new Promise(res => { const s = createServer().listen(0, () => { const p = s.address().port; s.close(() => res(p)) }) })
  base = `http://localhost:${port}`
  const vite = resolve(dirname(createRequire(import.meta.url).resolve('vite/package.json')), 'bin/vite.js')
  server = spawn(process.execPath, [vite, '--mode', 'mock', '--port', String(port), '--strictPort'], { stdio: 'ignore', env: { ...process.env, FILM_RENDER: '1' } })
  for (let i = 0; ; i++) {
    try { if ((await fetch(base)).ok) break } catch { /* not up yet */ }
    if (i > 60) throw new Error(`the dev server did not start on :${port}`)
    await new Promise(r => setTimeout(r, 500))
  }
}
process.on('exit', () => server?.kill())

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM, args: process.env.GPU === '1' ? [] : ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
const ctx = await browser.newContext({ viewport: { width: spec.w, height: spec.h }, deviceScaleFactor: spec.dpr })
await ctx.addInitScript(() => { try { localStorage.setItem('agentcoop.tour', 'done') } catch { /* private mode */ } })
const page = await ctx.newPage()
page.on('pageerror', e => console.error('[page]', e.message))
page.on('console', m => { if ((m.type() === 'warning' && m.text().startsWith('[film]')) || m.text().startsWith('[tour]')) console.warn(m.text()) })
/** polled from here: the page's own timers and frames are virtual, so Playwright's waitForFunction would never fire */
async function filmReady () {
  for (let i = 0; i < 180; i++) {
    if (await page.evaluate(() => window.__film?.ready === true).catch(() => false)) return
    await new Promise(r => setTimeout(r, 500))
  }
  throw new Error('the page did not get ready in 90 s')
}
const sep = spec.path.includes('?') ? '&' : '?'
// the first visit lets Vite discover and pre-bundle the dependencies; the second one is the take
await page.goto(`${base}${spec.path}${sep}render=1`)
await filmReady()
await page.goto(`${base}${spec.path}${sep}render=1${process.env.SUBS === '1' ? '&subs=1' : ''}`)
await filmReady()
const { duration, preroll } = await page.evaluate(() => ({ duration: window.__film.duration, preroll: window.__film.preroll ?? 0 }))
// the tour waits for the mock scenario to reach its first beat: step there quickly, without frames
for (let s = 0; s < preroll; s += 0.1) await page.evaluate(async () => { await window.__film.step(100) })
const frames = Math.ceil(duration * fps)

const ffmpeg = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(fps), '-i', '-',
  '-vf', 'scale=1920:1080:flags=lanczos', '-c:v', 'libx264', '-preset', 'slow', '-crf', crf, '-pix_fmt', 'yuv420p', '-movflags', '+faststart', file], { stdio: ['pipe', 'inherit', 'inherit'] })
const encoded = new Promise((res, rej) => { ffmpeg.on('close', code => (code === 0 ? res() : rej(new Error(`ffmpeg exited with ${code}`)))) })

await page.evaluate(() => window.__film.begin())
const dt = 1000 / fps
const started = Date.now()
for (let i = 0; i < frames; i++) {
  // one step of the page's clock per frame, then let the compositor present it before the screenshot
  await page.evaluate(async ms => { await window.__film.step(ms); await window.__vt.nextPaint() }, dt)
  const png = await page.screenshot({ type: 'png' })
  if (!ffmpeg.stdin.write(png)) await new Promise(r => ffmpeg.stdin.once('drain', r))
  if (i % fps === 0) process.stdout.write(`\r${seg}: ${(i / fps).toFixed(0)} / ${duration} s`)
}
ffmpeg.stdin.end()
await encoded
const { late, error, cues } = await page.evaluate(() => ({ late: window.__film.late, error: window.__film.error, cues: window.__film.cues ?? [] }))
await writeFile(resolve(outDir, `${seg}.cues.json`), JSON.stringify({ segment: seg, duration, cues }, null, 1) + '\n')
await browser.close()
server?.kill()
console.log(`\n${file} · ${frames} frames · ${cues.length} sound cues · ${((Date.now() - started) / 1000).toFixed(0)} s to render`)
if (error !== undefined) { console.error(`the script stopped: ${error}`); process.exitCode = 1 }
for (const l of late) console.warn(`late beat: ${l.beat} +${l.by.toFixed(2)} s (a walk took longer than the script allows)`)
