import type { TopicManager } from '@bsv/overlay'
import { Transaction, type AdmittanceInstructions } from '@bsv/sdk'
import { identifyAdmissible, type RuleOptions } from './kit/rules'
import { parseOpReturn } from './stub/opreturn'
import { isP2pkhHex, PLEDGE_COIN_VOUT, validatePledgeRecord, validatePoolRecord, validateSettleRecord } from './records'

export const TOPIC = 'tm_agentcoop'

/**
 * Topic manager for AgentCoop.
 *
 * Credits: the kit's BSV-21 rules (kit/rules.ts), unchanged. A transaction
 * spending a credit output this overlay never admitted is refused (the rules
 * throw): submit token transactions in order.
 *
 * Records: the first well-formed `OP_FALSE OP_RETURN "agentcoop" <op> <json>`
 * output is admitted (0 sat, never spent) so the lookup service can index it
 * and answer queries with it; for a pledge, the pledge coin (out0) too. These
 * checks are structural only; whether a pledge matches its pool's terms is
 * decided at query time (AgentCoopLookupService).
 *
 * Every previous topic coin is retained (marked spent, kept as history):
 * the engine deletes previous coins that are not in coinsToRetain, which would
 * erase pledge and settlement history.
 */
export class AgentCoopTopicManager implements TopicManager {
  constructor (private readonly opts: RuleOptions = {}) {}

  async identifyAdmissibleOutputs (beef: number[], previousCoins: number[]): Promise<AdmittanceInstructions> {
    const tx = Transaction.fromBEEF(beef)
    const admit = new Set(identifyAdmissible(tx, previousCoins, this.opts).outputsToAdmit)

    for (const [vout, output] of tx.outputs.entries()) {
      const record = parseOpReturn(output.lockingScript)
      if (record === null) continue
      if (record.op === 'pool' && validatePoolRecord(record.json) !== null) admit.add(vout)
      if (record.op === 'settle' && validateSettleRecord(record.json) !== null) admit.add(vout)
      if (record.op === 'list' || record.op === 'vault') admit.add(vout) // raw for now (B.P3)
      if (record.op === 'pledge') {
        const pledge = validatePledgeRecord(record.json)
        const coin = tx.outputs[PLEDGE_COIN_VOUT]
        const coinOk = vout !== PLEDGE_COIN_VOUT && coin !== undefined && (coin.satoshis ?? 0) > 0 &&
          (pledge?.signer !== 'p2pkh' || isP2pkhHex(coin.lockingScript.toHex()))
        if (pledge !== null && coinOk) {
          admit.add(vout)
          admit.add(PLEDGE_COIN_VOUT)
        }
      }
      break // one agentcoop record per transaction
    }

    return {
      outputsToAdmit: [...admit].sort((a, b) => a - b),
      coinsToRetain: [...previousCoins].sort((a, b) => a - b)
    }
  }

  async getDocumentation (): Promise<string> {
    return [
      '# tm_agentcoop',
      'BSV-21 credits (kit rules) and AgentCoop records:',
      '- deploy+mint: always (token id = its own outpoint)',
      '- transfer/burn: only when admitted token inputs cover the outputs',
      '- OP_FALSE OP_RETURN "agentcoop" <pool|pledge|settle|list|vault> <json>: the record output; for a pledge also out0 (the pledge coin)',
      'A transaction spending an unadmitted token output is rejected.'
    ].join('\n')
  }

  async getMetaData (): Promise<{ name: string, shortDescription: string }> {
    return { name: TOPIC, shortDescription: 'AgentCoop pools, pledges, settlements and BSV-21 credits' }
  }
}
