import { describe, expect, it } from 'vitest'
import { followSse } from '../src/sse'

/** A fetch that answers each call with the next list of chunks as a streamed body, recording the request headers. */
function fakeFetch (bodies: string[][]) {
  const calls: Array<Record<string, string>> = []
  const impl = (async (_url: string, init?: RequestInit) => {
    calls.push({ ...(init?.headers as Record<string, string> | undefined) })
    const chunks = bodies.shift()
    if (chunks === undefined) return await new Promise<Response>(() => {}) // no more bodies: hang until closed
    const enc = new TextEncoder()
    const stream = new ReadableStream<Uint8Array>({ start (c) { for (const ch of chunks) c.enqueue(enc.encode(ch)); c.close() } })
    return new Response(stream, { status: 200, headers: { 'content-type': 'text/event-stream' } })
  }) as unknown as typeof fetch
  return { impl, calls }
}

const until = async (cond: () => boolean): Promise<void> => {
  for (let i = 0; i < 100 && !cond(); i++) await new Promise(r => setTimeout(r, 5))
}

describe('followSse', () => {
  it('joins id/data frames split across chunks and ignores keepalive comments', async () => {
    const { impl } = fakeFetch([['id: g:1\nda', 'ta: {"a":1}\n\n: keepalive\n\n']])
    const got: Array<[string, string]> = []
    const h = followSse('http://x/events', (data, id) => got.push([data, id]), { fetchImpl: impl, minBackoffMs: 1 })
    await until(() => got.length > 0)
    h.close()
    expect(got).toEqual([['{"a":1}', 'g:1']])
  })

  it('BL-34 #8: a stream that goes silent is dropped after idleMs and reopened', async () => {
    let calls = 0
    const impl = (async (_url: string, init?: RequestInit) => {
      calls++
      const signal = init?.signal
      // sends one event, then nothing at all (no keepalive) until aborted
      const stream = new ReadableStream<Uint8Array>({
        start (c) {
          c.enqueue(new TextEncoder().encode(`id: s:${calls}\ndata: x\n\n`))
          signal?.addEventListener('abort', () => { c.error(new Error('aborted')) })
        }
      })
      return new Response(stream, { status: 200 })
    }) as unknown as typeof fetch
    const got: string[] = []
    const h = followSse('http://x/events', data => got.push(data), { fetchImpl: impl, minBackoffMs: 1, idleMs: 30 })
    await until(() => calls >= 2)
    h.close()
    expect(calls).toBeGreaterThanOrEqual(2)
    expect(got.length).toBeGreaterThanOrEqual(2)
  })

  it('reconnects after the stream ends and sends Last-Event-ID', async () => {
    const { impl, calls } = fakeFetch([['id: g:1\ndata: x\n\n'], ['id: g:2\ndata: y\n\n']])
    const got: string[] = []
    const h = followSse('http://x/events', data => got.push(data), { fetchImpl: impl, minBackoffMs: 1 })
    await until(() => got.length === 2)
    h.close()
    expect(got).toEqual(['x', 'y'])
    expect(calls[1]?.['Last-Event-ID']).toBe('g:1')
  })
})
