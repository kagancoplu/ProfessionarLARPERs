/**
 * A human joins a pool from BSV Desktop (track C 3.3), the same way the agents
 * do: Track A's buildPledge, then the coordinator's signing round with the
 * whole settlement checked (verifySettlementPlan + verifyLineage) before
 * Desktop signs the pledge input with SIGHASH_ALL. The functions take any
 * BRC-100 wallet (Desktop in cli.ts, wallet-toolbox in the tests).
 *
 * `pledge` and `sign` are separate steps: the pledge is recorded locally
 * (<DATA_DIR>/participant-cli/pledges.json) and `sign` adopts it and waits.
 *
 * `pledge --lighthouse` ("sign now and leave", A-P5 5.5): one SINGLE|ACP
 * signature over my own credit output, handed to the coordinator
 * (POST /pledges/lighthouse); the guard I name co-signs the round, so there is
 * nothing to keep open. `cancel` takes the coin back alone; `sync` picks up the credits.
 */
import type { WalletInterface } from '@agentcoop/core/sdk'
import { buildLighthousePledge, buildPledge, cancelLighthousePledge, cancelPledge, TokenKit, VAULT_PROTOCOL, type LineageOptions, type OverlayClient, type PledgeInstructions, type PoolTerms } from '@agentcoop/core'
import { AgentLog } from '../../agents/src/log'
import { PoolParticipant, type ActivePledge } from '../../agents/src/participant'
import type { ApiPool } from '../../agents/src/procurement'

/** Where pledge records live: a JsonFile in the CLI, plain memory in tests. */
export interface PledgeStore { read: () => ActivePledge[], write: (records: ActivePledge[]) => void }

export interface ParticipantContext {
  wallet: WalletInterface
  overlay: OverlayClient
  coopApiUrl: string
  /** Local pledge records (file in the CLI, memory in tests). */
  pledges: PledgeStore
  out: (line: string) => void
  /** verifyLineage source (tests: the mock chain). Default: Arcade. */
  lineage?: LineageOptions
}

const kitOf = (ctx: ParticipantContext): TokenKit => new TokenKit(ctx.wallet, ctx.overlay)

async function getPools (ctx: ParticipantContext): Promise<ApiPool[]> {
  const res = await fetch(`${ctx.coopApiUrl}/pools`)
  if (!res.ok) throw new Error(`coordinator answered ${res.status}`)
  const body = await res.json() as ApiPool[] | { pools: ApiPool[] }
  return Array.isArray(body) ? body : body.pools
}

export async function pools (ctx: ParticipantContext): Promise<ApiPool[]> {
  const open = (await getPools(ctx)).filter(p => p.status === 'open' && p.hasOffer)
  for (const p of open) {
    const t = p.terms
    const perCredit = Number(t.priceSats) / Number(t.credits)
    ctx.out(`${p.poolId}  "${t.label}"  ${p.pledgedCredits}/${t.credits} pledged · ${perCredit.toFixed(1)} sat/credit (retail ${t.retailSatsPerCredit}, demo pricing) · min ${t.minCredits} · fee ${t.feeSats} sat · deadline ${t.deadlineHeight}`)
  }
  if (open.length === 0) ctx.out('no open pools')
  return open
}

export async function pledge (ctx: ParticipantContext, poolId: string, credits: number): Promise<ActivePledge> {
  const pool = (await getPools(ctx)).find(p => p.poolId === poolId)
  if (pool === undefined || pool.status !== 'open') throw new Error(`pool ${poolId} is not open`)
  const terms: PoolTerms = { ...pool.terms, poolId }
  const kit = kitOf(ctx)
  const tokenIndex = await kit.nextIndex(await kit.identityKey())
  ctx.out(`Pledging ${credits} credits to "${terms.label}". Approve in BSV Desktop…`)
  const p = await buildPledge(ctx.wallet, terms, String(credits), 'p2pkh', undefined, { tokenIndex })
  await kit.overlay.submit(p.beef)
  const record: ActivePledge = {
    poolId, label: terms.label, outpoint: p.outpoint, credits: p.record.credits, tokenIndex, instructions: p.instructions,
    status: 'pending', pricePerCredit: Number(terms.priceSats) / Number(terms.credits)
  }
  ctx.pledges.write([...ctx.pledges.read(), record])
  ctx.out(`Pledged: ${p.satoshis} sat stay in your wallet as a pledge coin (${p.outpoint}) until settlement. https://whatsonchain.com/tx/${p.txid}`)
  ctx.out('Now run `participant-cli sign` and keep it open: the coordinator asks you to sign when the pool fills.')
  return record
}

/** "Sign now and leave": a lighthouse pledge whose round the named guard co-signs (nothing to keep open). */
export async function pledgeLighthouse (ctx: ParticipantContext, poolId: string, credits: number, opts: { guardUrl: string }): Promise<ActivePledge> {
  const pool = (await getPools(ctx)).find(p => p.poolId === poolId)
  if (pool === undefined || pool.status !== 'open') throw new Error(`pool ${poolId} is not open`)
  const terms: PoolTerms = { ...pool.terms, poolId }
  // Never leave a fee-paid coin that nobody can sign for: the coordinator must take lighthouse pledges.
  const probe = await fetch(`${ctx.coopApiUrl}/pledges/lighthouse`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
  if (probe.status === 404 || probe.status === 405 || probe.status === 501) throw new Error('this coordinator takes no lighthouse pledges; use `pledge` and `sign`')
  const health = await fetch(`${opts.guardUrl.replace(/\/+$/, '')}/healthz`)
  const guard = health.ok ? (await health.json() as { identityKey?: string }).identityKey : undefined
  if (typeof guard !== 'string') throw new Error(`no guard at ${opts.guardUrl} (GET /healthz)`)
  const kit = kitOf(ctx)
  const tokenIndex = await kit.nextIndex(await kit.identityKey())
  ctx.out(`Pledging ${credits} credits to "${terms.label}" and signing once (guard ${guard.slice(0, 12)}… co-signs the round). Approve in BSV Desktop…`)
  const lp = await buildLighthousePledge(ctx.wallet, terms, String(credits), { tokenIndex, guard })
  const res = await fetch(`${ctx.coopApiUrl}/pledges/lighthouse`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(lp) })
  const record: ActivePledge = {
    poolId, label: terms.label, outpoint: lp.outpoint, credits: lp.record.credits, tokenIndex,
    instructions: { protocolID: VAULT_PROTOCOL, keyID: lp.record.lhId, counterparty: 'anyone', poolId } as unknown as PledgeInstructions,
    status: 'pending', pricePerCredit: Number(terms.priceSats) / Number(terms.credits), lighthouse: true
  }
  ctx.pledges.write([...ctx.pledges.read(), record])
  if (!res.ok) {
    throw new Error(`the coordinator refused the pledge (${res.status}: ${(await res.text()).slice(0, 200)}). The coin is yours: \`participant-cli cancel ${lp.outpoint}\``)
  }
  ctx.out(`Pledged and signed: ${lp.satoshis} sat sit on a coin only you, or you with that guard, can spend (${lp.outpoint}). https://whatsonchain.com/tx/${lp.outpoint.split('_')[0]}`)
  ctx.out('Nothing to keep open. When the pool fills, the guard checks the whole settlement and co-signs; run `participant-cli sync` afterwards to see your credits.')
  return record
}

/** Pick up credits that arrived (a settlement, a lighthouse round) and show the balances. */
export async function sync (ctx: ParticipantContext): Promise<Array<{ tokenId: string, overlay: bigint }>> {
  const kit = kitOf(ctx)
  await kit.sync()
  const balances = await kit.balances()
  for (const b of balances) ctx.out(`${b.tokenId}  ${b.overlay} credits`)
  if (balances.length === 0) ctx.out('no credits yet')
  const settled = new Set((await getPools(ctx)).filter(p => p.status === 'settled').map(p => p.poolId))
  ctx.pledges.write(ctx.pledges.read().map(p => (p.lighthouse === true && p.status === 'pending' && settled.has(p.poolId) ? { ...p, status: 'settled' as const } : p)))
  return balances
}

/** Wait on the coordinator's WS for the round of my pending pledge; check, sign, take the credits. */
export async function sign (ctx: ParticipantContext, opts: { poolId?: string, timeoutMs?: number } = {}): Promise<ActivePledge> {
  const all = ctx.pledges.read()
  const mine = [...all].reverse().find(p => (opts.poolId === undefined || p.poolId === opts.poolId) && (p.status === 'pending' || p.status === 'signed'))
  if (mine === undefined) throw new Error('no pending pledge (run `participant-cli pledge` first)')
  if (mine.lighthouse === true) throw new Error('a lighthouse pledge is signed by its guard; nothing to keep open (`participant-cli sync` after the pool settles)')
  const log = new AgentLog('human', undefined, true, ctx.out) // the participant's readable lines go to the CLI output
  const participant = new PoolParticipant({ wallet: ctx.wallet, kit: kitOf(ctx), coopApiUrl: ctx.coopApiUrl, log, lineage: ctx.lineage, reconnect: true })
  participant.adopt(mine)
  try {
    await participant.connect()
    ctx.out(`Waiting for "${mine.label}" to fill (${mine.credits} credits pledged)… When it does, BSV Desktop asks you to sign; approve within the round timeout.`)
    await participant.until(() => participant.active?.status !== 'pending' && participant.active?.status !== 'signed', opts.timeoutMs ?? 24 * 3600_000)
  } finally {
    participant.close()
    ctx.pledges.write(all.map(p => (p.outpoint === mine.outpoint ? participant.active! : p)))
  }
  return participant.active!
}

/** Withdraw a pledge: spend the pledge coin back to the wallet (and tell the overlay). */
export async function cancel (ctx: ParticipantContext, outpoint?: string): Promise<string> {
  const all = ctx.pledges.read()
  const target = outpoint === undefined ? [...all].reverse().find(p => p.status !== 'settled' && p.status !== 'withdrawn') : all.find(p => p.outpoint === outpoint)
  if (target === undefined) throw new Error('no pledge to cancel')
  ctx.out(`Withdrawing pledge ${target.outpoint} from "${target.label}". Approve in BSV Desktop…`)
  const { txid, beef } = target.lighthouse === true ? await cancelLighthousePledge(ctx.wallet, target.outpoint) : await cancelPledge(ctx.wallet, target.outpoint)
  await ctx.overlay.submit(beef)
  ctx.pledges.write(all.map(p => (p.outpoint === target.outpoint ? { ...p, status: 'withdrawn' as const } : p)))
  ctx.out(`Withdrawn; the coin is back in your wallet. https://whatsonchain.com/tx/${txid}`)
  return txid
}
