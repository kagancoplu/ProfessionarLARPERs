/**
 * Overlay pledge → Track A's PledgeCandidate. The record is read from the
 * pledge transaction itself (pledgeRecordOf), so A-P5 fields the overlay view
 * may not carry (creditLock, mode, guard, lhId) reach planSettlement and
 * creditScriptFor unchanged. The view is the fallback for a transaction
 * without a record (cannot happen for an admitted pledge).
 */
import type { Transaction } from '@agentcoop/core/sdk'
import { pledgeRecordOf, type PledgeCandidate, type PledgeRecord } from '@agentcoop/core'
import type { PledgeView } from '../../../packages/overlay/src/views'

export function recordOf (view: PledgeView, sourceTx: Transaction): PledgeRecord {
  return pledgeRecordOf(sourceTx) ?? {
    v: '1',
    poolId: view.poolId,
    credits: view.credits,
    participant: view.participant,
    tokenIndex: view.tokenIndex,
    signer: view.signer,
    ...(view.creditLock !== undefined ? { creditLock: view.creditLock } : {}),
    ...(view.mode !== undefined ? { mode: view.mode } : {}),
    ...(view.guard !== undefined ? { guard: view.guard } : {}),
    ...(view.lhId !== undefined ? { lhId: view.lhId } : {})
  }
}

export function coreCandidate (view: PledgeView, sourceTx: Transaction): PledgeCandidate {
  return {
    outpoint: view.outpoint,
    satoshis: view.coinSats,
    lockingScriptHex: sourceTx.outputs[view.vout].lockingScript.toHex(),
    record: recordOf(view, sourceTx),
    sourceTx,
    ...(view.height !== undefined ? { blockHeight: view.height } : {})
  }
}
