/**
 * Typed errors for every verify* / plan* function, so the coordinator and the
 * guard can log and branch on a stable code (track A, Faz 2.7 extends the list;
 * new codes are also added to MASTER-PLAN §3.4).
 */
export type ErrorCode =
  | 'BAD_OP_RETURN'
  | 'BAD_TERMS'
  | 'BAD_OFFER'
  | 'BAD_PLEDGE'
  | 'BAD_PLAN'
  | 'BAD_SIGNATURE'
  | 'LINEAGE_FAILED'
  | 'BAD_LISTING'
  | 'DEADLINE_PASSED'

export class AgentCoopError extends Error {
  constructor (readonly code: ErrorCode, message: string) {
    super(`${code}: ${message}`)
    this.name = 'AgentCoopError'
  }
}
