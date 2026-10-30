/**
 * The coordinator's own state: verified offers and listings (off-chain data:
 * pre-signed SINGLE|ACP inputs that can only ever pay their signer its price,
 * FINAL-IDEA §4.4/§4.8), and per-pool round progress (blacklist, attempts,
 * last round) so a restart does not reset the griefing protection.
 * No funds.
 */
import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import knexFactory, { type Knex } from 'knex'
import type { Listing, Offer } from '@agentcoop/core'

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
    if (!(await knex.schema.hasTable('listings'))) {
      await knex.schema.createTable('listings', t => {
        t.string('outpoint', 80).primary()
        t.string('token_id', 80).notNullable().index()
        t.text('listing').notNullable()
        t.timestamp('created_at').defaultTo(knex.fn.now())
      })
    }
    if (!(await knex.schema.hasTable('progress'))) {
      await knex.schema.createTable('progress', t => {
        t.string('pool_id', 80).primary()
        t.text('json').notNullable()
        t.timestamp('updated_at').defaultTo(knex.fn.now())
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

  async saveListing (listing: Listing): Promise<void> {
    await this.knex('listings').insert({ outpoint: listing.outpoint, token_id: listing.tokenId, listing: JSON.stringify(listing) }).onConflict('outpoint').merge()
  }

  async listings (tokenId?: string): Promise<Listing[]> {
    const q = this.knex('listings').select('listing')
    if (tokenId !== undefined) q.where({ token_id: tokenId })
    return (await q).map((r: { listing: string }) => JSON.parse(r.listing) as Listing)
  }

  async deleteListing (outpoint: string): Promise<void> {
    await this.knex('listings').where({ outpoint }).delete()
  }

  async saveProgress (poolId: string, json: unknown): Promise<void> {
    await this.knex('progress').insert({ pool_id: poolId, json: JSON.stringify(json), updated_at: this.knex.fn.now() }).onConflict('pool_id').merge()
  }

  async allProgress (): Promise<Array<{ poolId: string, json: any }>> {
    return (await this.knex('progress').select('pool_id', 'json')).map((r: { pool_id: string, json: string }) => ({ poolId: r.pool_id, json: JSON.parse(r.json) }))
  }

  async close (): Promise<void> {
    await this.knex.destroy()
  }
}
