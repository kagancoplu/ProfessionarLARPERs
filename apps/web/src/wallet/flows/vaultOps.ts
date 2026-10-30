/**
 * Owner-side vault operations for the browser (mirrors Track D's apps/owner-cli/src/vault-ops.ts, which is
 * not a workspace export; same core primitives, same results). The owner's keys stay in BSV Desktop.
 *   createVault    vaultId + keys + script, the owner's key from its own wallet
 *   registerVault  PUT {guard}/vaults/:id over BRC-103; the guard must derive the very same script
 *   fundVault      out0 = vault coin, out1 = OP_RETURN vault record (T9)
 *   withdrawVault  the OP_IF branch: every vault UTXO back to the owner, without the guard or the agent
 */
import { Beef, Transaction, type WalletInterface } from '@agentcoop/core/sdk'
import { VAULT_BASKET, VAULT_PROTOCOL } from '@agentcoop/core'
import { VAULT_OWNER_UNLOCK_LENGTH, deriveVaultPub, newVaultId, validateVaultRecord, vaultKeysForRecord, vaultLockingScript, vaultRecordScript, type VaultRecord } from '@agentcoop/core/scripts/vault'
import { VaultOwnerSigner, broadcastResult, vaultTag, type VaultUtxo } from '@agentcoop/core/signers/VaultSigner'
import type { MyVault } from './types'

export interface Fetcher { fetch: (url: string, init?: { method?: string, headers?: Record<string, string>, body?: string }) => Promise<Response> }

const ownerInstructions = (vaultId: string): string => JSON.stringify({ vaultId, role: 'owner', protocolID: VAULT_PROTOCOL, keyID: vaultId, counterparty: 'anyone' })

export async function createVault (owner: WalletInterface, args: { agent: string, guard: string, vaultId?: string }): Promise<MyVault> {
  const { publicKey: identity } = await owner.getPublicKey({ identityKey: true })
  const vaultId = args.vaultId ?? newVaultId()
  const record: VaultRecord | null = validateVaultRecord({ v: '1', vaultId, owner: identity, agent: args.agent, guard: args.guard })
  if (record === null) throw new Error('invalid vault: owner, agent and guard must be three different identity keys')
  const { publicKey: ownerPub } = await owner.getPublicKey({ protocolID: VAULT_PROTOCOL, keyID: vaultId, counterparty: 'anyone', forSelf: true })
  if (ownerPub !== deriveVaultPub(identity, vaultId)) throw new Error('BSV Desktop derives a different vault key than your identity key implies')
  const keys = vaultKeysForRecord(record)
  return { vaultId, agent: args.agent, guard: args.guard, lockingScriptHex: vaultLockingScript(keys.ownerPub, keys.agentPub, keys.guardPub).toHex(), record: { v: '1', vaultId, owner: identity, agent: args.agent, guard: args.guard }, createdAt: new Date().toISOString(), fundedSats: 0 }
}

async function guardCall (fetcher: Fetcher, method: string, url: string, body?: unknown): Promise<Record<string, unknown>> {
  const res = await fetcher.fetch(url, { method, headers: { 'content-type': 'application/json' }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) })
  const json = await res.json().catch(() => ({})) as Record<string, unknown>
  if (!res.ok) throw new Error(`guard ${method} ${new URL(url).pathname} → ${res.status} ${String(json.reason ?? '')}`.trim())
  return json
}

export async function registerVault (fetcher: Fetcher, guardUrl: string, vault: MyVault): Promise<void> {
  const res = await guardCall(fetcher, 'PUT', `${guardUrl.replace(/\/+$/, '')}/vaults/${vault.vaultId}`, vault.record)
  if (res.lockingScriptHex !== vault.lockingScriptHex) throw new Error('the guard derived a different vault script: do not fund this vault')
}

export async function fundVault (owner: WalletInterface, vault: MyVault, satoshis: number): Promise<{ txid: string, vout: number, tx: number[] }> {
  if (!Number.isSafeInteger(satoshis) || satoshis < 1) throw new Error(`invalid amount: ${satoshis}`)
  const res = await owner.createAction({
    description: 'Fund AgentCoop vault',
    outputs: [
      { lockingScript: vault.lockingScriptHex, satoshis, outputDescription: 'AgentCoop vault', basket: VAULT_BASKET, customInstructions: ownerInstructions(vault.vaultId), tags: [vaultTag(vault.vaultId)] },
      { lockingScript: vaultRecordScript(vault.record).toHex(), satoshis: 0, outputDescription: 'AgentCoop vault record' }
    ],
    options: { randomizeOutputs: false, acceptDelayedBroadcast: false }
  })
  if (res.txid === undefined || res.tx === undefined) throw new Error('createAction returned no transaction')
  const vout = Transaction.fromAtomicBEEF(res.tx).outputs.findIndex(o => o.lockingScript.toHex() === vault.lockingScriptHex)
  if (vout < 0) throw new Error('vault output not found in the funding transaction')
  return { txid: res.txid, vout, tx: Array.from(res.tx) }
}

/** Vault outputs the owner's own wallet tracks (its fundings). */
export async function ownerBasketUtxos (owner: WalletInterface, vault: MyVault): Promise<VaultUtxo[]> {
  const { outputs, BEEF } = await owner.listOutputs({ basket: VAULT_BASKET, tags: [vaultTag(vault.vaultId)], include: 'entire transactions', limit: 1000 })
  if (BEEF === undefined) return []
  const beef = Array.from(BEEF)
  return outputs.filter(o => o.spendable).map(o => ({ outpoint: o.outpoint, satoshis: o.satoshis, lockingScriptHex: vault.lockingScriptHex, beef }))
}

export async function withdrawVault (owner: WalletInterface, vault: MyVault, utxos: VaultUtxo[]): Promise<{ txid: string, satoshis: number }> {
  const mine = utxos.filter(u => u.lockingScriptHex === vault.lockingScriptHex)
  if (mine.length === 0) throw new Error('no UTXO of this vault to withdraw')
  const beef = new Beef()
  for (const u of mine) beef.mergeBeef(u.beef)
  const created = await owner.createAction({
    description: 'Withdraw AgentCoop vault', inputBEEF: beef.toBinary(),
    inputs: mine.map(u => ({ outpoint: u.outpoint, unlockingScriptLength: VAULT_OWNER_UNLOCK_LENGTH, inputDescription: 'AgentCoop vault' })),
    outputs: [], options: { randomizeOutputs: false, acceptDelayedBroadcast: false, signAndProcess: false }
  })
  const signable = created.signableTransaction
  if (signable === undefined) throw new Error('createAction returned no signable transaction')
  try {
    const tx = Transaction.fromAtomicBEEF(signable.tx)
    const signer = new VaultOwnerSigner(owner, { vaultId: vault.vaultId })
    const spends: Record<number, { unlockingScript: string }> = {}
    for (const u of mine) {
      const [txid, vout] = u.outpoint.split('.')
      const i = tx.inputs.findIndex(x => (x.sourceTXID ?? x.sourceTransaction?.id('hex')) === txid && x.sourceOutputIndex === Number(vout))
      if (i < 0) throw new Error(`input ${u.outpoint} missing from the signable transaction`)
      spends[i] = { unlockingScript: (await signer.sign(tx, i)).toHex() }
    }
    const signed = broadcastResult(await owner.signAction({ reference: signable.reference, spends }))
    return { txid: signed.txid, satoshis: mine.reduce((s, u) => s + u.satoshis, 0) }
  } catch (e) {
    await owner.abortAction({ reference: signable.reference }).catch(() => {})
    throw e
  }
}
