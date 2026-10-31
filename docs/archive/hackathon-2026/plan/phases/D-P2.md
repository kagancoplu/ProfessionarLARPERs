# D-P2 — The guard's settlement path, pledge awareness, hot wallet, injection scenario (detailed plan)

> Track D · phase 2 · target sync **S3** · written: 2026-10-30 18:40 (before code), results in §11 (18:50)
> Parent plan: `plan/track-D-vault-ops-rail.md` phase 2 (2.1, 2.1b, 2.2, 2.3, 2.4, 2.5) · Interfaces: `00-MASTER-PLAN.md §3.2, §3.3, §3.4 (verifySettlementPlan, planTransaction, verifyLineage), §3.7` · Idea: `FINAL-IDEA.md §4.9, §8, §11` · Previous phase: `plan/phases/D-P1.md` (G1–G13)

---

## 1. Goal and the definition of "done"

A vault agent signs in the coordinator's signing round **together with the guard**; the guard verifies the settlement itself (DvP + credit lineage) without trusting the coordinator or the overlay. A prompt-injected agent's attempt to "put 100 % of the budget into X" is refused **at pledge time** and nothing moves. For retail 402, money can be moved to the agent's hot wallet (the `default` basket) within the guard's daily cap.

**Acceptance evidence** (written into STATUS Track D):
- Root `npm test` green; new: `test/e2e.vault-settlement.mockchain.test.ts` (B's real overlay + the coordinator round + A's `planSettlement`/`verifySettlementPlan`/`verifyLineage` + guard HTTP), `apps/guard/test/*` (settle/pledge/hot wallet unit tests), `test/vault.mockchain.test.ts` (hot wallet + `relinquishOutput`). `npm run typecheck` clean.
- `npx tsx --import @agentcoop/core/register-sdk scripts/demo-injection.ts` (mock chain) prints two readable refusal lines and one approval line; no refusal produces a broadcast.
- Mainnet (once the sats + a Node 24 laptop arrive, a ≤ 1,000 sat first trial): a vault pledge (T3v) + a vault settlement (T5 + T10) in one run with A.P3, a guard 403. *Not in this cloud session (§2).*

---

## 2. Human steps

| # | Step | Who | When | Note |
|---|---|---|---|---|
| H1 | D-P1 H1–H4 (sats, F1, treasury Desktop confirmation) | the D-P0 people | before mainnet | Unchanged (STATUS Blockers) |
| H2 | **Node 24** on the treasury laptop (24.13 ✓). Runtime `tsx --import @agentcoop/core/register-sdk`; the hook is broken on Node 22.22 (§3) | the treasury owner | every `npm run guard/owner/validation5` | the `npm run …` scripts already add the hook |
| H3 | Validation test 5 (`npm run validation5 -w @agentcoop/guard`) | the treasury owner | after the sats + F1 | D-P1 §9.3; no bridge blocker any more (Node 24) |
| H4 | A mainnet vault settlement: guard (`npm run guard`), overlay + coordinator (`node infra/run.mjs`), the owner's `owner-cli` (vault + policy + funding), C/A's vault agent | D + A + C | after A.P3 + C.P3 | a ≤ 1,000 sat first trial; a small pool (e.g. N=10, P=500) |
| H5 | Demo recording: the `scripts/demo-injection.ts` output on screen | D | phase 4 (video) | no sats needed in mock-chain mode |

---

## 3. State of the dependencies (18:30, `main` @ 81c2bf6 merged)

| Dependency | Status | Effect / stopgap |
|---|---|---|
| A.P2 `verifySettlementPlan`, `planTransaction`, `verifyLineage`, `receivePkh`, `pledgeAmount` | ✅ on `main` | the guard's `settle` path calls them directly |
| A.P3 `buildPledge(…,'vault')` | ✗ (`NOT_IMPLEMENTED`) | D writes the **reference** flow `pledgeFromVault` that follows the guard's 2.1b rule (`packages/core/src/signers/VaultSigner.ts`, D's file); A.3.1's `buildPledge(…,'vault')` can delegate to it. Tests and the demo use it |
| B.P2 coordinator `sign_request` for vault pledges | ✅ in general: B verifies signatures with `Spend`, A does the planning (vault unlock = A's `VAULT_UNLOCKING_SCRIPT_LENGTH` = 150 = D's value) | the e2e test runs with B's real coordinator |
| C.P3 `mode:'vault'` agent | ✗ (C in P1) | the injection demo is independent (mock chain, a rule-based "obedient agent"); the API is announced to C |
| SDK runtime bridge | ✅ **on Node 24**: C's `packages/core/register-sdk.mjs` hook (MASTER §3.1). `npm run guard` started on Node 24.22 + the hook (`/healthz` 200, an empty `/cosign` 400, an unauthenticated `PUT` 401); owner-cli and `scripts/balances.ts` load. ✗ **on Node 22.22**: the hook's `load` chain returns `source: undefined` for CJS modules (`wallet-toolbox/out/src/index.js`, `express`) → `ERR_INVALID_RETURN_PROPERTY_VALUE` (C's `npm run provider` too) | D's `package.json` scripts add the hook; use Node 24. Blocker → C (the hook's owner); the root `engines` (A) says `>=22` |
| Mainnet sats | ✗ | mock chain; the mainnet steps ready, not run |
| Track E requests (18:40, another session wrote to `trackD`; MASTER §3.7/§3.10) | taken into D.P2 | `GET /policies/:agent`, `GET /decisions`, `GET /events` (SSE, `CoopEvent`), CORS + `x-bsv-auth-*` exposed. `vault-ops.ts` must stay free of node imports (it already is) |

---

## 4. Design decisions

1. **The guard builds the settlement tx itself.** In a `kind:'settle'` request `plan` is required, tx = `planTransaction(plan)` (A); `txBEEF` is ignored (VaultSigner does not send it for settle). The agent signs the same `planTransaction(plan)` (`signSettlementInput`), so the sighashes are the same.
2. **The offer and terms from chain data, not from the coordinator.** The source tx of the template's input 0 = A's reserve tx (`buildReserveAndAnnounce`: out0 the offer UTXO, then `OP_RETURN pool { terms − poolId, nonce }`). G1 binds this tx's txid to input 0's prevout, so **the record cannot be changed**. The guard builds `terms = record − nonce + poolId` and `offer = { poolId, unlockingScriptHex: input 0's script, lockingScriptHex/satoshis: the source output, terms }`; it does not trust `GET /offers/:poolId` (coordinator) or the overlay. If the coordinator used different terms, `termsHash` does not match → `verifySettlementPlan` refuses.
3. **The provider proof has three parts** (so the allowlist means something): (a) `terms.provider ∈ allowProviders`; (b) `terms.payScriptHex == providerPayScript(provider, nonce)` (the payment goes to the provider's revenue key, MASTER §3.2); (c) the offer UTXO's BSV-21 owner = `anyonePkh(provider, 'offer <nonce>', [1,'agentcoop provider'])` → only that provider can make the offer signature. So even if someone writes "provider = X" in the record and opens a pool with a fake token, (c) and the offer signature fail.
4. **The expected credits from the pledge record.** The vault input's source tx = the pledge tx; the `OP_RETURN pledge` record → `expectedCredits = record.credits`, `expectedCreditPkh = receivePkh(agent, tokenIndex)` (A's kit), `record.participant == agent`, `record.signer == 'vault'`, `record.poolId == plan.poolId`. The request's `context.expectedCredits`/`tokenId` only cross-check the agent's intent (refused if different); the trusted source is the chain.
5. **`verifySettlementPlan(plan, offer, myOutpoint, { expectedCredits, expectedCreditPkh, maxFeeSats: policy.maxFeeSats, verifyLineage: true, lineage: { fetchTx, cache } })`**: DvP (the credit output to the agent's address, exactly `k`), change to the pledge coin's own script = **the vault**, fee share ≤ `maxFeeSats`, `pledgeListHash`/`termsHash`, the offer signature (`Spend`), lineage. An error → `403 { reason: '<CODE>: <message>' }`.
6. **Lineage is verified at pledge time and cached (pre-verification).** In 2.1b the guard calls `verifyLineage(poolId)`; the result in a `LineageCache` shared for the guard's lifetime. In the settlement round the same outpoint comes from the cache. **Measured (18:20, this container → Arcade):** `GET /tx` 250–950 ms; lineage depth 1–3 in A's pools (deploy → reserve) → the first verification ≈ 1–3 s, later ones ≈ 0. Fits in the 60 s round. A network error is not cached (A's `verifyLineage` stores only definite results).
7. **Pledge awareness (2.1b), inside `kind:'pay'`.** If the tx carries an `agentcoop pledge` record, the A.3.1 layout is required: out0 pledge coin = **this vault's script**, out1 the registration fee, out2 the record. Since the pledge coin stays on the vault script, the owner can withdraw it at any time too; the settlement change returns to the vault again. The pool tx comes from `context.poolBEEF` (the BEEF in the overlay's `{op:'pool'}` answer; **transport** only, verified by txid) or from the guard's own `fetchTx` (Arcade → WoC). out1 = `payScriptHex` = `providerPayScript(provider, nonce)` → a proven payment (the agent need not send `payees`).
8. **Ledger: reservation.** At pledge time only the registration fee + the miner fee actually leave the vault, but the pledge coin is **committed** to the pool. The guard writes two entries: `<vaultInput>` → outflow (fee + miner fee), pool share = fee; `reserve:<vaultInput>` → the pledge coin's value (weekly + pool share). Every later tx spending the pledge coin (settlement, cancellation, a non-owner spend) **resolves** this reservation: the reservation key is found from the pledge tx's inputs; the first resolution replaces the reservation (the real cost `s ≤ coin` at settlement, 0 on cancellation), later ones keep the largest (only one can reach the chain). So the weekly cap applies **at pledge time** (stopping the "split the budget across 10 pools" injection too) and is not counted twice at settlement.
9. **The per-pool cap (G11) is now per pool**: for the same (owner, agent), the fees + reservation/settlement costs going to one pool over 7 days ≤ `maxPerPoolSats`. For plain `pay` payments without a pool id, the D-P1 rule (Σ payments per tx) as before.
10. **Hot wallet = a BRC-29 payment with an `'anyone'` sender.** The output is `P2PKH(KeyDeriver('anyone').derivePublicKey([2,'3241645161d8'], '<prefix> <suffix>', agent))`; the guard recomputes it only for **the vault's registered agent** (the recipient cannot be anyone else). The agent takes it into the `default` basket with `internalizeAction({ protocol:'wallet payment', paymentRemittance: { derivationPrefix, derivationSuffix, senderIdentityKey: <anyone pubkey = 1·G> } })`. **Spike (18:15, mock chain):** the key the guard derived = the agent's `getPublicKey({counterparty: anyonePub \| 'anyone', forSelf:true})`; internalize `accepted:true`, balance +1,234, then spendable. The shared secret `agentPriv·1G = agentPub` is known to everyone, but spending still needs the agent's private key (only a loss of linkage privacy: whoever sees the keyID can tie the payment to the agent; prefix/suffix are random). Cap `hotWalletDailySats`, **rolling 24 h**, a separate ledger field (`hotSats`); the amount counts toward the weekly outflow too, not toward `maxPerPoolSats`.
11. **Asynchronous preparation outside the queue.** `/cosign`: (a) resolving + the pool tx + lineage (network) outside the queue, (b) policy + signature + ledger in one queue (the D-P1 decision kept: concurrent requests cannot exceed a cap).
12. **Signing round latency:** the settle evaluation on the guard side < 50 ms with a cached lineage (mock chain); agent → guard HTTP + `createSignature` twice each. The number of vault participants in a 60 s round is not a limit.

---

## 5. Files

| File | Change | Owner |
|---|---|---|
| `apps/guard/src/policy.ts` | `evaluateCosign` grows: pledge (2.1b), hot wallet (2.2), reservation resolution, per-pool G11; output `entries` (ledger drafts). Stays pure | D |
| `apps/guard/src/settle.ts` (new) | `evaluateSettle` (2.1): plan → tx, offer/terms from the chain, `verifySettlementPlan`, amounts; `poolFromTx`, `pledgeRecordOf`, `resolvePoolTx` (shared with 2.1b) | D |
| `apps/guard/src/guard.ts` | `kind` routing, preparation (pool tx, lineage cache), `fetchTx`/`lineage` options, multiple ledger entries, `hotLast24hSats` in the `GET /vaults` answer | D |
| `apps/guard/src/store.ts` | `LedgerEntry.kind/poolId/poolSats/hotSats`, `spentInWindow(…, exclude[])`, `poolSpent`, `hotSpent`, `findReservation`, reservation resolution | D |
| `apps/guard/src/main.ts` | `fetchTx` from `ARCADE_URL` | D |
| `apps/guard/src/server.ts` | CORS (`GUARD_CORS_ORIGIN`, `x-bsv-auth-*` exposed), `GET /policies/:agent`, `GET /decisions`, `GET /events` (SSE) — Track E | D |
| `scripts/lib/register-cjs.mjs` (new) | a `knex` ESM wrapper for the demo (A's mock-chain helper under tsx) | D — **removed by B at 20:05** (the hook now wraps `knex` too) |
| `packages/core/src/signers/VaultSigner.ts` | `CosignContext.poolBEEF?`, `hotWallet?`; no `txBEEF` sent for settle; `spendFromVault` output basket/tags + extra context, `relinquishOutput` on a broadcast error; new: `pledgeFromVault`, `cancelVaultPledge`, `internalizeVaultSettlement`, `topUpHotWallet`, `hotWalletScript`, `ANYONE_IDENTITY_KEY` | D |
| `apps/owner-cli/src/chain.ts` | `findVaultUtxos`: B's overlay (`{ op:'vaults', owner }`) as a second source (`OVERLAY_URL`) | D |
| `apps/guard/test/pledge.test.ts` (new) | pledge (P1–P6), reading the pool tx, ledger reservations (txs without the mock chain); the whole settle in the e2e | D |
| `test/e2e.vault-settlement.mockchain.test.ts` (new; shared with A.3.2) | §9.2 | D (+A) |
| `test/vault.mockchain.test.ts` | hot wallet + relinquish scenarios | D |
| `scripts/demo-injection.ts` (new) | 2.3 | D |
| `apps/guard/README.md` | 2.5: a check → threat table (G1–G13 + S/P/H), "the guard alone cannot move funds" | D |
| `apps/guard/package.json`, `apps/owner-cli/package.json`, `scripts/package.json` | `tsx --import @agentcoop/core/register-sdk` | D |

---

## 6. Interface addition (MASTER §3.7; MASTER first, then STATUS)

`POST /cosign` body `{ txBEEF?, plan?, inputIndex, agent, agentSignatureHex, context }`:

| `context.kind` | Tx source | New `context` fields |
|---|---|---|
| `'settle'` | **`plan` (SettlementPlan) required**; tx = `planTransaction(plan)`; `txBEEF` ignored | `poolId` (required, equal to `plan.poolId`), `expectedCredits?`, `tokenId?` (must equal the chain's if given). `inputIndex` = the agent's pledge coin (1..n) |
| `'pay'` | `txBEEF` | **`poolBEEF?`** (the pool tx if the tx carries an `agentcoop pledge` record: AtomicBEEF/BEEF/raw tx, hex or `number[]`; otherwise the guard fetches it itself) · **`hotWallet?: [{ vout, derivationPrefix, derivationSuffix }]`** (recipient = the vault's agent, the BRC-29 sender = `'anyone'`) · `payees` (D-P1) as before |

The answer is the same (`{ signatureHex, guardPub }` / `403|400 { reason }`). `hotLast24hSats` in the `GET /vaults/:vaultId` answer. The agent-side API (for C and A): `pledgeFromVault`, `cancelVaultPledge`, `internalizeVaultSettlement`, `topUpHotWallet` (`@agentcoop/core/signers/VaultSigner`).

---

## 7. New guard checks and the threats they close (FINAL-IDEA §8)

D-P1 §7.2's G1–G13 still apply; the following are added. The first failing check → `403/400 { reason }`, no signature.

### 7.1 `settle` (2.1)

| # | Check | `reason` | Threat it closes |
|---|---|---|---|
| S1 | `plan` present and `planTransaction(plan)` resolves; G1 (sources + txid binding) | `bad request: plan …` | Getting the guard to sign a different tx the coordinator built (the guard builds the tx from the plan itself) |
| S2 | `inputIndex ∈ 1..n`; G3 (registered vault, agent, one input), G4 (final), G5 (the agent's signature on the guard's sighash), G6 (policy) | the D-P1 texts; `input i is not a pledge input` | Blind signing; another owner's vault; signing the offer input |
| S3 | An `agentcoop pledge` record in the vault input's source tx; `participant == agent`, `signer == 'vault'`, `poolId == plan.poolId == context.poolId`; equal to `context.expectedCredits` if given | `no pledge record for this input`, `pledge record does not name this agent`, `pool mismatch`, `expectedCredits mismatch` | The coordinator putting the agent's coin into another pool/another share |
| S4 | An `agentcoop pool` record in input 0's source tx (`nonce` included); valid terms; equal to `context.tokenId` if given | `no pool record in the offer's transaction`, `token mismatch` | Made-up terms (terms come from txid-bound chain data) |
| S5 | `provider ∈ allowProviders`; `payScriptHex == providerPayScript(provider, nonce)`; the offer UTXO on the provider's `offer <nonce>` key | `provider not allowed: <key>`, `pool payScript is not the provider's revenue key`, `offer UTXO is not the provider's` | **Paying a provider that is not allowed through a prompt injection**; a fake pool carrying an allowed provider's name |
| S6 | `verifySettlementPlan(…, verifyLineage: true)` (§4.5) | `BAD_PLAN: …`, `LINEAGE_FAILED: …`, `BAD_TERMS: …` | "The coordinator tries to steal" (credits to another address, fewer credits, change cut, too high a fee); "the coordinator/overlay shows fake credits as valid" (lineage independent in the guard) |
| S7 | Outflow `s = coin − change`; pool share (7 days, excluding this pledge's reservation) + `s` ≤ `maxPerPoolSats`; weekly (resolving the reservation) ≤ `weeklyCapSats` | `maxPerPoolSats exceeded (…)`, `weeklyCapSats exceeded (…)` | If the policy was tightened after the pledge, it is applied again at settlement |

D-P1's G7–G10 (output classes, `payees`, unknown ≤ external inputs, tx fee) are **not applied** in a settlement: the tx has other participants' inputs/outputs. Instead S6's mapping "my own input ↔ my own credit and change outputs" and the cost bound with `maxFeeSats` apply (the ALL signature binds the whole tx).

### 7.2 Pledge awareness (2.1b, inside `kind:'pay'`)

| # | Check | `reason` | Threat it closes |
|---|---|---|---|
| P1 | The record is valid; `participant == agent`, `signer == 'vault'` | `bad pledge record`, `pledge record does not name this agent`, `vault pledge must say signer 'vault'` | A pledge for someone else with the agent's vault money (the credits to someone else) |
| P2 | Layout: out0 = this vault's script (the pledge coin), out1 the fee, out2 the record; `minCredits ≤ credits ≤ N`; out0 ≥ the share + 1 | `pledge layout: …` | The pledge coin slipping out of the vault (to the agent's key) |
| P3 | The pool tx (`poolBEEF` or the guard's `fetchTx`), txid = `poolId`'s txid, a `pool` record | `pool transaction not available: …`, `no pool record in the pool transaction` | Made-up pool information |
| P4 | The same as S5 + out1 = `payScriptHex` (a proven payment) | `provider not allowed: <key>`, `pledge fee is not paid to the pool's revenue key`, `offer UTXO is not the provider's` | **Injection: "100 % of the budget into X"** (X outside the allowlist) |
| P5 | Pool share + fee + pledge coin ≤ `maxPerPoolSats`; weekly + outflow + pledge coin ≤ `weeklyCapSats` | `maxPerPoolSats exceeded (pledge …)`, `weeklyCapSats exceeded (…)` | **Injection: "100 % of the budget into the (allowed) pool"**; splitting the budget across many pools |
| P6 | `verifyLineage(poolId)` (into the cache) | `LINEAGE_FAILED: …` | Paying a registration fee for fake credits; speeds up the settlement round |

### 7.3 Hot wallet (2.2, inside `kind:'pay'`)

| # | Check | `reason` | Threat it closes |
|---|---|---|---|
| H1 | Valid entries (vout exists, no repeats, prefix/suffix base64 ≤ 64) | `bad hot wallet entry` | Format |
| H2 | Output = `P2PKH(KeyDeriver('anyone').derivePublicKey(BRC29, '<p> <s>', vault.agent))` | `hot wallet proof mismatch at vout n` | A payment to a third party disguised as a hot wallet |
| H3 | The last 24 h's hot total + this ≤ `hotWalletDailySats` (+ weekly) | `hotWalletDailySats exceeded (a + b > c)` | A compromised agent draining the vault through the hot wallet: a daily limit |

### 7.4 Still open
Money moved to the hot wallet is no longer under the guard's control (by design; bounded by the cap). Credit outputs go to the agent's token address (K3, A phase 5 `creditLock:'vault'`). The ledger counts at signing time. While the guard is offline the agent cannot spend; the owner withdraws.

---

## 8. Flows

```
2.1b pledge (agent: pledgeFromVault — the A.3.1 reference)
  vault UTXO A ─▶ out0 pledge coin (vault script, basket 'agentcoop', signer:'vault')
                  out1 feeSats → payScriptHex      out2 OP_RETURN pledge {…, signer:'vault'}
                  out3 change → vault script       (+ the agent's fee input/change)
  VaultSigner(context: { kind:'pay', poolBEEF }) → guard P1–P6 → signature → broadcast → overlay submit
  ledger: A → fee+miner fee (pool share = fee) · reserve:A → coin (pool share = coin)

2.1 settlement (coordinator sign_request)
  agent: verifySettlementPlan (its own) → signSettlementInput(plan, i, VaultSigner({ kind:'settle', poolId, expectedCredits, tokenId }, plan))
  guard: S1–S7 (lineage in the cache) → signature → agent sign_response
  after broadcast: internalizeVaultSettlement → change into the 'agentcoop vault' basket, the pledge coin relinquished
  ledger: reserve:A → s (reservation resolved)

2.2 hot wallet (agent: topUpHotWallet)
  vault UTXO ─▶ out0 BRC-29('anyone' → agent) · change → vault
  context: { kind:'pay', hotWallet: [{ vout:0, prefix, suffix }] } → guard H1–H3 → signature
  agent: internalizeAction(wallet payment, senderIdentityKey = anyone) → default basket → 402 (AuthFetch)

Cancellation: cancelVaultPledge → the pledge coin fully back to the vault (kind:'pay') → reserve:A → 0
```

---

## 9. Test scenarios

### 9.1 Unit (`apps/guard/test/pledge.test.ts`; no mock chain, hand-built txs)
1. Pledge: an allowed pool → approved, entries (A, reserve:A); outside the allowlist → `provider not allowed`; coin + fee > `maxPerPoolSats` → refused; over the weekly with the reservation → refused; out0 outside the vault → `pledge layout`; a record for someone else → refused; a pool tx with the wrong txid → refused; failed lineage → `LINEAGE_FAILED`.
2. Hot wallet: the right derivation → approved; another recipient → `hot wallet proof mismatch`; the 24 h cap → refused; `maxPerPoolSats` does not count the hot payment.
3. Ledger: the reservation is resolved by the settlement (the weekly drops), a cancellation sets it to 0, a second resolution keeps the largest.

### 9.2 End to end (`test/e2e.vault-settlement.mockchain.test.ts`; B's overlay + coordinator, A's builders, guard HTTP)
1. Provider: deploy → reserve + announce (N=1000, P=10,000, fee 50) → offer `POST /offers`.
2. Owner: vault (agent V) + policy (`allow` the provider, `maxPerPool` 6,000, weekly 20,000) + fund 20,000; V adopts it.
3. **Injection (at pledge time):** V's "obedient" step: into the pool of a provider outside the allowlist → 403 `provider not allowed`; the whole vault (19,000) into the allowed pool → 403 `maxPerPoolSats exceeded`; no tx broadcast, the vault UTXO in place.
4. A P2PKH agent 600 (`buildPledge`), V 400 (`pledgeFromVault`) → the overlay counts both pledges valid.
5. Coordinator round: a P2PKH bot (B's `agentBot`) + a vault bot (`verifySettlementPlan` + `VaultSigner` settle → guard HTTP) → `settled`; credits 600/400; V's change on the vault script; the reservation resolved in the guard's ledger; the owner can withdraw the change alone.
6. A tampered plan (V's credit output to another address) → guard 403 `BAD_PLAN … pays someone else`.
7. **A.3.2's negative scenario:** the owner removes the provider from the allowlist → in a second pool, V's pledge (made while still allowed) gets 403 `provider not allowed` from the guard in the settlement round → V `sign_reject` → the coordinator blacklists V, **no broadcast**.

### 9.3 Additions to `test/vault.mockchain.test.ts`
- `topUpHotWallet` 1,500 → the agent's `default` balance +1,500; a second 1,000 → `hotWalletDailySats exceeded`.
- After the owner withdraws, the agent's spend attempt fails at broadcast → the vault UTXO is **relinquished** from the agent's basket (`listVaultUtxos` no longer shows it).

### 9.4 Demo (`scripts/demo-injection.ts`, mock chain, ~10 s)
Owner, provider, an attacker provider, agent, guard in one process; three instructions to the agent: (1) "100 % of the budget into pool X" → `DENY … provider not allowed`; (2) "100 % of the budget into the AgentCoop pool" → `DENY … maxPerPoolSats exceeded`; (3) "pledge 400 credits" → `ALLOW`. Each line readable for the jury (`[guard] DENY pay … reason="provider not allowed: 03ab…"`), the vault balance at the end.

---

## 10. Implementation order

1. ✅ main merge (Track C + B-INT), `compat.overlay.test.ts` to B's new `vault.ts`.
2. ✅ Runtime: Node 24 + hook confirmed; D's scripts with the hook.
3. ✅ Spike: BRC-29 with an `'anyone'` sender (§4.10); Arcade latency (§4.6).
4. `store.ts` ledger → `policy.ts` (pledge, hot) → `settle.ts` → `guard.ts` → unit tests.
5. `VaultSigner.ts` agent flows → the `test/vault.mockchain.test.ts` additions.
6. `test/e2e.vault-settlement.mockchain.test.ts` → `scripts/demo-injection.ts`.
7. owner-cli overlay source; README; MASTER §3.7; STATUS; checkpoint (§11).

---

## 11. Checkpoint (2026-10-30 18:50)

| Question | Answer |
|---|---|
| **Is the plan still good?** | Yes. (1) **The 60 s round:** the guard's only network dependency is `verifyLineage` (and the pool tx without `poolBEEF`); 250–950 ms per tx from Arcade, depth 1–3 in A's pools. The **pre-verification** the track file suggested was done: lineage verified and cached at pledge time, the settlement round from the cache (`test/e2e…` round ≈ 3 s, the settle evaluation < 50 ms). No dependency on the overlay at all. (2) A **reservation** was added to the ledger (the pledge coin counts toward the weekly + pool cap at pledge time, the settlement replaces it with the real cost) → `maxPerPoolSats` now means "per pool, 7 days" (STATUS Plan changes). (3) With no A.P3, the guard's pledge rule was fixed to the A.3.1 layout; `pledgeFromVault` is the reference flow. (4) **Runtime:** C's hook is used instead of A's bridge; it works on Node 24, broken on Node 22.22 (Blockers → C) |
| **Is it done?** | Mock chain ✓: 2.1, 2.1b, 2.2, 2.3, 2.4, 2.5 + D-P1 leftovers + the Track E guard endpoints. Root `npm test` → **29 files / 175 tests green**, `npm run typecheck` clean (18:50, `main` @ 68131d5 + `origin/trackD` merged). `npm run demo-injection -w @agentcoop/scripts` ~13 s on Node 24. **Open (mainnet, part of the acceptance):** a vault T5 + T10 and a 403 → sats + A.P3 (`buildPledge(…,'vault')` or `pledgeFromVault`) + C.P3's vault agent + a Node 24 laptop |
| **Other tracks?** (18:45 fetch) | **A:** the `htlcLockingScript` skeleton is **open and has a body** (`packages/core/src/scripts/htlc.ts`: claim = SHA256 + agent/guard 2-of-2, refund = maker/agent 2-of-2, pre-signed with nLockTime); the `planSettlement` window fix and `cancelPledge → { txid, beef }` on main; A.P3 not started (`buildPledge('vault')` still `NOT_IMPLEMENTED`); no `openWallet(...).wallet` fix in `skeleton.ts`. **B:** `{ op:'vaults', owner }` / `{ op:'vault' }` exist and match D's record (owner-cli's second source, checked in the e2e); B-INT + the local part of phase 6 on main; the coordinator planned and settled a vault pledge without any change. **C:** P1 on the mock chain; the agent profile has a `mode: 'p2pkh' \| 'vault'` field but no vault path (C.P3). **E:** the plan exists (`plan/track-E-frontend.md`), nobody assigned; what they asked of the guard is done |
| **Dependencies of the next phase (phase 3 Rail PoC)** | A.P0 `InputSigner` ✓; `htlcLockingScript` ✓ (A wrote it, D owns it). **Base Sepolia RPC** ✓ (`https://sepolia.base.org` answers `eth_blockNumber` from this container). **Missing:** Base Sepolia test ETH + USDC (SETUP-ACCOUNTS #9–11, human; faucet), EVM keys (`BASE_PRIVATE_KEY`, in the vault), 30k sat in the `maker` wallet (no sats), Foundry (not in this container; `solc` 0.8.38 is on npm). Validation tests 4 (nLockTime, ≤ 1,000 sat) and 6 (v1 malleability) **need mainnet sats**. Decision: the parts of phase 3 without sats (the HTLC contract + its local tests, the BSV side's script/refund tx on the mock chain, the `apps/maker` skeleton) can start; the Base Sepolia and mainnet steps when the sats + faucet arrive. If neither arrives, "Rail PoC not done" into STATUS at the end of the time box and phase 5's B path |
| **Interface change?** | MASTER §3.1 (Node 24 note), §3.3 (VaultSigner note), §3.7 (the D.P2 `/cosign` additions, `GET /vaults` `hotLast24hSats`, E's three endpoints ✅), §3.9 (`GUARD_CORS_ORIGIN`, `DATA_DIR`), §3.10 (the guard source ✅). STATUS "Interface changes" 18:40 D rows |
