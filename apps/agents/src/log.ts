/**
 * Readable agent lines: "[09:02] …".
 *  - info()     → console + <data>/agents/<name>/activity.log (what the agent did)
 *  - decision() → console + <data>/agents/<name>/decisions.log (why it bought or did not: for the jury)
 */
import { appendFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

const COLORS: Record<string, string> = { finetune: '\x1b[35m', eval: '\x1b[36m', inference: '\x1b[33m' }

export class AgentLog {
  private readonly activityFile?: string
  private readonly decisionsFile?: string
  readonly lines: string[] = []
  readonly decisions: string[] = []

  constructor (readonly agent: string, dir?: string, private readonly quiet = false) {
    if (dir !== undefined) {
      mkdirSync(join(dir, 'agents', agent), { recursive: true })
      this.activityFile = join(dir, 'agents', agent, 'activity.log')
      this.decisionsFile = join(dir, 'agents', agent, 'decisions.log')
    }
  }

  private stamp (): { now: Date, hhmm: string } {
    const now = new Date()
    return { now, hhmm: `[${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}]` }
  }

  info (text: string): void {
    const { now, hhmm } = this.stamp()
    const line = `${hhmm} ${text}`
    this.lines.push(line)
    if (this.activityFile !== undefined) appendFileSync(this.activityFile, `${now.toISOString()} ${line}\n`)
    if (!this.quiet) console.log(`${COLORS[this.agent] ?? '\x1b[32m'}${this.agent.padEnd(9)}\x1b[0m ${line}`)
  }

  decision (text: string): void {
    const { now, hhmm } = this.stamp()
    const line = `${hhmm} ${text}`
    this.decisions.push(line)
    if (this.decisionsFile !== undefined) appendFileSync(this.decisionsFile, `${now.toISOString()} ${line}\n`)
    if (this.activityFile !== undefined) appendFileSync(this.activityFile, `${now.toISOString()} ${line}\n`)
    if (!this.quiet) console.log(`${COLORS[this.agent] ?? '\x1b[32m'}${this.agent.padEnd(9)}\x1b[0m \x1b[1m${line}\x1b[0m`)
  }
}
