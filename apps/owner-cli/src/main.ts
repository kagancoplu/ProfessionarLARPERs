/**
 * Vault owner CLI (BSV Desktop). Run it where the owner's Desktop is open and unlocked.
 *
 *   npm run owner -- create-vault --agent agent-1 [--guard guard] [--guard-url http://localhost:8091]
 *   npm run owner -- policy <vaultId> --allow provider-api[,…] --max-pool 5000 --weekly 20000 --max-fee 500 [--hot-daily 2000]
 *   npm run owner -- fund <vaultId> <sats>             (> 100,000 sats needs --force)
 *   npm run owner -- withdraw <vaultId> [--outpoint txid.vout]… [--dry-run]
 *   npm run owner -- status [<vaultId>]
 *
 * Names (agent-1, guard, provider-api, …) resolve through config/identities.json.
 * Vault files: data/vaults/<vaultId>/vault.json; each funding leaves
 * data/vaults/<vaultId>/fund-<txid>.json for the agent (apps/guard: npm run adopt).
 * withdraw needs neither the guard nor the agent.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { AuthFetch, Utils } from '@agentcoop/core/sdk'
import { isVaultId } from '@agentcoop/core/scripts/vault'
import { connectDesktop, flag, loadIdentities, option, run, short } from '../../../scripts/lib/cli'
import { DATA_DIR, appOriginator, arcadeUrl, chain, wocTxUrl } from '../../../scripts/lib/env'
import { findVaultUtxos } from './chain'
import { createVault, fundVault, getVaultStatus, putPolicy, registerVault, withdrawVault, type VaultInfo } from './vault-ops'

const VAULTS_DIR = join(DATA_DIR, 'vaults')
const FUND_LIMIT = 100_000
const IDENTITY_RE = /^0[23][0-9a-f]{64}$/

const vaultDir = (vaultId: string): string => join(VAULTS_DIR, vaultId)

function loadVault (vaultId: string | undefined): VaultInfo {
  if (!isVaultId(vaultId)) throw new Error(`bad vaultId "${String(vaultId)}" (32 hex characters; see data/vaults/)`)
  const path = join(vaultDir(vaultId), 'vault.json')
  if (!existsSync(path)) throw new Error(`no ${path}: create the vault on this machine first`)
  return JSON.parse(readFileSync(path, 'utf8')) as VaultInfo
}

function resolveIdentity (nameOrKey: string): string {
  if (IDENTITY_RE.test(nameOrKey)) return nameOrKey
  const key = loadIdentities()[nameOrKey]
  if (key === undefined) throw new Error(`unknown party "${nameOrKey}": not an identity key and not in config/identities.json`)
  return key
}

function sats (args: string[], name: string, required = true): number {
  const v = option(args, name)
  if (v === undefined) {
    if (required) throw new Error(`missing ${name} <sats>`)
    return 0
  }
  const n = Number(v)
  if (!Number.isSafeInteger(n) || n < 0) throw new Error(`${name} must be whole sats, got "${v}"`)
  return n
}

const options = (args: string[], name: string): string[] => args.flatMap((a, i) => a === name && args[i + 1] !== undefined ? [args[i + 1]] : [])
const guardUrlOf = (args: string[], vault?: VaultInfo): string => option(args, '--guard-url') ?? vault?.guardUrl ?? process.env.GUARD_URL ?? 'http://localhost:8091'

run(async () => {
  const [command, ...args] = process.argv.slice(2)
  const originator = appOriginator()

  switch (command) {
    case 'create-vault': {
      const agent = resolveIdentity(option(args, '--agent') ?? '')
      const guard = resolveIdentity(option(args, '--guard') ?? 'guard')
      const guardUrl = guardUrlOf(args)
      const { wallet } = await connectDesktop()
      const vault = await createVault(wallet, { agent, guard, guardUrl, originator })
      await registerVault(new AuthFetch(wallet, undefined, undefined, originator), guardUrl, vault)
      mkdirSync(vaultDir(vault.record.vaultId), { recursive: true })
      writeFileSync(join(vaultDir(vault.record.vaultId), 'vault.json'), JSON.stringify(vault, null, 2))
      console.log(`✓ vault ${vault.record.vaultId} registered at ${guardUrl}`)
      console.log(`  owner ${short(vault.record.owner)} · agent ${short(agent)} · guard ${short(guard)}`)
      console.log(`  script ${vault.lockingScriptHex}`)
      console.log(`  next: npm run owner -- policy ${vault.record.vaultId} --allow <provider> --max-pool … --weekly … --max-fee …`)
      return
    }

    case 'policy': {
      const vault = loadVault(args[0])
      const allow = (option(args, '--allow') ?? '').split(',').filter(s => s !== '').map(resolveIdentity)
      const policy = { allowProviders: allow, maxPerPoolSats: sats(args, '--max-pool'), weeklyCapSats: sats(args, '--weekly'), maxFeeSats: sats(args, '--max-fee'), hotWalletDailySats: sats(args, '--hot-daily', false) }
      const { wallet } = await connectDesktop()
      await putPolicy(new AuthFetch(wallet, undefined, undefined, originator), guardUrlOf(args, vault), vault.record.agent, policy)
      console.log(`✓ policy for agent ${short(vault.record.agent)}: ${JSON.stringify(policy)}`)
      return
    }

    case 'fund': {
      const vault = loadVault(args[0])
      const amount = Number(args[1])
      if (!Number.isSafeInteger(amount) || amount < 1) throw new Error('usage: fund <vaultId> <sats>')
      if (amount > FUND_LIMIT && !flag(args, '--force')) throw new Error(`${amount} sats is above ${FUND_LIMIT}; pass --force if intended`)
      const { wallet } = await connectDesktop()
      const f = await fundVault(wallet, vault, amount, originator)
      const handoff = join(vaultDir(vault.record.vaultId), `fund-${f.txid}.json`)
      writeFileSync(handoff, JSON.stringify({ vaultId: vault.record.vaultId, txid: f.txid, vout: f.vout, satoshis: f.satoshis, tx: Utils.toHex(f.tx) }, null, 2))
      console.log(`✓ funded ${amount} sats → ${wocTxUrl(f.txid)}`)
      console.log(`  agent hand-off: ${handoff} (apps/guard: npm run adopt -- <agent> ${vault.record.vaultId})`)
      console.log(`  STATUS: | ${new Date().toISOString().slice(0, 16)} | T9 vault fund | ${f.txid} | D | ${amount} sats |`)
      return
    }

    case 'withdraw': {
      const vault = loadVault(args[0])
      const { wallet } = await connectDesktop()
      const { utxos, notes } = await findVaultUtxos(wallet, vault, { network: chain(), arcadeUrl: arcadeUrl(), outpoints: options(args, '--outpoint'), originator })
      for (const n of notes) console.log(`  note: ${n}`)
      const total = utxos.reduce((s, u) => s + u.satoshis, 0)
      console.log(`Vault ${vault.record.vaultId}: ${utxos.length} UTXO(s), ${total} sats`)
      for (const u of utxos) console.log(`  ${u.outpoint}  ${u.satoshis}`)
      if (utxos.length === 0 || flag(args, '--dry-run')) return
      const w = await withdrawVault(wallet, vault, utxos, originator)
      console.log(`✓ withdrew ${w.satoshis} sats (owner branch, no guard) → ${wocTxUrl(w.txid)}`)
      console.log(`  STATUS: | ${new Date().toISOString().slice(0, 16)} | T9 vault withdraw | ${w.txid} | D | ${w.satoshis} sats |`)
      return
    }

    case 'status': {
      const ids = args[0] !== undefined ? [args[0]] : (existsSync(VAULTS_DIR) ? readdirSync(VAULTS_DIR).filter(isVaultId) : [])
      if (ids.length === 0) { console.log('no vaults in data/vaults/'); return }
      const { wallet } = await connectDesktop()
      for (const id of ids) {
        const vault = loadVault(id)
        console.log(`Vault ${id} · agent ${short(vault.record.agent)} · guard ${short(vault.record.guard)}`)
        const { utxos, notes } = await findVaultUtxos(wallet, vault, { network: chain(), arcadeUrl: arcadeUrl(), originator })
        console.log(`  on chain: ${utxos.reduce((s, u) => s + u.satoshis, 0)} sats in ${utxos.length} UTXO(s)`)
        for (const n of notes) console.log(`  note: ${n}`)
        try {
          const s = await getVaultStatus(new AuthFetch(wallet, undefined, undefined, originator), guardUrlOf(args, vault), id)
          console.log(`  guard: spent ${String(s.spentLast7dSats)} sats in 7 days · policy ${JSON.stringify(s.policy)}`)
        } catch (e) {
          console.log(`  guard: unreachable (${(e as Error).message}); withdraw still works without it`)
        }
      }
      return
    }

    default:
      throw new Error('usage: npm run owner -- <create-vault | policy | fund | withdraw | status> … (see apps/owner-cli/src/main.ts)')
  }
})
