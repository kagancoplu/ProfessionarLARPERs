/** One JSON line per coordinator decision (B-P2 §3.5). */
export type Logger = (event: string, fields?: Record<string, unknown>) => void

export const jsonLogger: Logger = (event, fields = {}) => {
  console.log(JSON.stringify({ t: new Date().toISOString(), event, ...fields }))
}

export const silentLogger: Logger = () => {}
