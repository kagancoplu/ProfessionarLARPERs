/**
 * Sign, assemble, broadcast and receive a settlement (track A 1.6).
 */
import { Transaction, type UnlockingScript, type WalletInterface } from '../sdk'
import { AgentCoopError } from '../errors'
import { PLEDGE_BASKET, type InputSigner, type SettlementPlan } from '../types'
import { toWalletOutpoint } from '../util/outpoint'
import { inputScriptValid } from '../util/spend'
import type { PledgeInstructions } from './pledge'
import { planTransaction } from './verify'

/** Sign my pledge input (ALL|FORKID by default) over the plan's template. Call verifySettlementPlan first. */
export async function signSettlementInput (plan: SettlementPlan, inputIndex: number, signer: InputSigner): Promise<UnlockingScript> {
  if (inputIndex < 1 || inputIndex > plan.participants.length) throw new AgentCoopError('BAD_PLAN', `input ${inputIndex} is not a pledge input`)
  return await signer.sign(planTransaction(plan), inputIndex)
}

/** Fill every pledge input and check every script locally; throws BAD_SIGNATURE naming the bad inputs. */
export function assembleSettlement (plan: SettlementPlan, unlockingScripts: Record<number, UnlockingScript>): Transaction {
  const tx = planTransaction(plan)
  for (let i = 1; i < tx.inputs.length; i++) {
    const u = unlockingScripts[i]
    if (u === undefined) throw new AgentCoopError('BAD_SIGNATURE', `missing signature for input ${i}`)
    tx.inputs[i].unlockingScript = u
  }
  const invalid = tx.inputs.map((_, i) => i).filter(i => !inputScriptValid(tx, i))
  if (invalid.length > 0) throw new AgentCoopError('BAD_SIGNATURE', `inputs ${invalid.join(', ')} do not verify`)
  return tx
}

/** Arcade POST /tx with Extended Format hex (same request as wallet-toolbox's Arcade provider). */
export async function broadcastEF (tx: Transaction, arcadeUrl: string): Promise<string> {
  const res = await fetch(`${arcadeUrl}/tx`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rawTx: tx.toHexEF() })
  })
  const body = await res.json().catch(() => ({})) as { txid?: string, txStatus?: string, status?: number, title?: string, detail?: string, extraInfo?: string }
  const txid = tx.id('hex')
  if (!res.ok) throw new Error(`Arcade rejected ${txid} (${res.status}): ${body.detail ?? body.title ?? body.extraInfo ?? 'no detail'}`)
  if (/REJECTED|DOUBLE_SPEND/i.test(body.txStatus ?? '')) throw new Error(`Arcade reported ${body.txStatus} for ${txid}`)
  return txid
}

/**
 * After the settlement is out: take my change output back into the 'agentcoop'
 * basket and drop the spent pledge coin from it. Credits arrive via TokenKit.sync().
 * Also broadcasts the settlement if the network does not have it yet.
 */
export async function internalizeSettlement (
  wallet: WalletInterface,
  tx: Transaction,
  plan: SettlementPlan,
  myOutpoint: string,
  instructions: PledgeInstructions,
  opts: { originator?: string } = {}
): Promise<void> {
  const j = plan.participants.findIndex(p => p.outpoint === myOutpoint)
  if (j === -1) throw new AgentCoopError('BAD_PLAN', `${myOutpoint} is not in the plan`)
  const n = plan.participants.length
  await wallet.internalizeAction({
    tx: tx.toAtomicBEEF(),
    outputs: [{
      outputIndex: n + 1 + j,
      protocol: 'basket insertion',
      insertionRemittance: { basket: PLEDGE_BASKET, customInstructions: JSON.stringify({ ...instructions, change: true }), tags: ['agentcoop', 'change'] }
    }],
    labels: ['agentcoop'],
    description: 'AgentCoop settlement change'
  }, opts.originator)
  await wallet.relinquishOutput({ basket: PLEDGE_BASKET, output: toWalletOutpoint(myOutpoint) }, opts.originator).catch(() => undefined)
}
