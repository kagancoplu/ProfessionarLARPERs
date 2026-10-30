/**
 * Funding core, independent of where the wallets live: the source can be BSV
 * Desktop (WalletClient) or any wallet-toolbox wallet, so the same code runs
 * on mainnet and on the mock chain.
 *
 * A payment is written to disk BEFORE the recipient internalizes it. If
 * internalizing fails, nothing is lost: receive.ts retries from the file.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import type { ChainTracker, WalletInterface } from '@agentcoop/core/sdk'
import { acceptBrc29Payment, createBrc29Payment, type Brc29Payment } from '@agentcoop/core/kit/payments'

export interface FundingTarget {
  name: string
  identityKey: string
}

export interface FundingRecord extends Brc29Payment {
  target: string
  targetIdentityKey: string
  createdAt: string
}

const description = (prefix: string, name: string): string => `${prefix} ${name}`.slice(0, 50)

/** Pay `satoshis` from `source` to `target` with BRC-29. The source wallet signs and broadcasts. */
export async function payTarget (
  source: WalletInterface,
  target: FundingTarget,
  satoshis: number,
  originator?: string
): Promise<FundingRecord> {
  if (!Number.isSafeInteger(satoshis) || satoshis <= 0) throw new Error(`invalid amount for ${target.name}: ${satoshis}`)
  const payment = await createBrc29Payment(source, target.identityKey, satoshis, description('AgentCoop fund', target.name), originator)
  return { ...payment, target: target.name, targetIdentityKey: target.identityKey, createdAt: new Date().toISOString() }
}

/** Verify (SPV, script, amount) and internalize a funding payment into `wallet`. */
export async function acceptPayment (
  wallet: WalletInterface,
  record: FundingRecord,
  chainTracker?: ChainTracker,
  originator?: string
): Promise<void> {
  const { publicKey } = await wallet.getPublicKey({ identityKey: true }, originator)
  if (publicKey !== record.targetIdentityKey) throw new Error(`payment ${record.txid} is for ${record.target}, not for this wallet`)
  await acceptBrc29Payment(wallet, record, chainTracker, description('AgentCoop funding', record.target), originator)
}

// ── payment files (data/payments) ────────────────────────────────────────────

export function savePaymentFile (dir: string, record: FundingRecord): string {
  mkdirSync(dir, { recursive: true })
  const path = join(dir, `${record.target}-${record.txid}.json`)
  writeFileSync(path, JSON.stringify(record, null, 2))
  return path
}

export function loadPaymentFile (path: string): FundingRecord {
  const r = JSON.parse(readFileSync(path, 'utf8')) as FundingRecord
  if (!Array.isArray(r.tx) || typeof r.txid !== 'string' || typeof r.targetIdentityKey !== 'string') throw new Error(`${path} is not a funding payment file`)
  return r
}

/** Pending payment files (not yet moved to `accepted/`). */
export const pendingPaymentFiles = (dir: string): string[] =>
  existsSync(dir) ? readdirSync(dir).filter(f => f.endsWith('.json')).map(f => join(dir, f)) : []

export function markAccepted (path: string): string {
  const dir = join(path, '..', 'accepted')
  mkdirSync(dir, { recursive: true })
  const to = join(dir, basename(path))
  renameSync(path, to)
  return to
}

// ── balances (guide §11) ─────────────────────────────────────────────────────

export async function poolBalance (wallet: WalletInterface, basket = 'default', originator?: string): Promise<{ spendableSatoshis: number, spendableOutputs: number, outpoints: string[] }> {
  let total = 0
  let count = 0
  const outpoints: string[] = []
  for (let offset = 0; ; offset += 100) {
    const { outputs, totalOutputs } = await wallet.listOutputs({ basket, limit: 100, offset }, originator)
    for (const o of outputs) {
      if (o.spendable) { total += o.satoshis; count++; outpoints.push(o.outpoint) }
    }
    if (outputs.length === 0 || offset + outputs.length >= totalOutputs) break
  }
  return { spendableSatoshis: total, spendableOutputs: count, outpoints }
}
