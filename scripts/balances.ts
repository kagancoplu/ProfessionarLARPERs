/**
 * Balances of every server wallet on this machine, with WhatsOnChain links.
 *
 *   npx tsx scripts/balances.ts            # server wallets (keys in .env)
 *   npx tsx scripts/balances.ts --desktop  # + the app baskets of the BSV Desktop open here
 *   npx tsx scripts/balances.ts --json
 *
 * BSV Desktop does not let apps list its `default` basket (wallet-toolbox
 * WalletPermissionsManager.isAdminBasket), so a Desktop's own balance is read
 * in the Desktop UI; here we only see the AgentCoop baskets.
 */
import { existsSync } from 'node:fs'
import { WALLET_NAMES, chain, hasKey, wocTxUrl } from './lib/env'
import { PROBE_FILE, connectDesktop, flag, run, short } from './lib/cli'
import { poolBalance } from './lib/funding'
import { openWallet } from './wallets'

const DESKTOP_BASKETS = ['agentcoop', 'agentcoop vault', 'agentcoop revenue', 'bsv21']

interface Row { name: string, identityKey?: string, sats?: number, utxos?: number, links: string[], note?: string }

const txLinks = (outpoints: string[], n = 3): string[] =>
  [...new Set(outpoints.map(o => o.split('.')[0]))].slice(-n).map(wocTxUrl)

run(async () => {
  const args = process.argv.slice(2)
  const rows: Row[] = []

  for (const name of WALLET_NAMES) {
    if (!hasKey(name)) { rows.push({ name, links: [], note: 'no key in .env' }); continue }
    const w = await openWallet(name)
    try {
      const b = await poolBalance(w.wallet)
      rows.push({ name, identityKey: w.identityKey, sats: b.spendableSatoshis, utxos: b.spendableOutputs, links: txLinks(b.outpoints) })
    } finally {
      await w.close()
    }
  }

  if (flag(args, '--desktop')) {
    const { wallet, identityKey } = await connectDesktop()
    for (const basket of DESKTOP_BASKETS) {
      const b = await poolBalance(wallet, basket)
      rows.push({ name: `desktop:${basket}`, identityKey, sats: b.spendableSatoshis, utxos: b.spendableOutputs, links: txLinks(b.outpoints) })
    }
  }

  if (flag(args, '--json')) { console.log(JSON.stringify({ network: chain(), probeDone: existsSync(PROBE_FILE), rows }, null, 2)); return }

  console.log(`Balances (${chain()}net) · first-run lock: ${existsSync(PROBE_FILE) ? 'lifted' : 'active'}`)
  let total = 0
  for (const r of rows) {
    total += r.sats ?? 0
    const amount = r.sats === undefined ? '–' : `${r.sats.toLocaleString('en-US')} sat`
    console.log(`  ${r.name.padEnd(26)} ${amount.padStart(14)}  ${r.utxos ?? ''} utxo  ${r.identityKey !== undefined ? short(r.identityKey) : ''}${r.note !== undefined ? `  (${r.note})` : ''}`)
    for (const l of r.links) console.log(`      ${l}`)
  }
  console.log(`  ${'total'.padEnd(26)} ${`${total.toLocaleString('en-US')} sat`.padStart(14)}`)
})
