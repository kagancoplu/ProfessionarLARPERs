/**
 * AgentCoop OP_RETURN envelope (MASTER-PLAN §3.2):
 *
 *   OP_FALSE OP_RETURN "agentcoop" <op> <json>
 *
 * `op` ∈ pool | pledge | settle | list | vault; `json` is UTF-8 and every leaf
 * value is a string (numbers included), like BSV-21's canonical JSON.
 */
import { LockingScript, OP, Script, Utils } from '../sdk'
import { AgentCoopError } from '../errors'
import { COOP_OPS, OP_RETURN_TAG, type CoopOp } from '../types'

export type CoopJson = { [key: string]: CoopJsonValue }
export type CoopJsonValue = string | CoopJsonValue[] | { [key: string]: CoopJsonValue }

function assertStrings (value: unknown, path: string): void {
  if (typeof value === 'string') return
  if (Array.isArray(value)) { value.forEach((v, i) => assertStrings(v, `${path}[${i}]`)); return }
  if (value !== null && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      if (v === undefined) continue // optional fields are simply left out of the JSON
      assertStrings(v, `${path}.${k}`)
    }
    return
  }
  throw new AgentCoopError('BAD_OP_RETURN', `${path} must be a string (got ${typeof value})`)
}

export function buildOpReturn (op: CoopOp, json: object): LockingScript {
  if (!COOP_OPS.includes(op)) throw new AgentCoopError('BAD_OP_RETURN', `unknown op ${String(op)}`)
  assertStrings(json, 'json')
  const script = new Script()
    .writeOpCode(OP.OP_FALSE)
    .writeOpCode(OP.OP_RETURN)
    .writeBin(Utils.toArray(OP_RETURN_TAG, 'utf8'))
    .writeBin(Utils.toArray(op, 'utf8'))
    .writeBin(Utils.toArray(JSON.stringify(json), 'utf8'))
  return LockingScript.fromHex(script.toHex())
}

/** Decode an AgentCoop envelope; anything else (other OP_RETURNs, bad JSON, unknown op) → null. */
export function parseOpReturn (script: Script | LockingScript | string): { op: CoopOp, json: Record<string, unknown> } | null {
  let s: Script
  try {
    s = typeof script === 'string' ? Script.fromHex(script) : script
  } catch {
    return null
  }
  // The SDK parses everything after a top-level OP_RETURN as one data chunk,
  // so the pushes are re-read from that chunk's bytes.
  const head = s.chunks
  if (head.length !== 2 || head[0].op !== OP.OP_FALSE || head[1].op !== OP.OP_RETURN || head[1].data === undefined) return null
  try {
    const c = Script.fromBinary(head[1].data).chunks
    if (c.length !== 3 || c.some(x => x.data === undefined)) return null
    const field = (i: number): string => Utils.toUTF8(c[i].data!)
    if (field(0) !== OP_RETURN_TAG) return null
    const op = field(1)
    if (!(COOP_OPS as readonly string[]).includes(op)) return null
    const raw = field(2)
    const json = JSON.parse(raw) as unknown
    if (json === null || typeof json !== 'object' || Array.isArray(json)) return null
    assertStrings(json, 'json')
    return { op: op as CoopOp, json: json as Record<string, unknown> }
  } catch {
    return null
  }
}
