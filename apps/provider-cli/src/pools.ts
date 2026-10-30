/**
 * The operator's local record of its pools (`<DATA_DIR>/provider-cli/pools.json`).
 * The pool nonce is the keyID of the pool's revenue key, so without this file
 * sweep-revenue cannot sign; it holds no secret (the key stays in the wallet).
 */
import type { Offer, PoolTerms } from '@agentcoop/core'
import { JsonFile } from '../../provider-api/src/jsonFile'

export interface PoolRecord {
  /** Revenue keyID [1,'agentcoop provider'] (hex). Also the record id. */
  nonce: string
  terms: Omit<PoolTerms, 'poolId'>
  poolId?: string
  status: 'draft' | 'announced' | 'open' | 'cancelled' | 'settled'
  announceTxid?: string
  /** The signed SINGLE|ACP offer, kept so `post-offer` can register it again. */
  offer?: Offer
  cancelTxid?: string
  createdAt: string
}

/** Pools on disk, or in memory when no path is given (tests). */
export class PoolRegistry {
  private readonly file: JsonFile<PoolRecord[]>
  private memory?: PoolRecord[]

  constructor (path?: string) {
    this.file = new JsonFile<PoolRecord[]>(path, () => [])
    if (path === undefined) this.memory = []
  }

  all (): PoolRecord[] {
    return this.memory ?? this.file.read()
  }

  get (nonce: string): PoolRecord | undefined {
    return this.all().find(p => p.nonce === nonce)
  }

  byPoolId (poolId: string): PoolRecord | undefined {
    return this.all().find(p => p.poolId === poolId)
  }

  add (record: PoolRecord): PoolRecord {
    this.save([...this.all(), record])
    return record
  }

  update (nonce: string, patch: Partial<PoolRecord>): PoolRecord {
    const all = this.all()
    const i = all.findIndex(p => p.nonce === nonce)
    if (i === -1) throw new Error(`no pool record ${nonce}`)
    all[i] = { ...all[i], ...patch }
    this.save(all)
    return all[i]
  }

  private save (records: PoolRecord[]): void {
    if (this.memory !== undefined) this.memory = records
    else this.file.write(records)
  }
}
