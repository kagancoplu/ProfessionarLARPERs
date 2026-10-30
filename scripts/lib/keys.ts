/**
 * Server wallet key generation. Pure: returns `.env` lines, writes nothing.
 * keygen.ts prints them to stdout, which the operator redirects into .env.
 */
import { PrivateKey } from '@agentcoop/core/sdk'
import { keyVar } from './env'

export interface KeyLines {
  lines: string[]
  skipped: string[]
}

/** One `WALLET_<NAME>_KEY=<64 hex>` line per name, skipping names for which `isSet(name)` is true. */
export function generateKeyLines (names: readonly string[], isSet: (name: string) => boolean = () => false): KeyLines {
  const lines: string[] = []
  const skipped: string[] = []
  for (const name of names) {
    if (isSet(name)) { skipped.push(name); continue }
    lines.push(`${keyVar(name)}=${PrivateKey.fromRandom().toHex()}`)
  }
  return { lines, skipped }
}
