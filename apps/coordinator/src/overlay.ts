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

  /** The credit output a pool's offer spends (out0 of the pool tx), as the overlay holds it. */
  async creditOutput (poolId: string): Promise<{ lockingScriptHex: string, satoshis: number, spent: boolean } | undefined> {
    const [txid, vout] = poolId.split('_')
    const [r] = await this.lookup<{ spent: boolean }>({ op: 'outpoint', txid, vout: Number(vout) })
    if (r === undefined) return undefined
    const out = r.tx.outputs[r.outputIndex]
    return { lockingScriptHex: out.lockingScript.toHex(), satoshis: out.satoshis ?? 0, spent: r.context.spent }
  }
}
