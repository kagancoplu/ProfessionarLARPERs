/** Console helpers shared by the demos. */
import type { DemoAgent } from './harness'

export const step = (title: string): void => { console.log(`\n\x1b[1m\x1b[37m━━ ${title}\x1b[0m`) }
export const note = (text: string): void => { console.log(`\x1b[90m   ${text}\x1b[0m`) }

export async function summary (agents: DemoAgent[], dataDir: string): Promise<void> {
  step('Summary')
  const rows = []
  for (const a of agents) {
    const p = a.participant.history.at(-1)
    rows.push({
      agent: a.agent.profile.name,
      pledge: p === undefined ? '-' : `${p.credits} → ${p.status}`,
      settlement: p?.settledTxid === undefined ? '-' : `${p.settledTxid.slice(0, 16)}…`,
      'credits held': String(await a.agent.ownedCredits()),
      'prepaid min': await a.agent.prepaidMinutes(),
      'spent this week (sat)': a.agent.spentThisWeekSats()
    })
  }
  console.table(rows)
  note(`decisions.log per agent: ${dataDir}/agents/<name>/decisions.log`)
}
