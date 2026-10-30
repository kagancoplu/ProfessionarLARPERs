/**
 * Lighthouse pledges (A-P5 5.5–5.7, MASTER §3.5): an offline human pledged
 * once (SINGLE|ACP over its own credit output) and named a guard. The
 * coordinator keeps the LighthousePledge (POST /pledges/lighthouse) and, in a
 * round, asks that guard instead of the human over WS: POST {guard}/cosign
 * `{ context: { kind: 'lighthouse' }, plan, inputIndex, pledge }` →
 * the complete unlocking script, checked in place like any signature.
 *
 * Guards are configured by URL (LIGHTHOUSE_GUARDS); each one's identity key
 * comes from its GET /healthz, so a pledge naming a guard this coordinator
 * cannot reach is refused up front instead of failing every round.
 * The coordinator holds no keys here either: the guard signs, after its own check.
 */
import { Transaction } from '@agentcoop/core/sdk'
import { AgentCoopError, parseOutpoint, pledgeRecordOf, verifyLighthousePledge, type LighthousePledge, type SettlementPlan } from '@agentcoop/core'
import { lighthouseCosign } from '@agentcoop/core/signers/VaultSigner'
import type { OverlayLookup } from './overlay'
import type { CoordinatorStore } from './store'
import { OfferError } from './verifyOffer'

export interface LighthouseDesk {
  pledge: (outpoint: string) => Promise<LighthousePledge | undefined>
  /** The guard's full unlocking script for `inputIndex`; throws when it refuses or is unreachable. */
  cosign: (guard: string, req: { plan: SettlementPlan, inputIndex: number, pledge: LighthousePledge }) => Promise<string>
  /** URL of the guard with this identity key, if this coordinator can reach it. */
  guardUrl: (guard: string) => Promise<string | undefined>
}

/** identity key → URL, from each configured guard's GET /healthz (re-read at most once a minute on a miss). */
export class GuardDirectory {
  private known = new Map<string, string>()
  private readAt = 0

  constructor (readonly urls: string[], private readonly refreshMs = 60_000) {}

  async urlFor (identityKey: string): Promise<string | undefined> {
    if (!this.known.has(identityKey) && Date.now() - this.readAt > this.refreshMs) await this.refresh()
    return this.known.get(identityKey)
  }

  async refresh (): Promise<void> {
    this.readAt = Date.now()
    const found = await Promise.all(this.urls.map(async url => {
      try {
        const res = await fetch(`${url.replace(/\/+$/, '')}/healthz`, { signal: AbortSignal.timeout(5_000) })
        const body = await res.json() as { identityKey?: unknown }
        return typeof body.identityKey === 'string' ? [body.identityKey, url] as const : undefined
      } catch {
        return undefined
      }
    }))
    for (const f of found) if (f !== undefined) this.known.set(f[0], f[1])
  }
}

export function lighthouseDesk (store: CoordinatorStore, guards: GuardDirectory): LighthouseDesk {
  return {
    pledge: async outpoint => await store.getLighthouse(outpoint),
    guardUrl: async guard => await guards.urlFor(guard),
    async cosign (guard, req) {
      const url = await guards.urlFor(guard)
      if (url === undefined) throw new Error(`guard ${guard.slice(0, 12)}… is not reachable from this coordinator`)
      return await lighthouseCosign(url, req)
    }
  }
}

const isHex = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && v.length % 2 === 0 && /^[0-9a-f]+$/i.test(v)

/**
 * POST /pledges/lighthouse: check the pledge offline (A's verifyLighthousePledge: on-chain record,
 * coin script, credit output, the human's signature), check the pool and the guard, put the pledge
 * transaction on the overlay, keep the pledge. Facts come from the transaction, not the request.
 */
export async function acceptLighthousePledge (deps: { overlay: OverlayLookup, store: CoordinatorStore, lighthouse: LighthouseDesk }, body: unknown): Promise<{ outpoint: string, poolId: string, guard: string }> {
  const b = body as Partial<LighthousePledge> | null
  if (b === null || typeof b !== 'object' || typeof b.outpoint !== 'string' || !isHex(b.humanSignatureHex) || !isHex(b.creditLockingScriptHex) ||
    !Array.isArray(b.beef) || b.beef.length === 0 || !b.beef.every(x => Number.isInteger(x) && x >= 0 && x < 256)) {
    throw new OfferError('LIGHTHOUSE_INVALID_FORMAT', 'expected a LighthousePledge: outpoint, humanSignatureHex, creditLockingScriptHex, beef (AtomicBEEF bytes)')
  }
  let sourceTx: Transaction
  let vout: number
  try {
    sourceTx = Transaction.fromAtomicBEEF(b.beef)
    vout = parseOutpoint(b.outpoint).vout
  } catch (e) {
    throw new OfferError('LIGHTHOUSE_INVALID_FORMAT', `beef/outpoint: ${String((e as Error).message ?? e)}`)
  }
  const poolId = pledgeRecordOf(sourceTx)?.poolId
  if (poolId === undefined) throw new OfferError('LIGHTHOUSE_INVALID', 'the transaction has no pledge record')
  const pool = await deps.overlay.pool(poolId)
  if (pool === undefined) throw new OfferError('POOL_NOT_FOUND', 'pool is not on the overlay', 404)
  if (pool.status !== 'open') throw new OfferError('POOL_NOT_OPEN', `pool is ${pool.status}`, 409)

  const pledge: LighthousePledge = {
    outpoint: b.outpoint,
    record: b.record as LighthousePledge['record'],
    satoshis: sourceTx.outputs[vout]?.satoshis ?? 0,
    humanSignatureHex: b.humanSignatureHex.toLowerCase(),
    creditLockingScriptHex: b.creditLockingScriptHex.toLowerCase(),
    beef: b.beef
  }
  try {
    pledge.record = verifyLighthousePledge(pledge, { sourceTx, tokenId: pool.terms.tokenId }) // the on-chain record
  } catch (e) {
    if (e instanceof AgentCoopError) throw new OfferError('LIGHTHOUSE_INVALID', e.message, 422)
    throw e
  }
  const credits = BigInt(pledge.record.credits)
  if (credits < BigInt(pool.terms.minCredits) || credits > BigInt(pool.terms.credits)) {
    throw new OfferError('LIGHTHOUSE_INVALID', `credits outside ${pool.terms.minCredits}..${pool.terms.credits}`, 422)
  }
  if (await deps.lighthouse.guardUrl(pledge.record.guard) === undefined) {
    throw new OfferError('GUARD_UNKNOWN', `guard ${pledge.record.guard} is not reachable from this coordinator; it could never co-sign`, 422)
  }

  await deps.overlay.submit(sourceTx.toBEEF()) // idempotent; the overlay decides validity against the pool
  await deps.store.saveLighthouse(poolId, pledge)
  return { outpoint: pledge.outpoint, poolId, guard: pledge.record.guard }
}
