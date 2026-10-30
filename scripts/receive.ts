/**
 * Accept funding payments saved by fund.ts (data/payments/*.json).
 *
 *   npx tsx scripts/receive.ts                       # every pending file whose target lives on this machine
 *   npx tsx scripts/receive.ts data/payments/x.json  # one file (e.g. copied from the treasury laptop)
 *   npx tsx scripts/receive.ts --desktop             # pending files for the BSV Desktop open on this machine
 *
 * Each payment is checked with SPV (Arcade headers), against our own derived
 * key and against the claimed amount before the wallet internalizes it.
 * Accepting the same payment twice is harmless (it is not counted twice).
 */
import { resolve } from 'node:path'
import type { WalletInterface } from '@agentcoop/core/sdk'
import { arcadeUrl, hasKey } from './lib/env'
import { PAYMENTS_DIR, connectDesktop, flag, run } from './lib/cli'
import { acceptPayment, loadPaymentFile, markAccepted, pendingPaymentFiles } from './lib/funding'
import { ArcadeChainTracker } from '@agentcoop/core/kit/arcadeChainTracker'
import { openWallet } from './wallets'

run(async () => {
  const args = process.argv.slice(2)
  const useDesktop = flag(args, '--desktop')
  const explicit = args.filter(a => !a.startsWith('--')).map(a => resolve(a))
  const files = explicit.length > 0 ? explicit : pendingPaymentFiles(PAYMENTS_DIR)
  if (files.length === 0) { console.log('no pending payments'); return }

  const tracker = new ArcadeChainTracker(arcadeUrl())
  const desktop = useDesktop ? await connectDesktop() : undefined
  let accepted = 0

  for (const file of files) {
    const record = loadPaymentFile(file)
    let wallet: WalletInterface
    let close = async (): Promise<void> => {}
    if (desktop !== undefined) {
      if (record.targetIdentityKey !== desktop.identityKey) { console.log(`- skip ${record.target} (${record.txid}): not for this Desktop`); continue }
      wallet = desktop.wallet
    } else if (hasKey(record.target)) {
      const w = await openWallet(record.target)
      wallet = w.wallet
      close = w.close
    } else {
      console.log(`- skip ${record.target} (${record.txid}): no key on this machine${record.target.startsWith('desktop-') ? ' (use --desktop on that laptop)' : ''}`)
      continue
    }
    try {
      await acceptPayment(wallet, record, tracker)
      if (file.startsWith(PAYMENTS_DIR)) markAccepted(file)
      accepted++
      console.log(`✓ ${record.target} accepted ${record.satoshis} sat (${record.txid})`)
    } catch (e) {
      console.log(`✗ ${record.target} (${record.txid}): ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      await close()
    }
  }
  console.log(`${accepted}/${files.length} accepted`)
})
