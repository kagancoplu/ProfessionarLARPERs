/**
 * TEST-ONLY: a pool opened with Track A's real builders (deploy → reserve +
 * announce → SINGLE|ACP offer) on the tm_agentcoop overlay. Shared by the
 * second-coordinator and scale tests (B.P6b).
 */
import { buildReserveAndAnnounce, COOP_SERVICE, COOP_TOPIC, OverlayClient, signOffer, TokenKit, type Offer, type PoolTerms } from '@agentcoop/core'
import type { Wallet } from '@bsv/wallet-toolbox'
import type { MockChain } from '../../../../test/helpers/mockchain'

export const kitOn = (overlayUrl: string, w: Wallet): TokenKit =>
  new TokenKit(w, new OverlayClient(overlayUrl, undefined, 'main', undefined, COOP_TOPIC, COOP_SERVICE))

export async function openCoopPool (
  chain: MockChain,
  overlayUrl: string,
  provider: Wallet,
  opts: { credits: number, priceSats: number, minCredits?: number, feeSats?: number, sym?: string }
): Promise<{ terms: PoolTerms, offer: Offer, kit: TokenKit }> {
  const kit = kitOn(overlayUrl, provider)
  const height = await chain.services.getHeight()
  const { tokenId } = await kit.deploy({ sym: opts.sym ?? 'COOP', amt: BigInt(opts.credits), dec: 0 })
  const { terms } = await buildReserveAndAnnounce(provider, kit, {
    v: '1',
    providerApi: 'http://localhost:8092',
    tokenId,
    credits: String(opts.credits),
    priceSats: String(opts.priceSats),
    feeSats: String(opts.feeSats ?? 50),
    minCredits: String(opts.minCredits ?? 1),
    deadlineHeight: String(height + 144),
    label: 'test pool',
    retailSatsPerCredit: '15'
  })
  const offer = await signOffer(provider, terms.poolId, terms)
  return { terms, offer, kit }
}

/** Mock-chain transaction by txid (for verifyLineage in agent bots). */
export const fetchTxFrom = (chain: MockChain) => async (txid: string): Promise<import('@agentcoop/core/sdk').Transaction> => {
  const { Transaction } = await import('@agentcoop/core/sdk')
  return Transaction.fromBinary(Array.from((await (chain.services as any).storage.getTransaction(txid)).rawTx as number[]))
}

export async function waitUntil<T> (fn: () => T | undefined | Promise<T | undefined>, ms = 30_000, what = 'condition'): Promise<T> {
  const end = Date.now() + ms
  for (;;) {
    const v = await fn()
    if (v !== undefined) return v
    if (Date.now() > end) throw new Error(`timed out waiting for ${what}`)
    await new Promise(resolve => setTimeout(resolve, 50))
  }
}

/**
 * Retry a call that failed on a socket error (`fetch failed`, ECONNRESET). With 100 agents in one test
 * process the event loop blocks for seconds, and a keep-alive socket the server closed meanwhile gets
 * reused (Track D saw it in TokenKit.nextIndex's overlay lookup). Only for idempotent calls.
 */
export async function retrySocket<T> (fn: () => Promise<T>, attempts = 3): Promise<T> {
  for (let i = 1; ; i++) {
    try {
      return await fn()
    } catch (e) {
      const code = String((e as any)?.cause?.code ?? '')
      const message = String((e as Error)?.message ?? '')
      // TokenKit's submit keeps the tx in its outbox on a socket error and says so; submitting again flushes it
      const socket = message === 'fetch failed' || /not yet in the overlay/.test(message) || ['ECONNRESET', 'UND_ERR_SOCKET', 'EPIPE'].includes(code)
      if (!socket || i >= attempts) throw e
      await new Promise(resolve => setTimeout(resolve, 100 * i))
    }
  }
}
