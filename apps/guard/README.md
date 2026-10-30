# Guard — Mandate Vault policy engine and co-signer (Track D)

An agent's budget sits in a vault output:

```
OP_IF <ownerPub> OP_CHECKSIG OP_ELSE OP_2 <agentPub> <guardPub> OP_2 OP_CHECKMULTISIG OP_ENDIF
```

- **Owner** (BSV Desktop) withdraws alone, at any time, without the guard or the agent.
- **Agent + guard** spend together. The guard signs only after its policy checks pass.
- Neither the guard nor the agent can move the funds alone (the chain enforces the 2-of-2).

Plan and design: [`plan/phases/D-P1.md`](../../plan/phases/D-P1.md). Script and signers: [`packages/core/src/scripts/vault.ts`](../../packages/core/src/scripts/vault.ts), [`packages/core/src/signers/VaultSigner.ts`](../../packages/core/src/signers/VaultSigner.ts). Owner CLI: [`apps/owner-cli`](../owner-cli).

## Run

```bash
cd apps/guard && npm ci
npm test                 # script, policy engine, and the full vault flow on the mock chain
npm run typecheck        # guard + packages/core vault files + owner-cli
npm run guard            # GUARD_URL port (default 8091); wallet WALLET_GUARD_KEY; state data/guard/
```

CommonJS package on purpose (wallet-toolbox is CJS, MASTER §3.1). Until the root workspace exists, `tsconfig.json` `paths` makes `packages/core/src` and `scripts/` load this package's `@bsv/sdk` and wallet-toolbox, so the process has one copy of each.

## API (MASTER §3.7)

| Method | Path | Auth | Does |
|---|---|---|---|
| `PUT` | `/vaults/:vaultId` | BRC-103, identity = owner | Body = vault record `{ v:'1', vaultId, owner, agent, guard }`. The guard derives the script itself and returns `{ vaultId, lockingScriptHex, guardPub }`; the owner CLI refuses to fund unless it matches its own |
| `PUT` | `/policies/:agentIdentity` | BRC-103, identity = owner | `{ allowProviders[], maxPerPoolSats, weeklyCapSats, maxFeeSats, hotWalletDailySats }`, stored for the (owner, agent) pair |
| `GET` | `/vaults/:vaultId` | BRC-103, owner or agent | Record, script, policy, sats spent in the last 7 days |
| `POST` | `/cosign` | none (the agent's signature is in the request) | `{ txBEEF, inputIndex, agent, agentSignatureHex, context: { kind:'pay', payees:[{ vout, provider, keyID }] } }` → `{ signatureHex, guardPub }` or `403 { reason }` |
| `GET` | `/healthz` | none | `{ ok, identityKey, network }` |

Signatures are in checksig format (DER ‖ `0x41`), hex. `txBEEF` is AtomicBEEF with every input's source transaction.

## Policy fields

| Field | Meaning |
|---|---|
| `allowProviders` | Provider identity keys the agent may pay. A payment proves its recipient: the output must equal `P2PKH(derive([1,'agentcoop provider'], keyID, provider, 'anyone'))`, which the guard recomputes |
| `maxPerPoolSats` | Max sum of provider payments in one transaction |
| `weeklyCapSats` | Max outflow of the vault over a rolling 7 days |
| `maxFeeSats` | Max miner fee of one transaction |
| `hotWalletDailySats` | Daily hot-wallet top-up (enforced from D-P2) |

## What each check closes (FINAL-IDEA §8)

| Check | Refusal | Threat closed |
|---|---|---|
| Every input's source hashes to its prevout txid | `source txid mismatch` | Lying about the other inputs' amounts (BIP-143 signs only the input's own amount) to hide vault money in "agent change" |
| `kind` is `pay` | `kind '…' not enabled` | No signature for settlements before DvP + `verifyLineage` (D-P2) |
| Input = a registered vault of this agent, one per tx | `not a registered vault input`, `agent mismatch` | The guard used as a signing oracle for other scripts or another owner's vault |
| Final tx (lockTime 0, sequences final) | `non-final transaction` | Pre-signed future spends that dodge the weekly window |
| The guard computes the sighash (ALL\|FORKID); the agent's signature must verify on it | `agent signature invalid` | **Blind signing**; tampering after signing (coordinator theft); budget griefing without the agent |
| A policy exists | `no policy` | Default deny |
| Payee proof + allowlist | `provider not allowed`, `payee proof mismatch` | **Prompt injection** paying an attacker, without trusting the overlay or the coordinator for who the payee is |
| Unlisted outputs ≤ the agent's own inputs | `vault funds to unlisted output` | Vault money to the agent's change or a third party |
| Fee cap | `maxFeeSats exceeded` | Draining through the miner fee |
| Per-transaction cap | `maxPerPoolSats exceeded` | "Put 100% of the budget into pool X" |
| Rolling weekly cap (largest outflow per vault input) | `weeklyCapSats exceeded` | Bounded loss if the agent (or the agent and the guard) is compromised |
| One request at a time, decision log | — | Racing two requests under the cap; auditability |

Every decision is a line in the log and in `data/guard/decisions.jsonl`:

```
[guard] DENY pay agent=024af8279b… vault=3f9c0e1a77… reason="provider not allowed: 037fb75501…"
[guard] ALLOW pay agent=024af8279b… vault=3f9c0e1a77… outflow=300 paid=300 fee=41
```

Still open: if the guard is down the agent cannot spend (the owner can still withdraw); the ledger counts at signing time, so a signed but never broadcast spend still uses the window; an agent can sell its credits on the market and bypass the guard (K3).

## Other scripts

- `npm run adopt -- <agent-name> <vaultId>`: takes the owner's fundings (`data/vaults/<vaultId>/fund-*.json`) into the agent's `agentcoop vault` basket.
- `npm run validation5`: mainnet validation test 5 (≤ 1,000 sats; Desktop as owner, `agent-1`, guard in-process, `provider-api`). See D-P1 §9.3.

## For other tracks

- **A** (`signSettlementInput`, `buildPledge(…,'vault')`): `new VaultSigner(wallet, { vaultId, cosign, context })` implements `InputSigner`; `unlockingScriptLength` is `VAULT_COSIGN_UNLOCK_LENGTH = 150` (owner path 75). In tests use `inProcessCosigner(guard)` from `src/guard.ts`; the policy engine is `src/policy.ts` (pure).
- **B** (overlay): vault record and template in D-P1 §6.4 — `validateVaultRecord`, `vaultScriptForRecord`, `isVaultLockingScriptHex` in `vault.ts`.
- **C** (vault agent): `adoptVaultOutput`, `listVaultUtxos`, `spendFromVault` in `VaultSigner.ts`; `httpCosigner(GUARD_URL)`; a refusal throws `CosignRejected` with `reason`.
