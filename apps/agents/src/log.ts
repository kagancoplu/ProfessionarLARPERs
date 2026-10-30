/** Readable agent activity lines: "[09:02] …" to the console and <data>/agents/<name>/activity.log. */
import { appendFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

const COLORS: Record<string, string> = { finetune: '\x1b[35m', eval: '\x1b[36m', inference: '\x1b[33m' }

export class AgentLog {
  private readonly file?: string
  readonly lines: string[] = []

  constructor (readonly agent: string, dir?: string, private readonly quiet = false) {
    if (dir !== undefined) {
      mkdirSync(join(dir, 'agents', agent), { recursive: true })
      this.file = join(dir, 'agents', agent, 'activity.log')
    }
  }

  info (text: string): void {
    const now = new Date()
    const line = `[${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}] ${text}`
    this.lines.push(line)
    if (this.file !== undefined) appendFileSync(this.file, `${now.toISOString()} ${line}\n`)
    if (!this.quiet) console.log(`${COLORS[this.agent] ?? '\x1b[32m'}${this.agent.padEnd(9)}\x1b[0m ${line}`)
  }
}
