/**
 * npm run adopt -- <agent-name> <vaultId>
 *
 * Takes the owner's vault fundings (data/vaults/<vaultId>/fund-*.json, written by
 * the owner CLI) into the agent's `agentcoop vault` basket, so the agent can
 * spend them with the guard. Adopted files move to data/vaults/<vaultId>/adopted/.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync } from 'node:fs'
import { join } from 'node:path'
import { Utils } from '@agentcoop/core/sdk'
import { isVaultId } from '@agentcoop/core/scripts/vault'
import { adoptVaultOutput, listVaultUtxos } from '@agentcoop/core/signers/VaultSigner'
import { run } from '../../../scripts/lib/cli'
import { DATA_DIR } from '../../../scripts/lib/env'
import { openWallet } from '../../../scripts/wallets'

run(async () => {
  const [name, vaultId] = process.argv.slice(2)
  if (name === undefined || !isVaultId(vaultId)) throw new Error('usage: npm run adopt -- <agent-name> <vaultId>')
  const dir = join(DATA_DIR, 'vaults', vaultId)
  const files = existsSync(dir) ? readdirSync(dir).filter(f => /^fund-[0-9a-f]{64}\.json$/.test(f)) : []
  const { wallet, close } = await openWallet(name)
  try {
    for (const f of files) {
      const h = JSON.parse(readFileSync(join(dir, f), 'utf8')) as { vaultId: string, txid: string, vout: number, satoshis: number, tx: string }
      if (h.vaultId !== vaultId) throw new Error(`${f} belongs to vault ${h.vaultId}`)
      await adoptVaultOutput(wallet, vaultId, Utils.toArray(h.tx, 'hex'), h.vout)
      mkdirSync(join(dir, 'adopted'), { recursive: true })
      renameSync(join(dir, f), join(dir, 'adopted', f))
      console.log(`✓ adopted ${h.txid}.${h.vout} (${h.satoshis} sats)`)
    }
    const utxos = await listVaultUtxos(wallet, vaultId)
    console.log(`${name} vault ${vaultId}: ${utxos.reduce((s, u) => s + u.satoshis, 0)} sats in ${utxos.length} UTXO(s)`)
  } finally {
    await close()
  }
})
