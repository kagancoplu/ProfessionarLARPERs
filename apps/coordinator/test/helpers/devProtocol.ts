/**
 * TEST-ONLY SettlementProtocol (plan/phases/B-P2.md §2). Stands in for Track
 * A's planSettlement / assembleSettlement / broadcastEF so the coordinator's
 * round logic can be tested; it is not shipped and not a reference for A.
 *
 * Plan: take pledges in the order given (coordinator order) until N credits;
 * the last one may be partial. Layout from packages/overlay/test/helpers/settlement.ts.
 */
import { Hash, LockingScript, Transaction, UnlockingScript, Utils } from '@bsv/sdk'
import { broadcastMock, buildSettlement, type Coin } from '../../../../packages/overlay/test/helpers/settlement'
import type { SettlementPlan } from '../../../../packages/overlay/src/stub/types'
import type { SettlementProtocol } from '../../src/protocol'

const NO_KEY = { protocolID: [1, 'unused'] as [1, string], keyID: '' }

export function devProtocol (services: { postBeef: (beef: any, txids: string[]) => Promise<any[]> }, feePerParticipant = 100): SettlementProtocol {
  return {
    async planSettlement (req) {
      const N = BigInt(req.offer.terms.credits)
      const price = BigInt(req.offer.terms.priceSats)
      let remaining = N
      const chosen: Array<{ c: typeof req.pledges[number], take: bigint }> = []
      for (const c of req.pledges) {
        if (remaining === 0n) break
        const take = BigInt(c.view.credits) < remaining ? BigInt(c.view.credits) : remaining
        chosen.push({ c, take })
        remaining -= take
      }
      if (remaining > 0n) throw new Error('not enough pledges to fill the pool')
      const coinOf = (tx: Transaction, vout: number): Coin => ({ sourceTransaction: tx, vout, satoshis: tx.outputs[vout].satoshis!, lockingScript: tx.outputs[vout].lockingScript, key: NO_KEY })
      const parts = chosen.map(({ c, take }) => ({
        coin: coinOf(c.sourceTx, c.view.vout),
        identityKey: c.view.participant,
        credits: take,
        share: Number((take * price + N - 1n) / N),
        fee: feePerParticipant
      }))
      const tx = buildSettlement({
        offer: coinOf(req.creditSourceTx, 0),
        tokenId: req.offer.terms.tokenId,
        priceSats: Number(price),
        payScript: LockingScript.fromHex(req.offer.terms.payScriptHex),
        participants: parts,
        poolId: req.offer.poolId
      })
      const n = parts.length
      const outpoints = chosen.map(x => x.c.view.outpoint)
      const plan: SettlementPlan = {
        poolId: req.offer.poolId,
        round: req.round,
        participants: chosen.map(({ c, take }, i) => ({
          outpoint: c.view.outpoint,
          participant: c.view.participant,
          credits: take.toString(),
          signer: c.view.signer,
          changeSats: String(tx.outputs[1 + n + i].satoshis)
        })),
        pledgeListHash: Utils.toHex(Hash.sha256(Utils.toArray([...outpoints].sort().join(','), 'utf8'))),
        templateBEEF: Array.from(tx.toAtomicBEEF())
      }
      return plan
    },

    assembleSettlement (plan, offer, scripts) {
      const tx = Transaction.fromAtomicBEEF(plan.templateBEEF)
      tx.inputs[0].unlockingScript = UnlockingScript.fromHex(offer.unlockingScriptHex)
      for (const [i, hex] of scripts) tx.inputs[i].unlockingScript = UnlockingScript.fromHex(hex)
      return tx
    },

    async broadcast (tx) {
      await broadcastMock(services, tx)
      return tx.id('hex')
    }
  }
}
