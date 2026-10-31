/**
 * npm run maker → the maker's HTTP face on MAKER_URL's port (default 8094): /healthz, /quote, /events,
 * and the refund watchdog over data/rail (watchdog.ts, F-4).
 * Needs WALLET_MAKER_KEY (BSV identity) and BASE_PRIVATE_KEY (only its address is used here; never printed).
 */
import { join } from 'node:path'
import { arcadeTxFetcher, fetchChainPolicy } from '@agentcoop/core'
import { privateKeyToAccount } from 'viem/accounts'
import type { Address, Hex } from 'viem'
import { arcadeUrl, chain, DATA_DIR } from '../../../scripts/lib/env'
import { openWallet } from '../../../scripts/wallets'
import { createMakerApp } from './server'
import { arcadeBroadcast, fileRecords, startWatchdog, usdcClaimFromEnv } from './watchdog'

async function main (): Promise<void> {
  const url = new URL(process.env.MAKER_URL ?? 'http://localhost:8094')
  const port = Number(url.port === '' ? 8094 : url.port)
  const key = process.env.BASE_PRIVATE_KEY
  if (key === undefined || !/^0x[0-9a-fA-F]{64}$/.test(key)) throw new Error('BASE_PRIVATE_KEY (0x + 64 hex) is not set in .env')
  const rate = Number(process.env.RAIL_SATS_PER_USDC ?? '')
  if (!Number.isFinite(rate) || rate <= 0) throw new Error('RAIL_SATS_PER_USDC is not set in .env (sats per whole USDC)')
  const { identityKey, close } = await openWallet('maker', { startMonitor: false })
  await close()
  const app = createMakerApp({
    satsPerUsdc: rate,
    maxUsdc: 1_000_000n, // PoC: ≤ 1 USDC per swap
    makerEvm: privateKeyToAccount(key as Hex).address,
    makerBsv: identityKey,
    network: { evm: 'base-sepolia', bsv: chain(), htlc: process.env.BASE_HTLC_ADDRESS as Address | undefined, token: process.env.BASE_USDC_ADDRESS as Address | undefined }
  })
  app.listen(port, () => { console.log(`[maker] listening on :${port} · BSV ${identityKey} · ${rate} sat/USDC`) })
  const arcade = arcadeUrl()
  startWatchdog({
    records: fileRecords(join(DATA_DIR, 'rail')),
    tip: async () => (await fetchChainPolicy(arcade)).height,
    broadcast: arcadeBroadcast(arcade),
    ...usdcClaimFromEnv(process.env, chain(), arcadeTxFetcher(arcade)),
    log: line => { console.log(`[maker] ${line}`) }
  })
}

main().catch(e => { console.error(`[maker] ${(e as Error).message}`); process.exit(1) })
