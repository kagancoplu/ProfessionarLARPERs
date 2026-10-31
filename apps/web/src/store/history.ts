/**
 * The session's history (metrics charts, pool timelines, agent leaderboard), kept by a pure
 * reducer next to applyEventToData. `before` is the state before the event, so a settlement can
 * still read the pool's pledges and terms.
 */
import type { AnyCoopEvent } from '../events/types'
import { HISTORY_LIMIT, POOL_STEP_LIMIT, type AgentStats, type History, type HistoryPoint, type PoolStep, type StoreData } from './types'


const EMPTY_STATS: AgentStats = { poolsJoined: [], creditsBought: 0, savingsSats: 0, settlements: 0 }

const addPoint = (h: History, p: HistoryPoint): History => ({ ...h, points: [...h.points, p].slice(-HISTORY_LIMIT) })

function addStep (h: History, poolId: string, step: PoolStep): History {
  const list = h.poolSteps[poolId] ?? []
  // the same transaction can arrive twice (overlay and coordinator both report a settlement)
  if (step.txid !== undefined && list.some(s => s.step === step.step && s.txid === step.txid)) return h
  return { ...h, poolSteps: { ...h.poolSteps, [poolId]: [...list, step].slice(-POOL_STEP_LIMIT) } }
}

const touchStats = (h: History, identity: string, patch: (s: AgentStats) => AgentStats): History =>
  ({ ...h, agentStats: { ...h.agentStats, [identity]: patch(h.agentStats[identity] ?? EMPTY_STATS) } })

/** Retail price used for the market's comparison line: the first pool's, else 50 sat/credit. */
function retailOf (d: StoreData): number {
  const first = d.pools.order.map(id => d.pools.byId[id]).find(p => p !== undefined)
  const r = Number(first?.terms.retailSatsPerCredit ?? 50)
  return Number.isFinite(r) && r > 0 ? r : 50
}

export function applyHistory (before: StoreData, h: History, e: AnyCoopEvent): History {
  switch (e.type) {
    case 'pool_opened': {
      const { pool } = e.data
      return addStep(h, pool.poolId, { ts: e.ts, step: 'opened', text: `Announced: ${pool.terms.credits} credits for ${pool.terms.priceSats} sat`, txid: pool.txid, actor: pool.terms.provider })
    }
    case 'pledge_added': {
      const { pledge } = e.data
      if (before.pools.byId[pledge.poolId]?.pledges?.some(p => p.outpoint === pledge.outpoint) === true) return h
      h = addStep(h, pledge.poolId, { ts: e.ts, step: 'pledge', text: `Pledge of ${pledge.credits} credits (coin stays in the wallet)`, txid: pledge.txid, actor: pledge.participant })
      return touchStats(h, pledge.participant, s => (s.poolsJoined.includes(pledge.poolId) ? s : { ...s, poolsJoined: [...s.poolsJoined, pledge.poolId] }))
    }
    case 'pledge_cancelled':
      return addStep(h, e.data.pledge.poolId, { ts: e.ts, step: 'withdrawn', text: `Pledge of ${e.data.pledge.credits} credits withdrawn`, txid: e.data.txid, actor: e.data.pledge.participant })
    case 'pool_update':
      // lock-in is reported once, by whichever arrives first: the status change or the human's sign request
      if (e.data.status !== 'locking' || before.pools.byId[e.data.poolId]?.status === 'locking') return h
      return addStep(h, e.data.poolId, { ts: e.ts, step: 'locking', text: 'Locked in: pledges closed, the signing round starts' })
    case 'sign_request':
      if (before.pools.byId[e.data.poolId]?.status === 'locking') return h
      return addStep(h, e.data.poolId, { ts: e.ts, step: 'locking', text: `Locked in: signing round ${e.data.round}, ${e.data.plan.participants.length} participants` })
    case 'cosign_approved':
      // pledge co-signs are already the pledge line; the timeline shows the guard's settlement signatures
      if (e.data.poolId === undefined || (e.data.kind !== 'settle' && e.data.kind !== 'lighthouse')) return h
      return addStep(h, e.data.poolId, { ts: e.ts, step: 'signed', text: `The guard co-signed (${e.data.kind})`, actor: e.data.agent, ...(e.data.txid !== undefined ? { txid: e.data.txid } : {}) })
    case 'agent_decision':
      if (e.data.action !== 'sign' || e.data.poolId === undefined) return h
      return addStep(h, e.data.poolId, { ts: e.ts, step: 'signed', text: 'Signed its input after checking the plan', ...(e.agent !== undefined ? { actor: e.agent } : {}) })
    case 'round_failed':
      return addStep(h, e.data.poolId, { ts: e.ts, step: 'round_failed', text: `Round ${e.data.round} failed: ${e.data.missing.length} signature(s) missing` })
    case 'settled':
      return addStep(h, e.data.poolId, { ts: e.ts, step: 'settled', text: 'Settled in one transaction', txid: e.data.txid })
    case 'pool_settled': {
      const pool = before.pools.byId[e.data.poolId]
      h = addStep(h, e.data.poolId, { ts: e.ts, step: 'settled', text: `Settled in one transaction, ${e.data.participants} participants`, txid: e.data.txid })
      if (pool === undefined) return addPoint(h, { k: 'settled', ts: e.ts, poolId: e.data.poolId, txid: e.data.txid, savingsSats: 0, participants: e.data.participants })
      const retail = Number(pool.terms.retailSatsPerCredit)
      const credits = Number(pool.terms.credits)
      const perCredit = credits > 0 ? Number(pool.terms.priceSats) / credits : 0
      const saved = Math.max(0, retail * credits - Number(pool.terms.priceSats))
      h = addPoint(h, { k: 'settled', ts: e.ts, poolId: e.data.poolId, txid: e.data.txid, savingsSats: Number.isFinite(saved) ? saved : 0, participants: e.data.participants })
      for (const p of pool.pledges ?? []) {
        // a pledge counts if this settlement spent it (sources may mark it spent before this event arrives)
        if (p.spent ? p.spendingTxid !== e.data.txid : !p.valid) continue
        const c = Number(p.credits)
        const s = Math.max(0, Math.round(c * (retail - perCredit)))
        h = touchStats(h, p.participant, st => ({ ...st, creditsBought: st.creditsBought + c, savingsSats: st.savingsSats + (Number.isFinite(s) ? s : 0), settlements: st.settlements + 1 }))
      }
      return h
    }
    case 'pool_failed':
      return addStep(h, e.data.poolId, { ts: e.ts, step: 'failed', text: 'Did not fill by the deadline. Every coin is still in its wallet.' })
    case 'pool_cancelled':
      return addStep(h, e.data.poolId, { ts: e.ts, step: 'cancelled', text: 'Cancelled by the provider', txid: e.data.txid })
    case 'cosign_denied':
      return addPoint(h, { k: 'denied', ts: e.ts, agent: e.data.agent, reason: e.data.reason })
    case 'listing_added':
    case 'listing_filled': {
      const l = e.data.listing
      const c = Number(l.credits)
      if (!(c > 0)) return h
      h = addPoint(h, { k: 'price', ts: e.ts, satsPerCredit: Number(l.askSats) / c, credits: c, retail: retailOf(before), filled: e.type === 'listing_filled' })
      if (e.type === 'listing_filled' && e.data.buyer !== undefined) {
        const retail = retailOf(before)
        const s = Math.max(0, Math.round(c * retail - Number(l.askSats)))
        h = touchStats(h, e.data.buyer, st => ({ ...st, creditsBought: st.creditsBought + c, savingsSats: st.savingsSats + s }))
      }
      return h
    }
    default:
      return h
  }
}


