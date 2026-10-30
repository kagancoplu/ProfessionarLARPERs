/**
 * Market (track A 2.3–2.4), offline: signed SINGLE|ACP listings, one sweep
 * transaction buying two of them, a fake listing stopped by verifyLineage,
 * and a cancelled listing. Kit overlay over HTTP with SPV.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Wallet } from '@bsv/wallet-toolbox'
import { P2PKH, PrivateKey, ProtoWallet, PublicKey, Transaction, Utils } from '@agentcoop/core/sdk'
import {
  MARKET_PROTOCOL, OverlayClient, SIGHASH_SINGLE_ACP_FORKID, TokenKit, buildBsv21Script, buildSweep, cancelListing,
  offerSkeleton, reserveListing, signListing, signP2pkhWithScope, verifyListing, type Listing
} from '@agentcoop/core'
import { startOverlay, type RunningOverlay } from '../docs/starter/bsv21-token-kit/overlay/server'
import { createMockChain, type MockChain } from './helpers/mockchain'

let chain: MockChain
let overlay: RunningOverlay
const beefs = new Map<string, number[]>()

beforeAll(async () => {
  chain = await createMockChain()
  overlay = await startOverlay({ port: 18192, dbFile: join(mkdtempSync(join(tmpdir(), 'agentcoop-mkt-')), 'overlay.db'), chainTracker: chain.chainTracker, quiet: true })
})
afterAll(async () => { await overlay?.close(); await chain?.close() })

const fetchTx = async (txid: string): Promise<Transaction> =>
  Transaction.fromBinary(Array.from((await (chain.services as any).storage.getTransaction(txid)).rawTx as number[]))
const getBeef = async (txid: string): Promise<number[]> => { const b = beefs.get(txid); if (b === undefined) throw new Error(`no BEEF for ${txid}`); return b }
const sweepOpts = { lineage: { fetchTx }, getBeef }

describe('market: listings and one-transaction sweep', () => {
  let provider: Wallet, seller1: Wallet, seller2: Wallet, buyer: Wallet
  let kitP: TokenKit, kit1: TokenKit, kit2: TokenKit, kitB: TokenKit
  let tokenId: string
  let l1: Listing, l2: Listing

  it('setup: credits in two sellers\' wallets', async () => {
    ;[provider, seller1, seller2, buyer] = await Promise.all([0, 1, 2, 3].map(async () => await chain.makeWallet()))
    for (const w of [provider, seller1, seller2, buyer]) await chain.fund(w)
    ;[kitP, kit1, kit2, kitB] = [provider, seller1, seller2, buyer].map(w => new TokenKit(w, new OverlayClient(overlay.url)))
    ;({ tokenId } = await kitP.deploy({ sym: 'MKT', amt: 1000n, dec: 0 }))
    await kitP.send(tokenId, 300n, await kit1.identityKey())
    await kitP.send(tokenId, 200n, await kit2.identityKey())
    await kit1.sync(); await kit2.sync()
  })

  it('sellers list credits (reserved + SINGLE|ACP signed); listings verify offline', async () => {
    const r1 = await reserveListing(seller1, kit1, tokenId, '200', '3000')
    const r2 = await reserveListing(seller2, kit2, tokenId, '100', '1600')
    beefs.set(r1.txid, r1.beef); beefs.set(r2.txid, r2.beef)
    l1 = await signListing(seller1, r1.outpoint, '3000')
    l2 = await signListing(seller2, r2.outpoint, '1600')
    verifyListing(l1, { sourceTx: Transaction.fromAtomicBEEF(r1.beef) })
    expect(() => verifyListing({ ...l1, askSats: '1' }, { sourceTx: Transaction.fromAtomicBEEF(r1.beef) })).toThrow(/does not verify/)
    expect((await kit1.balances()).find(b => b.tokenId === tokenId)?.overlay).toBe(100n) // 200 reserved
  })

  it('T8: the buyer sweeps both listings in one transaction; sellers are paid in it', async () => {
    const { txid, credits, tx } = await buildSweep(buyer, kitB, [l1, l2], sweepOpts)
    expect(txid).toMatch(/^[0-9a-f]{64}$/)
    expect(credits).toBe('300')
    expect(tx.outputs[0]).toMatchObject({ satoshis: 3000 }); expect(tx.outputs[0].lockingScript.toHex()).toBe(l1.payScriptHex)
    expect(tx.outputs[1]).toMatchObject({ satoshis: 1600 }); expect(tx.outputs[1].lockingScript.toHex()).toBe(l2.payScriptHex)
    await kitB.sync()
    expect((await kitB.balances()).find(b => b.tokenId === tokenId)).toMatchObject({ overlay: 300n, basket: 300n })
  })

  it('a fake listing (credits minted from plain sats) is refused before the buyer pays anything', async () => {
    const holder = new ProtoWallet(PrivateKey.fromRandom())
    const key = { protocolID: MARKET_PROTOCOL, keyID: 'list fake' }
    const pkh = PublicKey.fromString((await holder.getPublicKey({ ...key, counterparty: 'anyone', forSelf: true })).publicKey).toHash('hex') as string
    const res = await seller2.createAction({
      description: 'Forged credits',
      outputs: [{ lockingScript: buildBsv21Script({ op: 'transfer', id: tokenId, amt: '500' }, pkh).toHex(), satoshis: 1, outputDescription: 'forged' }],
      options: { randomizeOutputs: false, acceptDelayedBroadcast: false }
    })
    beefs.set(res.txid!, Array.from(res.tx!))
    const source = Transaction.fromAtomicBEEF(res.tx!)
    const payScriptHex = new P2PKH().lock(Utils.toArray(pkh, 'hex')).toHex()
    const unlock = await signP2pkhWithScope(holder, offerSkeleton(source, 0, { payScriptHex, priceSats: '100' }), 0, key, SIGHASH_SINGLE_ACP_FORKID)
    const fake: Listing = { outpoint: `${res.txid!}_0`, tokenId, credits: '500', askSats: '100', seller: 'x', unlockingScriptHex: unlock.toHex(), lockingScriptHex: source.outputs[0].lockingScript.toHex(), payScriptHex }
    verifyListing(fake, { sourceTx: source }) // looks perfect on its own…
    await expect(buildSweep(buyer, kitB, [fake], sweepOpts)).rejects.toThrow(/LINEAGE_FAILED/) // …but has no genuine lineage
  })

  it('a cancelled listing returns the credits to the seller', async () => {
    const r = await reserveListing(seller1, kit1, tokenId, '100', '999')
    expect((await kit1.balances()).find(b => b.tokenId === tokenId)?.overlay ?? 0n).toBe(0n) // all reserved: no token row left
    await cancelListing(seller1, kit1, r.outpoint)
    await kit1.sync()
    expect((await kit1.balances()).find(b => b.tokenId === tokenId)).toMatchObject({ overlay: 100n, basket: 100n })
  })
})
