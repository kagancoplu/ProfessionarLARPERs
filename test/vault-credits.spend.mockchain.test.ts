/**
 * D-P2b: spending vault-locked credits (A 5.1–5.3) through the guard. Real guard over
 * HTTP, wallet-toolbox mock chain (every script verified on broadcast).
 *
 *   redeem (ALL)            credits to an allowed provider's token address, the rest back to the vault
 *   list (SINGLE|ACP 0xC3)  the proceeds go to the vault, at or above the owner's floor; a buyer completes it
 *   owner                   withdraws vault credits alone (OP_IF branch)
 *
 * The transaction builders here are test-local; Track A's src/vault/creditSpend.ts (A 5.4) is the API.
 */
import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { AuthFetch, LockingScript, P2PKH, PublicKey, Transaction, UnlockingScript, type CreateActionOutput } from '@agentcoop/core/sdk'
import { buildBsv21Script, buildVaultCreditScript, decodeBsv21Owned, receivePkh } from '@agentcoop/core'
import { VAULT_COSIGN_UNLOCK_LENGTH, VAULT_LIST_SIGHASH, VAULT_OWNER_UNLOCK_LENGTH } from '@agentcoop/core/scripts/vault'
import {
  CosignRejected, VAULT_CREDITS_BASKET, VaultOwnerSigner, VaultSigner, adoptVaultCredits, broadcastResult, httpCosigner, listVaultCredits, vaultTag,
  type CosignContext, type Cosigner, type VaultCreditUtxo
} from '@agentcoop/core/signers/VaultSigner'
import type { Wallet } from '@bsv/wallet-toolbox'
import { Guard } from '../apps/guard/src/guard'
import { createGuardApp } from '../apps/guard/src/server'
import { createVault, putPolicy, registerVault, type GuardPolicyInput, type VaultInfo } from '../apps/owner-cli/src/vault-ops'
import { createMockChain, type MockChain } from './helpers/mockchain'

let chain: MockChain
let owner: Wallet, agent: Wallet, guardWallet: Wallet, provider: Wallet, rogue: Wallet, buyer: Wallet
let server: Server
let guardUrl: string
let cosign: Cosigner
let vault: VaultInfo, otherVault: VaultInfo
let tokenId: string
const logs: string[] = []
const policy: GuardPolicyInput = { allowProviders: [], maxPerPoolSats: 5_000, weeklyCapSats: 20_000, maxFeeSats: 500, hotWalletDailySats: 0 }

const fetchTx = async (txid: string): Promise<Transaction> =>
  Transaction.fromBinary(Array.from((await (chain.services as any).storage.getTransaction(txid)).rawTx as number[]))
const refusal = async (p: Promise<unknown>): Promise<string> => {
  try { await p } catch (e) { if (e instanceof CosignRejected) return e.reason; throw e }
  throw new Error('expected the guard to refuse')
}
const transferTo = (pkh: string, amt: number): string => buildBsv21Script({ op: 'transfer', id: tokenId, amt: String(amt) }, pkh).toHex()
const toVault = (amt: number, v = vault): string => buildVaultCreditScript({ op: 'transfer', id: tokenId, amt: String(amt) }, v.lockingScriptHex).toHex()

/**
 * Test-local builder: spend one vault credit UTXO with agent + guard (kind 'redeem'); the agent's wallet
 * pays the fee. Credits that stay on the vault go straight into the credits basket (as spendFromVault
 * does with vault change): an output of the agent's own action cannot be internalized afterwards.
 */
async function redeem (utxo: VaultCreditUtxo, outputs: Array<{ lockingScript: string, satoshis?: number }>, creditPayees: CosignContext['creditPayees'] = []): Promise<{ txid: string, tx: number[] }> {
  const created = await agent.createAction({
    description: 'test: redeem vault credits',
    inputBEEF: utxo.beef,
    inputs: [{ outpoint: utxo.outpoint, unlockingScriptLength: VAULT_COSIGN_UNLOCK_LENGTH, inputDescription: 'vault credits' }],
    outputs: outputs.map((o, i): CreateActionOutput => {
      const d = decodeBsv21Owned(o.lockingScript)
      const keep = d?.owner.kind === 'vault' && d.owner.vaultScriptHex === vault.lockingScriptHex
      return {
        lockingScript: o.lockingScript,
        satoshis: o.satoshis ?? 1,
        outputDescription: `out ${i}`,
        ...(keep ? { basket: VAULT_CREDITS_BASKET, tags: [vaultTag(vault.record.vaultId), `token:${tokenId}`], customInstructions: JSON.stringify({ vaultId: vault.record.vaultId, role: 'agent', tokenId }) } : {})
      }
    }),
    options: { randomizeOutputs: false, acceptDelayedBroadcast: false, signAndProcess: false }
  })
  const st = created.signableTransaction!
  try {
    const tx = Transaction.fromAtomicBEEF(st.tx)
    const [txid, vout] = utxo.outpoint.split('.')
    const i = tx.inputs.findIndex(x => (x.sourceTXID ?? x.sourceTransaction?.id('hex')) === txid && x.sourceOutputIndex === Number(vout))
    const unlock = await new VaultSigner(agent, { vaultId: vault.record.vaultId, cosign, context: { kind: 'redeem', creditPayees } }).sign(tx, i)
    return broadcastResult(await agent.signAction({ reference: st.reference, spends: { [i]: { unlockingScript: unlock.toHex() } } }))
  } catch (e) {
    await agent.abortAction({ reference: st.reference }).catch(() => {})
    throw e
  }
}

/** The listing: the vault credit input i ↔ the output i (the proceeds), signed SINGLE|ACP by agent + guard. */
async function listing (utxo: VaultCreditUtxo, proceedsScript: string, askSats: number): Promise<string> {
  const [txid, vout] = utxo.outpoint.split('.')
  const tx = new Transaction()
  // an empty unlocking script so the skeleton serializes for the guard (txBEEF)
  tx.addInput({ sourceTransaction: Transaction.fromBEEF(utxo.beef, txid), sourceOutputIndex: Number(vout), sequence: 0xffffffff, unlockingScript: new UnlockingScript([]) })
  tx.addOutput({ lockingScript: LockingScript.fromHex(proceedsScript), satoshis: askSats })
  const unlock = await new VaultSigner(agent, { vaultId: vault.record.vaultId, cosign, context: { kind: 'list' }, scope: VAULT_LIST_SIGHASH }).sign(tx, 0)
  return unlock.toHex()
}

beforeAll(async () => {
  chain = await createMockChain()
  ;[owner, agent, guardWallet, provider, rogue, buyer] = await Promise.all(Array.from({ length: 6 }, async () => await chain.makeWallet()))
  await chain.fund(owner, 100_000)
  await chain.fund(agent, 10_000)
  await chain.fund(buyer, 20_000)
  const guard = await Guard.create({ wallet: guardWallet, fetchTx, log: l => logs.push(l) })
  server = createGuardApp(guard, guardWallet).listen(0)
  guardUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  cosign = httpCosigner(guardUrl)
  vault = await createVault(owner, { agent: agent.identityKey, guard: guardWallet.identityKey })
  await registerVault(new AuthFetch(owner), guardUrl, vault)
  otherVault = await createVault(owner, { agent: agent.identityKey, guard: guardWallet.identityKey })
  await registerVault(new AuthFetch(owner), guardUrl, otherVault)
  policy.allowProviders = [provider.identityKey]
  await putPolicy(new AuthFetch(owner), guardUrl, agent.identityKey, policy)
}, 120_000)

afterAll(async () => {
  server?.close()
  await chain?.close()
})

describe('D-P2b: vault-locked credits through the guard', () => {
  it('setup: 20 credits minted onto the vault script; the agent adopts them, not credits of another vault', async () => {
    const res = await owner.createAction({
      description: 'test: vault-locked credits',
      outputs: [
        { lockingScript: buildVaultCreditScript({ op: 'deploy+mint', amt: '20', sym: 'VCRED', dec: '0' }, vault.lockingScriptHex).toHex(), satoshis: 1, outputDescription: 'credits' },
        { lockingScript: buildVaultCreditScript({ op: 'deploy+mint', amt: '7', sym: 'OTHER', dec: '0' }, otherVault.lockingScriptHex).toHex(), satoshis: 1, outputDescription: 'credits' }
      ],
      options: { randomizeOutputs: false, acceptDelayedBroadcast: false }
    })
    const tx = Array.from(res.tx!)
    tokenId = `${res.txid!}_0`
    const c = await adoptVaultCredits(agent, vault.record.vaultId, tx, 0)
    expect(c).toMatchObject({ tokenId, amount: 20n, satoshis: 1 })
    await expect(adoptVaultCredits(agent, vault.record.vaultId, tx, 1)).rejects.toThrow(/locked to another vault/)
    expect((await listVaultCredits(agent, vault.record.vaultId)).map(u => u.amount)).toEqual([20n])
  })

  it('redeem: 5 credits to the allowed provider, 15 back to the vault; the chain accepts agent + guard', async () => {
    const [utxo] = await listVaultCredits(agent, vault.record.vaultId)
    const r = await redeem(utxo, [{ lockingScript: transferTo(receivePkh(provider.identityKey, 0), 5) }, { lockingScript: toVault(15) }], [{ vout: 0, provider: provider.identityKey, index: 0 }])
    expect(logs.at(-1)).toMatch(/ALLOW redeem .* credits=20 delivered=5 kept=15/)
    const t = await fetchTx(r.txid)
    expect(decodeBsv21Owned(t.outputs[0].lockingScript)).toMatchObject({ amount: 5n, owner: { kind: 'p2pkh', pkh: receivePkh(provider.identityKey, 0) } })
    expect(decodeBsv21Owned(t.outputs[1].lockingScript)).toMatchObject({ amount: 15n, owner: { kind: 'vault', vaultScriptHex: vault.lockingScriptHex } })
    expect((await listVaultCredits(agent, vault.record.vaultId)).map(u => u.amount)).toEqual([15n])
  })

  it('redeem refusals: a provider not allowed, the agent\'s own address (guard bypass), burning, another vault', async () => {
    const [utxo] = await listVaultCredits(agent, vault.record.vaultId) // 15
    expect(await refusal(redeem(utxo, [{ lockingScript: transferTo(receivePkh(rogue.identityKey, 0), 15) }], [{ vout: 0, provider: rogue.identityKey, index: 0 }])))
      .toBe(`provider not allowed: ${rogue.identityKey.slice(0, 10)}…`)
    expect(await refusal(redeem(utxo, [{ lockingScript: transferTo(receivePkh(agent.identityKey, 0), 15) }])))
      .toBe('credits to unlisted output (vout 0)')
    expect(await refusal(redeem(utxo, [{ lockingScript: transferTo(receivePkh(rogue.identityKey, 0), 15) }], [{ vout: 0, provider: provider.identityKey, index: 0 }])))
      .toBe('payee proof mismatch at vout 0')
    expect(await refusal(redeem(utxo, [{ lockingScript: toVault(10) }])))
      .toBe('credits not conserved (10 out of 15)')
    expect(await refusal(redeem(utxo, [{ lockingScript: toVault(15, otherVault) }])))
      .toBe('credits to another vault (vout 0)')
    expect((await listVaultCredits(agent, vault.record.vaultId)).map(u => u.amount)).toEqual([15n]) // nothing moved
  })

  it('split inside the vault (a redeem without a payee): 15 → 10 + 5', async () => {
    const [utxo] = await listVaultCredits(agent, vault.record.vaultId)
    await redeem(utxo, [{ lockingScript: toVault(10) }, { lockingScript: toVault(5) }])
    expect((await listVaultCredits(agent, vault.record.vaultId)).map(u => u.amount)).toEqual([10n, 5n])
  })

  let listed: { utxo: VaultCreditUtxo, unlockHex: string }
  it('list: off without the owner\'s floor; proceeds must go to the vault and meet the floor', async () => {
    const five = (await listVaultCredits(agent, vault.record.vaultId)).find(u => u.amount === 5n)!
    expect(await refusal(listing(five, vault.lockingScriptHex, 500))).toBe('listing not enabled by the owner (minAskSatsPerCredit)')
    await putPolicy(new AuthFetch(owner), guardUrl, agent.identityKey, { ...policy, minAskSatsPerCredit: 40 })
    const own = new P2PKH().lock(PublicKey.fromString(agent.identityKey).toAddress()).toHex() // the agent's own address
    expect(await refusal(listing(five, own, 500))).toBe('listing proceeds must go to the vault')
    expect(await refusal(listing(five, vault.lockingScriptHex, 199))).toBe('ask below minAskSatsPerCredit (199 < 200)')
    listed = { utxo: five, unlockHex: await listing(five, vault.lockingScriptHex, 200) }
    expect(logs.at(-1)).toMatch(/ALLOW list .* credits=5 ask=200/)
  })

  it('a buyer completes the listing with its own inputs: the chain accepts the SINGLE|ACP signatures; 200 sat land in the vault', async () => {
    const created = await buyer.createAction({
      description: 'test: buy listed vault credits',
      inputBEEF: listed.utxo.beef,
      inputs: [{ outpoint: listed.utxo.outpoint, unlockingScript: listed.unlockHex, inputDescription: 'listed vault credits' }],
      outputs: [
        { lockingScript: vault.lockingScriptHex, satoshis: 200, outputDescription: 'proceeds to the seller\'s vault' },
        { lockingScript: transferTo(receivePkh(buyer.identityKey, 0), 5), satoshis: 1, outputDescription: 'credits to the buyer' }
      ],
      options: { randomizeOutputs: false, acceptDelayedBroadcast: false }
    })
    const t = await fetchTx(created.txid!)
    expect(t.inputs[0].sourceTXID).toBe(listed.utxo.outpoint.split('.')[0])
    expect(t.outputs[0]).toMatchObject({ satoshis: 200 })
    expect(t.outputs[0].lockingScript.toHex()).toBe(vault.lockingScriptHex)
    expect(decodeBsv21Owned(t.outputs[1].lockingScript)).toMatchObject({ amount: 5n, owner: { kind: 'p2pkh', pkh: receivePkh(buyer.identityKey, 0) } })
  })

  it('the owner withdraws vault credits alone (OP_IF branch), without guard or agent', async () => {
    const ten = (await listVaultCredits(agent, vault.record.vaultId)).find(u => u.amount === 10n)!
    const ownerPkh = receivePkh(owner.identityKey, 0)
    const created = await owner.createAction({
      description: 'test: owner takes the vault credits',
      inputBEEF: ten.beef,
      inputs: [{ outpoint: ten.outpoint, unlockingScriptLength: VAULT_OWNER_UNLOCK_LENGTH, inputDescription: 'vault credits' }],
      outputs: [{ lockingScript: transferTo(ownerPkh, 10), satoshis: 1, outputDescription: 'credits to the owner' }],
      options: { randomizeOutputs: false, acceptDelayedBroadcast: false, signAndProcess: false }
    })
    const st = created.signableTransaction!
    const tx = Transaction.fromAtomicBEEF(st.tx)
    const i = tx.inputs.findIndex(x => (x.sourceTXID ?? x.sourceTransaction?.id('hex')) === ten.outpoint.split('.')[0])
    const unlock = await new VaultOwnerSigner(owner, { vaultId: vault.record.vaultId }).sign(tx, i)
    const r = broadcastResult(await owner.signAction({ reference: st.reference, spends: { [i]: { unlockingScript: unlock.toHex() } } }))
    expect(decodeBsv21Owned((await fetchTx(r.txid)).outputs[0].lockingScript)).toMatchObject({ amount: 10n, owner: { kind: 'p2pkh', pkh: ownerPkh } })
  })
})
