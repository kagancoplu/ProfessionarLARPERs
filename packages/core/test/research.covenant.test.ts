/**
 * Track A 6.6 (research): a guard-less vault as an OP_PUSH_TX covenant, checked with the
 * SDK's interpreter (Spend) only. Report: plan/phases/A-P6-covenant-report.md.
 */
import { describe, expect, it } from 'vitest'
import { LockingScript, OP, P2PKH, PrivateKey, Script, Transaction, UnlockingScript, Utils } from '../src/sdk'
import { buildCovenantSpend, covenantPreimage, covenantVaultScript, ownerSpend, type CovenantTerms } from '../src/research/covenant/vaultCovenant'
import { inputScriptValid } from '../src/util/spend'

const owner = PrivateKey.fromRandom()
const agent = PrivateKey.fromRandom()
const provider = PrivateKey.fromRandom()
const thief = PrivateKey.fromRandom()
const p2pkh = (k: PrivateKey): string => new P2PKH().lock(k.toPublicKey().toAddress()).toHex()
const terms: CovenantTerms = {
  ownerPub: owner.toPublicKey().toString(),
  agentPub: agent.toPublicKey().toString(),
  payScriptHex: p2pkh(provider),
  maxPaySats: 5_000,
  maxFeeSats: 300
}
const vault = covenantVaultScript(terms)

const funding = (sats = 20_000): Transaction => {
  const tx = new Transaction(1)
  tx.addOutput({ lockingScript: vault, satoshis: sats })
  return tx
}
const spend = (o: Partial<Parameters<typeof buildCovenantSpend>[0]> = {}): ReturnType<typeof buildCovenantSpend> =>
  buildCovenantSpend({ sourceTx: funding(), vout: 0, payScriptHex: terms.payScriptHex, paySats: 4_000, feeSats: 100, agentKey: agent, ...o })
const valid = (tx: Transaction): boolean => inputScriptValid(tx, 0)

describe('covenant vault (research 6.6)', () => {
  it('sizes', () => {
    const { tx, tries } = spend()
    const unlock = tx.inputs[0].unlockingScript!.toBinary().length
    console.log(`covenant vault: locking ${vault.toBinary().length} B, unlock ${unlock} B, spend tx ${tx.toBinary().length} B, grind tries ${tries}`)
    expect(vault.toBinary().length).toBeLessThan(1_000)
  })

  it('pays an allowlisted provider ≤ the cap, change back to the vault script, fee ≤ cap', () => {
    for (let i = 0; i < 5; i++) expect(valid(spend({ paySats: 1_000 + i * 900 }).tx)).toBe(true)
  })

  it('refuses: over the cap, another payee, change elsewhere, a fee above the cap, an extra output', () => {
    expect(valid(spend({ paySats: 5_001 }).tx)).toBe(false)
    expect(valid(spend({ payScriptHex: p2pkh(thief) }).tx)).toBe(false)
    expect(valid(spend({ tamper: tx => { tx.outputs[1].lockingScript = LockingScript.fromHex(p2pkh(thief)) } }).tx)).toBe(false)
    expect(valid(spend({ feeSats: 301 }).tx)).toBe(false)
    expect(valid(spend({ tamper: tx => { tx.outputs[1].satoshis! -= 600; tx.addOutput({ lockingScript: LockingScript.fromHex(p2pkh(thief)), satoshis: 500 }) } }).tx)).toBe(false)
  })

  it('refuses a second input (the fee can only come from the vault coin)', () => {
    const other = funding(5_000)
    expect(valid(spend({ tamper: tx => { tx.addInput({ sourceTransaction: other, sourceOutputIndex: 0, sequence: 0xffffffff }) } }).tx)).toBe(false)
  })

  it('refuses a preimage that is not this transaction\'s (OP_PUSH_TX), and a missing agent signature', () => {
    const real = spend()
    const decoy = spend({ paySats: 3_000 })
    // swap in the decoy's (valid, signed) preimage + outputs: the script recomputes its signature against THIS tx and fails
    const agentSig = real.tx.inputs[0].unlockingScript!.chunks[0].data!
    const swap = (outputs: number[], preimage: number[]): boolean => {
      real.tx.inputs[0].unlockingScript = UnlockingScript.fromHex(new Script().writeBin(agentSig).writeBin(outputs).writeBin(preimage).writeOpCode(OP.OP_0).toHex())
      return valid(real.tx)
    }
    expect(swap(real.outputs, real.preimage)).toBe(true) // control: the rebuilt unlock itself is fine
    expect(swap(decoy.outputs, decoy.preimage)).toBe(false)
    const unsigned = spend({ agentKey: thief })
    expect(valid(unsigned.tx)).toBe(false)
    expect(Utils.toHex(covenantPreimage(unsigned.tx))).toBe(Utils.toHex(unsigned.preimage))
  })

  it('the owner withdraws alone, to anywhere', () => {
    expect(valid(ownerSpend(funding(), 0, p2pkh(owner), 200, owner))).toBe(true)
    expect(valid(ownerSpend(funding(), 0, p2pkh(thief), 200, agent))).toBe(false)
  })

  it('works as version 1 (strict malleability rules) and version 2', () => {
    expect(valid(spend({ version: 1 }).tx)).toBe(true)
    expect(valid(spend({ version: 2 }).tx)).toBe(true)
  })
})
