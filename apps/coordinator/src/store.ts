/**
 * The coordinator's own state. Faz 1: verified offers (off-chain data: the
 * provider's pre-signed SINGLE|ACP input). Not funds: an offer can only ever
 * pay the provider its price (FINAL-IDEA §4.4).
 */
import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import knexFactory, { type Knex } from 'knex'
import type { Offer } from '../../../packages/overlay/src/stub/types'

export class CoordinatorStore {
  private constructor (readonly knex: Knex) {}

  static async open (dbFile: string): Promise<CoordinatorStore> {
    if (dbFile !== ':memory:') mkdirSync(dirname(resolve(dbFile)), { recursive: true })
    const knex = knexFactory({ client: 'better-sqlite3', connection: { filename: dbFile }, useNullAsDefault: true })
    if (!(await knex.schema.hasTable('offers'))) {
      await knex.schema.createTable('offers', t => {
        t.string('pool_id', 80).primary()
        t.text('offer').notNullable()
        t.timestamp('created_at').defaultTo(knex.fn.now())
      })
    }
    return new CoordinatorStore(knex)
  }

  /** A provider may re-post a (re-verified) offer for the same pool; the latest wins. */
  async saveOffer (offer: Offer): Promise<void> {
    await this.knex('offers').insert({ pool_id: offer.poolId, offer: JSON.stringify(offer) }).onConflict('pool_id').merge()
  }

  async getOffer (poolId: string): Promise<Offer | undefined> {
    const row = await this.knex('offers').where({ pool_id: poolId }).first()
    return row === undefined ? undefined : JSON.parse(row.offer) as Offer
  }

  async offerPoolIds (): Promise<Set<string>> {
    return new Set((await this.knex('offers').select('pool_id')).map((r: { pool_id: string }) => r.pool_id))
  }

  async close (): Promise<void> {
    await this.knex.destroy()
  }
}
