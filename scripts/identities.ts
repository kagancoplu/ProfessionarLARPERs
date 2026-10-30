/**
 * Write the public identity keys to config/identities.json (committed).
 *
 *   npx tsx scripts/identities.ts                        # every server wallet with a key in .env
 *   npx tsx scripts/identities.ts --desktop desktop-owner # the BSV Desktop running on this machine
 *
 * Server wallets are opened with openWallet(), which also creates their
 * data/wallets/<name>.sqlite, so this doubles as a smoke test of the setup.
 */
import { WALLET_NAMES, hasKey, keyVar } from './lib/env'
import { connectDesktop, loadIdentities, option, run, saveIdentities, short, IDENTITIES_FILE } from './lib/cli'
import { openWallet } from './wallets'

run(async () => {
  const args = process.argv.slice(2)
  const ids = loadIdentities()
  const desktopName = option(args, '--desktop')

  if (desktopName !== undefined) {
    if (!/^desktop-[a-z0-9-]+$/.test(desktopName)) throw new Error('Desktop names start with "desktop-", e.g. desktop-treasury, desktop-owner, desktop-human')
    const { identityKey } = await connectDesktop()
    ids[desktopName] = identityKey
    saveIdentities(ids)
    console.log(`${desktopName.padEnd(18)} ${identityKey}`)
    console.log(`→ ${IDENTITIES_FILE}`)
    return
  }

  for (const name of WALLET_NAMES) {
    if (!hasKey(name)) { console.log(`${name.padEnd(18)} – (${keyVar(name)} missing in .env)`); continue }
    const w = await openWallet(name)
    try {
      const { publicKey } = await w.wallet.getPublicKey({ identityKey: true })
      if (publicKey !== w.identityKey) throw new Error(`${name}: wallet identity does not match its key`)
      ids[name] = publicKey
      console.log(`${name.padEnd(18)} ${short(publicKey)}  data/wallets/${name}.sqlite`)
    } finally {
      await w.close()
    }
  }
  saveIdentities(ids)
  console.log(`→ ${IDENTITIES_FILE}`)
})
