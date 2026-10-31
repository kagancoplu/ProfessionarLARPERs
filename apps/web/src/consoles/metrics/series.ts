/** Pure builders from the store's session history to chart series and the agent leaderboard. */
import type { ChartSeries } from '../../ui/TimeChart'
import type { AgentEntry, AgentStats, HistoryPoint, StoreData } from '../../store/types'

const ms = (ts: string): number => new Date(ts).getTime()
const shortId = (s: string): string => (s.length > 12 ? `${s.slice(0, 6)}…${s.slice(-4)}` : s)

export function savingsSeries (points: HistoryPoint[]): ChartSeries {
  let total = 0
  const pts = points.flatMap(p => {
    if (p.k !== 'settled') return []
    total += p.savingsSats
    return [{ t: ms(p.ts), v: total, tip: `Pool ${shortId(p.poolId)} settled with ${p.participants} participants, ${p.savingsSats} sat saved vs retail` }]
  })
  return { id: 'savings', label: 'Village savings, running total', color: 'var(--grass-dark)', kind: 'step', points: pts }
}

export function refusalSeries (points: HistoryPoint[], names: Record<string, string>): ChartSeries {
  let n = 0
  const pts = points.flatMap(p => {
    if (p.k !== 'denied') return []
    n += 1
    return [{ t: ms(p.ts), v: n, tip: `${names[p.agent] ?? shortId(p.agent)}: ${p.reason}` }]
  })
  return { id: 'refusals', label: 'Guard refusals, running total', color: 'var(--danger-dark)', kind: 'step', points: pts }
}

export function priceSeries (points: HistoryPoint[]): { series: ChartSeries[], retail?: number } {
  const prices = points.filter((p): p is Extract<HistoryPoint, { k: 'price' }> => p.k === 'price')
  const pt = (p: Extract<HistoryPoint, { k: 'price' }>) => ({ t: ms(p.ts), v: p.satsPerCredit, tip: `${p.credits} credits at ${p.satsPerCredit.toFixed(1)} sat each (${Math.round(100 * (1 - p.satsPerCredit / p.retail))} % under retail)` })
  return {
    series: [
      { id: 'asked', label: 'Listed (ask)', color: 'var(--chart-ask)', kind: 'dots', hollow: true, points: prices.filter(p => !p.filled).map(pt) },
      { id: 'sold', label: 'Sold', color: 'var(--chart-fill)', kind: 'dots', points: prices.filter(p => p.filled).map(pt) }
    ],
    ...(prices.length > 0 ? { retail: prices.at(-1)!.retail } : {})
  }
}

export interface LeaderRow { identity: string, name: string, profile: string, pools: number, creditsBought: number, savingsSats: number }

/** Agents first by sats saved, then by pools joined; humans and unknown wallets are left out. */
export function leaderboard (agents: Record<string, AgentEntry>, stats: Record<string, AgentStats>): LeaderRow[] {
  return Object.values(agents)
    .filter(a => a.profile !== 'unknown')
    .map(a => {
      const s = stats[a.identity]
      return { identity: a.identity, name: a.name, profile: a.profile, pools: s?.poolsJoined.length ?? 0, creditsBought: s?.creditsBought ?? 0, savingsSats: s?.savingsSats ?? 0 }
    })
    .sort((a, b) => b.savingsSats - a.savingsSats || b.pools - a.pools || a.name.localeCompare(b.name))
}

/** The session's time axis: the first thing the history recorded, to the latest event seen. */
export function sessionSpan (d: Pick<StoreData, 'history' | 'feed'>): [number, number] | undefined {
  const firsts = [d.history.points[0]?.ts, ...Object.values(d.history.poolSteps).map(st => st[0]?.ts)].filter((x): x is string => x !== undefined).map(ms)
  const last = d.feed.at(-1)?.ts
  if (firsts.length === 0 || last === undefined) return undefined
  return [Math.min(...firsts), ms(last)]
}
