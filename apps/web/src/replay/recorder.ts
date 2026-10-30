/**
 * Records every bus event while recording is on and hands the result over as a replay file
 * (`mainnet-<date>.jsonl`: first line a comment, then one CoopEvent per line; `parseJsonl` reads it back).
 * The human drops the file into public/replays/ and opens `?replay=mainnet-<date>`.
 */
import type { EventBus } from '../events/bus'
import type { AnyCoopEvent } from '../events/types'

export interface RecordingMeta { mode: string, urls: Record<string, string>, startedAt: string }

export function toJsonl (events: AnyCoopEvent[], meta: RecordingMeta, name: string): string {
  const header = `# AgentCoop replay · ${name} · recorded ${meta.startedAt} in ${meta.mode} mode · ${Object.entries(meta.urls).map(([k, v]) => `${k}=${v}`).join(' ')}`
  return [header, ...events.map(e => JSON.stringify(e))].join('\n') + '\n'
}

export const replayName = (mode: string, at = new Date()): string => `${mode === 'live' ? 'mainnet' : mode}-${at.toISOString().slice(0, 16).replace(/[:T]/g, '-')}`

export class Recorder {
  readonly events: AnyCoopEvent[] = []
  private stop?: () => void
  startedAt?: string
  constructor (private readonly bus: EventBus) {}
  get recording (): boolean { return this.stop !== undefined }
  start (): void {
    if (this.stop !== undefined) return
    this.events.length = 0
    this.startedAt = new Date().toISOString()
    this.stop = this.bus.subscribe(e => { if (e.type !== 'flow_step' && e.type !== 'service_health') this.events.push(e) })
  }
  end (): void { this.stop?.(); this.stop = undefined }
  file (meta: Omit<RecordingMeta, 'startedAt'>): { name: string, text: string } {
    const name = replayName(meta.mode, this.startedAt !== undefined ? new Date(this.startedAt) : new Date())
    return { name: `${name}.jsonl`, text: toJsonl(this.events, { ...meta, startedAt: this.startedAt ?? new Date().toISOString() }, name) }
  }
}

/** Browser download of a text file. */
export function download (name: string, text: string): void {
  const blob = new Blob([text], { type: 'application/x-ndjson' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a'); a.href = url; a.download = name; a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
