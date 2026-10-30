/** Small helpers shared by the ops CLIs. */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { WalletClient } from '@bsv/sdk'
import { DATA_DIR, REPO_ROOT, appOriginator, walletNetwork } from './env'

export const IDENTITIES_FILE = join(REPO_ROOT, 'config', 'identities.json')
export const PAYMENTS_DIR = join(DATA_DIR, 'payments')
export const PROBE_FILE = join(DATA_DIR, 'ops', 'mainnet-probe.json')

/** Run an async CLI entry point; print only the error message (never env values) and exit. */
export function run (main: () => Promise<void>): void {
  main().then(
    () => process.exit(0),
    (e: unknown) => {
      console.error(`✗ ${e instanceof Error ? e.message : String(e)}`)
      process.exit(1)
    }
  )
}

export const flag = (args: string[], name: string): boolean => args.includes(name)

export function option (args: string[], name: string): string | undefined {
  const i = args.indexOf(name)
  return i === -1 ? undefined : args[i + 1]
}

/** Public identity keys: `{ "agent-1": "02…", "desktop-treasury": "03…" }`. Committed. */
export type Identities = Record<string, string>

export const loadIdentities = (): Identities =>
  existsSync(IDENTITIES_FILE) ? JSON.parse(readFileSync(IDENTITIES_FILE, 'utf8')) as Identities : {}

export function saveIdentities (ids: Identities): void {
  mkdirSync(join(IDENTITIES_FILE, '..'), { recursive: true })
  const sorted = Object.fromEntries(Object.entries(ids).sort(([a], [b]) => a.localeCompare(b)))
  writeFileSync(IDENTITIES_FILE, JSON.stringify(sorted, null, 2) + '\n')
}

/** Connect to BSV Desktop (or BSV Browser) running on this machine and check the network. */
export async function connectDesktop (): Promise<{ wallet: WalletClient, identityKey: string }> {
  const wallet = new WalletClient('auto', appOriginator())
  try {
    await wallet.waitForAuthentication({})
  } catch (e) {
    throw new Error(`BSV Desktop not reachable: open and unlock it on this machine (ports 3321/2121). ${e instanceof Error ? e.message : ''}`)
  }
  const { network } = await wallet.getNetwork({})
  if (network !== walletNetwork()) throw new Error(`BSV Desktop is on ${network}, but NETWORK expects ${walletNetwork()}`)
  const { publicKey: identityKey } = await wallet.getPublicKey({ identityKey: true })
  return { wallet, identityKey }
}

export const short = (key: string): string => `${key.slice(0, 10)}…${key.slice(-6)}`
