# @agentcoop/owner-cli: Mandate Vault from BSV Desktop

Creates, funds and empties an agent's Mandate Vault and writes the guard policy, with every signature approved in the owner's BSV Desktop ([docs/concepts/mandate-vault.md](../../docs/concepts/mandate-vault.md)). The web app's owner console does the same in a browser.

Run on the laptop where the owner's BSV Desktop is open and unlocked (mainnet). Each command shows Desktop approval windows.

```bash
npm install                                                   # repo root (workspace); then from apps/owner-cli:
npm run owner -w apps/owner-cli -- create-vault --agent agent-1                 # registers at GUARD_URL (BRC-103), writes data/vaults/<id>/vault.json
npm run owner -w apps/owner-cli -- policy <vaultId> --allow provider-api --max-pool 5000 --weekly 20000 --max-fee 500 --hot-daily 2000
npm run owner -w apps/owner-cli -- fund <vaultId> 20000                         # out0 vault coin, out1 OP_RETURN vault record
npm run adopt -w @agentcoop/guard -- agent-1 <vaultId>        # the agent takes the funding into its basket
npm run owner -w apps/owner-cli -- status                                       # chain balance (WhatsOnChain) + guard view
npm run owner -w apps/owner-cli -- withdraw <vaultId> [--outpoint txid.vout]    # owner branch: no guard, no agent
```

`withdraw` takes **every** UTXO of the vault (it empties the vault; `--outpoint` adds a UTXO WhatsOnChain has not indexed yet, it does not pick one). It finds the vault's UTXOs on chain (WhatsOnChain by script hash) plus the Desktop basket, and builds their BEEF from Arcade, so it works even if the guard and the overlay are down. If WhatsOnChain has not indexed a fresh UTXO yet, pass it with `--outpoint`.

Names resolve through `config/identities.json`. Library: `apps/owner-cli/src/vault-ops.ts` (tested in `test/vault.mockchain.test.ts`). These commands spend real satoshis on mainnet.
