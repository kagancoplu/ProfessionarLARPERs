/**
 * TEST-ONLY agent on the coordinator's WS that behaves like Track C's agents
 * should: on `sign_request` it checks the plan with Track A's
 * verifySettlementPlan (lineage included) and signs its input with
 * signSettlementInput. `silent` never answers (griefing / offline agent).
 */
import { P2pkhWalletSigner, receivePkh, signSettlementInput, verifySettlementPlan, type buildPledge, type Offer, type SettlementPlan } from '@agentcoop/core'
import type { Transaction, WalletInterface } from '@agentcoop/core/sdk'
import { WebSocket } from 'ws'

export interface AgentBot { ws: WebSocket, messages: any[], plans: SettlementPlan[] }

export async function startAgentBot (
  coopUrl: string,
  wallet: WalletInterface,
  identity: string,
  pledge: Awaited<ReturnType<typeof buildPledge>>,
  fetchTx: (txid: string) => Promise<Transaction>,
  opts: { silent?: boolean } = {}
): Promise<AgentBot> {
  const ws = new WebSocket(`${coopUrl.replace('http', 'ws')}/ws`)
  const messages: any[] = []
  const plans: SettlementPlan[] = []
  await new Promise((resolve, reject) => { ws.once('open', resolve); ws.once('error', reject) })
  ws.on('message', d => {
    const msg = JSON.parse(d.toString())
    messages.push(msg)
    if (msg.type !== 'sign_request' || opts.silent === true) return
    void (async () => {
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
      const unlock = await signSettlementInput(msg.plan, msg.yourInputIndex, new P2pkhWalletSigner(wallet, { protocolID: pledge.instructions.protocolID, keyID: pledge.instructions.keyID }))
      ws.send(JSON.stringify({ type: 'sign_response', poolId: msg.poolId, round: msg.round, inputIndex: msg.yourInputIndex, unlockingScriptHex: unlock.toHex() }))
    })()
  })
  ws.send(JSON.stringify({ type: 'hello', identity, poolIds: [] }))
  return { ws, messages, plans }
}
