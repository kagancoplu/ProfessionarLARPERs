/**
 * Where `/v1/credits/return` sends vault-redeemed credits (THREAT-MODEL T-10, AUDIT-READINESS F-10).
 * Unit level: the real CreditLedger and returnCredits, a recording TokenKit, no chain.
 *
 * The second test reproduces an open finding and is marked `it.fails`: it passes while the bug is
 * there. When returnCredits is fixed it starts failing; then drop `.fails` so it guards the fix.
 */
import { describe, expect, it } from 'vitest'
import type { TokenKit } from '@agentcoop/core'
import { CreditLedger } from '../apps/provider-api/src/credits'
import { returnCredits, type CreditDeps } from '../apps/provider-api/src/redeem'
import type { Product } from '../apps/provider-api/src/products'

const AGENT = '02'.padEnd(66, 'a')
const TOKEN = `${'ab'.repeat(32)}_0`
const VAULT_SCRIPT = '63'.padEnd(80, 'c')
const product: Product = { id: 'gpu-h100', label: 'H100 GPU-hours', unit: 'GPU-hour', retailSatsPerCredit: 50, runner: 'gpu', minutesPerCredit: 60, tokenId: TOKEN, simulate: {} as Product['simulate'] }

/** A provider whose ledger holds `credits` whole credits that `AGENT` redeemed from a vault. */
function provider (credits: number): { deps: CreditDeps, sent: Array<{ to: 'vault' | 'agent', credits: bigint }> } {
  const ledger = new CreditLedger()
  const outpoint = `${'cd'.repeat(32)}.1`
  expect(ledger.reserveRedeem(outpoint, AGENT, TOKEN, credits * 60, 20 * 60)).toBe('ok')
  ledger.commitRedeem(outpoint)
  ledger.noteVault(AGENT, TOKEN, VAULT_SCRIPT) // as redeemCredits does after a vault-sourced redeem
  const sent: Array<{ to: 'vault' | 'agent', credits: bigint }> = []
  const kit = {
    sendToVault: async (_t: string, amt: bigint) => { sent.push({ to: 'vault', credits: amt }); return { txid: 'v' } },
    send: async (_t: string, amt: bigint) => { sent.push({ to: 'agent', credits: amt }); return { txid: 'a' } }
  } as unknown as TokenKit
  return { deps: { ledger, kit, products: [product] } as unknown as CreditDeps, sent }
}

describe('/v1/credits/return of vault-redeemed credits', () => {
  it('a partial return goes back onto the vault script', async () => {
    const { deps, sent } = provider(3)
    await returnCredits(deps, AGENT, { credits: 2 })
    expect(sent).toEqual([{ to: 'vault', credits: 2n }])
  })

  it.fails('KNOWN ISSUE F-10 (open): returning the whole balance should also go back onto the vault script', async () => {
    const { deps, sent } = provider(3)
    await returnCredits(deps, AGENT, { credits: 3 })
    // today: the debit empties the balance, the ledger drops the vault mapping, and the credits go to the agent's own key
    expect(sent).toEqual([{ to: 'vault', credits: 3n }])
  })
})
