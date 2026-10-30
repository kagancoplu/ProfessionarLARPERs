import type { LookupFormula, LookupService, OutputAdmittedByTopic, OutputSpent } from '@bsv/overlay'
import { Transaction, Utils, type LookupQuestion } from '@agentcoop/core/sdk'
import type { Knex } from 'knex'
import { decodeBsv21, decodeBsv21Owned, tokenIdFromOutpoint } from '@agentcoop/core'
import { GAP_LIMIT, receivePkh } from '@agentcoop/core'
import { TOPIC } from './AgentCoopTopicManager'
import { parseOpReturn } from '@agentcoop/core'
import type { PoolTerms } from '@agentcoop/core'
import type { PledgeView, PoolStatus, PoolView, SettlementView, VaultView } from './views'
export type { PledgeView, PoolStatus, PoolView, SettlementView, VaultView } from './views'
import type { OverlayEvents } from './events'
import { expectedVaultScript, isVaultScriptHex } from './vault'
import {
  PLEDGE_COIN_VOUT,
  PLEDGE_FEE_VOUT,
  POOL_CREDIT_VOUT,
  validatePledgeRecord,
  validatePoolRecord,
  validateSettleRecord,
  validateVaultRecord,
  type PoolRecord
} from './records'

export const SERVICE = 'ls_agentcoop'
const OUTPUTS = 'agentcoop_token_outputs'
const TOKENS = 'agentcoop_tokens'
const POOLS = 'agentcoop_pools'
const PLEDGES = 'agentcoop_pledges'
const SETTLEMENTS = 'agentcoop_settlements'
const RECORDS = 'agentcoop_records'
const VAULTS = 'agentcoop_vaults'
const VAULT_OUTPUTS = 'agentcoop_vault_outputs'
const MAX_RESULTS = 500

/** Queries accepted by `ls_agentcoop` (the `query` of a LookupQuestion). MASTER §3.8. */
export type KitQuery =
  | { op: 'token', tokenId: string }
  | { op: 'tokens' }
  | { op: 'utxos', ownerPkhs: string[], tokenId?: string }
  | { op: 'identity', identityKey: string, tokenId?: string, includeSpent?: boolean }
  | { op: 'outpoint', txid: string, vout: number }
  | { op: 'history', tokenId: string, limit?: number }

export type AgentCoopQuery =
  | KitQuery
  | { op: 'pools', status?: PoolStatus }
  | { op: 'pool', poolId: string }
  | { op: 'pledges', poolId: string, includeSpent?: boolean, includeInvalid?: boolean }
  | { op: 'settlement', poolId: string }
  | { op: 'vaults', owner?: string, includeUnverified?: boolean }
  | { op: 'vault', vaultId: string }
  | { op: 'listings', tokenId?: string }
  | { op: 'offers', poolId: string }
  | { op: 'vaultCredits', vaultHash: string, tokenId?: string, includeSpent?: boolean }

/** Per-output metadata returned in each lookup answer's `context` (UTF-8 JSON). */
export interface OutputContext {
  tokenId: string
  op: string
  amt: string
  /** '' when the owner is a vault script (then ownerVaultHash is set). */
  ownerPkh: string
  /** sha256 of the Mandate Vault script owning a vault-locked credit (A-P5 5.3, `vaultScriptHash`). */
  ownerVaultHash?: string
  spent: boolean
  spendingTxid?: string
  /** Receive-key index, only for `identity` queries. */
  index?: number
  sym?: string
  dec?: string
}

interface OutputRow {
  txid: string
  vout: number
  token_id: string
  op: string
  amt: string
  owner_pkh: string
  owner_vault_hash: string | null
  spent: number
  spending_txid: string | null
}

interface PoolRow {
  pool_id: string
  txid: string
  record_vout: number
  terms: string
  credit_token_id: string | null
  credit_amt: string | null
  created_height: number | null
}

interface PledgeRow {
  outpoint: string
  txid: string
  vout: number
  pool_id: string
  participant: string
  credits: string
  token_index: string
  signer: 'p2pkh' | 'vault'
  credit_lock: 'vault' | null
  mode: 'lighthouse' | null
  guard: string | null
  lh_id: string | null
  coin_sats: number
  fee_out_sats: number | null
  fee_out_script_hex: string | null
  height: number | null
  spent: number
  spending_txid: string | null
}

interface VaultRow {
  vault_id: string
  txid: string
  record_vout: number
  owner: string
  agent: string
  guard: string
  script_hex: string | null
  verified: number
}

interface SettlementRow {
  txid: string
  record_vout: number
  pool_id: string
  pledge_list_hash: string
  inputs: string
}

export const migrations = [{
  name: '2026-10-30-001-agentcoop-tokens',
  async up (knex: Knex): Promise<void> {
    await knex.schema.createTable(OUTPUTS, t => {
      t.string('txid', 64).notNullable()
      t.integer('vout').notNullable()
      t.string('token_id', 80).notNullable().index()
      t.string('op', 16).notNullable()
      t.string('amt', 24).notNullable()
      t.string('owner_pkh', 40).notNullable().index()
      t.integer('satoshis').notNullable()
      t.boolean('spent').notNullable().defaultTo(false)
      t.string('spending_txid', 64)
      t.timestamp('created_at').defaultTo(knex.fn.now())
      t.primary(['txid', 'vout'])
    })
    await knex.schema.createTable(TOKENS, t => {
      t.string('token_id', 80).primary()
      t.string('sym', 64)
      t.string('dec', 4)
      t.string('icon', 255)
      t.string('supply', 24).notNullable()
      t.timestamp('created_at').defaultTo(knex.fn.now())
    })
  },
  async down (knex: Knex): Promise<void> {
    await knex.schema.dropTableIfExists(OUTPUTS)
    await knex.schema.dropTableIfExists(TOKENS)
  }
}, {
  name: '2026-10-30-002-agentcoop-records',
  async up (knex: Knex): Promise<void> {
    await knex.schema.createTable(POOLS, t => {
      t.string('pool_id', 80).primary()
      t.string('txid', 64).notNullable()
      t.integer('record_vout').notNullable()
      t.text('terms').notNullable()
      t.string('credit_token_id', 80)
      t.string('credit_amt', 24)
      t.integer('created_height')
      t.timestamp('created_at').defaultTo(knex.fn.now())
    })
    await knex.schema.createTable(PLEDGES, t => {
      t.string('outpoint', 80).primary()
      t.string('txid', 64).notNullable()
      t.integer('vout').notNullable()
      t.string('pool_id', 80).notNullable().index()
      t.string('participant', 66).notNullable().index()
      t.string('credits', 24).notNullable()
      t.string('token_index', 24).notNullable()
      t.string('signer', 8).notNullable()
      t.bigInteger('coin_sats').notNullable()
      t.bigInteger('fee_out_sats')
      t.text('fee_out_script_hex')
      t.integer('height')
      t.boolean('spent').notNullable().defaultTo(false)
      t.string('spending_txid', 64)
      t.timestamp('created_at').defaultTo(knex.fn.now())
    })
    await knex.schema.createTable(SETTLEMENTS, t => {
      t.string('txid', 64).primary()
      t.integer('record_vout').notNullable()
      t.string('pool_id', 80).notNullable().index()
      t.string('pledge_list_hash', 64).notNullable()
      t.text('inputs').notNullable()
      t.timestamp('created_at').defaultTo(knex.fn.now())
    })
    await knex.schema.createTable(RECORDS, t => {
      t.string('txid', 64).notNullable()
      t.integer('vout').notNullable()
      t.string('op', 16).notNullable().index()
      t.text('json').notNullable()
      t.timestamp('created_at').defaultTo(knex.fn.now())
      t.primary(['txid', 'vout'])
    })
  },
  async down (knex: Knex): Promise<void> {
    for (const t of [POOLS, PLEDGES, SETTLEMENTS, RECORDS]) await knex.schema.dropTableIfExists(t)
  }
}, {
  name: '2026-10-30-003-agentcoop-vaults',
  async up (knex: Knex): Promise<void> {
    await knex.schema.createTable(VAULTS, t => {
      t.string('txid', 64).notNullable()
      t.integer('record_vout').notNullable()
      t.string('vault_id', 64).notNullable().index()
      t.string('owner', 66).notNullable().index()
      t.string('agent', 66).notNullable()
      t.string('guard', 66).notNullable()
      t.text('script_hex')
      t.boolean('verified').notNullable().defaultTo(false)
      t.timestamp('created_at').defaultTo(knex.fn.now())
      t.primary(['txid', 'record_vout'])
    })
    await knex.schema.createTable(VAULT_OUTPUTS, t => {
      t.string('txid', 64).notNullable()
      t.integer('vout').notNullable()
      t.string('script_hex', 220).notNullable().index()
      t.bigInteger('satoshis').notNullable()
      t.boolean('spent').notNullable().defaultTo(false)
      t.string('spending_txid', 64)
      t.timestamp('created_at').defaultTo(knex.fn.now())
      t.primary(['txid', 'vout'])
    })
  },
  async down (knex: Knex): Promise<void> {
    for (const t of [VAULTS, VAULT_OUTPUTS]) await knex.schema.dropTableIfExists(t)
  }
}, {
  // A-P5: vault-locked credits (owner = a vault script) and the pledge record's creditLock / lighthouse fields.
  name: '2026-10-31-004-agentcoop-credit-locks',
  async up (knex: Knex): Promise<void> {
    await knex.schema.alterTable(OUTPUTS, t => {
      t.string('owner_vault_hash', 64).index()
    })
    await knex.schema.alterTable(PLEDGES, t => {
      t.string('credit_lock', 8)
      t.string('mode', 16)
      t.string('guard', 66)
      t.string('lh_id', 64)
    })
  },
  async down (knex: Knex): Promise<void> {
    await knex.schema.alterTable(OUTPUTS, t => { t.dropColumn('owner_vault_hash') })
    await knex.schema.alterTable(PLEDGES, t => { for (const c of ['credit_lock', 'mode', 'guard', 'lh_id']) t.dropColumn(c) })
  }
}]

const isHex = (s: unknown, len: number): s is string => typeof s === 'string' && s.length === len && /^[0-9a-f]+$/.test(s)
const outpointOf = (txid: string, vout: number): string => `${txid}_${vout}`
const ceilDiv = (a: bigint, b: bigint): bigint => (a + b - 1n) / b

export class AgentCoopLookupService implements LookupService {
  // whole-tx: AgentCoop records need the OP_RETURN, the inputs and the other outputs of the transaction.
  readonly admissionMode = 'whole-tx' as const
  readonly spendNotificationMode = 'txid' as const

  constructor (private readonly knex: Knex, private readonly events?: OverlayEvents) {}

  async outputAdmittedByTopic (payload: OutputAdmittedByTopic): Promise<void> {
    if (payload.mode !== 'whole-tx' || payload.topic !== TOPIC) return
    const tx = Transaction.fromAtomicBEEF(payload.atomicBEEF)
    const txid = tx.id('hex')
    await this.index(tx, txid, payload.outputIndex)
    this.events?.emitEvent({ type: 'admitted', txid })
  }

  private async index (tx: Transaction, txid: string, outputIndex: number): Promise<void> {
    const output = tx.outputs[outputIndex]
    if (output === undefined) return

    const scriptHex = output.lockingScript.toHex()
    if (isVaultScriptHex(scriptHex)) {
      await this.knex(VAULT_OUTPUTS).insert({ txid, vout: outputIndex, script_hex: scriptHex, satoshis: output.satoshis ?? 0 })
        .onConflict(['txid', 'vout']).ignore()
      return
    }

    const d = decodeBsv21Owned(output.lockingScript)
    if (d !== null) {
      const tokenId = d.op === 'deploy+mint' ? tokenIdFromOutpoint(txid, outputIndex) : d.id!
      await this.knex(OUTPUTS).insert({
        txid,
        vout: outputIndex,
        token_id: tokenId,
        op: d.op,
        amt: d.amt,
        owner_pkh: d.owner.kind === 'p2pkh' ? d.owner.pkh : '',
        owner_vault_hash: d.owner.kind === 'vault' ? d.owner.vaultHash : null,
        satoshis: output.satoshis ?? 0
      }).onConflict(['txid', 'vout']).ignore()
      if (d.op === 'deploy+mint') {
        await this.knex(TOKENS).insert({ token_id: tokenId, sym: d.sym ?? null, dec: d.dec ?? '0', icon: d.icon ?? null, supply: d.amt })
          .onConflict('token_id').ignore()
      }
      return
    }

    const record = parseOpReturn(output.lockingScript)
    if (record === null) return // e.g. the pledge coin itself: indexed with its record
    const height = tx.merklePath?.blockHeight ?? null
    switch (record.op) {
      case 'pool': {
        const terms = validatePoolRecord(record.json)
        if (terms === null) return
        const credit = tx.outputs[POOL_CREDIT_VOUT]
        const c = credit !== undefined ? decodeBsv21(credit.lockingScript) : null
        await this.knex(POOLS).insert({
          pool_id: outpointOf(txid, POOL_CREDIT_VOUT),
          txid,
          record_vout: outputIndex,
          terms: JSON.stringify(terms),
          credit_token_id: c === null ? null : (c.op === 'deploy+mint' ? tokenIdFromOutpoint(txid, POOL_CREDIT_VOUT) : c.id!),
          credit_amt: c?.amt ?? null,
          created_height: height
        }).onConflict('pool_id').ignore()
        return
      }
      case 'pledge': {
        const pledge = validatePledgeRecord(record.json)
        const coin = tx.outputs[PLEDGE_COIN_VOUT]
        if (pledge === null || coin === undefined) return
        const fee = tx.outputs[PLEDGE_FEE_VOUT]
        await this.knex(PLEDGES).insert({
          outpoint: outpointOf(txid, PLEDGE_COIN_VOUT),
          txid,
          vout: PLEDGE_COIN_VOUT,
          pool_id: pledge.poolId,
          participant: pledge.participant,
          credits: pledge.credits,
          token_index: pledge.tokenIndex,
          signer: pledge.signer,
          credit_lock: pledge.creditLock ?? null,
          mode: pledge.mode ?? null,
          guard: pledge.guard ?? null,
          lh_id: pledge.lhId ?? null,
          coin_sats: coin.satoshis ?? 0,
          fee_out_sats: fee?.satoshis ?? null,
          fee_out_script_hex: fee?.lockingScript.toHex() ?? null,
          height
        }).onConflict('outpoint').ignore()
        return
      }
      case 'settle': {
        const settle = validateSettleRecord(record.json)
        const in0 = tx.inputs[0]
        if (settle === null || in0 === undefined) return
        // Only a transaction that actually spends the pool's credit UTXO at input 0 settles the pool.
        if (outpointOf(in0.sourceTXID ?? in0.sourceTransaction!.id('hex'), in0.sourceOutputIndex) !== settle.poolId) return
        await this.knex(SETTLEMENTS).insert({
          txid,
          record_vout: outputIndex,
          pool_id: settle.poolId,
          pledge_list_hash: settle.pledgeListHash,
          inputs: JSON.stringify(tx.inputs.map(i => outpointOf(i.sourceTXID ?? i.sourceTransaction!.id('hex'), i.sourceOutputIndex)))
        }).onConflict('txid').ignore()
        return
      }
      case 'vault': {
        const vault = validateVaultRecord(record.json)
        if (vault === null) return
        const vaultOut = tx.outputs.find(o => isVaultScriptHex(o.lockingScript.toHex()))
        const script = vaultOut?.lockingScript.toHex() ?? null
        await this.knex(VAULTS).insert({
          txid,
          record_vout: outputIndex,
          vault_id: vault.vaultId,
          owner: vault.owner,
          agent: vault.agent,
          guard: vault.guard,
          script_hex: script,
          // The owner, agent and guard keys are 'anyone'-derived, so anyone can check the claim.
          verified: script !== null && script === expectedVaultScript(vault.owner, vault.agent, vault.guard, vault.vaultId).toHex()
        }).onConflict(['txid', 'record_vout']).ignore()
        return
      }
      default:
        await this.knex(RECORDS).insert({ txid, vout: outputIndex, op: record.op, json: JSON.stringify(record.json) })
          .onConflict(['txid', 'vout']).ignore()
    }
  }

  async outputSpent (payload: OutputSpent): Promise<void> {
    if (payload.topic !== TOPIC) return
    const spendingTxid = payload.mode === 'txid' || payload.mode === 'script' ? payload.spendingTxid : null
    await this.knex(OUTPUTS).where({ txid: payload.txid, vout: payload.outputIndex }).update({ spent: true, spending_txid: spendingTxid })
    await this.knex(PLEDGES).where({ txid: payload.txid, vout: payload.outputIndex }).update({ spent: true, spending_txid: spendingTxid })
    await this.knex(VAULT_OUTPUTS).where({ txid: payload.txid, vout: payload.outputIndex }).update({ spent: true, spending_txid: spendingTxid })
    this.events?.emitEvent({ type: 'spent', txid: spendingTxid ?? payload.txid })
  }

  async outputEvicted (txid: string, outputIndex: number): Promise<void> {
    await this.knex(OUTPUTS).where({ txid, vout: outputIndex }).delete()
    await this.knex(PLEDGES).where({ txid, vout: outputIndex }).delete()
    await this.knex(VAULT_OUTPUTS).where({ txid, vout: outputIndex }).delete()
  }

  async lookup (question: LookupQuestion): Promise<LookupFormula> {
    if (question.service !== SERVICE) throw new Error(`unsupported service ${question.service}`)
    const q = question.query as AgentCoopQuery
    if (q === null || typeof q !== 'object') throw new Error('query must be an object')

    switch (q.op) {
      case 'token': {
        const [txid, vout] = this.parseTokenId(q.tokenId)
        return await this.formula(await this.knex<OutputRow>(OUTPUTS).where({ txid, vout }))
      }
      case 'tokens':
        return await this.formula(await this.knex<OutputRow>(OUTPUTS).where({ op: 'deploy+mint' }).orderBy('created_at', 'desc').limit(MAX_RESULTS))
      case 'utxos': {
        if (!Array.isArray(q.ownerPkhs) || q.ownerPkhs.length === 0 || q.ownerPkhs.length > MAX_RESULTS || !q.ownerPkhs.every(p => isHex(p, 40))) {
          throw new Error('ownerPkhs must be 1..500 hex pkhs')
        }
        const rows = this.knex<OutputRow>(OUTPUTS).whereIn('owner_pkh', q.ownerPkhs).andWhere('spent', false)
        if (q.tokenId !== undefined) rows.andWhere({ token_id: q.tokenId })
        return await this.formula(await rows.limit(MAX_RESULTS))
      }
      case 'identity': {
        if (!isHex(q.identityKey, 66)) throw new Error('identityKey must be a compressed public key (hex)')
        const indexOf = await this.scanIdentity(q.identityKey)
        if (indexOf.size === 0) return []
        const rows = this.knex<OutputRow>(OUTPUTS).whereIn('owner_pkh', [...indexOf.keys()])
        if (q.includeSpent !== true) rows.andWhere('spent', false)
        if (q.tokenId !== undefined) rows.andWhere({ token_id: q.tokenId })
        return await this.formula(await rows.limit(MAX_RESULTS), indexOf)
      }
      case 'outpoint':
        return await this.formula(await this.knex<OutputRow>(OUTPUTS).where({ txid: q.txid, vout: q.vout }))
      case 'vaultCredits': {
        if (!isHex(q.vaultHash, 64)) throw new Error('vaultHash must be sha256(vault script) hex')
        const rows = this.knex<OutputRow>(OUTPUTS).where({ owner_vault_hash: q.vaultHash })
        if (q.includeSpent !== true) rows.andWhere('spent', false)
        if (q.tokenId !== undefined) rows.andWhere({ token_id: q.tokenId })
        return await this.formula(await rows.limit(MAX_RESULTS))
      }
      case 'history': {
        const limit = Math.min(Math.max(q.limit ?? 100, 1), MAX_RESULTS)
        return await this.formula(await this.knex<OutputRow>(OUTPUTS).where({ token_id: q.tokenId }).orderBy('created_at', 'desc').limit(limit))
      }
      case 'pools': {
        const rows = await this.knex<PoolRow>(POOLS).orderBy('created_at', 'desc').limit(MAX_RESULTS)
        const views = await Promise.all(rows.map(async r => await this.poolView(r)))
        return views
          .filter(v => q.status === undefined || v.view.status === q.status)
          .map(({ row, view }) => ({ txid: row.txid, outputIndex: row.record_vout, context: this.ctx(view) }))
      }
      case 'pool': {
        this.parseTokenId(q.poolId)
        const row = await this.knex<PoolRow>(POOLS).where({ pool_id: q.poolId }).first()
        if (row === undefined) return []
        const { view } = await this.poolView(row)
        return [{ txid: row.txid, outputIndex: row.record_vout, context: this.ctx(view) }]
      }
      case 'pledges': {
        this.parseTokenId(q.poolId)
        const pool = await this.knex<PoolRow>(POOLS).where({ pool_id: q.poolId }).first()
        const status = pool !== undefined ? (await this.poolView(pool)).view.status : undefined
        const rows = await this.knex<PledgeRow>(PLEDGES).where({ pool_id: q.poolId }).limit(MAX_RESULTS)
        return this.sortPledges(rows.map(r => this.pledgeView(r, pool, status)))
          .filter(v => (q.includeSpent === true || !v.spent) && (q.includeInvalid === true || v.valid))
          .map(v => ({ txid: v.txid, outputIndex: v.vout, context: this.ctx(v) }))
      }
      case 'settlement': {
        this.parseTokenId(q.poolId)
        const row = await this.knex<SettlementRow>(SETTLEMENTS).where({ pool_id: q.poolId }).orderBy('created_at', 'asc').first()
        if (row === undefined) return []
        const view: SettlementView = { poolId: row.pool_id, txid: row.txid, pledgeListHash: row.pledge_list_hash, inputs: JSON.parse(row.inputs) }
        return [{ txid: row.txid, outputIndex: row.record_vout, context: this.ctx(view) }]
      }
      case 'vaults': {
        const rows = this.knex<VaultRow>(VAULTS).orderBy('created_at', 'desc').limit(MAX_RESULTS)
        if (q.owner !== undefined) {
          if (!isHex(q.owner, 66)) throw new Error('owner must be a compressed public key (hex)')
          rows.where({ owner: q.owner })
        }
        if (q.includeUnverified !== true) rows.andWhere('verified', true)
        return await Promise.all((await rows).map(async r => ({ txid: r.txid, outputIndex: r.record_vout, context: this.ctx(await this.vaultView(r)) })))
      }
      case 'vault': {
        if (typeof q.vaultId !== 'string') throw new Error('vaultId required')
        const row = await this.knex<VaultRow>(VAULTS).where({ vault_id: q.vaultId }).andWhere('verified', true).orderBy('created_at', 'asc').first()
        return row === undefined ? [] : [{ txid: row.txid, outputIndex: row.record_vout, context: this.ctx(await this.vaultView(row)) }]
      }
      case 'listings': {
        const rows = await this.knex(RECORDS).where({ op: 'list' }).orderBy('created_at', 'desc').limit(MAX_RESULTS)
        return rows
          .map((r: any) => ({ r, json: JSON.parse(r.json) }))
          .filter(({ json }) => q.tokenId === undefined || json.tokenId === q.tokenId)
          .map(({ r, json }) => ({ txid: r.txid, outputIndex: r.vout, context: this.ctx({ txid: r.txid, ...json }) }))
      }
      case 'offers': {
        // B.P6b: published offers for a pool, oldest first. Not verified here: the reader checks each with verifyOffer.
        this.parseTokenId(q.poolId)
        const rows = await this.knex(RECORDS).where({ op: 'offer' }).whereRaw("json_extract(json, '$.poolId') = ?", [q.poolId]).orderBy('created_at', 'asc').limit(MAX_RESULTS)
        return rows.map((r: any) => ({ txid: r.txid, outputIndex: r.vout, context: this.ctx({ txid: r.txid, ...JSON.parse(r.json) }) }))
      }
      default:
        throw new Error('unknown query op')
    }
  }

  private async vaultView (r: VaultRow): Promise<VaultView> {
    const utxos = r.script_hex === null
      ? []
      : await this.knex(VAULT_OUTPUTS).where({ script_hex: r.script_hex }).andWhere('spent', false).orderBy('created_at', 'asc')
    return {
      vaultId: r.vault_id,
      owner: r.owner,
      agent: r.agent,
      guard: r.guard,
      scriptHex: r.script_hex ?? '',
      verified: Boolean(r.verified),
      balanceSats: utxos.reduce((s: number, u: any) => s + Number(u.satoshis), 0),
      utxos: utxos.map((u: any) => ({ outpoint: outpointOf(u.txid, u.vout), satoshis: Number(u.satoshis) }))
    }
  }

  /** Status, progress and sanity of a pool, all from chain records (MASTER §3.8). */
  private async poolView (row: PoolRow): Promise<{ row: PoolRow, view: PoolView }> {
    const terms = { ...JSON.parse(row.terms) as PoolRecord, poolId: row.pool_id } as PoolTerms
    const [credit, settlement] = await Promise.all([
      this.knex<OutputRow>(OUTPUTS).where({ txid: row.txid, vout: POOL_CREDIT_VOUT }).first(),
      this.knex<SettlementRow>(SETTLEMENTS).where({ pool_id: row.pool_id }).orderBy('created_at', 'asc').first()
    ])
    let invalidReason: string | undefined
    if (credit === undefined) invalidReason = 'credit output not admitted'
    else if (row.credit_token_id !== terms.tokenId || row.credit_amt !== terms.credits) invalidReason = 'credit output does not match terms'
    const status: PoolStatus = settlement !== undefined ? 'settled' : credit !== undefined && Boolean(credit.spent) ? 'cancelled' : 'open'
    // open: valid unspent pledges; settled: the pledges the settlement spent.
    const pledges = invalidReason !== undefined || status === 'cancelled'
      ? []
      : status === 'settled'
        ? (await this.knex<PledgeRow>(PLEDGES).where({ pool_id: row.pool_id, spending_txid: settlement!.txid })).map(p => this.pledgeView(p, row, status))
        : (await this.knex<PledgeRow>(PLEDGES).where({ pool_id: row.pool_id }).andWhere('spent', false)).map(p => this.pledgeView(p, row, status)).filter(p => p.valid)
    const view: PoolView = {
      poolId: row.pool_id,
      txid: row.txid,
      terms,
      status,
      pledgedCredits: pledges.reduce((s, p) => s + BigInt(p.credits), 0n).toString(),
      pledgeCount: pledges.length,
      target: terms.credits,
      ...(settlement !== undefined ? { settledTxid: settlement.txid } : {}),
      ...(credit?.spending_txid != null ? { spendingTxid: credit.spending_txid } : {}),
      ...(row.created_height !== null ? { createdHeight: row.created_height } : {}),
      ...(invalidReason !== undefined ? { invalidReason } : {})
    }
    return { row, view }
  }

  /** Pledge validity (MASTER §3.8), evaluated against the pool's terms at query time. */
  private pledgeView (r: PledgeRow, pool: PoolRow | undefined, status: PoolStatus | undefined): PledgeView {
    let invalidReason: string | undefined
    if (pool === undefined) invalidReason = 'unknown pool'
    else {
      const t = JSON.parse(pool.terms) as PoolRecord
      const credits = BigInt(r.credits)
      const N = BigInt(t.credits)
      if (status !== undefined && status !== 'open' && !Boolean(r.spent)) invalidReason = `pool ${status}`
      else if (credits < BigInt(t.minCredits) || credits > N) invalidReason = `credits outside ${t.minCredits}..${t.credits}`
      else if (r.fee_out_script_hex !== t.payScriptHex || BigInt(r.fee_out_sats ?? 0) < BigInt(t.feeSats)) invalidReason = 'registration fee missing or below feeSats'
      else if (BigInt(r.coin_sats) < ceilDiv(credits * BigInt(t.priceSats), N) + 1n) invalidReason = 'pledge coin below its share of the price'
    }
    return {
      outpoint: r.outpoint,
      txid: r.txid,
      vout: r.vout,
      poolId: r.pool_id,
      participant: r.participant,
      credits: r.credits,
      tokenIndex: r.token_index,
      signer: r.signer,
      ...(r.credit_lock != null ? { creditLock: r.credit_lock } : {}),
      ...(r.mode != null ? { mode: r.mode } : {}),
      ...(r.guard != null ? { guard: r.guard } : {}),
      ...(r.lh_id != null ? { lhId: r.lh_id } : {}),
      coinSats: Number(r.coin_sats),
      ...(r.height !== null ? { height: r.height } : {}),
      spent: Boolean(r.spent),
      ...(r.spending_txid !== null ? { spendingTxid: r.spending_txid } : {}),
      valid: invalidReason === undefined,
      ...(invalidReason !== undefined ? { invalidReason } : {})
    }
  }

  /** MASTER §3.2 order: (height asc, txid asc), unmined last by txid. The coordinator re-checks heights with Arcade. */
  private sortPledges (views: PledgeView[]): PledgeView[] {
    return views.sort((a, b) => {
      const ha = a.height ?? Number.MAX_SAFE_INTEGER
      const hb = b.height ?? Number.MAX_SAFE_INTEGER
      return ha !== hb ? ha - hb : a.txid < b.txid ? -1 : a.txid > b.txid ? 1 : a.vout - b.vout
    })
  }

  private ctx (value: object): number[] {
    return Utils.toArray(JSON.stringify(value), 'utf8')
  }

  /** pkh → receive index for every used index of `identityKey`, scanning GAP_LIMIT past the last used one. */
  private async scanIdentity (identityKey: string): Promise<Map<string, number>> {
    const used = new Map<string, number>()
    let start = 0
    for (;;) {
      const batch = new Map<string, number>()
      for (let i = start; i < start + GAP_LIMIT; i++) batch.set(receivePkh(identityKey, i), i)
      const hits = await this.knex(OUTPUTS).distinct('owner_pkh').whereIn('owner_pkh', [...batch.keys()])
      if (hits.length === 0) return used
      let maxUsed = start
      for (const { owner_pkh: pkh } of hits) {
        const i = batch.get(pkh)!
        used.set(pkh, i)
        maxUsed = Math.max(maxUsed, i)
      }
      start = maxUsed + 1
    }
  }

  private parseTokenId (tokenId: string): [string, number] {
    const m = /^([0-9a-f]{64})_(\d+)$/.exec(tokenId ?? '')
    if (m === null) throw new Error('tokenId must be "<txid>_<vout>"')
    return [m[1], Number(m[2])]
  }

  private async formula (rows: OutputRow[], indexOf?: Map<string, number>): Promise<LookupFormula> {
    const tokenIds = [...new Set(rows.map(r => r.token_id))]
    const meta = new Map((await this.knex(TOKENS).whereIn('token_id', tokenIds)).map((t: any) => [t.token_id, t]))
    return rows.map(r => {
      const ctx: OutputContext = {
        tokenId: r.token_id,
        op: r.op,
        amt: r.amt,
        ownerPkh: r.owner_pkh,
        ...(r.owner_vault_hash != null ? { ownerVaultHash: r.owner_vault_hash } : {}),
        spent: Boolean(r.spent),
        ...(r.spending_txid !== null ? { spendingTxid: r.spending_txid } : {}),
        ...(indexOf?.has(r.owner_pkh) === true ? { index: indexOf.get(r.owner_pkh) } : {}),
        ...(meta.get(r.token_id)?.sym != null ? { sym: meta.get(r.token_id).sym } : {}),
        ...(meta.get(r.token_id)?.dec != null ? { dec: meta.get(r.token_id).dec } : {})
      }
      return { txid: r.txid, outputIndex: r.vout, context: Utils.toArray(JSON.stringify(ctx), 'utf8') }
    })
  }

  async getDocumentation (): Promise<string> {
    return '# ls_agentcoop\nQueries: pools, pool, pledges, settlement (AgentCoop records) and token, tokens, utxos (ownerPkhs), vaultCredits (vaultHash), identity (identityKey), outpoint, history (BSV-21 credits). See plan/00-MASTER-PLAN.md §3.8.'
  }

  async getMetaData (): Promise<{ name: string, shortDescription: string }> {
    return { name: SERVICE, shortDescription: 'AgentCoop pools, pledges, settlements and BSV-21 credit UTXOs' }
  }
}

export const createAgentCoopLookupService = (knex: Knex): { service: LookupService, migrations: typeof migrations } => ({
  service: new AgentCoopLookupService(knex),
  migrations
})

/** Same, with an event emitter for GET /agentcoop/events. */
export const makeAgentCoopLookupFactory = (events: OverlayEvents, onKnex?: (knex: Knex) => void) => (knex: Knex): { service: LookupService, migrations: typeof migrations } => {
  onKnex?.(knex)
  return { service: new AgentCoopLookupService(knex, events), migrations }
}
