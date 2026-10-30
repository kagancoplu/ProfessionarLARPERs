/**
 * B.P3: vault indexing with on-chain ownership verification, and the SSE
 * event stream (plan/phases/B-P3.md §5, scenarios 1–4). Mock chain.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { OP, Random, Transaction, UnlockingScript, Utils, type LockingScript } from '@bsv/sdk'
import type { Wallet } from '@bsv/wallet-toolbox'
import { startOverlay, type RunningOverlay } from '../src/server'
import { buildOpReturn } from '../src/stub/opreturn'
import { expectedVaultScript, VAULT_PROTOCOL } from '../src/stub/vault'
import { createMockChain, type MockChain } from './helpers/mockchain'
import { checksigFor, coinFrom, lookup, SCOPE_ALL, submitToOverlay, type Coin } from './helpers/settlement'
import { beefOf } from './helpers/pool'

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
