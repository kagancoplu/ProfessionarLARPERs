/**
 * ls_agentcoop over HTTP (standard POST /lookup). The coordinator only reads
 * the overlay; it never needs to be trusted for credit validity (participants
 * check lineage themselves, FINAL-IDEA §4.3).
 */
import { Transaction, Utils } from '@bsv/sdk'
import type { PledgeView, PoolView, SettlementView } from '../../../packages/overlay/src/views'

export const SERVICE = 'ls_agentcoop'

export interface LookupResult<T> { txid: string, outputIndex: number, tx: Transaction, context: T }

export class OverlayUnavailableError extends Error {}

export class OverlayLookup {
  constructor (readonly url: string) {}

  async lookup<T = unknown> (query: Record<string, unknown>): Promise<Array<LookupResult<T>>> {
    let res: Response
    try {
      res = await fetch(`${this.url}/lookup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ service: SERVICE, query })
      })
    } catch (e) {
      throw new OverlayUnavailableError(`overlay unreachable at ${this.url}: ${(e as Error).message}`)
    }
    const answer = await res.json().catch(() => ({})) as any
    if (!res.ok) throw new OverlayUnavailableError(`overlay lookup failed (${res.status}): ${String(answer.message ?? answer.description ?? '')}`)
    if (answer.type !== 'output-list') throw new OverlayUnavailableError(`unexpected lookup answer ${String(answer.type)}`)
    return answer.outputs.map((o: { beef: number[], outputIndex: number, context?: number[] }) => {
      const tx = Transaction.fromBEEF(o.beef)
      return { txid: tx.id('hex'), outputIndex: o.outputIndex, tx, context: JSON.parse(Utils.toUTF8(o.context ?? [])) as T }
    })
  }

  async pools (): Promise<PoolView[]> {
    return (await this.lookup<PoolView>({ op: 'pools' })).map(r => r.context)
  }

  async pool (poolId: string): Promise<PoolView | undefined> {
    return (await this.lookup<PoolView>({ op: 'pool', poolId }))[0]?.context
  }

  async pledges (poolId: string, opts: { includeSpent?: boolean, includeInvalid?: boolean } = {}): Promise<PledgeView[]> {
    return (await this.lookup<PledgeView>({ op: 'pledges', poolId, ...opts })).map(r => r.context)
  }

  async settlement (poolId: string): Promise<SettlementView | undefined> {
    return (await this.lookup<SettlementView>({ op: 'settlement', poolId }))[0]?.context
  }

  /** Valid unspent pledges in coordinator order, with their transactions (BEEF ancestry) for the settlement template. */
  async pledgeCandidates (poolId: string): Promise<Array<{ view: PledgeView, sourceTx: Transaction }>> {
    return (await this.lookup<PledgeView>({ op: 'pledges', poolId })).map(r => ({ view: r.context, sourceTx: r.tx }))
  }

  /** The pool transaction (out0 = the credit UTXO the offer spends). */
  async poolTx (poolId: string): Promise<Transaction | undefined> {
    const [txid, vout] = poolId.split('_')
    return (await this.lookup({ op: 'outpoint', txid, vout: Number(vout) }))[0]?.tx
  }

  /** POST /submit to tm_agentcoop (BEEF). */
  async submit (beef: number[]): Promise<Record<string, unknown>> {
    const res = await fetch(`${this.url}/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/octet-stream', 'X-Topics': JSON.stringify(['tm_agentcoop']) },
      body: new Uint8Array(beef)
    })
    const body = await res.json().catch(() => ({})) as Record<string, unknown>
    if (!res.ok) throw new OverlayUnavailableError(`overlay submit failed (${res.status}): ${JSON.stringify(body)}`)
    return body
  }

  /** The credit output a pool's offer spends (out0 of the pool tx), as the overlay holds it. */
  async creditOutput (poolId: string): Promise<{ lockingScriptHex: string, satoshis: number, spent: boolean, tokenId: string, amt: string } | undefined> {
    return await this.tokenOutput(poolId)
  }

  /** An admitted credit (BSV-21) output by outpoint "txid_vout", with its token id, amount and spent flag. */
  async tokenOutput (outpoint: string): Promise<{ lockingScriptHex: string, satoshis: number, spent: boolean, tokenId: string, amt: string } | undefined> {
    const [txid, vout] = outpoint.split('_')
    const [r] = await this.lookup<{ spent: boolean, tokenId: string, amt: string }>({ op: 'outpoint', txid, vout: Number(vout) })
    if (r === undefined) return undefined
    const out = r.tx.outputs[r.outputIndex]
    return { lockingScriptHex: out.lockingScript.toHex(), satoshis: out.satoshis ?? 0, spent: r.context.spent, tokenId: r.context.tokenId, amt: r.context.amt }
  }
}
