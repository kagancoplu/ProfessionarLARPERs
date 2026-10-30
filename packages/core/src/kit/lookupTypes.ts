/**
 * Lookup query and answer-context types of the kit overlay (`ls_tokenkit`),
 * copied verbatim from the kit's overlay/Bsv21KitLookupService.ts so the core
 * package does not import the overlay package (owned by Track B).
 */

/** Queries accepted by `ls_tokenkit` (the `query` of a LookupQuestion). */
export type KitQuery =
  | { op: 'token', tokenId: string }
  | { op: 'tokens' }
  | { op: 'utxos', ownerPkhs: string[], tokenId?: string }
  | { op: 'identity', identityKey: string, tokenId?: string, includeSpent?: boolean }
  | { op: 'outpoint', txid: string, vout: number }
  | { op: 'history', tokenId: string, limit?: number }

/** Per-output metadata returned in each lookup answer's `context` (UTF-8 JSON). */
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
