# D-P1 — Mandate Vault: script, guard, owner CLI, VaultSigner, validation test 5 (detailed plan)

> Track D · Phase 1 · target sync **before S2** (A.P3 and C.P3 wait for this) · written: 2026-10-30 16:55
> Parent plan: `plan/track-D-vault-ops-rail.md` Phase 1 · Interfaces: `00-MASTER-PLAN.md §3.2, §3.3 (InputSigner), §3.4 (vaultLockingScript), §3.7` · Idea: `FINAL-IDEA.md §4.9, §8`

---

## 1. Goal and definition of "done"

The owner (BSV Desktop) can set up and fund a vault and write its policy to the guard; agent + guard can make **only policy-compliant** spends with 2-of-2; the owner can withdraw at any time with one signature, without asking the guard or the agent. Before signing, the guard decodes the tx and computes the sighash itself (no blind signing).

**Acceptance evidence** (written to STATUS Track D):
- `cd apps/guard && npm test` green: script unit tests + `test/vault.mockchain.test.ts` (fund → 2-of-2 spend → guard refusal → owner withdraws; plus negative tests where the chain refuses a single signature). `npm run typecheck` clean (guard, owner-cli, core files).
- `npm run guard` comes up (`GET /healthz`).
- `VaultSigner`, `VaultOwnerSigner`, `vaultLockingScript`, `VAULT_OWNER_UNLOCK_LENGTH`, `VAULT_COSIGN_UNLOCK_LENGTH` exported.
- **Validation test 5 (mainnet, ≤ 1,000 sat):** `npm run validation5` → three txids (funding T9, 2-of-2 payment T10, owner withdrawal T9) + one guard refusal (no broadcast). STATUS → "Mainnet transactions" and "Validation tests" #5. *Needs sats and the treasury laptop (§2, §3).*

---

## 2. Human steps

| # | Step | Who | When | Note |
|---|---|---|---|---|
| H1 | Sats must have arrived and F1 (`fund.ts agent-1=1000`) must be done | D-P0 humans | before test 5 | `agent-1` pays the 2-of-2 spend's **miner fee** from its own hot wallet (~30 sat) |
| H2 | Treasury Desktop open, unlocked, **mainnet**; repo + `.env` on the same laptop | treasury owner | test 5 | In test 5 the treasury Desktop takes the owner role (`desktop-owner` not needed). ≥ 1,100 sat in Desktop |
| H3 | Desktop approval windows: (1) the `agentcoop.local` connection, (2) BRC-103 authentication (`PUT /vaults`, `PUT /policies` to the guard), (3) key permission for the `agentcoop vault` protocol, (4) the funding `createAction`, (5) the withdrawal `createSignature` + `signAction` | treasury owner | test 5 | All in one run; the description text in every window is AgentCoop |
| H4 | Confirmation that this Desktop (`03e8836800…94a45a`) is the treasury | human | before test 5 | The open blocker in STATUS (D-P0) |

This cloud session has **no** `.env`, `data/` or Desktop; test 5 runs on the treasury laptop: `npm install` at the root, then `npm run validation5 -w @agentcoop/guard` (17:45 note: until A's SDK bridge is fixed; §11.1).

---

## 3. State of dependencies (16:55)

| Dependency | State | Effect / workaround |
|---|---|---|
| A.P0 root workspace + `packages/core` skeleton (`package.json`, `types.ts`, `index.ts`, `scripts/opreturn.ts`) | **None** (A has not started) | Only the two files reserved for D are written: `packages/core/src/scripts/vault.ts`, `packages/core/src/signers/VaultSigner.ts`. `InputSigner` is a **structural copy** from MASTER §3.3 (inside VaultSigner.ts, marked `TEMP`); the vault OP_RETURN envelope is in `vault.ts` with **the same bytes** as B's `stub/opreturn.ts` (switches to A's `buildOpReturn` when it arrives). `packages/core` has no `node_modules`: resolved to the guard's copies via `apps/guard/tsconfig.json` `paths` (tsx and tsc) and vitest `alias`+`dedupe` (§4.6) |
| A.P1/P2 `verifySettlementPlan`, `verifyLineage` | None | In Phase 1 the guard does only `kind:'pay'`; `settle`/`rail` → `403 kind not enabled` (D-P2/D-P3) |
| The keyID of A's revenue key | (17:45) present as `nonce` in A-P1's `pool` record | Needed for the guard to verify the payee **without relying on off-chain trust** (§7 G8). In Phase 1 it comes in the request with `context.payees`; the D-P2 pledge/settle path uses `nonce` (the earlier proposed `PoolTerms.payKeyID` was withdrawn) |
| B.P3 `vaults` lookup | None | Not needed: the owner finds the vault UTXOs with a WhatsOnChain script-hash query (independent of the guard and the overlay). The record format and template for B are in §6.4 |
| Sats | **None** | Continue on the mockchain; test 5 waits (STATUS Blockers) |
| npm (this container, npm 10.9.4) | A fresh `npm install` hits an arborist error (`reading 'edgesOut'`) | `apps/guard/package-lock.json` was seeded from the lock in `scripts/`, then the missing ones added; `npm ci` works |

---

## 4. Design decisions (validated by a spike, 16:45, mockchain + wallet-toolbox 2.14.9)

1. **Script 109 bytes**, hex template `6321{owner}ac675221{agent}21{guard}52ae68`. On the mockchain (`MockServices.postBeef` → `tx.verify('scripts only')`) both branches passed with real signatures.
2. **Derived keys, never the identity key** (guide §5.1): `[1,'agentcoop vault']`, keyID = vaultId, counterparty `'anyone'`. Anyone can compute the agent's and the guard's vault key with `new KeyDeriver('anyone').derivePublicKey(proto, vaultId, identityKey)`, and it is **equal** to its owner's `getPublicKey({…, forSelf:true})` result (verified in the spike). So the owner CLI, the guard and the overlay rebuild the script from just three identity keys.
3. **The agent's spend is `createAction + signAction`** (the same pattern as A.3.1): the vault input is given with `inputBEEF`; the agent's wallet **adds its own input for the fee and its own change outputs** (in the spike, 1 input + 8 change outputs). That is why the guard computes "external inputs / unknown outputs" (§7 G9). In the signable tx (`signableTransaction.tx`, AtomicBEEF) **every input has its source tx** → the guard can compute the fee and the amounts.
4. **Owner withdrawal is a `createAction` with no outputs**: only the vault input (`unlockingScriptLength: 75`), `outputs: []` → the wallet turns the whole amount (minus the fee) into change in its own `default` basket (spike: 9,000 → 8,984). Desktop runs the same engine (wallet-toolbox).
5. **Measured unlock lengths:** owner 74 bytes (constant **75**), 2-of-2 147 bytes (constant **150**). Signature ≤ 73 bytes (DER ≤ 72 + sighash 1), push 1 byte.
6. **One SDK copy:** `apps/guard` is CommonJS (MASTER §3.1 note). tsx applies `tsconfig.json` `paths` to **every** file in the repo: when `packages/core/src/*` and even `scripts/wallets.ts` (which has its own `node_modules`) are imported, there is one `@bsv/sdk` and one wallet-toolbox in `require.cache` (tried). So the guard uses D-P0's `openWallet` without copying it. In tests, vitest `alias` + `dedupe` (the pattern in B's coordinator).
7. **The agent tracks its vault UTXOs:** after the owner funds, the agent takes the funding output into its own wallet with `internalizeAction` (`basket insertion`, basket `agentcoop vault`); in agent spends, the change returning to the vault is written to the same basket in the `createAction` output. The agent sees its vault with `listOutputs({ basket:'agentcoop vault' })`.
8. **The owner finding the vault does not depend on the guard:** the owner CLI builds the script itself, finds the UTXOs with WhatsOnChain `GET /v1/bsv/main/script/{scriptHash}/unspent` (this endpoint works; `/unspent/all` gave 429) + the Desktop basket + `--outpoint`, and builds the BEEF from Arcade `/tx/{txid}` (guide §20.4 `beefFromArcade`). Withdrawal works while the guard is offline too.
9. **The guard's record and policy key:** the vault record is bound to `vaultId`, the policy to the **(owner, agent)** pair (the URL is `PUT /policies/:agentIdentity` as in MASTER, owner = the identity authenticated with BRC-103). A policy for someone else's agent cannot be "occupied"; each owner manages only its own vaults.
10. **State file:** `data/guard/state.json` (records, policies, ledger; atomic writes) + `data/guard/decisions.jsonl`. One process; `/cosign` requests are processed in a single queue (no cap overrun by races).

---

## 5. Files

| File | What it does | Owner |
|---|---|---|
| `packages/core/src/scripts/vault.ts` | Constants (`VAULT_PROTOCOL`, `VAULT_BASKET`, `VAULT_SIGHASH`, unlock lengths), `vaultLockingScript`, `parseVaultLockingScript` / `isVaultLockingScriptHex` (template for B), `deriveVaultPub`, `vaultKeysForRecord` / `vaultScriptForRecord`, `newVaultId`, `validateVaultRecord`, `vaultRecordScript` (OP_RETURN), `vaultSighash`, `vaultOwnerUnlock`, `vaultCosignUnlock`, `toChecksigSignature`, `verifyVaultSignature`, `providerPayScript` | D (no A skeleton; §3) |
| `packages/core/src/signers/VaultSigner.ts` | `VaultSigner` (InputSigner; agent signature + guard `/cosign`), `VaultOwnerSigner` (owner branch), `httpCosigner(guardUrl)`, `CosignRejected`, agent flows `adoptVaultOutput`, `spendFromVault`; `InputSigner` temporary structural copy | D |
| `apps/guard/package.json`, `package-lock.json`, `tsconfig.json`, `vitest.config.mts` | CJS package; `@bsv/sdk` 3.2.1, wallet-toolbox 2.14.9, `@bsv/auth-express-middleware` 2.2.9, express 5.3.0 | D |
| `apps/guard/src/policy.ts` | **Pure** policy engine: `evaluateCosign(tx, inputIndex, vault, policy, request, spentLast7d)` → allow (with amounts) or `{ reason }`. A's e2e test can import it in process | D |
| `apps/guard/src/store.ts` | `GuardStore`: JSON state (records, policies, ledger), decision log | D |
| `apps/guard/src/guard.ts` | `Guard`: `registerVault`, `putPolicy`, `getVault`, `cosign` (queue, signature, ledger, log) | D |
| `apps/guard/src/server.ts` | Express: BRC-103 auth (`allowUnauthenticated:true`, owner routes require identity), MASTER §3.7 routes, `/healthz` | D |
| `apps/guard/src/main.ts` | `npm run guard`: `openWallet('guard')`, port from `GUARD_URL` | D |
| `apps/guard/src/validation5.ts` | `npm run validation5`: mainnet validation test 5 (Desktop = owner, `agent-1`, guard in process over HTTP) | D |
| `apps/guard/test/vault.script.test.ts` | Script/key/record unit tests | D |
| `test/vault.mockchain.test.ts` | §9.2 scenarios (moved from `apps/guard/test/` to the root `test/` at 17:45) | D |
| `apps/guard/test/compat.overlay.test.ts` | B's overlay (B.P3 `stub/vault.ts`, `records.ts`) derives the same script from the same record. Excluded from the guard's type check because B's package is ESM | D |
| `apps/guard/src/adopt.ts` | `npm run adopt -- <agent> <vaultId>`: takes the owner's fundings into the agent's basket | D |
| `apps/guard/README.md` | Running, API, policy fields, control → threat table (extended in D-P2) | D |
| `apps/owner-cli/package.json`, `tsconfig.json` | CJS package, only `@bsv/sdk` (`WalletClient` to Desktop, `AuthFetch` to the guard) | D |
| `apps/owner-cli/src/vault-ops.ts` | Library (in tests a wallet-toolbox wallet stands in for Desktop): `createVault`, `registerVault`, `fundVault`, `putPolicy`, `getVaultStatus`, `findVaultUtxos`, `withdrawVault` | D |
| `apps/owner-cli/src/main.ts` | CLI: `create-vault`, `fund`, `policy`, `withdraw`, `status` | D |

Runtime files (git-ignored `data/`): `data/vaults/<vaultId>/vault.json` (record + script; public data), `data/vaults/<vaultId>/fund-<txid>.json` (handover to the agent: AtomicBEEF), `data/guard/state.json`, `data/guard/decisions.jsonl`.

---

## 6. Script level (opcodes)

### 6.1 Locking script (109 bytes)

```
63                    OP_IF
21 <ownerPub 33B>
ac                    OP_CHECKSIG                 ← owner branch (Desktop)
67                    OP_ELSE
52                    OP_2
21 <agentPub 33B>
21 <guardPub 33B>
52                    OP_2
ae                    OP_CHECKMULTISIG            ← agent + guard
68                    OP_ENDIF
```

### 6.2 Unlocking scripts

| Branch | Script | Length constant (measured) | Note |
|---|---|---|---|
| Owner | `<sigO‖41> OP_1` | `VAULT_OWNER_UNLOCK_LENGTH = 75` (74) | `OP_1` → `OP_IF` true; MINIMALIF compliant |
| Agent + guard | `OP_0 <sigA‖41> <sigG‖41> OP_0` | `VAULT_COSIGN_UNLOCK_LENGTH = 150` (147) | The first `OP_0` is CHECKMULTISIG's extra element (NULLDUMMY); signatures in pubkey order (agent, guard); the last `OP_0` → the `OP_ELSE` branch |

A's fee calculation (A.2.5) uses **150** for a vault input (p2pkh 108).

### 6.3 Sighash

BIP-143 (FORKID), scope **`SIGHASH_ALL | FORKID` = 0x41**, subscript = **the full vault locking script** (no OP_CODESEPARATOR), `sourceSatoshis` = the vault UTXO's value. The same as the kit's `signWalletP2pkhInput`, only the subscript differs. `createSignature({ hashToDirectlySign: hash256(preimage), protocolID:[1,'agentcoop vault'], keyID: vaultId, counterparty:'anyone' })`. ALL binds every input (outpoint + sequence) and every output: the tx cannot change after signing.

### 6.4 The vault record (OP_RETURN) and the funding tx — **the definitive format for B**

```
OP_FALSE OP_RETURN "agentcoop" "vault" {"v":"1","vaultId":"<32 hex>","owner":"<identity 66 hex>","agent":"<identity>","guard":"<identity>"}
```
- All values are strings; the keys are **identity keys** (not derived). The derived keys and the script can be recomputed by anyone: `vaultScriptForRecord(record)`.
- `vaultId` = 16 random bytes, lowercase hex (32 characters); also the keyID.
- `owner`, `agent`, `guard` must be **distinct** (if agent = guard, the 2-of-2 reduces to one signature).
- **Funding tx layout** (`randomizeOutputs:false`): `out0` = the vault coin (vault script), `out1` = OP_RETURN `vault` (0 sat), then the Desktop change. Every funding (top-ups included) carries the record.
- **Validity (for the overlay):** the record passes `validateVaultRecord` **and** `out0.lockingScript == vaultScriptForRecord(record)`. Otherwise the record lies and is not admitted.
- **Vault coins without a record:** the change returning to the vault in 2-of-2 spends, and vault pledge coins, carry no record; they are recognised because their script is **byte for byte equal** to a registered vault's script (B: a `lockingScriptHex → vaultId` index). Template recognition: `isVaultLockingScriptHex(hex)` / `parseVaultLockingScript(script)` (regex `^6321(0[23][0-9a-f]{64})ac675221(0[23][0-9a-f]{64})21(0[23][0-9a-f]{64})52ae68$`).
- B's topic manager keeps the inputs that spend vault outputs in `coinsToRetain` (B.P1 already keeps all previous topic coins).

---

## 7. Guard

### 7.1 API (MASTER §3.7; additions in this phase in **bold**)

| Method | Path | Identity | What it does |
|---|---|---|---|
| **`PUT`** | **`/vaults/:vaultId`** | BRC-103, identity = `owner` | Body = the vault record (§6.4). The guard checks `guard == its own identity` and the record's validity, derives the script **itself** → `{ vaultId, lockingScriptHex, guardPub }`. The owner CLI compares this with its own computation and does not fund if they differ. The same record again → 200 (idempotent); the same vaultId with another owner/agent → 409 |
| `PUT` | `/policies/:agentIdentity` | BRC-103, identity = owner | `{ allowProviders[], maxPerPoolSats, weeklyCapSats, maxFeeSats, hotWalletDailySats }` (numbers in sat, integers ≥ 0). **Written to the (owner, agent) pair**; 404 if the owner has no registered vault with that agent |
| **`GET`** | **`/vaults/:vaultId`** | BRC-103, identity = owner or agent | Record, script, policy, sat out in the last 7 days, window |
| `POST` | `/cosign` | none (the agent's signature is in the request) | Body: `{ txBEEF, plan?, inputIndex, agent, `**`agentSignatureHex`**`, context: { kind, poolId?, expectedCredits?, tokenId?, `**`payees?: [{ vout, provider, keyID }]`**` } }`. `txBEEF`: AtomicBEEF, `number[]` or hex. Signatures in **checksig format** (DER + `0x41`), hex. → `200 { signatureHex, guardPub }` · `403 { reason }` (policy) · `400 { reason }` (format) |
| `GET` | `/healthz` | none | `{ ok, identityKey, network }` |

### 7.2 `/cosign` checks and the threats they close (FINAL-IDEA §8)

In order; the first failing check returns `403/400 { reason }` and **no signature is produced**. *(D-P2 extended this table with `settle` S1–S7, pledge P1–P6 and hot wallet H1–H3: `plan/phases/D-P2.md` §7.)*

| # | Check | `reason` | Threat it closes |
|---|---|---|---|
| G1 | AtomicBEEF decodes; `inputIndex` valid; **every** input has its source tx and the source's computed txid equals the input's prevout txid | `bad request: …`, `missing source for input i`, `source txid mismatch for input i` | BIP-143 signs only an input's **own** amount; if the other inputs' amounts were not verified, the agent could lie about the size of an "external input" and get past G9. The amounts are bound to the txid, so they cannot be faked |
| G2 | `context.kind == 'pay'` (Phase 1) | `kind '<k>' not enabled` | No signature without the `settle` (A.P2 DvP + `verifyLineage`) and `rail` verifiers (D-P2/D-P3) |
| G3 | The source script at `inputIndex` is byte for byte equal to a registered vault script; the registered agent = `agent`; **only one** input in the tx with this vault script | `not a registered vault input`, `agent mismatch`, `more than one input from this vault` | The guard becoming a signing oracle for arbitrary scripts or another owner's vault (confused deputy); keeping the outflow calculation unambiguous |
| G4 | `lockTime == 0` and every `sequence == 0xffffffff` | `non-final transaction` | Pre-signed, future-dated spends (exceeding the weekly window, mixing with the Rail refund). The Rail (D-P3) brings its own rule |
| G5 | **The guard computes** the sighash (ALL\|FORKID); the last byte of `agentSignatureHex` is `0x41`, low-S, and valid on this hash with the agent's derived vault key | `agent signature invalid` | **Blind signing** (the guard does not sign a hash it never saw); ALL binds the whole tx, so after signing nobody, the coordinator included, can change the outputs ("The coordinator tries to steal"); requests without an agent signature cannot use up the ledger (budget griefing) |
| G6 | An (owner, agent) policy exists | `no policy` | Default deny: no spending from a vault whose policy has not been written |
| G7 | Output classes: vault script → **change**; `OP_FALSE OP_RETURN` → data (refused if sat > 0); with proof in `payees` → **payment**; anything else → **unknown**. A vout not in `payees` / repeated → refused | `OP_RETURN output carries sats`, `bad payee entry` | Getting money out by burning or as data |
| G8 | For each `payees` entry the guard computes `providerPayScript(provider, keyID)` = `P2PKH(derive([1,'agentcoop provider'], keyID, provider, 'anyone'))`, which must equal the output; `provider ∈ allowProviders` | `provider not allowed: <key>`, `payee proof mismatch at vout n` | **Payment to an attacker through prompt injection.** Who the payee is is proven by key derivation, not by trusting the overlay or the coordinator: an attacker cannot produce a script bound to an allowed provider's identity that it can spend itself |
| G9 | Σ unknown outputs ≤ Σ external inputs (non-vault inputs) | `vault funds to unlisted output` | The agent draining vault money into its own change or to a third party. The fee input/change the agent's wallet adds stays free (§4.3) |
| G10 | Fee (Σ inputs − Σ outputs, authenticated by G1) ≤ `maxFeeSats` | `maxFeeSats exceeded` | Draining through the miner fee |
| G11 | Σ payments ≤ `maxPerPoolSats` | `maxPerPoolSats exceeded` | The "put 100 % of the budget into X" injection (the demo moment, D-P2.3) |
| G12 | Outflows in the last 7 days + this outflow ≤ `weeklyCapSats`. Outflow = vault input − returned to the vault. The ledger keeps the largest outflow per **vault input outpoint** (re-signing for the same outpoint — e.g. a new round — is not counted twice; only one can get on chain) | `weeklyCapSats exceeded` | A weekly limit on the loss even if the agent is compromised (or the guard's policy bypassed); "Agent and guard compromised together" → the loss is limited to the vault balance |
| G13 | Decision log (allow/deny, reason, amounts) + requests in a single queue | — | Auditability (a readable line for the jury); exceeding caps with concurrent requests |

**Guarantees the chain itself gives** (independent of the guard, proven by tests): the guard cannot spend alone and the agent cannot spend alone (CHECKMULTISIG 2-of-2) → "The guard is compromised" closed; the owner withdraws at any time through the `OP_IF` branch → the last resort for "The agent is prompt-injected". **Still open:** if the guard is offline the agent cannot spend (the owner can withdraw); the ledger counts at signing time, so an unbroadcast tx is also written to the window (conservative); bypassing the guard by selling credits (K3, §4.9).

### 7.3 Record and policy checks

| Check | Threat |
|---|---|
| `PUT /vaults`: identity (BRC-103) = `owner`; `guard` = this guard; the three identities distinct; vaultId format | Writing a vault/policy on someone else's behalf; agent = guard (a single signature) |
| The policy is keyed by (owner, agent); only the owner writes it | Occupying another owner's agent; the agent cannot loosen its own policy (needs the owner's identity) |

`hotWalletDailySats` is stored in this phase and enforced in D-P2.2.

---

## 8. Flows

```
create-vault  (owner CLI, Desktop)
  vaultId ← 16 random bytes
  ownerPub ← Desktop.getPublicKey([1,'agentcoop vault'], vaultId, 'anyone', forSelf)
  agentPub, guardPub ← KeyDeriver('anyone') (from the identities)
  script ← vaultLockingScript(ownerPub, agentPub, guardPub)
  AuthFetch(Desktop) PUT GUARD/vaults/:id {record}  → guard's script == ours?  (stop if not)
  data/vaults/<id>/vault.json

policy  → AuthFetch PUT GUARD/policies/:agent {…}

fund <id> <sats>  (Desktop createAction: out0 vault [basket 'agentcoop vault', tag vault:<id>], out1 OP_RETURN vault)
  → data/vaults/<id>/fund-<txid>.json (AtomicBEEF) → agent: adoptVaultOutput (basket insertion)

pay  (agent: spendFromVault)
  createAction { inputBEEF, inputs:[vault utxo, len 150], outputs:[payment(s), vault change→basket] }
  → VaultSigner.sign: sighash, agent signature, POST /cosign {txBEEF, agentSignatureHex, payees}
  → guard G1–G13 → guard signature (VaultSigner verifies with guardPub) → OP_0 sigA sigG OP_0 → signAction

withdraw <id>  (Desktop)
  UTXOs: WoC script-hash unspent ∪ Desktop basket ∪ --outpoint ; BEEF: Arcade
  createAction { inputs: all (len 75), outputs: [] } → each input: <sigO> OP_1 → signAction
```

---

## 9. Test scenarios

### 9.1 Unit (`apps/guard/test/vault.script.test.ts`)
1. Script 109 bytes, the template hex; `parseVaultLockingScript` round trip; P2PKH and broken scripts are refused.
2. `deriveVaultPub(identity, vaultId)` == the wallet's `getPublicKey(forSelf:true)`; **not** the identity key itself.
3. `validateVaultRecord`: a valid record; a number (non-string) value, a short vaultId, two identical identities → null. The record OP_RETURN decodes with B's `parseOpReturn` format (same bytes).
4. Unlock lengths: ≤ 75 / ≤ 150 even with the longest signatures.
5. Pure `evaluateCosign` tests: source txid mismatch (G1), non-final (G4), sat in an OP_RETURN (G7), fee cap (G10).

### 9.2 Mockchain (`test/vault.mockchain.test.ts`; guard HTTP server in process, the owner with `AuthFetch`, real BRC-103)
1. **Registration:** the owner's `create-vault` → the guard's script is equal. Unauthenticated `PUT` → 401; another owner with the same vaultId → 409; a policy for an agent the owner has no vault with → 404.
2. **Fund** 10,000 → out0 vault, out1 record (`validateVaultRecord` + `vaultScriptForRecord` equal) → agent `adoptVaultOutput` → in the agent's basket.
3. **2-of-2 payment:** 1,000 to an allowed provider + 9,000 change to the vault → the guard signs → the mockchain verifies the scripts, accepted. Ledger 1,000.
4. **Guard refusal — outside the allowlist:** payment to another provider → `403 provider not allowed`, no signature, no broadcast (`abortAction`), the ledger unchanged.
5. **Guard refusal — caps:** `maxPerPoolSats` exceeded; a second payment exceeding the weekly cap; vault money to an output without proof (`vault funds to unlisted output`); a broken agent signature; an unregistered script.
6. **The chain refuses a single signature:** agent signature + a fake guard signature, and the agent's signature twice → the mockchain refuses (2-of-2 enforced on chain).
7. **Repeat:** a second `/cosign` for the same input does not double the ledger.
8. **Owner withdrawal:** the remaining vault UTXO through the `OP_IF` branch → the owner's `default` balance grows, the output in the agent's basket is spent.

### 9.3 Mainnet — validation test 5 (`npm run validation5`, ≤ 1,000 sat)
Desktop = owner, `agent-1` = agent, `guard` = guard (in-process HTTP, real `AuthFetch` from Desktop), `provider-api` = the allowed provider.
1. `create-vault` + policy (`allow provider-api`, `maxPerPool 500`, `weekly 1000`, `maxFee 200`).
2. **T9 fund** 1,000 sat → txid₁.
3. **Guard refusal:** `agent-1` → 300 to the `coordinator`'s revenue key (not allowed) → 403, no broadcast.
4. **T10 2-of-2:** `agent-1` → 300 to `provider-api`'s revenue key (keyID `validation5`), 700 to the vault → txid₂; `provider-api` takes the output into the `agentcoop revenue` basket (the sats stay with the team).
5. **T9 withdraw:** the 700 vault UTXO to Desktop → txid₃.
If it fails, the Arcade `/tx` error text is written to STATUS and discussed with A (track Phase 1.6). Expectation: after Genesis, bare multisig and `OP_IF` are standard; the Arcade `/health` policy has no script restriction.

---

## 10. Build order

1. ✅ Spike (§4), the `apps/guard` package.
2. `vault.ts` → unit tests.
3. `policy.ts`, `store.ts`, `guard.ts`, `server.ts`, `main.ts`.
4. `VaultSigner.ts` (signer + agent flows), `owner-cli` (`vault-ops.ts`, `main.ts`).
5. Mockchain test → green; `typecheck` (guard + owner-cli).
6. `validation5.ts` (cannot run here: no `.env`/Desktop/sats).
7. MASTER §3.2/§3.3/§3.7, STATUS (Track D, interface changes, blockers), `apps/guard/README.md`, Checkpoint (§11).

---

## 11. Checkpoint (2026-10-30 17:25)

| Question | Answer |
|---|---|
| **Is the plan still good?** | Yes. On the mockchain the three paths (fund, 2-of-2, owner withdrawal) and every refusal scenario work; the chain refuses a single signature. Three fixes/findings: (1) **wallet-toolbox `signAction` does not throw on a broadcast error** (double spend → `sendWithResults[].status='failed'`); `broadcastResult()` added, A/C should check it in their own `signAction` calls too (announced in STATUS). (2) The agent's wallet adds its own fee input and many change outputs to a vault spend → the guard's G1 (source txid binding) + G9 (unknown ≤ external inputs) rules are required; together they limit any "unexplained" outflow from the vault to the fee cap. (3) In a vault pledge the pledge coin returns to the vault script, so `maxPerPoolSats` kicks in at settlement, not at pledge time → **Phase 2.1b** added to the track file (pledge awareness + `PoolTerms.payKeyID`). Test 5 has not run on mainnet (no sats), the policy-refusal risk is open; A's test 2 (Desktop signing with a custom subscript) does not exist yet either, so Desktop's behaviour will be seen for the first time in test 5 |
| **Is it done?** | Code, unit + mockchain tests (**24/24**, `cd apps/guard && npm test`), type check (guard + owner-cli), the `npm run guard` smoke test (`/healthz` 200, empty `/cosign` 400, unauthenticated `PUT` 401) ✓. **Open:** validation test 5 (mainnet) → sats + the treasury laptop (`npm run validation5`) |
| **Other tracks?** (17:20 fetch) | **A:** no branch, P0 not started → no `verifyLineage`/`verifySettlementPlan`/`buildPledge('vault')`. **B:** P3 ✅ mockchain: the vault index is **compatible** with D's record format (same fields, same `'anyone'` derivation; `compat.overlay.test.ts` proves it), the coordinator leaves planning to A and verifies signatures generically with `Spend` (a vault input needs no special handling). B's `.env.example` requests added. **C:** no branch, P0 not started (no `mode:'vault'`) |
| **Does the next phase depend on others?** | D-P2's `settle` path needs A.P2 (`verifySettlementPlan`, `verifyLineage`) and A.P3 (`buildPledge(…,'vault')`); if they are missing, the track rule: test with a mock plan (B's planner `apps/coordinator/test/helpers/devProtocol.ts` as a reference). 2.2 hot wallet and 2.1b pledge awareness can start independently of A |
| **Interface change?** | MASTER §3.2 (vault script + record row), §3.3 (`PoolTerms.payKeyID?`, `VaultSigner` note), §3.4 (location of `vaultLockingScript`), §3.7 (`PUT/GET /vaults`, `agentSignatureHex`, `payees`, (owner, agent) policy, `/healthz`), §3.9 (B's variables). In STATUS "Interface changes" |

### 11.1 Addendum: merging with A.P0–P2 (`main`) (17:45)

A pushed the root workspace and `packages/core` to `main` from a base unaware of D-P0 (ESM + the `src/sdk.ts` bridge, a vault.ts skeleton). Merged into this branch: `vault.ts` with A's signature and D's body (`'../sdk'`, `types.ts` constants, `buildOpReturn`), `VaultSigner` on A's `InputSigner`; `scripts/`, `apps/guard`, `apps/owner-cli` are members of the root workspace (ESM, `@agentcoop/core/sdk`), the kit copies and per-package `node_modules`/lock/tsconfig removed; the flow test is the root `test/vault.mockchain.test.ts`, the ops tests `test/ops.*.test.ts`. Root `npm test` 114/115 (the failing one is B's, from the environment), A and D type checks clean.

**Open blocker:** A's bridge loses 58/186 of the SDK exports under tsx/Node; it does not show in vitest, and at runtime every `@agentcoop/core` user crashes. Going back to CJS (removing `"type":"module"`) was tried and worked; the decision is A's (STATUS Blockers, MASTER §3.1 Addendum). Test 5 waits for this fix (or for `66aac1f` before the merge).
