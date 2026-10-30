/**
 * TEST-ONLY agent on the coordinator's WS that behaves like Track C's agents
 * should: on `sign_request` it checks the plan with Track A's
 * verifySettlementPlan (lineage included) and signs its input with
 * signSettlementInput. `silent` never answers (griefing / offline agent);
 * `delayMs` waits before answering; `signer` replaces the P2PKH signer (a vault
 * agent passes a VaultSigner, which asks the guard to co-sign).
 */
import { P2pkhWalletSigner, receivePkh, signSettlementInput, verifySettlementPlan, type InputSigner, type Offer, type PledgeRecord, type SettlementPlan } from '@agentcoop/core'
import type { Transaction, WalletInterface } from '@agentcoop/core/sdk'
import type { WebSocket } from 'ws'
import { connectCoordinator } from '../../src/client'

export interface AgentBot { ws: WebSocket, messages: any[], plans: SettlementPlan[] }

export async function startAgentBot (
  coopUrl: string,
  wallet: WalletInterface,
  identity: string,
  pledge: { outpoint: string, record: PledgeRecord, instructions: { protocolID: any, keyID: string } },
  fetchTx: (txid: string) => Promise<Transaction>,
  opts: { silent?: boolean, delayMs?: number, signer?: (plan: SettlementPlan, offer: Offer) => InputSigner } = {}
): Promise<AgentBot> {
  const plans: SettlementPlan[] = []
  const onMessage = (msg: any): void => {
    if (msg.type !== 'sign_request' || opts.silent === true) return
    void (async () => {
      if (opts.delayMs !== undefined) await new Promise(resolve => setTimeout(resolve, opts.delayMs))
      const offer = await (await fetch(`${coopUrl}/offers/${msg.poolId}`)).json() as Offer
      try {
        await verifySettlementPlan(msg.plan, offer, pledge.outpoint, {
          expectedCredits: pledge.record.credits,
          expectedCreditPkh: receivePkh(identity, Number(pledge.record.tokenIndex)),
          verifyLineage: true,
          lineage: { fetchTx }
        })
      } catch (e) {
        ws.send(JSON.stringify({ type: 'sign_reject', poolId: msg.poolId, round: msg.round, reason: String((e as Error).message) }))
        return
      }
      plans.push(msg.plan)
      let unlock
      try {
        const signer = opts.signer?.(msg.plan, offer) ?? new P2pkhWalletSigner(wallet, { protocolID: pledge.instructions.protocolID, keyID: pledge.instructions.keyID })
        unlock = await signSettlementInput(msg.plan, msg.yourInputIndex, signer)
      } catch (e) {
        // e.g. the guard refused to co-sign: say so instead of timing out
        ws.send(JSON.stringify({ type: 'sign_reject', poolId: msg.poolId, round: msg.round, reason: String((e as any).reason ?? (e as Error).message) }))
        return
      }
      ws.send(JSON.stringify({ type: 'sign_response', poolId: msg.poolId, round: msg.round, inputIndex: msg.yourInputIndex, unlockingScriptHex: unlock.toHex() }))
    })()
  }
  // Proven hello (B-P5a): the coordinator only sends sign_request to sessions that signed its challenge.
  const session = await connectCoordinator(coopUrl, wallet, { onMessage })
  if (session.identity !== identity) throw new Error('agent bot: wallet identity mismatch')
  const ws = session.ws
  return { ws, messages: session.messages, plans }
}
