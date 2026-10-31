/**
 * Fund wallets from BSV Desktop with BRC-29 payments (MASTER-PLAN §6.2 step 4).
 * Run it on the laptop where the treasury BSV Desktop is open and unlocked.
 *
 *   npx tsx scripts/fund.ts agent-1=1000                               # first mainnet run: ≤ 1,000 sats
 *   npx tsx scripts/fund.ts agent-1=49000 agent-2=50000 provider-api=20000
 *   npx tsx scripts/fund.ts desktop-owner=60000                        # Desktop → Desktop
 *
 * A target whose key is in this machine's .env is paid and internalized at
 * once. Any other target (another laptop, another Desktop) needs its identity
 * key in config/identities.json; its payment is saved under data/payments/
 * and accepted on that machine with scripts/receive.ts.
 *
 * Options: --dry-run · --max-total <sats> (default 400000) · --force (skip the first-run lock)
 * First-run lock: on mainnet, no payment above 1,000 sats until one ≤ 1,000 sat
 * payment has been accepted (data/ops/mainnet-probe.json).
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { PrivateKey } from '@agentcoop/core/sdk'
import { arcadeUrl, chain, hasKey, requireKey, wocTxUrl } from './lib/env'
import { PAYMENTS_DIR, PROBE_FILE, connectDesktop, flag, loadIdentities, option, run, short } from './lib/cli'
import { acceptPayment, markAccepted, payTarget, savePaymentFile } from './lib/funding'
import { ArcadeChainTracker } from '@agentcoop/core/kit/arcadeChainTracker'
import { openWallet } from './wallets'

const PROBE_MAX = 1_000

interface Planned { name: string, identityKey: string, sats: number, local: boolean }

function plan (specs: string[]): Planned[] {
  const ids = loadIdentities()
  return specs.map(spec => {
    const m = /^([a-z0-9-]+)=(\d+)$/.exec(spec)
    if (m === null) throw new Error(`bad target "${spec}", expected name=sats (e.g. agent-1=50000)`)
    const [, name, amount] = m
    const sats = Number(amount)
    if (hasKey(name)) return { name, identityKey: PrivateKey.fromHex(requireKey(name)).toPublicKey().toString(), sats, local: true }
    const identityKey = ids[name]
    if (identityKey === undefined) throw new Error(`unknown target "${name}": no key in .env and not in config/identities.json (run scripts/identities.ts on its machine)`)
    return { name, identityKey, sats, local: false }
  })
}

run(async () => {
  const args = process.argv.slice(2)
  const targets = plan(args.filter(a => !a.startsWith('--') && a !== option(args, '--max-total')))
  if (targets.length === 0) throw new Error('usage: npx tsx scripts/fund.ts <name>=<sats> … [--dry-run] [--max-total N] [--force]')

  const total = targets.reduce((s, t) => s + t.sats, 0)
  const maxTotal = Number(option(args, '--max-total') ?? 400_000)
  if (total > maxTotal) throw new Error(`total ${total} sats exceeds --max-total ${maxTotal}`)
  if (new Set(targets.map(t => t.name)).size !== targets.length) throw new Error('a target appears twice')

  const probeDone = existsSync(PROBE_FILE)
  if (chain() === 'main' && !probeDone && !flag(args, '--force') && targets.some(t => t.sats > PROBE_MAX)) {
    throw new Error(`first mainnet run: send one payment of ≤ ${PROBE_MAX} sats first (e.g. fund.ts agent-1=1000), or pass --force`)
  }

  console.log(`Funding plan (${chain()}net, total ${total} sats):`)
  for (const t of targets) console.log(`  ${t.name.padEnd(16)} ${String(t.sats).padStart(8)} sat  → ${short(t.identityKey)}  ${t.local ? 'accept here' : 'save for receive.ts'}`)
  if (flag(args, '--dry-run')) return

  const { wallet: desktop, identityKey: treasuryKey } = await connectDesktop()
  if (targets.some(t => t.identityKey === treasuryKey)) throw new Error('a target is the treasury Desktop itself')
  console.log(`Treasury Desktop ${short(treasuryKey)} connected. Approve each payment in BSV Desktop.`)

  const tracker = new ArcadeChainTracker(arcadeUrl())
  const rows: string[] = []
  for (const t of targets) {
    const record = await payTarget(desktop, t, t.sats).catch((e: unknown) => {
      const m = e instanceof Error ? e.message : String(e)
      // HTTPWalletJSON drops the response body; nothing was paid when createAction fails.
      throw new Error(/HTTP status 400/.test(m) ? `${m}: BSV Desktop refused the payment, nothing was sent (usually not enough sats in this Desktop, or the approval was denied)` : m)
    })
    const file = savePaymentFile(PAYMENTS_DIR, record) // on disk before anything else can fail
    console.log(`✓ paid ${t.name} ${t.sats} sat  ${wocTxUrl(record.txid)}`)
    rows.push(`| ${new Date().toISOString().slice(0, 16).replace('T', ' ')} | FUND | ${record.txid} | D | ${t.name} ${t.sats} sat |`)

    if (!t.local) { console.log(`  saved ${file} → run scripts/receive.ts on the ${t.name} machine`); continue }
    const w = await openWallet(t.name)
    try {
      await acceptPayment(w.wallet, record, tracker)
      markAccepted(file)
      console.log(`  accepted into ${t.name}`)
      if (!probeDone && chain() === 'main' && t.sats <= PROBE_MAX) {
        mkdirSync(join(PROBE_FILE, '..'), { recursive: true })
        writeFileSync(PROBE_FILE, JSON.stringify({ txid: record.txid, target: t.name, sats: t.sats, at: new Date().toISOString() }, null, 2))
        console.log('  first mainnet payment accepted: lock lifted')
      }
    } catch (e) {
      console.log(`  ! not accepted yet (${e instanceof Error ? e.message : String(e)}). The payment is safe in ${file}; retry: npx tsx scripts/receive.ts ${file}`)
    } finally {
      await w.close()
    }
  }
  console.log('\nRows for docs/reference/transactions.md:')
  for (const r of rows) console.log(r)
})
