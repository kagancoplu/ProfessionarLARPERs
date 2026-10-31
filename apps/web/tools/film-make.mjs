#!/usr/bin/env node
/**
 * The whole demo video in one go (VIDEO.md): renders the four segments, fetches the tour's mainnet data, mixes
 * the soundtrack and cuts film-out/agentcoop-demo.mp4. The narrator must exist already (npm run film:voice: it
 * needs the Kokoro model). Each step can also run alone; ONLY=tour,mix runs just those (render steps are pool,
 * assets, tour, why, manifesto, then mix). Env is passed through (CHROMIUM, GPU, FPS, …).
 */
import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

const only = process.env.ONLY?.split(',')
const want = (step) => only === undefined || only.includes(step)
const run = (args, env = {}) => execFileSync(process.execPath, args, { stdio: 'inherit', env: { ...process.env, ...env } })
const tsx = resolve(process.cwd(), '../../node_modules/tsx/dist/cli.mjs')

if (!existsSync(resolve(process.cwd(), 'film-out/voice/durations.json')) && want('mix')) {
  console.error('no narrator yet: run `npm -w apps/web run film:voice` first (Kokoro-82M, see VIDEO.md)')
  process.exit(1)
}
if (want('pool')) run(['tools/film-render.mjs'], { SEG: 'pool' })
// the tour opens on the film's last frame and shows two mainnet transactions
if (want('assets')) run(['tools/film-assets.mjs'], { NODE_USE_ENV_PROXY: process.env.NODE_USE_ENV_PROXY ?? (process.env.HTTPS_PROXY !== undefined ? '1' : '') })
for (const seg of ['tour', 'why', 'manifesto']) if (want(seg)) run(['tools/film-render.mjs'], { SEG: seg })
if (want('mix')) run([existsSync(tsx) ? tsx : 'tsx', 'tools/film-mix.mjs'])
