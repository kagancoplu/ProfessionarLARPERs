/**
 * Server-Sent Events over fetch (Node has no EventSource without a flag): MASTER §3.10 framing (`id:` +
 * `data:`, `:` comments are keepalives). Reconnects with 1 → 30 s backoff and resumes with Last-Event-ID.
 * A stream silent for `idleMs` (default 45 s; the services send a keepalive every 15 s) is dropped and reopened.
 */
export interface SseOptions { fetchImpl?: typeof fetch, minBackoffMs?: number, maxBackoffMs?: number, idleMs?: number, onStatus?: (ok: boolean, detail?: string) => void }

export function followSse (url: string, onEvent: (data: string, id: string) => void, opts: SseOptions = {}): { close (): void } {
  const doFetch = opts.fetchImpl ?? fetch
  const min = opts.minBackoffMs ?? 1_000
  const max = opts.maxBackoffMs ?? 30_000
  const idleMs = opts.idleMs ?? 45_000
  let closed = false
  let lastId = ''
  let ctrl: AbortController | undefined

  const run = async (): Promise<void> => {
    let backoff = min
    while (!closed) {
      try {
        ctrl = new AbortController()
        const headers: Record<string, string> = { accept: 'text/event-stream' }
        if (lastId !== '') headers['Last-Event-ID'] = lastId
        const res = await doFetch(url, { headers, signal: ctrl.signal })
        if (!res.ok || res.body === null) throw new Error(`HTTP ${res.status}`)
        opts.onStatus?.(true)
        backoff = min
        const reader = res.body.pipeThrough(new TextDecoderStream()).getReader()
        let buf = ''
        let idle: ReturnType<typeof setTimeout> | undefined
        const stream = ctrl
        const wake = (): void => { if (idle !== undefined) clearTimeout(idle); idle = setTimeout(() => { stream.abort(new Error(`no data for ${idleMs} ms`)) }, idleMs) }
        wake()
        for (;;) {
          let chunk: ReadableStreamReadResult<string>
          try { chunk = await reader.read() } finally { if (idle !== undefined) clearTimeout(idle) }
          const { value, done } = chunk
          if (done) break
          wake()
          buf += value
          let end: number
          while ((end = buf.indexOf('\n\n')) >= 0) {
            const frame = buf.slice(0, end)
            buf = buf.slice(end + 2)
            let id = ''
            const data: string[] = []
            for (const line of frame.split('\n')) {
              if (line.startsWith('id:')) id = line.slice(3).trim()
              else if (line.startsWith('data:')) data.push(line.slice(5).replace(/^ /, ''))
            }
            if (id !== '') lastId = id
            if (data.length > 0) onEvent(data.join('\n'), id)
          }
        }
        opts.onStatus?.(false, 'stream ended')
      } catch (err) {
        if (closed) return
        opts.onStatus?.(false, String((err as Error).message ?? err))
      }
      if (closed) return
      await new Promise(resolve => setTimeout(resolve, backoff))
      backoff = Math.min(backoff * 2, max)
    }
  }
  void run()
  return { close () { closed = true; ctrl?.abort() } }
}
