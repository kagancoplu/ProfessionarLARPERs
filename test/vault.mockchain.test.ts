/**
 * D-P1 §9.2: the Mandate Vault end to end on wallet-toolbox's mock chain, which
 * verifies every script (MockServices → tx.verify('scripts only')).
 *
 * The guard runs over HTTP in-process; the owner talks to it with AuthFetch
 * (real BRC-103). Wallet-toolbox wallets stand in for BSV Desktop (same engine).
 *
 * fund → 2-of-2 payment → guard refusals (nothing broadcast) → the chain refuses
 * single signatures → the owner withdraws alone.
 */
import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { AuthFetch, BigNumber, ECDSA, P2PKH, PrivateKey, Transaction, TransactionSignature, Utils } from '@agentcoop/core/sdk'
import type { Wallet } from '@bsv/wallet-toolbox'
import { createMockChain, type MockChain } from './helpers/mockchain'
import { poolBalance } from '../scripts/lib/funding'
import {
  VAULT_COSIGN_UNLOCK_LENGTH,
  VAULT_SIGHASH,
  parseVaultLockingScript,
  providerPayScript,
  toChecksigSignature,
  validateVaultRecord,
  vaultCosignUnlock,
  vaultScriptForRecord,
  vaultSighash
} from '@agentcoop/core/scripts/vault'
import {
  CosignRejected,
  VaultSigner,
  adoptVaultOutput,
  httpCosigner,
  listVaultUtxos,
  spendFromVault,
  type Cosigner,
  type VaultUtxo
} from '@agentcoop/core/signers/VaultSigner'
import { parseOpReturn } from '@agentcoop/core'
import { createVault, fundVault, getVaultStatus, putPolicy, registerVault, withdrawVault, type VaultInfo } from '../apps/owner-cli/src/vault-ops'
import { Guard, inProcessCosigner } from '../apps/guard/src/guard'
import { createGuardApp } from '../apps/guard/src/server'

describe('Mandate Vault (mock chain)', () => {
  let chain: MockChain
  let owner: Wallet
  let agent: Wallet
  let guardWallet: Wallet
  let provider: Wallet
  let otherProvider: Wallet
  let stranger: Wallet
  let guard: Guard
  let server: Server
  let url: string
  let cosign: Cosigner
  let vault: VaultInfo
  const logs: string[] = []

  const pay = (to: Wallet, keyID: string, satoshis: number) =>
    ({ lockingScript: providerPayScript(to.identityKey, keyID).toHex(), satoshis, payee: { provider: to.identityKey, keyID } })
  const vaultUtxo = async (): Promise<VaultUtxo> => (await listVaultUtxos(agent, vault.record.vaultId))[0]
  const refusal = async (p: Promise<unknown>): Promise<string> => {
    try { await p } catch (e) { if (e instanceof CosignRejected) return e.reason; throw e }
    throw new Error('expected the guard to refuse')
  }

  beforeAll(async () => {
    chain = await createMockChain()
    ;[owner, agent, guardWallet, provider, otherProvider, stranger] = await Promise.all(Array.from({ length: 6 }, async () => await chain.makeWallet()))
    await chain.fund(owner, 200_000)
    await chain.fund(agent, 50_000)
    guard = await Guard.create({ wallet: guardWallet, log: l => logs.push(l) })
    server = createGuardApp(guard, guardWallet).listen(0)
    url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
    cosign = httpCosigner(url)
  })

  afterAll(async () => {
    server?.close()
    await chain?.close()
  })

  it('1. the owner registers a vault over BRC-103; the guard derives the same script', async () => {
    vault = await createVault(owner, { agent: agent.identityKey, guard: guardWallet.identityKey })
    await registerVault(new AuthFetch(owner), url, vault)
    expect(guard.store.getVault(vault.record.vaultId)?.lockingScriptHex).toBe(vault.lockingScriptHex)

    // no session → refused by the auth middleware
    const anon = await fetch(`${url}/vaults/${vault.record.vaultId}`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(vault.record) })
    expect(anon.status).toBeGreaterThanOrEqual(400)
    // someone else cannot take over the vaultId with their own keys
    const squat = await createVault(stranger, { agent: agent.identityKey, guard: guardWallet.identityKey, vaultId: vault.record.vaultId })
    await expect(registerVault(new AuthFetch(stranger), url, squat)).rejects.toThrow(/409/)
    // nor register a vault in the owner's name
    await expect(registerVault(new AuthFetch(stranger), url, vault)).rejects.toThrow(/403 only the owner/)
    // a policy needs a vault of this owner for this agent
    await expect(putPolicy(new AuthFetch(stranger), url, agent.identityKey, { allowProviders: [], maxPerPoolSats: 1, weeklyCapSats: 1, maxFeeSats: 1, hotWalletDailySats: 0 })).rejects.toThrow(/404/)

    await putPolicy(new AuthFetch(owner), url, agent.identityKey, {
      allowProviders: [provider.identityKey], maxPerPoolSats: 3_000, weeklyCapSats: 5_000, maxFeeSats: 500, hotWalletDailySats: 0
    })
  })

  it('2. funding: out0 = vault coin, out1 = OP_RETURN vault record; the agent adopts it', async () => {
    const f = await fundVault(owner, vault, 10_000)
    const tx = Transaction.fromAtomicBEEF(f.tx)
    expect(f.vout).toBe(0)
    expect(tx.outputs[0].lockingScript.toHex()).toBe(vault.lockingScriptHex)
    const rec = parseOpReturn(tx.outputs[1].lockingScript)
    expect(rec?.op).toBe('vault')
    const parsed = validateVaultRecord(rec?.json)
    expect(parsed).toEqual(vault.record)
    expect(vaultScriptForRecord(parsed!).toHex()).toBe(tx.outputs[0].lockingScript.toHex()) // the overlay's admission rule

    await adoptVaultOutput(agent, vault.record.vaultId, f.tx, f.vout)
    expect((await listVaultUtxos(agent, vault.record.vaultId)).map(u => u.satoshis)).toEqual([10_000])
  })

  it('3. agent + guard pay an allowed provider; change returns to the vault', async () => {
    const agentBefore = (await poolBalance(agent)).spendableSatoshis
    const r = await spendFromVault(agent, { vaultId: vault.record.vaultId, utxo: await vaultUtxo(), outputs: [pay(provider, 'pool-1', 1_000)], cosign })
    const tx = Transaction.fromAtomicBEEF(r.tx)
    expect(tx.outputs[0].lockingScript.toHex()).toBe(providerPayScript(provider.identityKey, 'pool-1').toHex())
    expect(tx.outputs[0].satoshis).toBe(1_000)
    expect(tx.outputs[r.changeVout!].lockingScript.toHex()).toBe(vault.lockingScriptHex)
    const vin = tx.inputs.find(i => parseVaultLockingScript(i.sourceTransaction!.outputs[i.sourceOutputIndex].lockingScript) !== null)!
    expect(vin.unlockingScript!.toBinary().length).toBeLessThanOrEqual(VAULT_COSIGN_UNLOCK_LENGTH)

    expect((await listVaultUtxos(agent, vault.record.vaultId)).map(u => u.satoshis)).toEqual([9_000])
    expect(agentBefore - (await poolBalance(agent)).spendableSatoshis).toBeLessThan(200) // the agent paid only the miner fee
    const status = await getVaultStatus(new AuthFetch(owner), url, vault.record.vaultId)
    expect(status.spentLast7dSats).toBe(1_000)
  })

  it('4. prompt injection: payment to a provider outside the allowlist → 403, nothing signed or broadcast', async () => {
    const reason = await refusal(spendFromVault(agent, { vaultId: vault.record.vaultId, utxo: await vaultUtxo(), outputs: [pay(otherProvider, 'pool-9', 1_000)], cosign }))
    expect(reason).toMatch(/^provider not allowed/)
    expect((await listVaultUtxos(agent, vault.record.vaultId)).map(u => u.satoshis)).toEqual([9_000]) // aborted, still spendable
    expect(logs.some(l => l.includes('DENY pay') && l.includes('provider not allowed'))).toBe(true)
  })

  it('5. caps and forgeries are refused', async () => {
    const vaultId = vault.record.vaultId
    // "put 100% of the budget into this pool"
    expect(await refusal(spendFromVault(agent, { vaultId, utxo: await vaultUtxo(), outputs: [pay(provider, 'pool-1', 9_000)], cosign }))).toMatch(/^maxPerPoolSats exceeded/)
    // vault money to an address without a payee proof
    const thief = new P2PKH().lock(PrivateKey.fromRandom().toPublicKey().toAddress()).toHex()
    expect(await refusal(spendFromVault(agent, { vaultId, utxo: await vaultUtxo(), outputs: [{ lockingScript: thief, satoshis: 1_000 }], cosign }))).toBe('vault funds to unlisted output')
    // a request whose agent signature was tampered with
    const tampered: Cosigner = async req => await cosign({ ...req, agentSignatureHex: req.agentSignatureHex.replace(/..$/, '01') })
    expect(await refusal(spendFromVault(agent, { vaultId, utxo: await vaultUtxo(), outputs: [pay(provider, 'pool-1', 500)], cosign: tampered }))).toBe('agent signature invalid')
    // a request claiming another agent
    const impostor: Cosigner = async req => await cosign({ ...req, agent: stranger.identityKey })
    expect(await refusal(spendFromVault(agent, { vaultId, utxo: await vaultUtxo(), outputs: [pay(provider, 'pool-1', 500)], cosign: impostor }))).toBe('agent mismatch')

    // weekly cap 5,000: 1,000 spent; 2,500 fits, then 2,000 does not
    await spendFromVault(agent, { vaultId, utxo: await vaultUtxo(), outputs: [pay(provider, 'pool-1', 2_500)], cosign })
    expect(await refusal(spendFromVault(agent, { vaultId, utxo: await vaultUtxo(), outputs: [pay(provider, 'pool-1', 2_000)], cosign }))).toBe('weeklyCapSats exceeded (3500 + 2000 > 5000)')
    expect((await listVaultUtxos(agent, vaultId)).map(u => u.satoshis)).toEqual([6_500])

    // an unregistered vault with the same parties
    const unregistered = await createVault(owner, { agent: agent.identityKey, guard: guardWallet.identityKey })
    const f = await fundVault(owner, unregistered, 2_000)
    await adoptVaultOutput(agent, unregistered.record.vaultId, f.tx, f.vout)
    const [u] = await listVaultUtxos(agent, unregistered.record.vaultId)
    expect(await refusal(spendFromVault(agent, { vaultId: unregistered.record.vaultId, utxo: u, outputs: [pay(provider, 'pool-1', 500)], cosign }))).toBe('not a registered vault input')
    expect(guard.store.spentInWindow(owner.identityKey, agent.identityKey, Date.now())).toBe(3_500)
  })

  it('6. the chain itself refuses anything short of agent + guard', async () => {
    const utxo = await vaultUtxo()
    const created = await agent.createAction({
      description: 'Forged vault spend',
      inputBEEF: utxo.beef,
      inputs: [{ outpoint: utxo.outpoint, unlockingScriptLength: VAULT_COSIGN_UNLOCK_LENGTH, inputDescription: 'vault' }],
      outputs: [{ lockingScript: new P2PKH().lock(PrivateKey.fromRandom().toPublicKey().toAddress()).toHex(), satoshis: utxo.satoshis, outputDescription: 'thief' }],
      options: { randomizeOutputs: false, acceptDelayedBroadcast: false, signAndProcess: false }
    })
    const st = created.signableTransaction!
    const tx = Transaction.fromAtomicBEEF(st.tx)
    const vi = tx.inputs.findIndex(i => `${i.sourceTXID}.${i.sourceOutputIndex}` === utxo.outpoint)
    const sighash = vaultSighash(tx, vi)
    const { signature } = await agent.createSignature({ hashToDirectlySign: sighash, protocolID: [1, 'agentcoop vault'], keyID: vault.record.vaultId, counterparty: 'anyone' })
    const sigAgent = toChecksigSignature(signature)
    const forged = ECDSA.sign(new BigNumber(sighash), PrivateKey.fromRandom(), true)
    const sigForged = new TransactionSignature(forged.r, forged.s, VAULT_SIGHASH).toChecksigFormat()

    for (const unlock of [vaultCosignUnlock(sigAgent, sigForged), vaultCosignUnlock(sigAgent, sigAgent)]) {
      const attempt = agent.signAction({ reference: st.reference, spends: { [vi]: { unlockingScript: unlock.toHex() } } })
      await expect(attempt).rejects.toThrow()
    }
    await agent.abortAction({ reference: st.reference }).catch(() => {})
    expect((await listVaultUtxos(agent, vault.record.vaultId)).map(u => u.satoshis)).toEqual([6_500])
  })

  it('7. a second /cosign for the same vault input is not counted twice', async () => {
    const before = guard.store.spentInWindow(owner.identityKey, agent.identityKey, Date.now())
    const twice: Cosigner = async req => { await inProcessCosigner(guard)(req); return await inProcessCosigner(guard)(req) }
    const utxo = await vaultUtxo()
    const created = await agent.createAction({
      description: 'Vault spend, signed twice',
      inputBEEF: utxo.beef,
      inputs: [{ outpoint: utxo.outpoint, unlockingScriptLength: VAULT_COSIGN_UNLOCK_LENGTH, inputDescription: 'vault' }],
      outputs: [{ ...pay(provider, 'pool-1', 1_000), outputDescription: 'provider payment' }, { lockingScript: vault.lockingScriptHex, satoshis: utxo.satoshis - 1_000, outputDescription: 'vault change' }],
      options: { randomizeOutputs: false, acceptDelayedBroadcast: false, signAndProcess: false }
    })
    const st = created.signableTransaction!
    const tx = Transaction.fromAtomicBEEF(st.tx)
    const vi = tx.inputs.findIndex(i => `${i.sourceTXID}.${i.sourceOutputIndex}` === utxo.outpoint)
    await new VaultSigner(agent, { vaultId: vault.record.vaultId, cosign: twice, context: { kind: 'pay', payees: [{ vout: 0, provider: provider.identityKey, keyID: 'pool-1' }] } }).sign(tx, vi)
    await agent.abortAction({ reference: st.reference })
    expect(guard.store.spentInWindow(owner.identityKey, agent.identityKey, Date.now())).toBe(before + 1_000)
  })

  it('8. the owner withdraws alone (OP_IF branch), without guard or agent', async () => {
    const before = (await poolBalance(owner)).spendableSatoshis
    const utxos = await listVaultUtxos(agent, vault.record.vaultId) // the agent's change outputs; on mainnet: WhatsOnChain (owner-cli)
    const w = await withdrawVault(owner, vault, utxos)
    expect(w.satoshis).toBe(6_500)
    const gained = (await poolBalance(owner)).spendableSatoshis - before
    expect(gained).toBeGreaterThan(6_400)
    expect(gained).toBeLessThanOrEqual(6_500)
    // the vault UTXO is gone: an agent spend of it is now a double spend
    await expect(spendFromVault(agent, { vaultId: vault.record.vaultId, utxo: utxos[0], outputs: [pay(provider, 'pool-1', 100)], cosign })).rejects.toThrow(/broadcast of .* failed/)
  })
})
