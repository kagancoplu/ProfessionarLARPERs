/**
 * Fetch the missing merkle proofs of server wallets (wallet-toolbox's CheckForProofs task, run by hand).
 *
 *   npm run prove -w @agentcoop/scripts                 # every server wallet with a key in .env
 *   npm run prove -w @agentcoop/scripts -- agent-2 maker
 *
 * Why: a wallet whose monitor did not collect proofs keeps its mined transactions "unproven", and every new
 * transaction then carries all of them as unconfirmed ancestors until "Maximum BEEF depth exceeded" (mainnet,
 * 31.10: agent-2 had 103). Read-only on chain: it asks for proofs and stores them; nothing is broadcast.
 */
import { fetchChainPolicy } from '@agentcoop/core'
import { arcadeUrl, hasKey, WALLET_NAMES } from './lib/env'
import { run } from './lib/cli'
import { openWallet } from './wallets'

run(async () => {
  const names = process.argv.slice(2).length > 0 ? process.argv.slice(2) : WALLET_NAMES.filter(hasKey)
  const { height } = await fetchChainPolicy(arcadeUrl())
  for (const name of names) {
    const w = await openWallet(name, { startMonitor: false })
    try {
      const unproven = async (): Promise<number> =>
        (await w.wallet.listActions({ labels: [], limit: 10_000 })).actions.filter(a => a.status === 'unproven').length
      const before = await unproven()
      // the task only proves transactions up to the newest header it has seen
      ;(w.monitor as unknown as { lastNewHeader?: { height: number } }).lastNewHeader = { height }
      for (let pass = 0; pass < 10; pass++) {
        await w.monitor.runTask('CheckForProofs')
        if (await unproven() === 0) break
      }
      console.log(`${name.padEnd(13)} unproven ${before} → ${await unproven()}`)
    } finally {
      await w.close()
    }
  }
})
