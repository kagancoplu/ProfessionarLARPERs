#!/usr/bin/env node
/**
 * Renders a film-mode script (src/film) frame by frame into an MP4 (VIDEO.md → Film mode):
 *   npm -w apps/web run film:render                    → film-out/pool.mp4 (1920×1080, 30 fps)
 *   FILM=pool FPS=60 SUBS=1 npm -w apps/web run film:render
 * The page's clock only moves when this script steps it, so every frame is on time even on a slow machine
 * (and the render lines up with the voice-over to the frame). Starts its own mock dev server unless BASE is set.
 * Env: FILM (pool), FPS (30), SUBS=1 (burn in the narrator's subtitles), OUT (film-out), BASE (http://…),
 *      GPU=1 (use the machine's GPU instead of SwiftShader), CRF (14), CHROMIUM (a Chromium binary, when
 *      Playwright's own browser is not installed).
 * Its dev server runs without hot reload (FILM_RENDER=1 in vite.config.ts), so editing src/ does not end the take.
 * Needs ffmpeg on the PATH.
 */
import { spawn } from 'node:child_process'
import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { chromium } from '@playwright/test'

const film = process.env.FILM ?? 'pool'
const fps = Number(process.env.FPS ?? 30)
const outDir = resolve(process.cwd(), process.env.OUT ?? 'film-out')
const file = resolve(outDir, `${film}${process.env.SUBS === '1' ? '-subs' : ''}.mp4`)
const crf = process.env.CRF ?? '14'
await mkdir(outDir, { recursive: true })

let server
let base = process.env.BASE
if (base === undefined) {
  const port = 5179
  base = `http://localhost:${port}`
  server = spawn('npx', ['vite', '--mode', 'mock', '--port', String(port), '--strictPort'], { stdio: 'ignore', env: { ...process.env, FILM_RENDER: '1' } })
  for (let i = 0; ; i++) {
    try { if ((await fetch(base)).ok) break } catch { /* not up yet */ }
    if (i > 60) throw new Error('the dev server did not start on :5179')
    await new Promise(r => setTimeout(r, 500))
  }
}

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM, args: process.env.GPU === '1' ? [] : ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 })
page.on('pageerror', e => console.error('[page]', e.message))
page.on('console', m => { if (m.type() === 'warning' && m.text().startsWith('[film]')) console.warn(m.text()) })
// the first visit lets Vite discover and pre-bundle the film's dependencies; the second one is the take
await page.goto(`${base}/film?film=${film}&render=1`)
await page.waitForFunction(() => window.__film?.ready === true, null, { timeout: 90_000 })
await page.goto(`${base}/film?film=${film}&render=1${process.env.SUBS === '1' ? '&subs=1' : ''}`)
await page.waitForFunction(() => window.__film?.ready === true, null, { timeout: 90_000 })
const duration = await page.evaluate(() => window.__film.duration)
const frames = Math.ceil(duration * fps)

const ffmpeg = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(fps), '-i', '-',
  '-c:v', 'libx264', '-preset', 'slow', '-crf', crf, '-pix_fmt', 'yuv420p', '-movflags', '+faststart', file], { stdio: ['pipe', 'inherit', 'inherit'] })
const encoded = new Promise((res, rej) => { ffmpeg.on('close', code => (code === 0 ? res() : rej(new Error(`ffmpeg exited with ${code}`)))) })

await page.evaluate(() => window.__film.begin())
const dt = 1000 / fps
const started = Date.now()
for (let i = 0; i < frames; i++) {
  // one game step per frame, then let the compositor present it before the screenshot
  await page.evaluate(ms => new Promise(r => { window.__film.step(ms); requestAnimationFrame(() => r()) }), dt)
  const png = await page.screenshot({ type: 'png' })
  if (!ffmpeg.stdin.write(png)) await new Promise(r => ffmpeg.stdin.once('drain', r))
  if (i % fps === 0) process.stdout.write(`\r${(i / fps).toFixed(0)} / ${duration} s`)
}
ffmpeg.stdin.end()
await encoded
const { late, error } = await page.evaluate(() => ({ late: window.__film.late, error: window.__film.error }))
await browser.close()
server?.kill()
console.log(`\n${file} · ${frames} frames · ${((Date.now() - started) / 1000).toFixed(0)} s to render`)
if (error !== undefined) console.error(`the script stopped: ${error}`)
for (const l of late) console.warn(`late beat: ${l.beat} +${l.by.toFixed(2)} s (a walk took longer than the script allows)`)
