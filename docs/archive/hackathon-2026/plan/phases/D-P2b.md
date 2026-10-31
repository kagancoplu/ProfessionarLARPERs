# D-P2b — Spending vault-locked credits: signer, guard `redeem` / `list`, basket

> Track D. A's request of 30.10 21:30 (STATUS "Interface changes" A → B, D, C; `plan/track-A-protocol.md` phase 5.4). A 5.1–5.3 locked the credits to the vault script (`creditLock: 'vault'`); **spending** them (redeem, listing) needs agent + guard and cannot happen without the guard's policy. This phase is D's share; the transaction builders (`src/vault/creditSpend.ts`) are A's. When done, FINAL-IDEA §8 / `docs/THREAT-MODEL.md` T-10 becomes "Closed".
> User decision (30.10 ~22:00): do it now. First `git pull` + STATUS. Another D session works on the same branch: before starting, no commit on `origin/trackD` takes this work (checked).

## 1. The vault credit output (A 5.1)

`OP_FALSE OP_IF "ord" OP_1 "application/bsv-20" OP_0 <json> OP_ENDIF` + the vault script (109 B). The unlock is the vault's (the envelope is a no-op); the sighash subscript is the **whole** locking script (envelope included): `vaultSighash` already uses the source's full script.

## 2. Signer (`packages/core/src/signers/VaultSigner.ts`, `scripts/vault.ts`)

- `VaultSigner` / `VaultOwnerSigner`: the input's keys via `vaultKeysOfScript` (A): a plain vault output **or** a vault credit. Today a credit input is refused with "not a vault output".
- The sighash scope becomes a parameter: `vaultSighash(tx, i, scope = ALL|FORKID)`, `toChecksigSignature(der, scope)`, `verifyVaultSignature(pub, h, sig, scope)`; defaults unchanged (existing calls unchanged). `VaultSignerOptions.scope?` (`SINGLE|ANYONECANPAY|FORKID` = 0xC3 for a listing).
- `'redeem' | 'list'` added to `CosignKind`; `CosignContext.creditPayees?: [{ vout, provider, index }]` (proof of the redeem recipient).
- Basket: `VAULT_CREDITS_BASKET = 'agentcoop vault credits'`, `adoptVaultCredits(wallet, vaultId, tx, vout)` (only this vault's credits accepted), `listVaultCredits(wallet, vaultId)` → `{ outpoint, satoshis, lockingScriptHex, tokenId, amount, beef }`. Separate from the vault's sats basket: `spendFromVault` never picks a credit UTXO for fees.

## 3. Guard `kind: 'redeem'` (ALL; a spend or a split inside the vault)

Input `i` = credits of a registered vault of this agent (`decodeBsv21Owned` → owner vault script = the registered script), one input from that vault in the tx. No BSV-21 in the other inputs (only the agent's fee sats).
- **C1** G1, G4, G5 (sighash ALL), G6 as before.
- **C2** Credit outputs of two kinds only: (a) a transfer to an **allowed provider** proven by `creditPayees`: `ownerPkh = receivePkh(provider, index)`, `provider ∈ allowProviders`; (b) credits locked to **the same vault** (change / split). Any other BSV-21 output → `credits to unlisted output`.
- **C3** Conservation: Σ output credits = input credits, same `tokenId` (no burning either) → `credits not conserved`.
- **C4** Sats as in `pay`: sats back to the vault are the vault's return, unproven outputs ≤ the agent's own inputs (G9), fee ≤ `maxFeeSats` (G10), outflow against the weekly cap (G12; only the credit outputs' 1 sat each).
- A redeem without payees = a split/merge inside the vault (splitting off a lot before a listing).

Note: `allowProviders` holds the pool provider's identity; the redeem address is provider-api's identity (`/v1/catalog` `credits.redeemTo`). The owner puts both on the allowlist.

## 4. Guard `kind: 'list'` (SINGLE|ANYONECANPAY|FORKID)

Tx = the listing skeleton: input `i` the vault credits (as in C1), **the output at the same index** the sale proceeds. Guard and agent sign the same 0xC3 sighash (the buyer adds other inputs/outputs when sweeping; the same logic as A 2.3's `SINGLE|ACP` listings).
- **L1** Output `i` = **this vault's script** (the proceeds land in the vault, not with the agent) → otherwise `listing proceeds must go to the vault`.
- **L2** Policy `minAskSatsPerCredit` (new, optional field); without it **listing is off** (`listing not enabled by the owner`, default deny). Proceeds ≥ credits × `minAskSatsPerCredit` → otherwise `ask below minAskSatsPerCredit`.
- **L3** Final (G4); the agent's signature on the 0xC3 sighash (G5 with its scope).
- Ledger: no outflow (the proceeds come into the vault); written to the decision log as `list`.

## 5. Interface (MASTER §3.7, MASTER first then STATUS)

- `/cosign` `context.kind`: `'pay' | 'settle' | 'rail' | 'redeem' | 'list'`; `creditPayees` (redeem). For a listing request the agent's and the guard's signatures are 0xC3.
- Policy: optional `minAskSatsPerCredit` (sats, integer); old policies stay valid.

## 6. Tests (`test/vault-credits.spend.mockchain.test.ts`, real guard, mock chain)

1. Setup: owner vault + policy; a 20-credit deploy+mint locked to the vault (lineage root), the agent takes it into its basket (`adoptVaultCredits`, refuses another vault's).
2. Redeem: 5 credits to an allowed provider's `receivePkh` + 15 credits to the same vault → ALLOW, the chain accepts (the mock chain verifies scripts).
3. Redeem refusals: a provider not allowed, an unproven P2PKH (the agent's own address = guard bypass), burning (conservation), credits locked to another vault.
4. Split: a redeem without payees (10 + 5 to the same vault) → ALLOW.
5. Listing: refused without a policy; refused if the proceeds go to the agent; refused under the floor; a valid listing (0xC3) → a buyer sweeps it (its own input + the credit output to itself) → the chain accepts, the proceeds in the vault.
6. The owner withdraws the vault credits without the guard (`VaultOwnerSigner`, `vaultKeysOfScript`).
7. Regression: the existing guard/vault tests green unchanged.

## 7. Acceptance

Tests green; root `npm test` + typecheck clean; MASTER §3.7 and STATUS (D → A, C) current; `docs/THREAT-MODEL.md` T-10 "Closed (mock chain)" + C/L rows in the guard table.

## 8. Checkpoint (30.10 ~22:45)

1. **Is the plan still good?** Yes. One deviation: in the in-test builder, credit outputs going back to the vault are put into the `agentcoop vault credits` basket at `createAction` time; an output of the agent's own transaction cannot be taken in later with `internalizeAction` (wallet-toolbox). **A's `creditSpend.ts` should do the same** (the same pattern as `spendFromVault`'s vault change). The listing skeleton's input must carry an empty unlocking script, otherwise the `txBEEF` sent to the guard does not serialize.
2. **Done:** signer (`vaultKeysOfScript`, `scope`), scope parameters in `scripts/vault.ts` (defaults unchanged), `adoptVaultCredits`/`listVaultCredits`, guard `apps/guard/src/credits.ts` (`redeem` C1–C4, `list` L1–L3), policy `minAskSatsPerCredit` (optional; owner-cli `--min-ask`), credit movement in the decision log. Test `test/vault-credits.spend.mockchain.test.ts` 7/7: setup + refusal of another vault's credits; redeem 5 to the provider + 15 to the vault, the chain accepts; refusals (provider not allowed, the agent's own address, a fake proof, burning, another vault); a split inside the vault; listing refusals (no floor, proceeds to the agent, under the floor); a buyer completes the listing with its own inputs (the SINGLE|ACP signatures are valid on chain, 200 sat in the vault); the owner withdraws the credits alone.
3. **Other tracks:** A 5.4 writes the `creditSpend.ts` builders for these guard kinds; C: `/v1/credits/return` sends credits redeemed from a vault to the agent's P2PKH (the bounded indirect path in T-10) → they must go back to the vault. In STATUS as D → A, C.
4. **Next:** S3 still not done; no sats/laptop for mainnet. Ask the user.
5. **Interface change:** MASTER §3.7 (`kind: 'redeem' | 'list'`, `creditPayees`, `minAskSatsPerCredit`, 0xC3) updated; in STATUS "Interface changes" as D → A, C.

## 9. Addendum: merging with A 5.4 (30.10 ~23:40, user decision)

A 5.4 (`src/vault/creditSpend.ts`) was written without seeing D-P2b: in `list` it moved the credits to the agent's listing key (P2PKH), and in `redeem` it sent no recipient proof. User decision: **D's guard rules stand, A adapts.** In the merge: `VaultSigner.ts` is D's version (A's changes were a subset of it); one basket constant (`types.ts`) with A's tags (`id:`, `amt:`); the guard gives an explicit reason for a `list`/`redeem` request signed with the wrong scope. New test: A's `transferVaultCredits` with the real guard (`redeem` + `creditPayees` passes; without a proof, and a "listing" to a P2PKH, refused; A's `listVaultCredits` reads D's record). STATUS D → A.
