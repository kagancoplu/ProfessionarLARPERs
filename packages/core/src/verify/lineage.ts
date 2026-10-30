/**
 * verifyLineage (track A 2.1, FINAL-IDEA §4.3 step 5 / §8): decide whether a
 * BSV-21 output is genuine WITHOUT trusting any overlay. Ancestors are fetched
 * from Arcade (WhatsOnChain as fallback) and the kit's admission rules
 * (rules.ts, a port of 1Sat's validated topic manager) are applied locally,
 * input by input, back to the deploy.
 *
 * Only inputs carrying the SAME token are walked (the rules ignore the rest),
 * so the plain pledge inputs of a settlement cost nothing. Each walked token
 * input's unlocking script is also checked (Spend), and every fetched
 * transaction's txid is recomputed, so fabricated history is refused.
 */
import { Transaction } from '../sdk'
import { tokenIdFromOutpoint } from '../kit/inscription'
import { bsv21Decoder, identifyAdmissible, UnknownTokenInputError } from '../kit/rules'
import { decodeBsv21Owned, type CreditOwner, type OwnerKind } from '../scripts/creditLock'
import { ARCADE_URL } from '../types'
import { coopOutpoint, parseOutpoint } from '../util/outpoint'
import { inputScriptValid } from '../util/spend'

export type TxFetcher = (txid: string) => Promise<Transaction>

export interface LineageResult {
  ok: boolean
  tokenId?: string
  amt?: bigint
  /** Set when the output is owned by a P2PKH. */
  ownerPkh?: string
  owner?: CreditOwner
  /** Transactions walked back to the deploy. */
  depth: number
  reason?: string
}

export type LineageCache = Map<string, LineageResult>

export interface LineageOptions {
  arcadeUrl?: string
  /** e.g. https://api.whatsonchain.com/v1/bsv/main */
  wocUrl?: string
  /** Overrides the network fetcher (tests, or a caller with its own BEEF store). */
  fetchTx?: TxFetcher
  maxDepth?: number
  cache?: LineageCache
  /** Token owners accepted along the way (rules.ts RuleOptions.ownerKinds). Default ['p2pkh']. Do not share a cache across settings. */
  ownerKinds?: readonly OwnerKind[]
}

const sleep = async (ms: number): Promise<void> => await new Promise(resolve => setTimeout(resolve, ms))

/** Arcade GET /tx/{txid} (raw or Extended Format), falling back to WhatsOnChain GET /tx/{txid}/hex. */
export function arcadeTxFetcher (arcadeUrl = ARCADE_URL, wocUrl = 'https://api.whatsonchain.com/v1/bsv/main'): TxFetcher {
  return async (txid: string): Promise<Transaction> => {
    try {
      const res = await fetch(`${arcadeUrl}/tx/${txid}`)
      if (res.ok) {
        const info = await res.json() as { rawTx?: string }
        if (info.rawTx !== undefined && info.rawTx !== '') {
          const isEF = info.rawTx.slice(8, 20).toLowerCase() === '0000000000ef' // version + EF marker
          return isEF ? Transaction.fromHexEF(info.rawTx) : Transaction.fromHex(info.rawTx)
        }
      }
    } catch { /* fall through to WhatsOnChain */ }
    for (let attempt = 0; attempt < 3; attempt++) {
      const res = await fetch(`${wocUrl}/tx/${txid}/hex`)
      if (res.ok) return Transaction.fromHex((await res.text()).trim())
      if (res.status !== 429) throw new Error(`neither Arcade nor WhatsOnChain could provide ${txid} (${res.status})`)
      await sleep(500 * 2 ** attempt)
    }
    throw new Error(`WhatsOnChain rate-limited while fetching ${txid}`)
  }
}

export async function verifyLineage (outpoint: string, opts: LineageOptions = {}): Promise<LineageResult> {
  const fetchTx = opts.fetchTx ?? arcadeTxFetcher(opts.arcadeUrl, opts.wocUrl)
  const maxDepth = opts.maxDepth ?? 50
  const cache: LineageCache = opts.cache ?? new Map()
  const rules = { ownerKinds: opts.ownerKinds }
  const decode = bsv21Decoder(rules)
  const ownerOf = (script: Parameters<typeof decode>[0]): Pick<LineageResult, 'ownerPkh' | 'owner'> => {
    const owner = decodeBsv21Owned(script)?.owner
    return owner === undefined ? {} : { owner, ...(owner.kind === 'p2pkh' ? { ownerPkh: owner.pkh } : {}) }
  }
  const txs = new Map<string, Promise<Transaction>>()

  const load = async (txid: string): Promise<Transaction> => {
    let p = txs.get(txid)
    if (p === undefined) {
      p = fetchTx(txid).then(tx => {
        if (tx.id('hex') !== txid) throw new Error(`fetched data for ${txid} hashes to ${tx.id('hex')}`)
        return tx
      })
      txs.set(txid, p)
    }
    return await p
  }

  const genuine = async (op: string, depth: number): Promise<LineageResult> => {
    const cached = cache.get(op)
    if (cached !== undefined) return cached
    const fail = (reason: string): LineageResult => ({ ok: false, depth, reason })
    if (depth > maxDepth) return fail(`lineage deeper than ${maxDepth}`)
    const { txid, vout } = parseOutpoint(op)
    let tx: Transaction
    try { tx = await load(txid) } catch (e) { return fail(e instanceof Error ? e.message : String(e)) }
    const out = tx.outputs[vout]
    if (out === undefined) return fail(`${op} does not exist`)
    const d = decode(out.lockingScript)
    if (d === null) return fail(`${op} is not a canonical BSV-21 output`)
    if (d.op === 'burn') return fail(`${op} is a burn`)
    if (d.op === 'deploy+mint') {
      const r = { ok: true, tokenId: tokenIdFromOutpoint(txid, vout), amt: d.amount, ...ownerOf(out.lockingScript), depth }
      cache.set(op, r)
      return r
    }

    // Walk this token's inputs; the rules only admit outputs covered by genuine ones.
    const previousCoins: number[] = []
    let deepest = depth
    for (let vin = 0; vin < tx.inputs.length; vin++) {
      const input = tx.inputs[vin]
      const sourceTxid = input.sourceTXID ?? input.sourceTransaction?.id('hex')
      if (sourceTxid === undefined) return fail(`input ${vin} of ${txid} has no source txid`)
      let source: Transaction
      try { source = await load(sourceTxid) } catch (e) { return fail(e instanceof Error ? e.message : String(e)) }
      input.sourceTransaction = source
      const sourceOut = source.outputs[input.sourceOutputIndex]
      if (sourceOut === undefined) return fail(`input ${vin} of ${txid} spends a missing output`)
      const sd = decode(sourceOut.lockingScript)
      if (sd === null || sd.op === 'burn') continue
      const sid = sd.op === 'deploy+mint' ? tokenIdFromOutpoint(sourceTxid, input.sourceOutputIndex) : sd.id!
      if (sid !== d.id) continue // another token's input: the rules ignore it for this token
      const parent = await genuine(coopOutpoint(sourceTxid, input.sourceOutputIndex), depth + 1)
      if (!parent.ok) continue // left out of previousCoins → the rules refuse the transaction
      if (!inputScriptValid(tx, vin)) return fail(`token input ${vin} of ${txid} has an invalid signature`)
      previousCoins.push(vin)
      deepest = Math.max(deepest, parent.depth)
    }
    let admitted: number[]
    try {
      admitted = identifyAdmissible(tx, previousCoins, rules).outputsToAdmit
    } catch (e) {
      if (e instanceof UnknownTokenInputError) return fail(`${txid} spends ${e.outpoint}, which is not genuine`)
      throw e
    }
    const r = admitted.includes(vout)
      ? { ok: true, tokenId: d.id!, amt: d.amount, ...ownerOf(out.lockingScript), depth: deepest }
      : fail(`${op} is not covered by genuine ${d.id} inputs`)
    cache.set(op, r)
    return r
  }

  return await genuine(outpoint, 0)
}
