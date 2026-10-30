#!/usr/bin/env node
/**
 * Mainnet preflight (plan/MAINNET-RUNBOOK.md §1): is this machine ready for
 * the mainnet run? Spends nothing, never prints a key, opens no wallet
 * unless --wallets is given.
 *
 *   node infra/preflight.mjs              # runtime, .env names, identities, Arcade, WhatsOnChain, services, BSV Desktop
 *   node infra/preflight.mjs --wallets    # + server wallet balances against their targets (docs/OPS.md §1)
 *   node infra/preflight.mjs --root <dir> # check another checkout (its .env, node_modules, config)
 *
 * Exit 1 when something blocks S1 (the walking skeleton); warnings do not.
 */
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const args = process.argv.slice(2)
const rootArg = args.indexOf('--root')
const root = rootArg >= 0 ? resolve(args[rootArg + 1]) : resolve(dirname(fileURLToPath(import.meta.url)), '..')
const results = []
const ok = (area, msg) => results.push({ level: 'ok', area, msg })
const warn = (area, msg, next) => results.push({ level: 'warn', area, msg, next })
const block = (area, msg, next) => results.push({ level: 'block', area, msg, next })

// ── .env (names only; values are never printed) ──────────────────────────────
const env = { ...process.env }
const envFile = join(root, '.env')
const envNames = new Set()
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, 'utf8').split('\n')) {
    const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line)
    if (m === null || line.trimStart().startsWith('#')) continue
    const value = m[2].replace(/^(['"])(.*)\1$/, '$2')
    if (value !== '') envNames.add(m[1])
    env[m[1]] ??= value
  }
}
const net = (env.NETWORK ?? 'main') === 'test' ? 'test' : 'main'
const arcade = env.ARCADE_URL || (net === 'main' ? 'https://arcade-v2-us-1.bsvblockchain.tech' : 'https://arcade-v2-testnet-us-1.bsvblockchain.tech')
const originator = env.APP_ORIGINATOR || 'agentcoop.local'

async function get (url, init = {}) {
  try {
    const res = await fetch(url, { ...init, signal: AbortSignal.timeout(5_000) })
    return { status: res.status, body: await res.json().catch(() => undefined) }
  } catch (e) {
    return { error: String(e.cause?.code ?? e.message) }
  }
}

// ── runtime ──────────────────────────────────────────────────────────────────
const [maj, min] = process.versions.node.split('.').map(Number)
if (maj > 22 || (maj === 22 && min >= 15)) ok('runtime', `Node ${process.versions.node}`)
else block('runtime', `Node ${process.versions.node}: the register-sdk hook needs Node ≥ 22.15`, 'nvm use 22 (or install Node 24)')
if (existsSync(join(root, 'node_modules', '.bin', 'tsx'))) {
  const probe = "import('@agentcoop/core/sdk').then(s => import('@agentcoop/core').then(c => { if (typeof s.Transaction !== 'function' || typeof c.planSettlement !== 'function') process.exit(3); console.log('sdk ok') }))"
  const r = spawnSync(join(root, 'node_modules', '.bin', 'tsx'), ['--import', '@agentcoop/core/register-sdk', '-e', probe], { cwd: root, encoding: 'utf8', timeout: 60_000 })
  if (r.status === 0 && r.stdout.includes('sdk ok')) ok('runtime', 'tsx + register-sdk: @agentcoop/core and its SDK load (one copy)')
  else block('runtime', `tsx + register-sdk cannot load @agentcoop/core (exit ${r.status}): ${(r.stderr || r.stdout).split('\n').find(l => /Error/.test(l)) ?? ''}`, 'npm install at the repo root; check STATUS for register-sdk notes')
} else {
  block('runtime', 'node_modules missing', 'npm install (repo root)')
}

// ── repo hygiene and secrets ─────────────────────────────────────────────────
const ignored = ['.env', 'data/', 'data/wallets/x.sqlite'].every(p => spawnSync('git', ['check-ignore', '-q', p], { cwd: root }).status === 0)
if (ignored) ok('secrets', '.env and data/ are git-ignored')
else block('secrets', '.env or data/ is NOT git-ignored', 'fix .gitignore before creating keys (docs/OPS.md §6)')
if (!existsSync(envFile)) {
  block('secrets', 'no .env in the repo root', 'docs/OPS.md §2: .env.example → .env, keygen --only-missing >> .env')
} else {
  const mode = statSync(envFile).mode & 0o777
  if ((mode & 0o077) === 0) ok('secrets', '.env permissions 600')
  else warn('secrets', `.env permissions ${mode.toString(8)} (group/other can read it)`, 'chmod 600 .env')
  if (net === 'main') ok('config', 'NETWORK = main')
  else warn('config', `NETWORK = ${env.NETWORK}`, 'the track runs on mainnet; set NETWORK=main for the real run')
  const s1 = ['WALLET_PROVIDER_API_KEY', 'WALLET_AGENT_1_KEY', 'WALLET_AGENT_2_KEY']
  const rest = ['WALLET_COORDINATOR_KEY', 'WALLET_GUARD_KEY', 'WALLET_AGENT_3_KEY', 'WALLET_MAKER_KEY']
  const missingS1 = s1.filter(k => !envNames.has(k))
  const missingRest = rest.filter(k => !envNames.has(k))
  if (missingS1.length === 0) ok('secrets', `S1 wallet keys set (${s1.length})`)
  else block('secrets', `missing in .env: ${missingS1.join(', ')}`, 'npx tsx scripts/keygen.ts --only-missing >> .env (never paste keys anywhere else)')
  if (missingRest.length === 0) ok('secrets', `other wallet keys set (${rest.length})`)
  else warn('secrets', `not set yet: ${missingRest.join(', ')}`, 'needed after S1 (guard, vault, rail)')
}
const idFile = join(root, 'config', 'identities.json')
if (existsSync(idFile)) {
  const ids = JSON.parse(readFileSync(idFile, 'utf8'))
  const names = Object.keys(ids).filter(k => /^0[23][0-9a-f]{64}$/.test(ids[k] ?? ''))
  ok('identities', `config/identities.json: ${names.length} identities (${names.join(', ')})`)
} else {
  warn('identities', 'config/identities.json missing', 'npx tsx scripts/identities.ts')
}

// ── network ──────────────────────────────────────────────────────────────────
const health = await get(`${arcade}/health`)
if (health.body?.healthy === true) {
  const fees = (health.body.datahub_urls ?? []).filter(d => d.policy?.miningFee !== undefined).map(d => d.policy.miningFee.satoshis * 1000 / d.policy.miningFee.bytes)
  ok('network', `Arcade ${health.body.version} healthy, height ${health.body.blockHeight}, fee ${Math.min(...fees)}–${Math.max(...fees)} sat/kB`)
} else {
  block('network', `Arcade ${arcade}/health: ${health.error ?? health.status}`, 'check the network; Arcade is the broadcaster and SPV header source')
}
const woc = await get(`https://api.whatsonchain.com/v1/bsv/${net}/chain/info`)
if (woc.body?.blocks !== undefined) ok('network', `WhatsOnChain reachable (height ${woc.body.blocks})`)
else warn('network', `WhatsOnChain: ${woc.error ?? woc.status}`, 'only a fallback (lineage, spent checks); rate-limited without a key')

// ── services ─────────────────────────────────────────────────────────────────
const svc = [
  ['overlay', `${env.OVERLAY_URL || 'http://localhost:8080'}/agentcoop/healthz`, 'node infra/run.mjs'],
  ['coordinator', `${env.COOP_API_URL || 'http://localhost:8090'}/healthz`, 'node infra/run.mjs'],
  ['guard', `${env.GUARD_URL || 'http://localhost:8091'}/healthz`, 'npm run guard -w @agentcoop/guard'],
  ['provider-api', `${env.PROVIDER_API_URL || 'http://localhost:8092'}/healthz`, 'npm run provider']
]
for (const [name, url, start] of svc) {
  const r = await get(url)
  if (r.status === 200) {
    const extra = name === 'coordinator' ? (r.body?.engine === true ? ' (signing rounds on)' : ' — engine OFF') : ''
    if (name === 'coordinator' && r.body?.engine !== true) warn('services', `${name} up${extra}`, 'start it with `node infra/run.mjs` (Track A protocol wired)')
    else ok('services', `${name} up${extra}`)
  } else {
    warn('services', `${name} not running (${r.error ?? r.status})`, start)
  }
}

// ── BSV Desktop (BRC-100 over HTTP; isAuthenticated / getNetwork need no permission) ──
const desktop = async call => await get(`http://localhost:3321/${call}`, {
  method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/json', Origin: `http://${originator}`, Originator: `http://${originator}` }, body: '{}'
})
const auth = await desktop('isAuthenticated')
if (auth.body?.authenticated === true) {
  const n = await desktop('getNetwork')
  if (n.body?.network === 'mainnet') ok('desktop', 'BSV Desktop on this machine: unlocked, mainnet')
  else warn('desktop', `BSV Desktop network: ${n.body?.network ?? n.error ?? n.status}`, 'switch Desktop to the mainnet wallet')
} else {
  warn('desktop', `BSV Desktop not reachable on :3321 (${auth.error ?? auth.status ?? 'locked'})`, 'needed for funding (treasury), validation 2/3, provider-cli, participant-cli, owner-cli: open and unlock it')
}

// ── wallets (opt-in: opens the server wallets' sqlite files) ─────────────────
if (args.includes('--wallets')) {
  const targets = { 'provider-api': 20_000, coordinator: 5_000, guard: 5_000, 'agent-1': 50_000, 'agent-2': 50_000, 'agent-3': 50_000, maker: 30_000 }
  const s1Min = { 'provider-api': 5_000, 'agent-1': 5_000, 'agent-2': 5_000 }
  const r = spawnSync('npm', ['run', '-s', 'balances', '-w', '@agentcoop/scripts', '--', '--json'], { cwd: root, encoding: 'utf8', timeout: 120_000 })
  const start = r.stdout.indexOf('{\n')
  let report
  try { report = JSON.parse(r.stdout.slice(start)) } catch { report = undefined }
  if (report === undefined) {
    warn('wallets', `could not read balances (exit ${r.status})`, 'npm run balances -w @agentcoop/scripts')
  } else {
    if (!report.probeDone) warn('wallets', 'first-run lock still active (no ≤ 1,000-sat mainnet payment yet)', 'npx tsx scripts/fund.ts agent-1=1000 (docs/OPS.md §3.2)')
    for (const row of report.rows) {
      const want = targets[row.name]
      if (want === undefined) continue
      if (row.sats === undefined) warn('wallets', `${row.name}: ${row.note ?? 'unknown'}`)
      else if (s1Min[row.name] !== undefined && row.sats < s1Min[row.name]) block('wallets', `${row.name}: ${row.sats} sat (< ${s1Min[row.name]} needed for S1)`, 'docs/OPS.md §3.3')
      else if (row.sats < want) warn('wallets', `${row.name}: ${row.sats} sat (target ${want})`, 'docs/OPS.md §3')
      else ok('wallets', `${row.name}: ${row.sats} sat`)
    }
  }
}

// ── report ───────────────────────────────────────────────────────────────────
const mark = { ok: '✓', warn: '!', block: '✗' }
for (const area of [...new Set(results.map(r => r.area))]) {
  console.log(`\n${area}`)
  for (const r of results.filter(x => x.area === area)) console.log(`  ${mark[r.level]} ${r.msg}${r.next !== undefined ? `\n      → ${r.next}` : ''}`)
}
const blocking = results.filter(r => r.level === 'block').length
const warnings = results.filter(r => r.level === 'warn').length
console.log(`\n${blocking === 0 ? 'Ready for S1' : `${blocking} blocking`}${warnings > 0 ? `, ${warnings} warning(s)` : ''}. Runbook: plan/MAINNET-RUNBOOK.md`)
process.exit(blocking === 0 ? 0 : 1)
