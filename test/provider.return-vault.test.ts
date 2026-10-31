/**
 * Where `/v1/credits/return` sends vault-redeemed credits (THREAT-MODEL T-10, AUDIT-READINESS F-10).
 * Unit level: the real CreditLedger and returnCredits, a recording TokenKit, no chain.
 *
 * The second test reproduced F-10 (a full return went to the agent's key); fixed 31.10, it now guards the fix.
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

  it('F-10 (fixed): returning the whole balance also goes back onto the vault script', async () => {
    const { deps, sent } = provider(3)
    await returnCredits(deps, AGENT, { credits: 3 })
    // the vault is read before the debit that empties the balance (and drops the mapping)
    expect(sent).toEqual([{ to: 'vault', credits: 3n }])
  })

  it('a failed return restores the balance and its vault', async () => {
    const { deps } = provider(3)
    ;(deps.kit as any).sendToVault = async () => { throw new Error('broadcast failed') }
    await expect(returnCredits(deps, AGENT, { credits: 3 })).rejects.toThrow(/could not send the credits back/)
    expect(deps.ledger.balance(AGENT, TOKEN)).toBe(180)
    expect(deps.ledger.vaultOf(AGENT, TOKEN)).toBe(VAULT_SCRIPT)
  })
})
