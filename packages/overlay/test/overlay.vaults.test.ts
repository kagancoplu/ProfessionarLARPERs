/**
 * B.P3: vault indexing with on-chain ownership verification, and the SSE
 * event stream (plan/phases/B-P3.md §5, scenarios 1–4). B-A5: vault-locked
 * credits and the A-P5 pledge record fields (plan/phases/B-A5.md). Mock chain.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { OP, Random, Transaction, UnlockingScript, Utils, type LockingScript } from '@agentcoop/core/sdk'
import type { Wallet } from '@bsv/wallet-toolbox'
import { startOverlay, type RunningOverlay } from '../src/server'
import { buildOpReturn, buildBsv21Script, buildVaultCreditScript, receivePkh, vaultScriptHash, TOKEN_BASKET } from '@agentcoop/core'
import { VAULT_PROTOCOL } from '@agentcoop/core'
import { expectedVaultScript } from '../src/vault'
import { createMockChain, type MockChain } from '../../../test/helpers/mockchain'
import { checksigFor, coinFrom, deployCredits, lookup, SCOPE_ALL, submitToOverlay, type Coin } from './helpers/settlement'
import { beefOf, openPool, pledge, spendCoin } from './helpers/pool'

let chain: MockChain
let overlay: RunningOverlay
let owner: Wallet, agent: Wallet, guard: Wallet, mallory: Wallet
let ids: Record<'owner' | 'agent' | 'guard' | 'mallory', string>

const submit = async (atomicBeef: number[]): Promise<any> => {
  const { status, body } = await submitToOverlay(overlay.url, beefOf(atomicBeef))
  expect(status).toBe(200)
  return body.tm_agentcoop
}
const vaultsOf = async (q: Record<string, unknown>): Promise<any[]> => (await lookup(overlay.url, { op: 'vaults', ...q })).map(o => o.ctx)

/** Owner funds a vault (Track D 1.1 layout: vault output + OP_RETURN vault record). */
async function fundVault (funder: Wallet, script: LockingScript, record: Record<string, string>, sats: number): Promise<{ tx: number[], coin: Coin }> {
  const res = await funder.createAction({
    description: 'Fund AgentCoop vault',
    outputs: [
      { lockingScript: script.toHex(), satoshis: sats, outputDescription: 'vault' },
      { lockingScript: buildOpReturn('vault', record).toHex(), satoshis: 0, outputDescription: 'vault record' }
    ],
    options: { randomizeOutputs: false, acceptDelayedBroadcast: false }
  })
  return { tx: Array.from(res.tx!), coin: coinFrom(res.tx!, script, { protocolID: VAULT_PROTOCOL, keyID: record.vaultId }) }
}

beforeAll(async () => {
  chain = await createMockChain()
  const dir = mkdtempSync(join(tmpdir(), 'agentcoop-overlay-p3-'))
  overlay = await startOverlay({ port: 18192, dbFile: join(dir, 'overlay.db'), chainTracker: chain.chainTracker, quiet: true })
  ;[owner, agent, guard, mallory] = await Promise.all([chain.makeWallet(), chain.makeWallet(), chain.makeWallet(), chain.makeWallet()])
  for (const w of [owner, mallory]) await chain.fund(w)
  const id = async (w: Wallet): Promise<string> => (await w.getPublicKey({ identityKey: true })).publicKey
  ids = { owner: await id(owner), agent: await id(agent), guard: await id(guard), mallory: await id(mallory) }
})

afterAll(async () => {
  await overlay?.close()
  await chain?.close()
})

describe('ls_agentcoop: Mandate Vaults', () => {
  const vaultId = Utils.toHex(Random(8))
  let script: LockingScript
  let funded: Coin

  it('1. a correctly built vault is listed for its owner as verified, with its balance', async () => {
    script = expectedVaultScript(ids.owner, ids.agent, ids.guard, vaultId)
    // The owner's wallet derives the same key the overlay recomputes ('anyone' counterparty).
    const { publicKey } = await owner.getPublicKey({ protocolID: VAULT_PROTOCOL, keyID: vaultId, counterparty: 'anyone', forSelf: true })
    expect(script.toHex()).toContain(publicKey)
    const f = await fundVault(owner, script, { v: '1', vaultId, owner: ids.owner, agent: ids.agent, guard: ids.guard }, 20_000)
    funded = f.coin
    expect((await submit(f.tx)).outputsToAdmit).toEqual([0, 1])
    const [v] = await vaultsOf({ owner: ids.owner })
    expect(v).toMatchObject({ vaultId, verified: true, balanceSats: 20_000, utxos: [{ outpoint: `${funded.sourceTransaction.id('hex')}_0`, satoshis: 20_000 }] })
    expect((await lookup(overlay.url, { op: 'vault', vaultId }))[0].ctx.owner).toBe(ids.owner)
  })

  it('2. a record claiming someone else\'s vault script is unverified and hidden', async () => {
    const f = await fundVault(mallory, script, { v: '1', vaultId, owner: ids.mallory, agent: ids.agent, guard: ids.guard }, 1_000)
    await submit(f.tx)
    expect(await vaultsOf({ owner: ids.mallory })).toEqual([])
    expect((await vaultsOf({ owner: ids.mallory, includeUnverified: true }))[0]).toMatchObject({ verified: false })
    // Mallory's gift is locked to the real vault script, so it does count towards the owner's vault.
    expect((await vaultsOf({ owner: ids.owner }))[0].balanceSats).toBe(21_000)
  })

  it('3. owner withdraws part; the change back to the vault script is indexed without a record', async () => {
    const created = await owner.createAction({
      description: 'Vault partial withdraw',
      inputBEEF: funded.sourceTransaction.toBEEF(),
      inputs: [{ outpoint: `${funded.sourceTransaction.id('hex')}.0`, unlockingScriptLength: 75, inputDescription: 'vault (owner branch)' }],
      outputs: [{ lockingScript: script.toHex(), satoshis: 15_000, outputDescription: 'back to vault' }],
      options: { randomizeOutputs: false, acceptDelayedBroadcast: false }
    })
    const signable = created.signableTransaction!
    const tx = Transaction.fromAtomicBEEF(signable.tx)
    const i = tx.inputs.findIndex(inp => inp.sourceTXID === funded.sourceTransaction.id('hex'))
    tx.inputs[i].sourceTransaction ??= funded.sourceTransaction
    const sig = await checksigFor(owner, tx, i, funded.key, SCOPE_ALL)
    const unlock = new UnlockingScript([{ op: sig.length, data: sig }, { op: OP.OP_1 }]) // <sig> OP_TRUE → OP_IF (owner) branch
    const signed = await owner.signAction({ reference: signable.reference, spends: { [i]: { unlockingScript: unlock.toHex() } }, options: { acceptDelayedBroadcast: false } })
    const steak = await submit(Array.from(signed.tx!))
    expect(steak.outputsToAdmit).toEqual([0]) // the change back to the vault
    const [v] = await vaultsOf({ owner: ids.owner })
    expect(v.balanceSats).toBe(16_000) // 15,000 change + Mallory's 1,000
    expect(v.utxos.map((u: any) => u.outpoint)).not.toContain(`${funded.sourceTransaction.id('hex')}_0`)
  })

  it('4. SSE: an admitted transaction is announced no later than a second after the overlay accepts it', async () => {
    const controller = new AbortController()
    try {
      const res = await fetch(`${overlay.url}/agentcoop/events`, { signal: controller.signal })
      expect(res.headers.get('content-type')).toContain('text/event-stream')
      const reader = res.body!.getReader()
      const f = await fundVault(owner, expectedVaultScript(ids.owner, ids.agent, ids.guard, 'v2'), { v: '1', vaultId: 'v2', owner: ids.owner, agent: ids.agent, guard: ids.guard }, 2_000)
      const txid = Transaction.fromAtomicBEEF(f.tx).id('hex')
      const seen = (async () => {
        let buffer = ''
        while (!buffer.includes(txid)) {
          const { value, done } = await reader.read()
          if (done) break
          buffer += new TextDecoder().decode(value)
        }
        return { buffer, at: Date.now() }
      })()
      await submit(f.tx)
      const acceptedAt = Date.now()
      const { buffer, at } = await seen
      expect(buffer).toContain(`"type":"admitted","txid":"${txid}"`)
      expect(at - acceptedAt).toBeLessThan(1_000)
    } finally {
      controller.abort()
    }
  })
})

describe('ls_agentcoop: vault-locked credits and A-P5 pledge fields (B-A5)', () => {
  const vaultId = Utils.toHex(Random(8))
  let vaultScript: LockingScript
  let tokenId: string
  let locked: Coin

  it('5. credits on a vault script are admitted, found by vault hash, and spent by the owner alone', async () => {
    vaultScript = expectedVaultScript(ids.owner, ids.agent, ids.guard, vaultId)
    const d = await deployCredits(owner, 1000n)
    tokenId = d.tokenId
    expect((await submit(Array.from(d.coin.sourceTransaction.toAtomicBEEF()))).outputsToAdmit).toEqual([0])

    const lockedScript = buildVaultCreditScript({ op: 'transfer', id: tokenId, amt: '400' }, vaultScript)
    const back = buildBsv21Script({ op: 'transfer', id: tokenId, amt: '600' }, receivePkh(ids.owner, 0))
    const tx = await spendCoin(owner, d.coin, [
      { lockingScript: lockedScript.toHex(), satoshis: 1, outputDescription: 'vault-locked credits' },
      { lockingScript: back.toHex(), satoshis: 1, outputDescription: 'credits back', basket: TOKEN_BASKET }
    ], 'Lock credits to a vault')
    expect((await submit(tx)).outputsToAdmit).toEqual([0, 1])
    locked = coinFrom(tx, lockedScript, { protocolID: VAULT_PROTOCOL, keyID: vaultId })

    const vaultHash = vaultScriptHash(vaultScript.toHex())
    const found = await lookup(overlay.url, { op: 'vaultCredits', vaultHash })
    expect(found.map(f => f.ctx)).toEqual([expect.objectContaining({ tokenId, amt: '400', ownerPkh: '', ownerVaultHash: vaultHash, spent: false })])
    expect((await lookup(overlay.url, { op: 'outpoint', txid: found[0].txid, vout: 0 }))[0].ctx.ownerVaultHash).toBe(vaultHash)
    // Not a vault (sats) output: the vault's balance is unchanged by its credits.
    expect((await vaultsOf({ owner: ids.owner })).find(v => v.vaultId === vaultId)).toBeUndefined()

    // Owner branch (<sig> OP_TRUE) back to a P2PKH: a transfer with an admitted vault-owned input.
    const created = await owner.createAction({
      description: 'Owner takes vault-locked credits',
      inputBEEF: locked.sourceTransaction.toBEEF(),
      inputs: [{ outpoint: `${locked.sourceTransaction.id('hex')}.${locked.vout}`, unlockingScriptLength: 75, inputDescription: 'vault-locked credits' }],
      outputs: [{ lockingScript: buildBsv21Script({ op: 'transfer', id: tokenId, amt: '400' }, receivePkh(ids.owner, 1)).toHex(), satoshis: 1, outputDescription: 'credits', basket: TOKEN_BASKET }],
      options: { randomizeOutputs: false, acceptDelayedBroadcast: false }
    })
    const signable = created.signableTransaction!
    const spend = Transaction.fromAtomicBEEF(signable.tx)
    const i = spend.inputs.findIndex(inp => inp.sourceTXID === locked.sourceTransaction.id('hex'))
    spend.inputs[i].sourceTransaction ??= locked.sourceTransaction
    const sig = await checksigFor(owner, spend, i, locked.key, SCOPE_ALL)
    const signed = await owner.signAction({ reference: signable.reference, spends: { [i]: { unlockingScript: new UnlockingScript([{ op: sig.length, data: sig }, { op: OP.OP_1 }]).toHex() } }, options: { acceptDelayedBroadcast: false } })
    expect((await submit(Array.from(signed.tx!))).outputsToAdmit).toEqual([0])
    expect(await lookup(overlay.url, { op: 'vaultCredits', vaultHash })).toEqual([])
    expect((await lookup(overlay.url, { op: 'vaultCredits', vaultHash, includeSpent: true }))[0].ctx).toMatchObject({ spent: true })
  })

  it('6. pledge records keep creditLock / lighthouse fields; malformed ones are not admitted', async () => {
    const pool = await openPool(owner)
    await submit(pool.deployTx)
    await submit(pool.poolTx)
    const guardKey = ids.guard
    const lhId = Utils.toHex(Random(16))
    const vaultLocked = await pledge(mallory, pool, 100n, { record: { signer: 'vault', creditLock: 'vault' } })
    const lighthouse = await pledge(mallory, pool, 100n, { record: { signer: 'vault', mode: 'lighthouse', guard: guardKey, lhId } })
    for (const p of [vaultLocked, lighthouse]) expect((await submit(p.tx)).outputsToAdmit).toEqual([0, 2])
    const views = (await lookup(overlay.url, { op: 'pledges', poolId: pool.poolId })).map(o => o.ctx)
    expect(views.find(v => v.txid === vaultLocked.txid)).toMatchObject({ signer: 'vault', creditLock: 'vault', valid: true })
    expect(views.find(v => v.txid === lighthouse.txid)).toMatchObject({ signer: 'vault', mode: 'lighthouse', guard: guardKey, lhId, valid: true })

    const malformed: Array<Record<string, string>> = [
      { signer: 'p2pkh', creditLock: 'vault' }, // creditLock needs a vault signer
      { signer: 'vault', mode: 'lighthouse', lhId }, // no guard
      { signer: 'vault', mode: 'lighthouse', guard: guardKey, lhId: 'zz' }, // bad lhId
      { signer: 'vault', guard: guardKey } // guard without lighthouse
    ]
    for (const record of malformed) {
      expect((await submit((await pledge(mallory, pool, 100n, { record })).tx)).outputsToAdmit).toEqual([])
    }
  })
})
