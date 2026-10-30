/** Repo paths and `.env` loading shared by the apps (Node ≥ 22: process.loadEnvFile). */
import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url))

/** Load `<repo>/.env` once. Variables already set in the environment win. */
export function loadDotEnv (file = join(REPO_ROOT, '.env')): void {
  if (existsSync(file)) process.loadEnvFile(file)
}

/** `DATA_DIR` or `<repo>/data` (gitignored): wallets, ledgers, logs. */
export const dataDir = (): string => resolve(process.env.DATA_DIR ?? join(REPO_ROOT, 'data'))

export function requireEnv (name: string): string {
  const value = process.env[name]
  if (value === undefined || value.trim() === '') throw new Error(`${name} is not set (see .env.example)`)
  return value.trim()
}

export const network = (): 'main' | 'test' => (process.env.NETWORK === 'test' ? 'test' : 'main')
