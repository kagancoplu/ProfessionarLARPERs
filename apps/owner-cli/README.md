# Owner CLI — Mandate Vault from BSV Desktop (Track D)

Run on the laptop where the owner's BSV Desktop is open and unlocked (mainnet). Each command shows Desktop approval windows.

```bash
cd apps/owner-cli && npm ci
npm run owner -- create-vault --agent agent-1                 # registers at GUARD_URL (BRC-103), writes data/vaults/<id>/vault.json
npm run owner -- policy <vaultId> --allow provider-api --max-pool 5000 --weekly 20000 --max-fee 500 --hot-daily 2000
npm run owner -- fund <vaultId> 20000                         # out0 vault coin, out1 OP_RETURN vault record
cd ../guard && npm run adopt -- agent-1 <vaultId>             # the agent takes the funding into its basket
npm run owner -- status                                       # chain balance (WhatsOnChain) + guard view
npm run owner -- withdraw <vaultId> [--outpoint txid.vout]    # owner branch: no guard, no agent
```

`withdraw` finds the vault's UTXOs on chain (WhatsOnChain by script hash) plus the Desktop basket, and builds their BEEF from Arcade, so it works even if the guard and the overlay are down. If WhatsOnChain has not indexed a fresh UTXO yet, pass it with `--outpoint`.

Names resolve through `config/identities.json`. Library: `src/vault-ops.ts` (tested in `apps/guard/test/vault.mockchain.test.ts`). Plan: [`plan/phases/D-P1.md`](../../plan/phases/D-P1.md).
