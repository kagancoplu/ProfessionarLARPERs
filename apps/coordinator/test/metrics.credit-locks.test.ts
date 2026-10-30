/**
 * B-A5: custody classification knows A-P5 credit locks. A vault-locked
 * pledge's credits sit on its own vault script (creditScriptFor), not at a
 * receive address; that output is 'credits', not custodied. The same credits
 * on a P2PKH (or another vault) are not.
 */
import { describe, expect, it } from 'vitest'
import { LockingScript, P2PKH, PrivateKey, Transaction } from '@agentcoop/core/sdk'
import { buildBsv21Script, buildOpReturn, buildVaultCreditScript, receivePkh, type PledgeRecord } from '@agentcoop/core'
import { expectedVaultScript } from '../../../packages/overlay/src/vault'
import { classifySettlement } from '../src/metrics'

const key = (): string => PrivateKey.fromRandom().toPublicKey().toString()
const tokenId = `${'ab'.repeat(32)}_0`
const pay = new P2PKH().lock(PrivateKey.fromRandom().toAddress())
const terms = { priceSats: '1000', payScriptHex: pay.toHex(), tokenId }

describe('classifySettlement with vault-locked credits', () => {
  const participant = key()
  const vaultScript = expectedVaultScript(key(), participant, key(), 'v1')
  const record: PledgeRecord = { v: '1', poolId: tokenId, credits: '40', participant, tokenIndex: '3', signer: 'vault', creditLock: 'vault' }
  const pledge = { record, lockingScriptHex: vaultScript.toHex() }
  const settlement = (creditScript: LockingScript): Transaction => {
    const tx = new Transaction()
    tx.addOutput({ lockingScript: pay, satoshis: 1000 })
    tx.addOutput({ lockingScript: creditScript, satoshis: 1 })
    tx.addOutput({ lockingScript: vaultScript, satoshis: 500 }) // change back to the coin's own script
    tx.addOutput({ lockingScript: buildOpReturn('settle', { v: '1', poolId: tokenId, pledgeListHash: '00'.repeat(32) }), satoshis: 0 })
    return tx
  }

  it('credits on the pledge\'s own vault script are credits', () => {
    const tx = settlement(buildVaultCreditScript({ op: 'transfer', id: tokenId, amt: '40' }, vaultScript))
    expect(classifySettlement(tx, terms, [pledge])).toEqual(['provider', 'credits', 'change', 'record'])
  })

  it('the same credits at the receive address, or on another vault, are unaccounted', () => {
    const elsewhere = [
      buildBsv21Script({ op: 'transfer', id: tokenId, amt: '40' }, receivePkh(participant, 3)),
      buildVaultCreditScript({ op: 'transfer', id: tokenId, amt: '40' }, expectedVaultScript(key(), participant, key(), 'v2'))
    ]
    for (const s of elsewhere) expect(classifySettlement(settlement(s), terms, [pledge])[1]).toBe('unaccounted')
    // …while a plain P2PKH pledge's credits there are fine.
    expect(classifySettlement(settlement(elsewhere[0]), terms, [{ ...pledge, record: { ...record, signer: 'p2pkh', creditLock: undefined } }])[1]).toBe('credits')
  })
})
