/**
 * T8 on mainnet (README › Example transactions): a market sweep. A seller lists credits SINGLE|ANYONECANPAY
 * at the coordinator (`POST /listings`); a buyer takes them in ONE transaction (`buildSweep`), each listing
 * traced to the token deploy first. The same calls `apps/agents/src/market.ts` makes, run once by hand.
 *
 *   npm run market-sweep -w @agentcoop/scripts                       # dry run: balances, plan
 *   npm run market-sweep -w @agentcoop/scripts -- --yes [--seller agent-2] [--buyer agent-3] [--credits 2] [--ask 40] [--token <txid_vout>]
 *
 * Needs the overlay and the coordinator up (npm run infra) and `npm run agents` STOPPED: the agents process
 * holds the same server wallets. Moves `--credits` credits from seller to buyer for `--ask` sats (+ fee).
 * The token defaults to the gpu-h100 product's; the ask must stay below the retail price in that token's pool terms.
 */
import { beefFromArcade, buildSweep, COOP_SERVICE, COOP_TOPIC, OverlayClient, reserveListing, signListing, TokenKit, type KitQuery, type Listing } from '@agentcoop/core'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { arcadeUrl, chain, REPO_ROOT, wocTxUrl } from './lib/env'
import { flag, option, run } from './lib/cli'
import { openWallet } from './wallets'

run(async () => {
  const args = process.argv.slice(2)
  const sellerName = option(args, '--seller') ?? 'agent-2'
  const buyerName = option(args, '--buyer') ?? 'agent-3'
  const credits = option(args, '--credits') ?? '2'
  const askSats = option(args, '--ask') ?? '40'
  const overlayUrl = process.env.OVERLAY_URL ?? 'http://localhost:8080'
  const coop = process.env.COOP_API_URL ?? 'http://localhost:8090'
  const agentsUrl = process.env.AGENTS_URL ?? 'http://localhost:8093'
  const arcade = arcadeUrl()
  const product = JSON.parse(readFileSync(join(REPO_ROOT, 'apps/provider-api/products/gpu-h100.json'), 'utf8')) as { tokenId: string | null }
  const tokenId = option(args, '--token') ?? product.tokenId
  if (tokenId === null) throw new Error('no --token and gpu-h100 has no credit token yet')
  const pools = await (await fetch(`${coop}/pools`)).json() as Array<{ terms: { tokenId: string, retailSatsPerCredit: string } }>
  const retail = pools.find(p => p.terms.tokenId === tokenId)?.terms.retailSatsPerCredit
  if (retail === undefined) throw new Error(`no pool on the coordinator sells ${tokenId}`)
  if (Number(askSats) / Number(credits) >= Number(retail)) throw new Error(`ask ${askSats} sat for ${credits} credits is not below retail (${retail}/credit)`)

  const agentsUp = await fetch(`${agentsUrl}/healthz`, { signal: AbortSignal.timeout(2000) }).then(r => r.ok, () => false)
  if (agentsUp) throw new Error(`the agents process answers at ${agentsUrl}: stop \`npm run agents\` first (it holds the same wallets)`)

  const overlay = (): OverlayClient => new OverlayClient(overlayUrl, undefined, chain(), arcade, COOP_TOPIC, COOP_SERVICE)
  const seller = await openWallet(sellerName)
  const buyer = await openWallet(buyerName)
  try {
    const sk = new TokenKit(seller.wallet, overlay())
    const bk = new TokenKit(buyer.wallet, overlay())
    await sk.sync()
    await bk.sync()
    const bal = async (k: TokenKit): Promise<bigint> => (await k.balances()).find(b => b.tokenId === tokenId)?.overlay ?? 0n // what the overlay admitted, not the basket
    const [sb, bb] = [await bal(sk), await bal(bk)]
    console.log(`T8 market sweep · ${chain()} · token ${tokenId.slice(0, 12)}… · ${sellerName} holds ${sb}, ${buyerName} holds ${bb}`)
    console.log(`plan: ${sellerName} lists ${credits} credits for ${askSats} sat (SINGLE|ACP); ${buyerName} sweeps them in one tx`)
    if (sb < BigInt(credits)) throw new Error(`${sellerName} holds only ${sb} credits`)
    if (!flag(args, '--yes')) { console.log('dry run: add --yes'); return }

    const { outpoint, txid: reserveTxid } = await reserveListing(seller.wallet, sk, tokenId, credits, askSats)
    console.log(`T8 listing reserved: ${wocTxUrl(reserveTxid)}`)
    const listing = await signListing(seller.wallet, outpoint, askSats)
    const posted = await fetch(`${coop}/listings`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(listing) })
    if (!posted.ok) throw new Error(`coordinator refused the listing: ${posted.status} ${await posted.text()}`)
    const listed = await (await fetch(`${coop}/listings?tokenId=${encodeURIComponent(tokenId)}`)).json() as Listing[]
    const mine = listed.find(l => l.outpoint === outpoint)
    if (mine === undefined) throw new Error('the listing is not on the coordinator')
    console.log(`T8 listing posted: ${outpoint} · ${mine.credits} credits for ${mine.askSats} sat`)

    const ov = overlay()
    const getBeef = async (txid: string): Promise<number[]> => {
      const [o] = await ov.lookup({ op: 'outpoint', txid, vout: 0 } satisfies KitQuery)
      return o !== undefined ? o.beef : await beefFromArcade(txid, arcade)
    }
    const res = await buildSweep(buyer.wallet, bk, [mine], { lineage: { arcadeUrl: arcade }, getBeef })
    console.log(`T8 sweep: ${wocTxUrl(res.txid)} (${res.credits} credits)`)
    await bk.sync()
    await sk.sync()
    console.log(`after: ${sellerName} holds ${await bal(sk)}, ${buyerName} holds ${await bal(bk)}`)
    console.log(`STATUS: | ${new Date().toISOString().slice(0, 16)} | T8 market sweep | ${res.txid} | C | ${sellerName} listed ${credits} for ${askSats} sat (SINGLE\\|ACP, listing ${reserveTxid.slice(0, 10)}…); ${buyerName} swept, lineage verified |`)
  } finally {
    await buyer.close()
    await seller.close()
  }
})
