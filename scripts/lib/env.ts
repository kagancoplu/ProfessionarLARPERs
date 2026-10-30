/**
 * Environment for the ops scripts (MASTER-PLAN §3.9).
 *
 * Loads `<repo>/.env` once. Private keys are read from it but never printed:
 * every error names the variable, never its value.
 */
import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { ARCADE_MAINNET, ARCADE_TESTNET } from '@agentcoop/core/kit/arcadeChainTracker'

export const REPO_ROOT = resolve(import.meta.dirname, '..', '..')
export const ENV_FILE = join(REPO_ROOT, '.env')
export const DATA_DIR = join(REPO_ROOT, 'data')

if (existsSync(ENV_FILE)) process.loadEnvFile(ENV_FILE)

/** The seven server wallets of MASTER-PLAN §6.1, in .env order. */
export const WALLET_NAMES = ['provider-api', 'coordinator', 'guard', 'agent-1', 'agent-2', 'agent-3', 'maker'] as const
export type WalletName = typeof WALLET_NAMES[number]

export type Chain = 'main' | 'test'

/** `provider-api` → `WALLET_PROVIDER_API_KEY`, `agent-1` → `WALLET_AGENT_1_KEY`. */
export const keyVar = (name: string): string => `WALLET_${name.toUpperCase().replace(/-/g, '_')}_KEY`

export const isKeyHex = (s: string | undefined): s is string => s !== undefined && /^[0-9a-f]{64}$/i.test(s)

export const hasKey = (name: string): boolean => isKeyHex(process.env[keyVar(name)])

export function requireKey (name: string): string {
  const v = keyVar(name)
  const value = process.env[v]
  if (value === undefined || value === '') throw new Error(`${v} is not set in .env (run: npx tsx scripts/keygen.ts --only-missing >> .env)`)
  if (!isKeyHex(value)) throw new Error(`${v} in .env is not 64 hex characters`)
  return value
}

export function chain (): Chain {
  const n = process.env.NETWORK ?? 'main'
  if (n !== 'main' && n !== 'test') throw new Error(`NETWORK must be "main" or "test", got "${n}"`)
  return n
}

export const arcadeUrl = (): string => process.env.ARCADE_URL ?? (chain() === 'main' ? ARCADE_MAINNET : ARCADE_TESTNET)

export const appOriginator = (): string => process.env.APP_ORIGINATOR ?? 'agentcoop.local'

/** The name BRC-100 `getNetwork` reports for our chain. */
export const walletNetwork = (): 'mainnet' | 'testnet' => chain() === 'main' ? 'mainnet' : 'testnet'

export const wocTxUrl = (txid: string): string =>
  `https://whatsonchain.com${chain() === 'main' ? '' : '/test'}/tx/${txid}`
