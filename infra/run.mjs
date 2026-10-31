#!/usr/bin/env node
/**
 * AgentCoop infra (Track B, Faz 3): overlay + coordinator with persistent data,
 * restarted when they crash. `node infra/run.mjs` (root `npm run infra` once
 * Track A's root package.json has the script).
 *
 * Reads the root .env if present (never overrides variables already set).
 *   DATA_DIR      ./data             persistent state: overlay/overlay.db, overlay/overlay.key, coordinator/coordinator.db
 *   OVERLAY_PORT  8080               COOP_PORT 8090
 *   COOP2_PORT    (unset)            a second, independent coordinator on the same overlay (B.P6b, Faz 6.2): own database coordinator2/coordinator.db
 *   NETWORK, ARCADE_URL, TOKEN_WHITELIST, OVERLAY_PRIVATE_KEY, ROUND_TIMEOUT_MS, MAX_ROUNDS, SPENT_CHECK  passed through
 *   SUPABASE_URL + SUPABASE_SECRET_KEY  (both set) also start apps/relay, the web's optional Supabase live layer
 */
import { spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
if (Number(process.versions.node.split('.')[0]) < 22) {
  console.error(`Node ${process.versions.node}: AgentCoop needs Node 22 or newer (nvm use 22)`)
  process.exit(1)
}

// .env (KEY=VALUE lines; values are never printed)
const envFile = join(root, '.env')
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, 'utf8').split('\n')) {
    const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line)
    if (m === null || line.trimStart().startsWith('#')) continue
    process.env[m[1]] ??= m[2].replace(/^(['"])(.*)\1$/, '$2')
  }
}

// An empty DATA_DIR= (as in .env.example) means the default, not the repo root (D's 23:05 finding).
const dataDir = resolve(root, process.env.DATA_DIR?.trim() || 'data')
// Earlier runs with DATA_DIR= kept their state in <repo>/overlay and <repo>/coordinator: refuse to
// start on a missing or older database (the overlay would forget the pools) and say how to move it.
for (const d of ['overlay', 'coordinator']) {
  const [old, db] = [join(root, d, `${d}.db`), join(dataDir, d, `${d}.db`)]
  if (old !== db && existsSync(old) && (!existsSync(db) || statSync(old).mtimeMs > statSync(db).mtimeMs)) {
    console.error(`[infra] ${old} is newer than ${db} (or that is missing): state from a run with an empty DATA_DIR. Stop the services, then:\n  mkdir -p ${join(dataDir, d)} && mv ${join(root, d)}/* ${join(dataDir, d)}/\nor run with DATA_DIR=${root}.`)
    process.exit(1)
  }
}
for (const d of ['overlay', 'coordinator', 'coordinator2']) mkdirSync(join(dataDir, d), { recursive: true })
const keyFile = join(dataDir, 'overlay', 'overlay.key')
if (process.env.OVERLAY_PRIVATE_KEY === undefined || process.env.OVERLAY_PRIVATE_KEY === '') {
  if (!existsSync(keyFile)) writeFileSync(keyFile, randomBytes(32).toString('hex'), { mode: 0o600 })
  process.env.OVERLAY_PRIVATE_KEY = readFileSync(keyFile, 'utf8').trim()
}

const overlayPort = process.env.OVERLAY_PORT ?? '8080'
const coopPort = process.env.COOP_PORT ?? '8090'
const services = [
  {
    name: 'overlay',
    cwd: join(root, 'packages/overlay'),
    env: { PORT: overlayPort, OVERLAY_DB: join(dataDir, 'overlay', 'overlay.db') }
  },
  {
    name: 'coordinator',
    cwd: join(root, 'apps/coordinator'),
    env: { PORT: coopPort, OVERLAY_URL: `http://localhost:${overlayPort}`, COORDINATOR_DB: join(dataDir, 'coordinator', 'coordinator.db') }
  },
  ...(process.env.COOP2_PORT
    ? [{
        name: 'coordinator2',
        cwd: join(root, 'apps/coordinator'),
        env: { PORT: process.env.COOP2_PORT, OVERLAY_URL: `http://localhost:${overlayPort}`, COORDINATOR_DB: join(dataDir, 'coordinator2', 'coordinator.db') }
      }]
    : []),
  // optional: the Supabase live layer for the web (apps/relay, plan/phases/SUPABASE-MVP.md)
  ...(process.env.SUPABASE_URL && process.env.SUPABASE_SECRET_KEY
    ? [{
        name: 'relay',
        cwd: join(root, 'apps/relay'),
        env: { COOP_API_URL: `http://localhost:${coopPort}`, OVERLAY_URL: `http://localhost:${overlayPort}` }
      }]
    : [])
]

let stopping = false
const children = new Map()

function start (svc, backoff = 1_000) {
  const tsx = join(root, 'node_modules', '.bin', 'tsx') // npm workspaces: dependencies live at the root
  if (!existsSync(tsx)) {
    console.error(`[${svc.name}] ${tsx} missing: run npm install at the repo root`)
    process.exit(1)
  }
  const startedAt = Date.now()
  // --import register-sdk: one runtime copy of @bsv/sdk under tsx (packages/core/register-sdk.mjs, MASTER §3.1)
  const child = spawn(tsx, ['--import', '@agentcoop/core/register-sdk', 'src/server.ts'], { cwd: svc.cwd, env: { ...process.env, ...svc.env }, stdio: ['ignore', 'pipe', 'pipe'] })
  children.set(svc.name, child)
  const prefix = (stream, out) => {
    let buf = ''
    stream.on('data', chunk => {
      buf += chunk.toString()
      let i
      while ((i = buf.indexOf('\n')) >= 0) { out.write(`[${svc.name}] ${buf.slice(0, i)}\n`); buf = buf.slice(i + 1) }
    })
  }
  prefix(child.stdout, process.stdout)
  prefix(child.stderr, process.stderr)
  child.on('exit', (code, signal) => {
    children.delete(svc.name)
    if (stopping) return
    const next = Date.now() - startedAt > 60_000 ? 1_000 : Math.min(backoff * 2, 30_000)
    console.error(`[infra] ${svc.name} exited (${signal ?? code}); restarting in ${next / 1000}s`)
    setTimeout(() => start(svc, next), next)
  })
  console.log(`[infra] ${svc.name} started (pid ${child.pid})`)
}

function stop () {
  if (stopping) return
  stopping = true
  console.log('[infra] stopping')
  for (const c of children.values()) c.kill('SIGTERM')
  setTimeout(() => process.exit(0), 2_000).unref()
}
process.on('SIGINT', stop)
process.on('SIGTERM', stop)

console.log(`[infra] data in ${dataDir}; overlay :${overlayPort}, coordinator :${coopPort}${process.env.COOP2_PORT ? `, coordinator2 :${process.env.COOP2_PORT}` : ''}${services.some(s => s.name === 'relay') ? ', relay → Supabase' : ''}`)
start(services[0])
setTimeout(() => { for (const svc of services.slice(1)) start(svc) }, 1_500) // the coordinators read the overlay
