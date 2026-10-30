/**
 * Walking skeleton on MAINNET (track A 1.7, sync point S1): one provider and two
 * agents, server wallets only. Same flow as test/skeleton.mockchain.test.ts.
 *
 *   OVERLAY_URL=http://localhost:8080 npx tsx scripts/skeleton.ts
 *
 * Needs Track D's scripts/wallets.ts (`openWallet(name)` → funded wallet-toolbox
 * wallets 'provider-api', 'agent-1', 'agent-2', MASTER-PLAN §6.2) and a running
 * token overlay (Track B's tm_agentcoop, or the kit's `npm run overlay` with
 * OVERLAY_TOPIC=tm_tokenkit OVERLAY_SERVICE=ls_tokenkit). Small amounts:
 * N = 1,000 credits for P = 1,000 sats. Prints txids and WhatsOnChain links
 * (T1, T2, T3×2, T5) for plan/STATUS.md. Never prints keys.
 */
import type { WalletInterface } from '@agentcoop/core/sdk'
import { Transaction } from '@agentcoop/core/sdk'
import {
  ARCADE_URL, COOP_SERVICE, COOP_TOPIC, OverlayClient, P2pkhWalletSigner, TokenKit,
  assembleSettlement, broadcastEF, buildPledge, buildReserveAndAnnounce, fetchChainPolicy, internalizeSettlement,
  parseOutpoint, planSettlement, receivePkh, signOffer, signSettlementInput, verifyOffer, verifySettlementPlan,
  type PledgeCandidate
} from '@agentcoop/core'

const ARCADE = process.env.ARCADE_URL ?? ARCADE_URL
const OVERLAY = process.env.OVERLAY_URL ?? 'http://localhost:8080'
const TOPIC = process.env.OVERLAY_TOPIC ?? COOP_TOPIC
const SERVICE = process.env.OVERLAY_SERVICE ?? COOP_SERVICE
const woc = (txid: string): string => `https://whatsonchain.com/tx/${txid}`
const log = (what: string, txid: string): void => console.log(`${what.padEnd(28)} ${txid}  ${woc(txid)}`)

async function main (): Promise<void> {
  const walletsModule = './wallets.ts' // Track D (MASTER-PLAN §6.2); loaded at runtime so typecheck does not depend on it
  const { openWallet } = await import(walletsModule) as { openWallet: (name: string) => Promise<WalletInterface> }
  const [provider, agent1, agent2] = await Promise.all(['provider-api', 'agent-1', 'agent-2'].map(openWallet))
  const overlay = (): OverlayClient => new OverlayClient(OVERLAY, undefined, 'main', ARCADE, TOPIC, SERVICE)
  const kitP = new TokenKit(provider, overlay())
  const kits = [new TokenKit(agent1, overlay()), new TokenKit(agent2, overlay())]
  const policy = await fetchChainPolicy(ARCADE)
  console.log(`height ${policy.height}, fee ${policy.satsPerKb} sat/kB`)

  const { txid: deployTxid, tokenId } = await kitP.deploy({ sym: 'AGENTCOOP', amt: 1000n, dec: 0 })
  log('T1 deploy', deployTxid)
  const reserved = await buildReserveAndAnnounce(provider, kitP, {
    v: '1', providerApi: process.env.PROVIDER_API_URL ?? 'http://localhost:8092', tokenId, credits: '1000', priceSats: '1000',
    feeSats: '10', minCredits: '100', deadlineHeight: String(policy.height + 144), label: 'skeleton · 1,000 credits', retailSatsPerCredit: '2'
  })
  log('T2 reserve + announce', reserved.txid)
  const offerSourceTx = Transaction.fromAtomicBEEF(reserved.beef)
  const offer = await signOffer(provider, reserved.poolId, reserved.terms, { sourceTx: offerSourceTx })
  verifyOffer(offer, { sourceTx: offerSourceTx })

  const shares = ['600', '400']
  const pledges = []
  for (const [i, w] of [agent1, agent2].entries()) {
    const me = await kits[i].identityKey()
    const p = await buildPledge(w, reserved.terms, shares[i], 'p2pkh', undefined, { tokenIndex: await kits[i].nextIndex(me) })
    log(`T3 pledge agent-${i + 1}`, p.txid)
    pledges.push({ p, w, me })
  }
  const candidates: PledgeCandidate[] = pledges.map(({ p }) => {
    const sourceTx = Transaction.fromAtomicBEEF(p.beef)
    return { outpoint: p.outpoint, satoshis: p.satoshis, lockingScriptHex: sourceTx.outputs[parseOutpoint(p.outpoint).vout].lockingScript.toHex(), record: p.record, sourceTx }
  })
  const plan = planSettlement(offer, candidates, { height: policy.height, satsPerKb: policy.satsPerKb, offerSourceTx })
  const sigs: Record<number, any> = {}
  for (const { p, w, me } of pledges) {
    await verifySettlementPlan(plan, offer, p.outpoint, { expectedCredits: p.record.credits, expectedCreditPkh: receivePkh(me, Number(p.record.tokenIndex)) })
    const i = plan.participants.findIndex(x => x.outpoint === p.outpoint) + 1
    sigs[i] = await signSettlementInput(plan, i, new P2pkhWalletSigner(w, { protocolID: p.instructions.protocolID, keyID: p.instructions.keyID }))
  }
  const settlement = assembleSettlement(plan, sigs)
  const txid = await broadcastEF(settlement, ARCADE)
  log('T5 SETTLEMENT (DvP)', txid)
  for (const { p, w } of pledges) await internalizeSettlement(w, settlement, plan, p.outpoint, p.instructions)
  await kitP.overlay.submit(settlement.toAtomicBEEF())
  for (const [i, k] of kits.entries()) {
    await k.sync()
    const b = (await k.balances()).find(x => x.tokenId === tokenId)
    console.log(`agent-${i + 1} credits: overlay ${b?.overlay ?? 0n}, basket ${b?.basket ?? 0n}`)
  }
}

main().catch(e => { console.error('skeleton failed:', e instanceof Error ? e.message : e); process.exit(1) })
