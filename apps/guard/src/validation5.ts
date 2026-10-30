/**
 * Validation test 5 (FINAL-IDEA §12.1, plan/phases/D-P1.md §9.3): does the vault
 * script (bare 2-of-2 multisig inside OP_IF) pass mainnet policy? ≤ 1,000 sats.
 *
 *   owner     BSV Desktop on this machine (treasury), via real BRC-103 to the guard
 *   agent     agent-1 (pays the miner fee from its own wallet: needs ~100 sats, F1)
 *   guard     guard wallet, HTTP server in this process (state: data/guard-validation5/)
 *   provider  provider-api (allowed); coordinator's revenue key stands in for a provider that is not
 *
 *   1. create + register vault, policy (maxPerPool 500, weekly 1000, maxFee 200)
 *   2. T9   fund 1,000 sats                          → txid
 *   3. 403  pay 300 to a provider not in the policy  → nothing signed, nothing broadcast
 *   4. T10  agent + guard pay 300 to provider-api    → txid (provider-api keeps the output)
 *   5. T9   owner withdraws the 700 change alone     → txid
 *
 * cd apps/guard && npm run validation5
 */
import type { AddressInfo } from 'node:net'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { AuthFetch, Transaction } from '@agentcoop/core/sdk'
import { PROVIDER_PROTOCOL } from '@agentcoop/core'
import { providerPayScript } from '@agentcoop/core/scripts/vault'
import { CosignRejected, adoptVaultOutput, httpCosigner, spendFromVault } from '@agentcoop/core/signers/VaultSigner'
import { connectDesktop, loadIdentities, run, short } from '../../../scripts/lib/cli'
import { DATA_DIR, appOriginator, chain, wocTxUrl } from '../../../scripts/lib/env'
import { poolBalance } from '../../../scripts/lib/funding'
import { openWallet } from '../../../scripts/wallets'
import { createVault, fundVault, putPolicy, registerVault, withdrawVault } from '../../owner-cli/src/vault-ops'
import { Guard } from './guard'
import { createGuardApp } from './server'
import { GuardStore } from './store'

const FUND = 1_000
const PAY = 300
const KEY_ID = 'validation5'

run(async () => {
  const originator = appOriginator()
  const ids = loadIdentities()
  if (ids.coordinator === undefined) throw new Error('config/identities.json has no coordinator')
  const rows: string[] = []
  const stamp = (): string => new Date().toISOString().slice(0, 16)

  const { wallet: desktop, identityKey: ownerId } = await connectDesktop()
  const agent = await openWallet('agent-1')
  const guardW = await openWallet('guard')
  const provider = await openWallet('provider-api')
  const server = await (async () => {
    const guard = await Guard.create({ wallet: guardW.wallet, store: new GuardStore(join(DATA_DIR, 'guard-validation5')) })
    return createGuardApp(guard, guardW.wallet, { network: chain() }).listen(0)
  })()
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  try {
    const fee = (await poolBalance(agent.wallet)).spendableSatoshis
    if (fee < 100) throw new Error(`agent-1 has ${fee} sats; it pays the miner fee of the 2-of-2 spend: run scripts/fund.ts agent-1=1000 first (F1)`)
    console.log(`network ${chain()} · owner (Desktop) ${short(ownerId)} · agent-1 ${short(agent.identityKey)} · guard ${short(guardW.identityKey)} · provider-api ${short(provider.identityKey)}`)

    // 1. vault + policy (Desktop approves the BRC-103 handshake and the vault key)
    const auth = new AuthFetch(desktop, undefined, undefined, originator)
    const vault = await createVault(desktop, { agent: agent.identityKey, guard: guardW.identityKey, guardUrl: url, originator })
    await registerVault(auth, url, vault)
    await putPolicy(auth, url, agent.identityKey, { allowProviders: [provider.identityKey], maxPerPoolSats: 500, weeklyCapSats: 1_000, maxFeeSats: 200, hotWalletDailySats: 0 })
    const dir = join(DATA_DIR, 'vaults', vault.record.vaultId)
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'vault.json'), JSON.stringify(vault, null, 2))
    console.log(`1. vault ${vault.record.vaultId} registered, policy set`)

    // 2. T9 fund
    const f = await fundVault(desktop, vault, FUND, originator)
    rows.push(`| ${stamp()} | T9 vault fund (test 5) | ${f.txid} | D | ${FUND} sats, OP_RETURN vault |`)
    console.log(`2. funded ${FUND} → ${wocTxUrl(f.txid)}`)
    await adoptVaultOutput(agent.wallet, vault.record.vaultId, f.tx, f.vout)
    const utxo = { outpoint: `${f.txid}.${f.vout}`, satoshis: FUND, lockingScriptHex: vault.lockingScriptHex, beef: f.tx }
    const cosign = httpCosigner(url)

    // 3. refusal: provider not in the policy
    try {
      await spendFromVault(agent.wallet, {
        vaultId: vault.record.vaultId, utxo, cosign,
        outputs: [{ lockingScript: providerPayScript(ids.coordinator, KEY_ID).toHex(), satoshis: PAY, payee: { provider: ids.coordinator, keyID: KEY_ID } }]
      })
      throw new Error('the guard signed a payment to a provider outside the policy')
    } catch (e) {
      if (!(e instanceof CosignRejected)) throw e
      console.log(`3. guard refused (${e.status}): ${e.reason} — nothing broadcast`)
    }

    // 4. T10 agent + guard
    const p = await spendFromVault(agent.wallet, {
      vaultId: vault.record.vaultId, utxo, cosign,
      outputs: [{ lockingScript: providerPayScript(provider.identityKey, KEY_ID).toHex(), satoshis: PAY, payee: { provider: provider.identityKey, keyID: KEY_ID } }]
    })
    rows.push(`| ${stamp()} | T10 vault 2-of-2 pay (test 5) | ${p.txid} | D | ${PAY} → provider-api, ${FUND - PAY} back to the vault |`)
    console.log(`4. agent + guard paid ${PAY} → ${wocTxUrl(p.txid)}`)
    const payVout = Transaction.fromAtomicBEEF(p.tx).outputs.findIndex(o => o.lockingScript.toHex() === providerPayScript(provider.identityKey, KEY_ID).toHex())
    await provider.wallet.internalizeAction({
      tx: p.tx,
      outputs: [{ outputIndex: payVout, protocol: 'basket insertion', insertionRemittance: { basket: 'agentcoop revenue', customInstructions: JSON.stringify({ protocolID: PROVIDER_PROTOCOL, keyID: KEY_ID, counterparty: 'anyone' }), tags: ['validation5'] } }],
      description: 'AgentCoop test 5 revenue'
    })

    // 5. T9 owner withdraw (no guard, no agent)
    const change = { outpoint: `${p.txid}.${p.changeVout!}`, satoshis: FUND - PAY, lockingScriptHex: vault.lockingScriptHex, beef: p.tx }
    const w = await withdrawVault(desktop, vault, [change], originator)
    rows.push(`| ${stamp()} | T9 vault owner withdraw (test 5) | ${w.txid} | D | ${w.satoshis} sats, OP_IF branch |`)
    console.log(`5. owner withdrew ${w.satoshis} → ${wocTxUrl(w.txid)}`)

    console.log('\n✓ validation test 5 passed. Add to plan/STATUS.md → "Mainnet işlemleri":')
    for (const r of rows) console.log(r)
  } catch (e) {
    if (rows.length > 0) { console.log('\nPartial run, record these in plan/STATUS.md:'); for (const r of rows) console.log(r) }
    throw e
  } finally {
    server.close()
    await Promise.all([agent.close(), guardW.close(), provider.close()])
  }
})
