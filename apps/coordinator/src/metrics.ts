/**
 * GET /metrics (plan/phases/B-P6a.md §4): numbers for the README, the video
 * and the UI, computed from what the overlay indexed, not from the
 * coordinator's own bookkeeping.
 *
 * custodiedSats: every output of every settlement must be one of
 *   provider payment (out0 = priceSats → payScriptHex),
 *   a participant's credits (BSV-21 to receivePkh(participant, tokenIndex)),
 *   a participant's change (back to its own pledge coin script),
 *   the OP_RETURN record.
 * Satoshis in any other output are counted as custodied, i.e. sent somewhere
 * no participant or the provider controls. Zero is a computed result.
 */
import { decodeBsv21, parseOpReturn, receivePkh, type PoolTerms } from '@agentcoop/core'
import type { Transaction } from '@agentcoop/core/sdk'
import type { PledgeView } from '../../../packages/overlay/src/views'
import { derivePools, type ApiDeps } from './api'

export type OutputClass = 'provider' | 'credits' | 'change' | 'record' | 'unaccounted'

/** Classify each output of a settlement (MASTER §3.3 layout). */
export function classifySettlement (tx: Transaction, terms: Pick<PoolTerms, 'priceSats' | 'payScriptHex' | 'tokenId'>, included: Array<Pick<PledgeView, 'participant' | 'tokenIndex' | 'credits'> & { lockingScriptHex: string }>): OutputClass[] {
  const creditPkhs = new Set(included.map(p => `${receivePkh(p.participant, Number(p.tokenIndex))}:${p.credits}`))
  const changeScripts = new Set(included.map(p => p.lockingScriptHex))
  return tx.outputs.map((o, i) => {
    const hex = o.lockingScript.toHex()
    if (i === 0 && hex === terms.payScriptHex && o.satoshis === Number(terms.priceSats)) return 'provider'
    const d = decodeBsv21(o.lockingScript)
    if (d !== null && d.op === 'transfer' && d.id === terms.tokenId && creditPkhs.has(`${d.ownerPkh}:${d.amt}`)) return 'credits'
    if (changeScripts.has(hex)) return 'change'
    if (parseOpReturn(o.lockingScript) !== null && (o.satoshis ?? 0) === 0) return 'record'
    return 'unaccounted'
  })
}

export interface Metrics {
  generatedAt: string
  pools: Record<string, number>
  pledges: { open: number, cancelled: number, settled: number, waiting: number }
  settlements: number
  participants: { total: number, avgPerSettlement: number, max: number }
  avgFeeSats: number
  avgFeeSatsPerParticipant: number
  avgSettlementBytes: number
  rounds: { avg: number, max: number }
  custodiedSats: number
  custodyCheck: { settlementsChecked: number, outputsClassified: number, unaccountedOutputs: Array<{ txid: string, vout: number, satoshis: number }> }
}

const avg = (xs: number[]): number => (xs.length === 0 ? 0 : Math.round(xs.reduce((s, x) => s + x, 0) / xs.length))

export async function computeMetrics (deps: ApiDeps): Promise<Metrics> {
  const pools = await derivePools(deps, await deps.overlay.pools())
  const byStatus: Record<string, number> = { open: 0, locking: 0, settled: 0, failed: 0, cancelled: 0 }
  for (const p of pools) byStatus[p.status] = (byStatus[p.status] ?? 0) + 1
  const pledges = { open: 0, cancelled: 0, settled: 0, waiting: 0 }
  const fees: number[] = []; const perParticipant: number[] = []; const bytes: number[] = []; const counts: number[] = []; const rounds: number[] = []
  const unaccounted: Metrics['custodyCheck']['unaccountedOutputs'] = []
  let outputsClassified = 0

  for (const pool of pools) {
    const all = await deps.overlay.pledgeCandidatesAll(pool.poolId)
    const s = pool.status === 'settled' ? await deps.overlay.settlementWithTx(pool.poolId) : undefined
    const settledTxid = s?.tx.id('hex')
    for (const { view } of all) {
      if (view.spent && view.spendingTxid === settledTxid) pledges.settled++
      else if (view.spent) pledges.cancelled++
      else if (pool.status === 'open' || pool.status === 'locking') pledges.open++
      else pledges.waiting++ // left over after the pool settled, failed or was cancelled
    }
    if (s === undefined) continue
    const tx = s.tx
    const inSats = tx.inputs.reduce((sum, inp) => sum + (inp.sourceTransaction?.outputs[inp.sourceOutputIndex]?.satoshis ?? 0), 0)
    const outSats = tx.outputs.reduce((sum, o) => sum + (o.satoshis ?? 0), 0)
    const n = tx.inputs.length - 1
    fees.push(inSats - outSats); perParticipant.push((inSats - outSats) / n); bytes.push(tx.toBinary().length); counts.push(n)
    const round = parseOpReturn(tx.outputs[tx.outputs.length - 1].lockingScript)?.json.round
    if (typeof round === 'string') rounds.push(Number(round))
    const byOutpoint = new Map(all.map(c => [c.view.outpoint, c]))
    const included = tx.inputs.slice(1).map(inp => byOutpoint.get(`${inp.sourceTXID ?? inp.sourceTransaction!.id('hex')}_${inp.sourceOutputIndex}`))
      .filter(c => c !== undefined)
      .map(c => ({ ...c!.view, lockingScriptHex: c!.sourceTx.outputs[c!.view.vout].lockingScript.toHex() }))
    classifySettlement(tx, pool.terms, included).forEach((cls, vout) => {
      outputsClassified++
      if (cls === 'unaccounted') unaccounted.push({ txid: tx.id('hex'), vout, satoshis: tx.outputs[vout].satoshis ?? 0 })
    })
  }

  return {
    generatedAt: new Date().toISOString(),
    pools: byStatus,
    pledges,
    settlements: counts.length,
    participants: { total: counts.reduce((s, x) => s + x, 0), avgPerSettlement: avg(counts), max: Math.max(0, ...counts) },
    avgFeeSats: avg(fees),
    avgFeeSatsPerParticipant: avg(perParticipant),
    avgSettlementBytes: avg(bytes),
    rounds: { avg: rounds.length === 0 ? 0 : Math.round(10 * rounds.reduce((s, x) => s + x, 0) / rounds.length) / 10, max: Math.max(0, ...rounds) },
    custodiedSats: unaccounted.reduce((s, u) => s + u.satoshis, 0),
    custodyCheck: { settlementsChecked: counts.length, outputsClassified, unaccountedOutputs: unaccounted }
  }
}

/** Prometheus text exposition. */
export function toProm (m: Metrics): string {
  const lines: string[] = []
  const g = (name: string, help: string, v: number, labels = ''): void => {
    if (!lines.some(l => l.startsWith(`# HELP ${name} `))) lines.push(`# HELP ${name} ${help}`, `# TYPE ${name} gauge`)
    lines.push(`${name}${labels} ${v}`)
  }
  for (const [status, n] of Object.entries(m.pools)) g('agentcoop_pools', 'Pools by status', n, `{status="${status}"}`)
  for (const [state, n] of Object.entries(m.pledges)) g('agentcoop_pledges', 'Pledges by state', n, `{state="${state}"}`)
  g('agentcoop_settlements', 'Settlement transactions', m.settlements)
  g('agentcoop_participants_total', 'Participants across settlements', m.participants.total)
  g('agentcoop_participants_max', 'Largest settlement (participants)', m.participants.max)
  g('agentcoop_settlement_fee_sats_avg', 'Average settlement fee (sats)', m.avgFeeSats)
  g('agentcoop_settlement_fee_sats_per_participant_avg', 'Average fee per participant (sats)', m.avgFeeSatsPerParticipant)
  g('agentcoop_settlement_bytes_avg', 'Average settlement size (bytes)', m.avgSettlementBytes)
  g('agentcoop_custodied_sats', 'Sats in settlement outputs that pay neither the provider nor a participant', m.custodiedSats)
  return lines.join('\n') + '\n'
}
