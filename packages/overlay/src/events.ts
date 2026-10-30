/**
 * Overlay → listeners: one event per admission and per spend, so the
 * coordinator and UIs can update immediately (B.P3, MASTER §3.8).
 * Served as Server-Sent Events at GET /agentcoop/events.
 */
import { EventEmitter } from 'node:events'
import type { Request, Response } from 'express'

export interface OverlayEvent { type: 'admitted' | 'spent', txid: string }

export class OverlayEvents extends EventEmitter {
  /** open SSE responses, ended on close() so the HTTP server can shut down */
  readonly streams = new Set<Response>()

  emitEvent (e: OverlayEvent): void { this.emit('event', e) }

  close (): void {
    for (const res of this.streams) res.end()
    this.streams.clear()
  }
}

export function sseHandler (events: OverlayEvents) {
  return (req: Request, res: Response): void => {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'Access-Control-Allow-Origin': '*'
    })
    res.write(': agentcoop overlay events\n\n')
    const send = (e: OverlayEvent): void => { res.write(`data: ${JSON.stringify(e)}\n\n`) }
    const ping = setInterval(() => res.write(': ping\n\n'), 15_000)
    events.on('event', send)
    events.streams.add(res)
    req.on('close', () => { clearInterval(ping); events.off('event', send); events.streams.delete(res) })
  }
}
