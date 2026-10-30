/**
 * Lookup query and answer types of the overlay.
 *
 * `KitQuery` and `OutputContext` are copied from the starter kit
 * (overlay/Bsv21KitLookupService.ts), since the client must not import
 * the server. `CoopQuery` lists the AgentCoop record queries of
 * MASTER §3.8, which Track B serves from `ls_agentcoop`.
 */

/** Token queries (the `query` of a LookupQuestion). */
export type KitQuery =
  | { op: 'token', tokenId: string }
  | { op: 'tokens' }
  | { op: 'utxos', ownerPkhs: string[], tokenId?: string }
  | { op: 'identity', identityKey: string, tokenId?: string, includeSpent?: boolean }
  | { op: 'outpoint', txid: string, vout: number }
  | { op: 'history', tokenId: string, limit?: number }

/** AgentCoop record queries (MASTER §3.8, served by Track B). */
export type CoopQuery =
  | { op: 'pools' }
  | { op: 'pool', poolId: string }
  | { op: 'pledges', poolId: string, includeSpent?: boolean }
  | { op: 'settlement', poolId: string }
  | { op: 'listings', tokenId?: string }
  | { op: 'vaults', owner?: string }

export type OverlayQuery = KitQuery | CoopQuery

/** Per-output metadata returned in each token lookup answer's `context` (UTF-8 JSON). */
export interface OutputContext {
  tokenId: string
  op: string
  amt: string
  ownerPkh: string
  spent: boolean
  spendingTxid?: string
  /** Receive-key index, only for `identity` queries. */
  index?: number
  sym?: string
  dec?: string
}
