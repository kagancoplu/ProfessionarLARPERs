/**
 * GEÇİCİ KOPYA (Track B, Faz 1): MASTER §3.2 OP_RETURN zarfı, A'nın
 * `packages/core/src/scripts/opreturn.ts`'i (A.P0.3) gelene kadar.
 *
 *   OP_FALSE OP_RETURN "agentcoop" <op> <json>
 *
 * The SDK parses everything after OP_RETURN as one raw data chunk, so the
 * pushes are read by parsing that chunk again as a script.
 */
import { LockingScript, OP, Script, Utils } from '@bsv/sdk'

export const AGENTCOOP_OPS = ['pool', 'pledge', 'settle', 'list', 'vault'] as const
export type AgentCoopOp = typeof AGENTCOOP_OPS[number]

export function buildOpReturn (op: AgentCoopOp, json: Record<string, unknown>): LockingScript {
  return LockingScript.fromHex(new Script()
    .writeOpCode(OP.OP_FALSE)
    .writeOpCode(OP.OP_RETURN)
    .writeBin(Utils.toArray('agentcoop', 'utf8'))
    .writeBin(Utils.toArray(op, 'utf8'))
    .writeBin(Utils.toArray(JSON.stringify(json), 'utf8'))
    .toHex())
}

/** `{ op, json }` for a well-formed agentcoop envelope, else null. Does not validate the json fields. */
export function parseOpReturn (script: LockingScript | Script | string): { op: AgentCoopOp, json: Record<string, unknown> } | null {
  try {
    const hex = typeof script === 'string' ? script : script.toHex()
    const c = Script.fromHex(hex).chunks
    if (c.length !== 2 || c[0].op !== OP.OP_FALSE || c[1].op !== OP.OP_RETURN || c[1].data === undefined) return null
    const pushes = Script.fromBinary(c[1].data).chunks
    if (pushes.length !== 3 || pushes.some(p => p.data === undefined)) return null
    if (Utils.toUTF8(pushes[0].data!) !== 'agentcoop') return null
    const op = Utils.toUTF8(pushes[1].data!) as AgentCoopOp
    if (!AGENTCOOP_OPS.includes(op)) return null
    const json = JSON.parse(Utils.toUTF8(pushes[2].data!))
    if (json === null || typeof json !== 'object' || Array.isArray(json)) return null
    return { op, json }
  } catch {
    return null
  }
}
