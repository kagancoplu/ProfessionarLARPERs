/**
 * Provider operator commands. The operator's wallet is BSV Desktop
 * (`WalletClient('auto', APP_ORIGINATOR)`, see cli.ts); every command that
 * spends or signs shows a Desktop approval prompt. The functions take any
 * BRC-100 wallet, so tests run them with wallet-toolbox wallets.
 *
 * Two identities on the provider side (README): pool revenue (settlement
 * output 0 and pledge fees) goes to the operator's Desktop wallet under the
 * revenue key [1,'agentcoop provider'] / keyID = pool nonce; 402 retail
 * revenue goes to the provider-api server wallet.
 */
import { P2PKH, Random, Transaction, Utils, type LockingScript, type WalletInterface } from '@agentcoop/core/sdk'
import {
  anyonePkh, buildReserveAndAnnounce, cancelPool as coreCancelPool, P2PKH_UNLOCK_LENGTH, PROVIDER_PROTOCOL, publishOffer, REVENUE_BASKET,
  signOffer, signWalletP2pkhInput, TokenKit, type CustomInstructions, type KitQuery, type Offer, type OverlayClient, type PoolTerms, type TermsDraft
} from '@agentcoop/core'
import { loadProducts, setProductTokenId } from '../../provider-api/src/products'
import type { PoolRecord, PoolRegistry } from './pools'

export interface CliContext {
  wallet: WalletInterface
  overlay: OverlayClient
  /** Coordinator side API (MASTER §3.5). */
  coopApiUrl: string
  /** Public root of provider-api, written into the pool terms. */
  providerApiUrl: string
  productsDir?: string
  pools: PoolRegistry
  out: (line: string) => void
}

const kitOf = (ctx: CliContext): TokenKit => new TokenKit(ctx.wallet, ctx.overlay)

/** Locking script of pool output 0 and of the pledge fees: P2PKH to the operator's revenue key for this pool. */
export function revenueLockingScript (providerIdentity: string, poolNonce: string): LockingScript {
  return new P2PKH().lock(Utils.toArray(anyonePkh(providerIdentity, poolNonce, PROVIDER_PROTOCOL), 'hex'))
}

const revenueInstructions = (nonce: string): CustomInstructions =>
  ({ protocolID: PROVIDER_PROTOCOL, keyID: nonce, counterparty: 'anyone' })

// ── mint ────────────────────────────────────────────────────────────────────

export async function mint (ctx: CliContext, args: { sym: string, amt: bigint, dec: number, product: string }): Promise<{ txid: string, tokenId: string }> {
  if (!/^[A-Z0-9]{1,16}$/.test(args.sym)) throw new Error('--sym must be 1-16 capital letters or digits')
  if (args.amt <= 0n) throw new Error('--amt must be positive')
  loadProducts(ctx.productsDir).find(p => p.id === args.product) ?? (() => { throw new Error(`unknown product ${args.product}`) })()
  ctx.out(`Deploying BSV-21 ${args.sym} (${args.amt}, dec ${args.dec}). Approve in BSV Desktop…`)
  const { txid, tokenId } = await kitOf(ctx).deploy({ sym: args.sym, amt: args.amt, dec: args.dec })
  setProductTokenId(args.product, tokenId, ctx.productsDir)
  ctx.out(`Minted. tokenId ${tokenId}  (written to products/${args.product}.json)`)
  ctx.out(`  https://whatsonchain.com/tx/${txid}`)
  return { txid, tokenId }
}

// ── open-pool ───────────────────────────────────────────────────────────────

export interface OpenPoolArgs {
  product: string
  credits: number
  priceSats: number
  /** "+144" = 144 blocks from now, or an absolute height. */
  deadline: string
  feeSats: number
  minCredits: number
  label: string
}

async function sendOffer (coopApiUrl: string, offer: Offer): Promise<void> {
  let res: Response
  try {
    res = await fetch(`${coopApiUrl}/offers`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(offer) })
  } catch (e) {
    throw new Error(`coordinator at ${coopApiUrl} is unreachable (${(e as Error).message})`)
  }
  if (!res.ok) throw new Error(`coordinator refused the offer: ${res.status} ${await res.text()}`)
}

/** Register a pool's signed offer with the coordinator (`POST /offers`); retried by `post-offer` if open-pool could not. */
export async function postOffer (ctx: CliContext, poolId: string): Promise<PoolRecord> {
  const record = ctx.pools.byPoolId(poolId)
  if (record?.offer === undefined) throw new Error(`no signed offer for pool ${poolId} in the local records`)
  await sendOffer(ctx.coopApiUrl, record.offer)
  ctx.out(`Pool open: offer registered at ${ctx.coopApiUrl}`)
  return ctx.pools.update(record.nonce, { status: 'open' })
}

export async function openPool (ctx: CliContext, args: OpenPoolArgs): Promise<PoolRecord> {
  const product = loadProducts(ctx.productsDir).find(p => p.id === args.product)
  if (product === undefined) throw new Error(`unknown product ${args.product}`)
  if (product.tokenId === null) throw new Error(`product ${product.id} has no credit token yet: run mint first`)
  for (const [k, v] of Object.entries({ credits: args.credits, price: args.priceSats, min: args.minCredits })) {
    if (!Number.isSafeInteger(v) || v < 1) throw new Error(`--${k} must be a positive integer`)
  }
  if (!Number.isSafeInteger(args.feeSats) || args.feeSats < 0) throw new Error('--fee must be a non-negative integer')
  if (args.minCredits > args.credits) throw new Error('--min cannot exceed --credits')

  const kit = kitOf(ctx)
  const me = await kit.identityKey()
  const held = (await kit.balances()).find(b => b.tokenId === product.tokenId)?.overlay ?? 0n
  if (held < BigInt(args.credits)) throw new Error(`you hold ${held} credits of ${product.tokenId}; the pool needs ${args.credits}`)

  const { height } = await ctx.wallet.getHeight({})
  const deadlineHeight = args.deadline.startsWith('+') ? height + Number(args.deadline.slice(1)) : Number(args.deadline)
  if (!Number.isSafeInteger(deadlineHeight) || deadlineHeight <= height) throw new Error(`--deadline must be in the future (current height ${height})`)

  const nonce = Utils.toHex(Random(16))
  const terms: TermsDraft & Pick<PoolTerms, 'provider' | 'payScriptHex'> = {
    v: '1',
    provider: me,
    providerApi: ctx.providerApiUrl,
    tokenId: product.tokenId,
    credits: String(args.credits),
    priceSats: String(args.priceSats),
    payScriptHex: revenueLockingScript(me, nonce).toHex(),
    feeSats: String(args.feeSats),
    minCredits: String(args.minCredits),
    deadlineHeight: String(deadlineHeight),
    label: args.label,
    retailSatsPerCredit: String(product.retailSatsPerCredit)
  }
  const perCredit = args.priceSats / args.credits
  ctx.out(`Pool "${args.label}": ${args.credits} ${product.unit} for ${args.priceSats} sat = ${perCredit.toFixed(1)} sat/credit ` +
    `(retail ${product.retailSatsPerCredit}, ${Math.round(100 * (1 - perCredit / product.retailSatsPerCredit))}% off · demo pricing), deadline height ${deadlineHeight}`)

  const record = ctx.pools.add({ nonce, terms, status: 'draft', createdAt: new Date().toISOString() })
  ctx.out('Reserving the credits and announcing the pool (T2). Approve in BSV Desktop…')
  // Track A: N credits into one offer UTXO (output 0) + OP_RETURN pool, revenue key = this nonce.
  const announced = await buildReserveAndAnnounce(ctx.wallet, kit, terms, { poolNonce: nonce })
  if (announced.terms.payScriptHex !== terms.payScriptHex) throw new Error('pool revenue script differs from the one derived for this nonce')
  ctx.pools.update(nonce, { poolId: announced.poolId, announceTxid: announced.txid, status: 'announced' })
  ctx.out(`  announced: poolId ${announced.poolId}  https://whatsonchain.com/tx/${announced.txid}`)
  ctx.out('Signing the offer (SIGHASH_SINGLE|ANYONECANPAY). Approve in BSV Desktop…')
  const offer = await signOffer(ctx.wallet, announced.poolId, announced.terms)
  ctx.pools.update(nonce, { offer })
  // The offer on chain too (OP_RETURN offer): any coordinator can close the pool, not just the one we post to.
  const published = await publishOffer(ctx.wallet, offer)
  await ctx.overlay.submit(published.beef)
  ctx.out(`  offer published on chain (OP_RETURN offer). https://whatsonchain.com/tx/${published.txid}`)
  try {
    return await postOffer(ctx, announced.poolId)
  } catch (e) {
    ctx.out(`Offer signed and saved, but not registered: ${(e as Error).message}. Retry with: provider-cli post-offer ${announced.poolId}`)
    return ctx.pools.get(nonce)!
  }
}

// ── cancel-pool ─────────────────────────────────────────────────────────────

/** Spends the reserved offer UTXO back to the operator's token balance (Track A `cancelPool`): the signed offer becomes void. */
export async function cancelPool (ctx: CliContext, poolId: string): Promise<{ txid: string }> {
  const record = ctx.pools.byPoolId(poolId)
  if (record === undefined) throw new Error(`no local record of pool ${poolId} (data/provider-cli/pools.json)`)
  ctx.out(`Cancelling pool "${record.terms.label}": moving its ${record.terms.credits} credits back to you. Approve in BSV Desktop…`)
  const txid = await coreCancelPool(ctx.wallet, kitOf(ctx), poolId)
  ctx.pools.update(record.nonce, { status: 'cancelled', cancelTxid: txid })
  ctx.out(`Cancelled. https://whatsonchain.com/tx/${txid}`)
  return { txid }
}

// ── list-pools ──────────────────────────────────────────────────────────────

interface CoopPool { poolId: string, terms?: PoolTerms, pledgedCredits?: string, target?: string, status?: string }

export async function listPools (ctx: CliContext): Promise<Array<PoolRecord & { live?: CoopPool }>> {
  const me = await kitOf(ctx).identityKey()
  let live: CoopPool[] = []
  try {
    const res = await fetch(`${ctx.coopApiUrl}/pools`, { signal: AbortSignal.timeout(3000) })
    const body = await res.json() as CoopPool[] | { pools: CoopPool[] }
    live = (Array.isArray(body) ? body : body.pools).filter(p => p.terms?.provider === me)
  } catch {
    ctx.out(`(coordinator at ${ctx.coopApiUrl} unreachable; showing local records only)`)
  }
  const rows = ctx.pools.all().map(r => ({ ...r, live: live.find(p => p.poolId === r.poolId) }))
  for (const r of rows) {
    const progress = r.live !== undefined ? ` · ${r.live.pledgedCredits ?? '?'}/${r.live.target ?? r.terms.credits} pledged · ${r.live.status ?? ''}` : ''
    ctx.out(`${r.status.padEnd(9)} ${r.poolId ?? '(no poolId)'}  "${r.terms.label}"  ${r.terms.credits} credits for ${r.terms.priceSats} sat, deadline ${r.terms.deadlineHeight}${progress}`)
  }
  if (rows.length === 0) ctx.out('no pools yet')
  return rows
}

// ── revenue ─────────────────────────────────────────────────────────────────

/**
 * Track the outputs of `beef` that pay this pool's revenue script in the
 * `agentcoop revenue` basket (the wallet does not see payments to a derived
 * 'anyone' key by itself). Returns the outpoints added.
 */
export async function internalizeRevenue (ctx: CliContext, beef: number[], txid: string, nonce: string, payScriptHex: string): Promise<string[]> {
  const tx = Transaction.fromBEEF(beef, txid)
  const known = new Set((await ctx.wallet.listOutputs({ basket: REVENUE_BASKET, limit: 1000 })).outputs.map(o => o.outpoint))
  const vouts = tx.outputs.map((o, i) => (o.lockingScript.toHex() === payScriptHex && !known.has(`${txid}.${i}`) ? i : -1)).filter(i => i >= 0)
  if (vouts.length === 0) return []
  await ctx.wallet.internalizeAction({
    tx: tx.toAtomicBEEF(),
    outputs: vouts.map(outputIndex => ({
      outputIndex,
      protocol: 'basket insertion' as const,
      insertionRemittance: { basket: REVENUE_BASKET, customInstructions: JSON.stringify(revenueInstructions(nonce)), tags: ['agentcoop', 'revenue'] }
    })),
    labels: ['agentcoop revenue'],
    description: 'AgentCoop pool revenue'
  })
  return vouts.map(v => `${txid}.${v}`)
}

/**
 * Find pledge fees and settlement payments of our pools on the overlay (MASTER §3.8, Track B) and track them.
 * `includeInvalid`: a pledge left out of the settlement (wait list) is `valid:false`, but its registration fee still paid us.
 */
export async function syncRevenue (ctx: CliContext): Promise<string[]> {
  const added: string[] = []
  for (const pool of ctx.pools.all().filter(p => p.poolId !== undefined)) {
    for (const query of [{ op: 'pledges' as const, poolId: pool.poolId!, includeSpent: true, includeInvalid: true }, { op: 'settlement' as const, poolId: pool.poolId! }]) {
      let outputs
      try {
        // §3.8 AgentCoop queries (ls_agentcoop); the kit client types only its token queries.
        outputs = await ctx.overlay.lookup(query as unknown as KitQuery)
      } catch (e) {
        ctx.out(`  ${query.op} lookup for ${pool.poolId} failed: ${(e as Error).message}`)
        continue
      }
      for (const o of outputs) added.push(...await internalizeRevenue(ctx, o.beef, o.txid, pool.nonce, pool.terms.payScriptHex))
    }
  }
  ctx.out(added.length > 0 ? `Tracked ${added.length} revenue output(s).` : 'No new revenue outputs.')
  return added
}

/** Move everything in the `agentcoop revenue` basket into the wallet's default balance (one tx, change = default basket). */
export async function sweepRevenue (ctx: CliContext): Promise<{ txid: string, satoshis: number } | undefined> {
  const listed = await ctx.wallet.listOutputs({ basket: REVENUE_BASKET, include: 'entire transactions', includeCustomInstructions: true, limit: 1000 })
  const outputs = listed.outputs.filter(o => o.spendable && o.customInstructions !== undefined)
  if (outputs.length === 0) { ctx.out('Nothing to sweep.'); return undefined }
  const total = outputs.reduce((s, o) => s + o.satoshis, 0)
  ctx.out(`Sweeping ${outputs.length} revenue output(s), ${total} sat, into your wallet balance. Approve in BSV Desktop…`)
  const inputBEEF = Array.from(listed.BEEF ?? [])
  const created = await ctx.wallet.createAction({
    description: 'Sweep AgentCoop pool revenue',
    labels: ['agentcoop revenue'],
    inputBEEF,
    inputs: outputs.map(o => ({ outpoint: o.outpoint, unlockingScriptLength: P2PKH_UNLOCK_LENGTH, inputDescription: 'Pool revenue' })),
    outputs: [],
    options: { randomizeOutputs: false, acceptDelayedBroadcast: false }
  })
  const signable = created.signableTransaction
  if (signable === undefined) throw new Error('wallet did not return a signable transaction')
  const tx = Transaction.fromAtomicBEEF(signable.tx)
  const spends: Record<number, { unlockingScript: string }> = {}
  for (const o of outputs) {
    const [txid, vout] = o.outpoint.split('.')
    const i = tx.inputs.findIndex(inp => (inp.sourceTXID ?? inp.sourceTransaction?.id('hex')) === txid && inp.sourceOutputIndex === Number(vout))
    if (i === -1) throw new Error(`revenue input ${o.outpoint} missing from the signable transaction`)
    const ci = JSON.parse(o.customInstructions!) as CustomInstructions
    spends[i] = { unlockingScript: (await signWalletP2pkhInput(ctx.wallet, tx, i, { protocolID: ci.protocolID, keyID: ci.keyID })).toHex() }
  }
  const signed = await ctx.wallet.signAction({ reference: signable.reference, spends, options: { acceptDelayedBroadcast: false } })
  if (signed.txid === undefined) throw new Error('wallet did not complete the sweep')
  ctx.out(`Swept. https://whatsonchain.com/tx/${signed.txid}`)
  return { txid: signed.txid, satoshis: total }
}

/** The operator's identity key (the `provider` field of every pool it opens). */
export async function whoami (ctx: CliContext): Promise<{ identityKey: string }> {
  const identityKey = await kitOf(ctx).identityKey()
  ctx.out(`operator identity ${identityKey}`)
  return { identityKey }
}
