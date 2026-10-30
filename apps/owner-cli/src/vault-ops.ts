/**
 * Owner-side vault operations (plan/phases/D-P1.md §8). The wallet is BSV
 * Desktop in the CLI and a wallet-toolbox wallet in tests (same engine).
 *
 *   createVault    vaultId + keys + script (the owner's key from its own wallet)
 *   registerVault  PUT {guard}/vaults/:id over BRC-103; the guard's script must equal ours
 *   putPolicy      PUT {guard}/policies/:agent
 *   fundVault      out0 = vault coin, out1 = OP_RETURN vault record
 *   withdrawVault  the OP_IF branch: every given vault UTXO back to the owner's wallet,
 *                  without the guard or the agent
 */
import { Beef, Transaction, type WalletInterface } from '@bsv/sdk'
import {
  VAULT_BASKET,
  VAULT_OWNER_UNLOCK_LENGTH,
  VAULT_PROTOCOL,
  deriveVaultPub,
  newVaultId,
  validateVaultRecord,
  vaultKeysForRecord,
  vaultLockingScript,
  vaultRecordScript,
  type VaultKeys,
  type VaultRecord
} from '../../../packages/core/src/scripts/vault'
import { VaultOwnerSigner, broadcastResult, vaultTag, type VaultUtxo } from '../../../packages/core/src/signers/VaultSigner'

export interface VaultInfo {
  record: VaultRecord
  keys: VaultKeys
  lockingScriptHex: string
  guardUrl?: string
  createdAt: string
}

/** What the guard API needs from a client: AuthFetch (BRC-103) satisfies it. */
export interface Fetcher {
  fetch: (url: string, init?: { method?: string, headers?: Record<string, string>, body?: any }) => Promise<Response>
}

export interface GuardPolicyInput {
  allowProviders: string[]
  maxPerPoolSats: number
  weeklyCapSats: number
  maxFeeSats: number
  hotWalletDailySats: number
}

const ownerInstructions = (vaultId: string): string =>
  JSON.stringify({ vaultId, role: 'owner', protocolID: VAULT_PROTOCOL, keyID: vaultId, counterparty: 'anyone' })

export async function createVault (owner: WalletInterface, args: { agent: string, guard: string, vaultId?: string, guardUrl?: string, originator?: string }): Promise<VaultInfo> {
  const { publicKey: identity } = await owner.getPublicKey({ identityKey: true }, args.originator)
  const vaultId = args.vaultId ?? newVaultId()
  const record = validateVaultRecord({ v: '1', vaultId, owner: identity, agent: args.agent, guard: args.guard })
  if (record === null) throw new Error('invalid vault: owner, agent and guard must be three different identity keys')
  // Our own vault key, from our wallet; it must equal what anyone derives from our identity key.
  const { publicKey: ownerPub } = await owner.getPublicKey({ protocolID: VAULT_PROTOCOL, keyID: vaultId, counterparty: 'anyone', forSelf: true }, args.originator)
  if (ownerPub !== deriveVaultPub(identity, vaultId)) throw new Error('the wallet derives a different vault key than its identity key implies')
  const keys = vaultKeysForRecord(record)
  return {
    record,
    keys,
    lockingScriptHex: vaultLockingScript(keys.ownerPub, keys.agentPub, keys.guardPub).toHex(),
    ...(args.guardUrl !== undefined ? { guardUrl: args.guardUrl } : {}),
    createdAt: new Date().toISOString()
  }
}

async function guardCall (fetcher: Fetcher, method: string, url: string, body?: unknown): Promise<Record<string, unknown>> {
  const res = await fetcher.fetch(url, {
    method,
    headers: { 'content-type': 'application/json' },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {})
  })
  const json = await res.json().catch(() => ({})) as Record<string, unknown>
  if (!res.ok) throw new Error(`guard ${method} ${new URL(url).pathname} → ${res.status} ${String(json.reason ?? '')}`.trim())
  return json
}

const base = (guardUrl: string): string => guardUrl.replace(/\/+$/, '')

/** Register at the guard; refuses to continue unless the guard derives the very same script. */
export async function registerVault (fetcher: Fetcher, guardUrl: string, vault: VaultInfo): Promise<void> {
  const res = await guardCall(fetcher, 'PUT', `${base(guardUrl)}/vaults/${vault.record.vaultId}`, vault.record)
  if (res.lockingScriptHex !== vault.lockingScriptHex) throw new Error('the guard derived a different vault script: do not fund this vault')
}

export async function putPolicy (fetcher: Fetcher, guardUrl: string, agent: string, policy: GuardPolicyInput): Promise<Record<string, unknown>> {
  return await guardCall(fetcher, 'PUT', `${base(guardUrl)}/policies/${agent}`, policy)
}

export async function getVaultStatus (fetcher: Fetcher, guardUrl: string, vaultId: string): Promise<Record<string, unknown>> {
  return await guardCall(fetcher, 'GET', `${base(guardUrl)}/vaults/${vaultId}`)
}

export interface FundResult {
  txid: string
  vout: number
  satoshis: number
  /** AtomicBEEF: hand it to the agent (adoptVaultOutput). */
  tx: number[]
}

export async function fundVault (owner: WalletInterface, vault: VaultInfo, satoshis: number, originator?: string): Promise<FundResult> {
  if (!Number.isSafeInteger(satoshis) || satoshis < 1) throw new Error(`invalid amount: ${satoshis}`)
  const { vaultId } = vault.record
  const res = await owner.createAction({
    description: 'Fund AgentCoop vault',
    outputs: [
      { lockingScript: vault.lockingScriptHex, satoshis, outputDescription: 'AgentCoop vault', basket: VAULT_BASKET, customInstructions: ownerInstructions(vaultId), tags: [vaultTag(vaultId)] },
      { lockingScript: vaultRecordScript(vault.record).toHex(), satoshis: 0, outputDescription: 'AgentCoop vault record' }
    ],
    options: { randomizeOutputs: false, acceptDelayedBroadcast: false }
  }, originator)
  if (res.txid === undefined || res.tx === undefined) throw new Error('createAction returned no transaction')
  const vout = Transaction.fromAtomicBEEF(res.tx).outputs.findIndex(o => o.lockingScript.toHex() === vault.lockingScriptHex)
  if (vout < 0) throw new Error('vault output not found in the funding transaction')
  return { txid: res.txid, vout, satoshis, tx: Array.from(res.tx) }
}

export interface WithdrawResult {
  txid: string
  /** Sats taken out of the vault (before the miner fee). */
  satoshis: number
  inputs: string[]
  tx: number[]
}

/** Spend every given vault UTXO through the owner's branch; the wallet takes the sum (minus fee) as change. */
export async function withdrawVault (owner: WalletInterface, vault: VaultInfo, utxos: VaultUtxo[], originator?: string): Promise<WithdrawResult> {
  const mine = utxos.filter(u => u.lockingScriptHex === vault.lockingScriptHex)
  if (mine.length === 0) throw new Error('no UTXO of this vault to withdraw')
  if (new Set(mine.map(u => u.outpoint)).size !== mine.length) throw new Error('an outpoint appears twice')
  const beef = new Beef()
  for (const u of mine) beef.mergeBeef(u.beef)

  const created = await owner.createAction({
    description: 'Withdraw AgentCoop vault',
    inputBEEF: beef.toBinary(),
    inputs: mine.map(u => ({ outpoint: u.outpoint, unlockingScriptLength: VAULT_OWNER_UNLOCK_LENGTH, inputDescription: 'AgentCoop vault' })),
    outputs: [],
    options: { randomizeOutputs: false, acceptDelayedBroadcast: false, signAndProcess: false }
  }, originator)
  const signable = created.signableTransaction
  if (signable === undefined) throw new Error('createAction returned no signable transaction')
  try {
    const tx = Transaction.fromAtomicBEEF(signable.tx)
    const signer = new VaultOwnerSigner(owner, { vaultId: vault.record.vaultId, originator })
    const spends: Record<number, { unlockingScript: string }> = {}
    for (const u of mine) {
      const [txid, vout] = u.outpoint.split('.')
      const i = tx.inputs.findIndex(x => (x.sourceTXID ?? x.sourceTransaction?.id('hex')) === txid && x.sourceOutputIndex === Number(vout))
      if (i < 0) throw new Error(`input ${u.outpoint} missing from the signable transaction`)
      spends[i] = { unlockingScript: (await signer.sign(tx, i)).toHex() }
    }
    const signed = broadcastResult(await owner.signAction({ reference: signable.reference, spends }, originator))
    return { ...signed, satoshis: mine.reduce((s, u) => s + u.satoshis, 0), inputs: mine.map(u => u.outpoint) }
  } catch (e) {
    await owner.abortAction({ reference: signable.reference }, originator).catch(() => {})
    throw e
  }
}

/** Vault outputs the owner's own wallet tracks (its fundings). The guard's and the agent's spends are not visible here. */
export async function ownerBasketUtxos (owner: WalletInterface, vault: VaultInfo, originator?: string): Promise<VaultUtxo[]> {
  const { outputs, BEEF } = await owner.listOutputs({ basket: VAULT_BASKET, tags: [vaultTag(vault.record.vaultId)], include: 'entire transactions', limit: 1000 }, originator)
  if (BEEF === undefined) return []
  const beef = Array.from(BEEF)
  return outputs.filter(o => o.spendable).map(o => ({ outpoint: o.outpoint, satoshis: o.satoshis, lockingScriptHex: vault.lockingScriptHex, beef }))
}
