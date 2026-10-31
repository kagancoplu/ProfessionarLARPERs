# Track A — Protocol core (`packages/core`)

> **Role:** the whole on-chain mechanism: types, tx builders, sighash signing (BRC-100 and wallet-toolbox), the DvP verifier, `verifyLineage`, market builders, the walking skeleton. **You are on the critical path**: B and C use your builders.
> **References:** `00-MASTER-PLAN.md §3` (interfaces), `FINAL-IDEA.md §4` (mechanism), guide §5, §6.3, §9, §17, §20; kit `client/signer.ts`, `client/token.ts`, `core/rules.ts`, `test/helpers/mockchain.ts`.

## How to use this file with an AI

1. Give the AI **one phase only**. Prompt template:
   > "Read `plan/00-MASTER-PLAN.md` §3 and §4, `plan/STATUS.md` and **phase N** of `plan/track-A-protocol.md`. Implement only phase N. When done, run the Checkpoint at the end of the phase and update the Track A section of STATUS.md."
2. The AI **copies** kit code, it does not rewrite it. It does not guess API names; it checks them in `node_modules/@bsv/sdk/dist/types`.
3. No moving to the next phase before the current one is done.

---

## Phase 0 — Skeleton, types, SDK bridge, signature spike → S0

**Goal:** the ground everyone builds on is ready within 1–2 hours; the riskiest assumption (a custom-scope signature with Desktop) is tested in the first hour.

**Dependency:** none. (Without sats, postpone 0.4 until D funds it; do the rest.)

**Tasks**
- 0.1 Monorepo: root `package.json` (workspaces `packages/*`, `apps/*`, `scripts`), `tsconfig.base.json`, a root `vitest.config.ts` = the kit's alias (path `node_modules/@bsv/sdk/dist/cjs/mod.js`), `.gitignore` (`.env`, `data/`, `*.sqlite`), a copy of `AGENTS.md`. Versions pinned as in the `docs/AGENTS.md` table.
- 0.2 `packages/core`: `src/types.ts` (MASTER §3.3 exactly), `src/sdk.ts` (`export * from '@bsv/sdk'`), `src/index.ts`. Copy from the kit: `core/inscription.ts`, `core/rules.ts`, `core/addresses.ts`, `client/signer.ts`, `client/token.ts`, `client/overlayApi.ts`, `client/payments.ts`, `client/arcadeChainTracker.ts`, `client/coinselect.ts` → `packages/core/src/kit/`. `test/helpers/mockchain.ts` → `test/helpers/`.
- 0.3 `src/scripts/opreturn.ts`: `buildOpReturn(op, json)` / `parseOpReturn(script)`; the MASTER §3.2 envelope. Test: round trip, all numbers are strings.
- 0.4 **Validation tests 2 + 3 (mainnet, BSV Desktop, 1,000 sat):** `scripts/spike-sighash.ts`: connect to Desktop with `WalletClient('auto', APP_ORIGINATOR)`; set aside a 1,000 sat coin on a P2PKH derived with `[1,'agentcoop pledge']` (`createAction`, basket `agentcoop`); sign this input with `SIGHASH_SINGLE|ANYONECANPAY|FORKID` (a scope-parameterised copy of the kit's `signWalletP2pkhInput`); let a second wallet-toolbox wallet add a fee input and complete with `ALL|FORKID`; broadcast to Arcade as EF. Observe: how many approval windows Desktop showed (test 3). Write the result into the STATUS "Validation tests" table.
- 0.5 `src/signers/P2pkhWalletSigner.ts`: implements the `InputSigner` interface; takes a scope parameter (default ALL|FORKID). A generalised `signer.ts`.
- 0.6 `npm test` green (the rules test moved from the kit + the opreturn test).

**Acceptance:** `npm install && npm test` clean; `packages/core` imported as `@agentcoop/core` from other workspaces; the test 2/3 result in STATUS; S0 items ✓ for A.

**Outputs:** root configuration; `packages/core/src/{types,sdk,index}.ts`, `src/kit/*`, `src/scripts/opreturn.ts`, `src/signers/P2pkhWalletSigner.ts`; `scripts/spike-sighash.ts`; `test/helpers/mockchain.ts`.

> **Status (2026-10-30): ✓ mock chain, the mainnet run waiting.** Detail and result: `plan/phases/A-P0.md`. Deviations from the plan:
> - `sdk.ts` re-exports the CJS build **by a relative file path** instead of tsconfig `paths` (the SDK's `exports` map does not allow `dist/cjs`). Rule: everyone imports from `@agentcoop/core/sdk`.
> - Extra files: `src/errors.ts` (`AgentCoopError`), `src/signers/sighash.ts` (`signP2pkhWithScope`, `sighashFor`), `src/scripts/{vault,htlc}.ts` skeletons, `src/kit/lookupTypes.ts`; an optional `topic`/`service` on `OverlayClient`.
> - The mock-chain half of 0.4: `test/spike-sighash.mockchain.test.ts`. The mainnet half (`scripts/spike-sighash.ts`) waits for Desktop + sats (STATUS Blockers).

### ✋ Checkpoint (end of phase 0)
1. **Is the plan still good?** If test 2 fails, the plan B in `FINAL-IDEA.md §12.2` kicks in: provider offers come from a server wallet. Update phase 1.2 of this file and the MASTER §3.3 `Offer` note; write it into STATUS "Plan changes". The same if anything else you learned changes the plan.
2. **This phase is done** → update the Track A section of STATUS (phase, file paths, known issues).
3. **What did the other tracks do?** Read all of STATUS. B and C are waiting for your `types.ts`; write that it is ready in the "What other tracks expect from me" row.
4. **Dependencies of the next phase:** D.P0 (funded server wallets, `scripts/wallets.ts`). Otherwise finish phase 1 on the mock chain, keep the mainnet run waiting; write it into STATUS Blockers.
5. If you changed an interface, update MASTER §3 and announce it in STATUS.

---

## Phase 1 — Offer, pledge, settlement builders + walking skeleton → S1

**Goal:** with server wallets only, 1 provider + 2 agents, **the first DvP settlement** on the mock chain and then on mainnet. The project's biggest technical risk closes here.

**Dependency:** D.P0 (`scripts/wallets.ts`, funded `agent-1`, `agent-2`, `provider-api`). For the overlay, B.P1's `tm_agentcoop`; if not ready, temporarily the kit's `tm_tokenkit` (same rules).

**Tasks**
- 1.1 `src/pool/reserve.ts` — `buildReserveAndAnnounce(wallet, tokenKit, terms)`: take N credits into one UTXO (an output of exactly N with `TokenKit.merge` + `send(…, 'self')` if needed; it will be output 0), add `OP_RETURN pool <terms>` to the same tx. `poolId = txid_0`. Submit to the overlay (the kit outbox).
- 1.2 `src/pool/offer.ts` — `signOffer(wallet, outpoint, terms)`: a `SINGLE|ACP|FORKID` signature with the input 0 ↔ output 0 (`payScriptHex`, `priceSats`) mapping; return an `Offer`. Verifier: `verifyOffer(offer)` → signature, outpoint unspent (Arcade `/tx` + overlay), terms consistent.
- 1.3 `src/pool/pledge.ts` — `buildPledge(wallet, terms, credits, 'p2pkh')`: amount = `ceil(credits × priceSats / N)` + a fee-share buffer (e.g. +300 sat); out0 the pledge coin (a derived key, basket `agentcoop`, protocol/keyID in customInstructions), out1 `feeSats → payScriptHex`, out2 `OP_RETURN pledge`. `cancelPledge` = spend the coin to itself with BRC-29.
- 1.4 `src/pool/plan.ts` — `planSettlement(offer, pledges, chainInfo)`: the MASTER §3.2 ordering; the `120 %` upper bound; a participant list whose credits total exactly N (the excess waits); the fee (sat/kB from the Arcade `/health` policy, split equally among participants); change = to the pledge coin's own script; `pledgeListHash`; the template tx: in0 offer, out0 payment, in1..n pledges, out1..n BSV-21 transfer inscriptions → `receivePkh(participant, tokenIndex)` (kit `addresses.ts`), out n+1.. change, last the OP_RETURN settle. `templateBEEF` = with all source txs (pledge txs + the offer tx; `beefFromArcade` if needed).
- 1.5 `src/pool/verify.ts` — `verifySettlementPlan(plan, offer, myOutpoint, { expectedCredits, verifyLineage: false })`: output 0 equals the offer; my input is there; my credit output is the right address and amount; my change ≥ expected; Σcredits = N; the OP_RETURN hash recomputed and equal; follows the ordering rule. (`verifyLineage` is added in phase 2, the flag exists already.)
- 1.6 `src/pool/sign.ts` + `assemble.ts` + `broadcast.ts` — `signSettlementInput(plan, i, signer)`, `assembleSettlement(plan, scripts)`, `broadcastEF(tx, arcadeUrl)` (guide §20.1: `POST /tx` EF). After broadcast, submit to the overlay (`X-Topics: ["tm_agentcoop"]`).
- 1.7 **`scripts/skeleton.ts`**: end to end with server wallets: token deploy (N=1,000, dec 0) → reserve+announce → offer → agent-1 pledges 600, agent-2 pledges 400 → plan → each agent verifies + signs → assemble → broadcast → overlay submit → each agent's `TokenKit.sync()` sees the credits → print the WhatsOnChain link. First on the mock chain as `test/skeleton.mockchain.test.ts` (B's overlay started over HTTP in the test; the kit's `e2e.mockchain.test.ts` pattern), then on mainnet with `NETWORK=main`.
- 1.8 A failed pool test: the deadline passed, the pledges sit unspent, no broadcast (`planSettlement` refuses after `deadlineHeight`).

**Acceptance:** the mock-chain test green; the mainnet settlement txid in STATUS "Mainnet transactions" (T1, T2, T3, **T5**); both agents' credit balances right on the overlay; S1 ✓.

**Outputs:** `packages/core/src/pool/*`, `scripts/skeleton.ts`, `test/skeleton.mockchain.test.ts`.

> **Status (2026-10-30): ✓ mock chain, mainnet (S1) waiting.** Detail and result: `plan/phases/A-P1.md`. Deviations from the plan:
> - 1.1: the credit UTXO is not on the token receive address but moved to the `[1,'agentcoop provider']` keyID `offer <poolNonce>` key, basket `agentcoop offers` (so TokenKit does not touch it). The pool OP_RETURN json = terms − `poolId` + `nonce`. In MASTER §3.2.
> - 1.2: `verifyOffer(offer, { sourceTx })` offline (amount, token, signature with Spend). The unspentness check is left to the caller (coordinator: overlay/Arcade).
> - 1.4: `pledgeListHash` = sha256(join(',', sort_lex(outpoints))). The 120 % window is recomputed once insufficient coins are dropped. The fee = the real signature size × `fetchChainPolicy()` (Arcade `/health`).
> - 1.6: sign/assemble/broadcast/internalize in one file: `src/pool/settle.ts`. `broadcastEF` = `POST {arcade}/tx` JSON `{ rawTx: EF hex }` (the same as wallet-toolbox Arcade.js). New: `internalizeSettlement` (change into the basket with `change:true`, the spent pledge `relinquishOutput`).
> - 1.7: the kit overlay (`tm_tokenkit`) as the overlay in tests; when B's `tm_agentcoop` arrives, `OverlayClient(..., COOP_TOPIC, COOP_SERVICE)`.

### ✋ Checkpoint (end of phase 1)
1. **Is the plan still good?** If the skeleton brought a surprise about fees, BEEF or overlay admission, update phase 2 and MASTER §3.3/3.4; write it into STATUS. If the overlay refused (validation test 1), decide on a `rules.ts` extension with B.
2. **This phase is done** → update STATUS Track A; write the txids.
3. **What did the other tracks do?** Is B.P1's offers API ready (connect the skeleton to use `POST /offers`); does C.P1 have a product/token (move the skeleton to C's token)?
4. **Dependencies of the next phase:** Arcade/WoC access (exists). D.P1's vault script for phase 3; not needed now.
5. If an interface changed, MASTER §3 + STATUS.

---

## Phase 2 — `verifyLineage`, market builders, hardening → S2

**Goal:** participants and the guard verify the credit lineage themselves without trusting the overlay; market listings and sweeps work; the builders get close to production quality.

**Dependency:** phase 1. (C.P2 and D.P2 are waiting for your `verifyLineage`: **finish 2.1 first and write it into STATUS.**)

**Tasks**
- 2.1 `src/verify/lineage.ts` — `verifyLineage(outpoint, { arcadeUrl, wocUrl? })`: fetch the tx and its ancestors with `beefFromArcade` (kit), walk unconfirmed ancestors, a WoC `GET /v1/bsv/main/tx/{txid}/beef` fallback; apply `identifyAdmissible` (kit `rules.ts`) at each step; on reaching the deploy return `{ ok, tokenId, amt, ownerPkh, depth }`. A depth limit (e.g. 50) and a cache. **Validation test 7**: run it on a fresh mainnet token transfer.
- 2.2 A `verifyLineage: true` path in `verifySettlementPlan`: is the offer input real credits, is `amt = N`.
- 2.3 `src/market/listing.ts` — `signListing(wallet, outpoint, askSats)`: `SINGLE|ACP`, `payScriptHex` the seller's derived key (`[1,'agentcoop market']` instead of `[1,'agentcoop provider']`, add to MASTER §3.2), announced with `OP_RETURN list` in a separate small tx (optional; the primary record is B's `POST /listings`). `cancelListing` = spend the coin.
- 2.4 `src/market/sweep.ts` — `buildSweep(wallet, listings[])`: input i ↔ output i (seller payments), then a single credit output to the buyer, change; the buyer signs `ALL`; `verifyLineage` for each listing. Test: 2 listings in one tx.
- 2.5 Fee and policy: read sat/kB from Arcade `/health`, compute the settlement size with the real signature lengths (p2pkh 108, vault 2-of-2 ≈ 150 — confirm with D), split equally among participants, leave the rounding excess **to the fee**, not to the provider nor to the first participant.
- 2.6 Griefing support: `planSettlement(…, { exclude: outpoint[] })` — a blacklist; filling from the waiting list; a `round` number.
- 2.7 Error messages and type safety: every `verify*` function throws `AgentCoopError{code}`; the codes are added to MASTER §3.4 (the coordinator and the guard log them).
- 2.8 Test suite: `test/core.pool.test.ts` (ordering determinism, 120 %, hash, change), `test/core.lineage.test.ts` (refusing a fake token — derived from the kit's forgery test), `test/core.market.test.ts`.

**Acceptance:** a plan with fake credits fails in `verifySettlementPlan` (test); a listing + sweep (T8) done on mainnet; A's side ✓ for S2.

**Outputs:** `src/verify/lineage.ts`, `src/market/*`, tests, MASTER §3.2/3.4 updates.

> **Status (2026-10-30): ✓ mock chain, mainnet (test 7, T8) waiting.** Detail and result: `plan/phases/A-P2.md`. Deviations from the plan:
> - 2.1: `verifyLineage` walks only the inputs of **the same token**, recomputes the txid of every fetched tx, verifies the ancestors' signatures with Spend. `fetchTx` is injectable. CLI: `scripts/lineage-check.ts`.
> - 2.3: listed credits move to `[1,'agentcoop market']` keyID `list <nonce>` (`reserveListing`, basket `agentcoop listings`), `OP_RETURN list` in the same tx. Then `signListing`, `verifyListing`. Cancellation = `cancelListing` (takes the credits back). `cancelPool` for cancelling a pool.
> - 2.4: inside `src/market/listing.ts` instead of `src/market/sweep.ts`. **The signature changed:** `buildSweep(wallet, kit, listings[], opts)` → `{ txid, credits, tx }` (MASTER §3.4 + STATUS).
> - 2.5 and 2.6 were done in phase 1. 2.7: the codes are in MASTER §3.4 (`BAD_LISTING`, `LINEAGE_FAILED` …). 2.8: the test files are `packages/core/test/{pool.plan,lineage}.test.ts`, `test/market.mockchain.test.ts`.

### ✋ Checkpoint (end of phase 2)
1. **Is the plan still good?** If `beefFromArcade` fell short on unconfirmed ancestors, make the WoC fallback primary and plan for it; if `verifyLineage` is too slow, write down the cache strategy. Changes into STATUS.
2. **This phase is done** → STATUS Track A.
3. **What did the other tracks do?** Are D.P1's `vaultLockingScript` and `VaultSigner` ready (phase 3 integrates them)? Does B.P2's coordinator use `planSettlement`, which error codes did it need?
4. **Dependencies of the next phase:** D.P1 (vault script + guard `/cosign`), B.P2 (coordinator). If not ready, write phase 3's 3.1 against D's interface draft with a mock guard.
5. If an interface changed, MASTER §3 + STATUS.

---

## Phase 3 — Integrating the vault path and end-to-end scenarios → S3

**Goal:** a vault agent enters a settlement (agent + guard signatures); the market and coordinator flows are locked down with core tests.

**Dependency:** D.P1/P2 (`vaultLockingScript`, `VaultSigner`, guard `/cosign`), B.P2 (the coordinator round).

**Tasks**
- 3.1 `buildPledge(…, 'vault', vaultScript)`: the pledge coin locked to the vault script (the agent takes it out of the vault: agent + guard 2-of-2 with `createAction + signAction`, guard `context.kind='pay'`); change to the vault. `unlockingScriptLength` for the vault is D's value.
- 3.2 `test/e2e.vault-settlement.mockchain.test.ts`: 1 p2pkh agent + 1 vault agent + a provider; the guard as a mock in-process (D's policy engine imported); the settlement succeeds; then in the same test a plan the guard refuses (a provider outside the allowlist) → no signature → no broadcast.
- 3.3 `test/e2e.coordinator.mockchain.test.ts` (with B): 3 agents, one does not sign → completed from the waiting list in round 2; the blacklist works.
- 3.4 `test/e2e.market.mockchain.test.ts`: after the settlement agent 1 lists its surplus credits, agent 3 buys them with a sweep, `verifyLineage` passes.
- 3.5 Mainnet: a vault settlement (T5 + T10) once.

**Acceptance:** three e2e tests green; the vault settlement txid on mainnet in STATUS; A ✓ for S3.

### ✋ Checkpoint (end of phase 3)
1. **Is the plan still good?** If there are surprises such as the vault signature length, a dummy element (`OP_0`) or a policy refusal, update the MASTER §3.3 `InputSigner` note with D.
2. **This phase is done** → STATUS Track A.
3. **What did the other tracks do?** Do C.P3's agents use the vault mode; did D.P3's Rail PoC ask you for anything for `htlcLockingScript`?
4. **Dependencies of the next phase:** none (documentation).
5. If an interface changed, MASTER §3 + STATUS.

---

## Extension phases (5 and 6) — why and the rules

> Phases 0–3 build the minimum mechanism. Against the jury weights (adoption 35 %, stack 25 %, technical/non-custodial 20 %), three things that make a difference are missing: (1) the only **"Open"** non-custodial item in FINAL-IDEA §8 (the agent sells its credits and bypasses the guard), (2) offline **people** being able to join a pool (adoption: people will not wait in a 60 s signing round like agents), (3) **visibility** in the existing 1Sat ecosystem (credits should be tradable outside our overlay too).
>
> **Rules:** phases 5 and 6 **do not start before S3 is done**. The core builder signatures (MASTER §3.4) do not change; only new functions are added. Each extension sits behind a flag (`creditLock: 'p2pkh' | 'vault'`, `pledgeMode: 'interactive' | 'lighthouse'`); with the flag off the behaviour is exactly phase 3's and the existing tests stay green unchanged. Phase 4 (wrap-up) is done after the extensions; if time runs out, phases 5/6 are cut, phase 4 is not.
>
> **Considered and not added:** period (forward) credits (they split liquidity, FINAL-IDEA §4.11), Coop Rail's reverse direction (D's area), an MCP server (C's area). These stay in K3.

---

## Phase 5 — Vault-locked credits + Lighthouse mode (offline human pledges) → S3+

**Goal:** (a) a vault agent's credits land at settlement on a BSV-21 output **locked to the vault script**; spending the credits (redeem, listing) then needs the guard's co-signature too, and the FINAL-IDEA §8 gap "the agent sells its credits and bypasses the guard" **closes**. (b) People can join a pool by **signing once and going offline** (Lighthouse mode), without breaking DvP.

**Dependency:** S3 (phase 3 green). D.P1's `vaultLockingScript` (the real body). B's topic manager must accept the new output type (the rule function comes from A, B wires it). If not ready: A stands up the kit overlay with an extended `identifyAdmissible` in its own test, STATUS → Blockers.

**Design notes**
- **The vault-locked credit output:** `OP_FALSE OP_IF "ord" OP_1 "application/bsv-20" OP_0 <json> OP_ENDIF` + **the vault script** (instead of a P2PKH). Script does not enforce BSV-21 but it enforces the ownership condition: spending the output needs the owner's signature or the agent+guard 2-of-2. The token rules (conservation, lineage) do not change; only the **owner suffix** widens: the kit's `decodeBsv21` expects a P2PKH suffix → a new `decodeBsv21Owned(script)` → `{ …decoded, owner: { kind: 'p2pkh', pkh } | { kind: 'vault', vaultHash } }`. `vaultHash = sha256(vaultScriptHex)` (for the lookup index).
- **1Sat compatibility:** the 1Sat indexer indexes non-P2PKH suffixes without an owner address; visibility on BananaBlocks may be lost. A conscious trade-off; written in the README. Credits leaving the vault (redeem/listing) land on a P2PKH again and become visible.
- **Lighthouse mode:** the `ALL|ACP` design in idea.md broke DvP (FINAL-IDEA §4.6). Instead we use a **`SINGLE|ANYONECANPAY` pledge**: the person's pledge input `i` is paired in the settlement with their own credit output **at the same index** ("spend this coin as long as the output at the same index gives me k credits"). The settlement layout is already `in i ↔ out i` (in0 offer ↔ out0 payment, in1..n pledge ↔ out1..n credits), so **the template does not change**. Constraint: SINGLE covers only one output → no change → the pledge coin is **exact** (`ceil(k×P/N) + feeShare`); any excess fee share goes to the fee. The credit output's script and amount are fixed by the signature → the coordinator cannot change them, DvP holds. The output's BSV-21 validity (input 0 being real credits) cannot be checked at the moment the person signs; so the person's signature is locked only to **that pool's `poolId`**: `poolId` + `mode:'lighthouse'` in the pledge OP_RETURN, and the coordinator + the other participants already verify input 0 with `verifyLineage`. Residual risk: the person's pledge spent with a fake "pool" offer and fake credits given → the person signs only pools that passed `verifyOffer` + `verifyLineage` (participant-cli makes this mandatory before signing). A row is added to the threat model.

- **⚠ Design correction (30.10, implemented):** the bare `SINGLE|ACP` lighthouse above is **unsafe**: BSV-21 is not enforced by script, so anyone who sees the signature can take the person's coin by putting a fake "k credits" output at the same index and writing the rest to themselves (the overlay does not accept the fake credits, but the money is gone; "sign only verified pools" does not stop it, the thief needs no pool). **Implemented:** the coin sits on the script `OP_IF <person withdraw> CHECKSIG ELSE 2 <person> <guard> 2 CHECKMULTISIG ENDIF`; the person signs `SINGLE|ACP` once and goes offline, and **the guard the person chose** checks the whole plan + `verifyLineage` at settlement and co-signs `ALL`. The solo withdraw branch uses **a separate key** (with the same key the `SINGLE|ACP` pre-signature would also open that branch; caught in a test). Lighthouse participants come after the interactive ones (no change), so the interactive change stays at `n+1+j`. Remaining trust: the guard + a thief together could push a fake plan through → the person chooses the guard (the same model as the vault guard).

**Tasks**
- 5.1 `src/scripts/creditLock.ts` — `buildVaultCreditScript(json, vaultScript)`, `decodeBsv21Owned(script)`; unit test: P2PKH-suffixed and vault-suffixed outputs round-trip; the kit's `decodeBsv21` gives exactly the same result for P2PKH (regression).
- 5.2 Extending `src/kit/rules.ts` **on the copy, behind a flag**: `identifyAdmissible(tx, prev, { ownerKinds: ['p2pkh','vault'] })`. The default `['p2pkh']` = the kit's behaviour. The kit's rules tests green unchanged + new cases (a vault-suffixed transfer, a P2PKH output from a vault-suffixed input, the inflation refusal as before).
- 5.3 `planSettlement(…, { creditLock: 'vault' })`: the credit output of a participant with `signer:'vault'` is `buildVaultCreditScript(…, vaultScript)`; an optional `vaultScriptHash` on `PledgeRecord` (a MASTER §3.3 change, MASTER updated first). `verifySettlementPlan` expects it.
- 5.4 `src/vault/creditSpend.ts` — spending the credits in the vault: `buildVaultCreditTransfer(…)` agent+guard 2-of-2 (D's `VaultSigner`), guard `context.kind:'redeem'|'list'`. Adding the `kind` to the guard API is written as a request to D in STATUS.
- 5.5 `src/pool/lighthouse.ts` — `buildLighthousePledge(wallet, terms, credits, tokenIndex)`: an exact coin (`[1,'agentcoop pledge']`), out1 the registration fee, out2 `OP_RETURN pledge {…, mode:'lighthouse'}`; then `signLighthouseInput(wallet, outpoint, creditOutput)` → a `SINGLE|ACP|FORKID` signature, `LighthousePledge { outpoint, unlockingScriptHex, creditLockingScriptHex, satoshis }` (off-chain, to B with `POST /pledges/lighthouse`). Important: the SINGLE|ACP preimage contains only its own input and the output **at the same index**; so the person's signature is not independent of the index → the coordinator must place lighthouse pledges **at the index they were signed for**. Resolution: the signature is not bound to the index (in BIP-143 `inputIndex` does not enter the preimage, it only selects the paired output) — **prove it in a test** with the SDK's `TransactionSignature.format` behaviour; otherwise the lighthouse pledge is bound to a fixed index (`1`) and there is one lighthouse entry per pool (the low road).
- 5.6 `planSettlement` accepts lighthouse inputs mixed: interactive (ALL) + lighthouse (SINGLE|ACP) in the same tx; change only for the interactive ones. `verifySettlementPlan` keeps counting the lighthouse inputs' own credits for an interactive participant (Σk = N).
- 5.7 Tests: `test/core.creditlock.test.ts`, `test/e2e.lighthouse.mockchain.test.ts` (1 interactive agent + 1 lighthouse person + 1 vault-locked agent → one settlement; the lighthouse person is offline, i.e. in the test their signature is taken in advance and their wallet closed), negative: the coordinator changes the lighthouse credit output → script verification fails.
- 5.8 Mainnet: 1 mixed settlement (a T5 variant, "T5-L") with ≤ 1,000 sat pledges.

**Acceptance:** a vault agent's credits cannot be spent without the guard (in the mock-chain test the agent's solo `createAction` → a script error); the settlement completes while the lighthouse person is offline; the existing phase 0–3 tests green unchanged; the FINAL-IDEA §8 table row "the agent sells its credits on the market and bypasses the guard" ready to be updated to **Closed** (a threat model note to D).

**Outputs:** `src/scripts/creditLock.ts`, `src/pool/lighthouse.ts`, `src/vault/creditSpend.ts`, `src/kit/rules.ts` (flagged), tests; MASTER §3.3 (`PledgeRecord.mode`, `vaultScriptHash`, `LighthousePledge`), §3.5 (`POST /pledges/lighthouse`), §3.7 (`kind:'redeem'|'list'`).

### ✋ Checkpoint (end of phase 5)
1. **Is the plan still good?** If the index independence of the SINGLE|ACP signature could not be confirmed in a test, write into the track file and STATUS that lighthouse fell back to the "one per pool" road. If the 1Sat visibility trade-off was found unacceptable, `creditLock:'vault'` stays off by default.
2. **This phase is done** → STATUS Track A (files, txids).
3. **What did the other tracks do?** Was `ownerKinds` wired into B's topic manager? Does C's participant-cli use lighthouse? Did D add the `redeem`/`list` context to the guard?
4. **Next phase:** the OrdLock part of phase 6 works only with P2PKH-suffixed credits; vault credits are moved out to a P2PKH (with the guard's approval) before listing.
5. If an interface changed, MASTER §3 + STATUS.

---

## Phase 6 — OrdLock listings (1Sat Market visibility) + covenant vault research (time-boxed) → S3+

**Goal:** (a) credits can be listed and bought in the **existing 1Sat Market** besides our own market: outside liquidity and visibility (adoption). (b) Research **in at most 3 hours** whether a **covenant vault** that could remove the guard entirely is feasible with the Chronicle opcodes; a written report whatever the result.

**Dependency:** phase 2's market builders; phase 5 (the way out of the vault to a P2PKH for vault credits). External dependency: the 1Sat OrdLock script format (verified from the official source, not guessed: `docs.1satordinals.com`, the `js-1sat-ord` source code). If it cannot be verified, 6.1–6.3 stop and it is written into STATUS.

**Tasks**
- 6.1 **Verify the OrdLock format from the source:** read the official spec/source code for 1Sat's `OrdLock` locking script (owner pkh + the "payment output" serialization, the seller's cancel branch); with quotes and source links under `docs/` in `plan/phases/A-P6-ordlock-notes.md`. Copy the script constants, do not re-derive them.
- 6.2 `src/market/ordlock.ts` — `buildOrdLockListing(wallet, tokenOutpoint, askSats)`: move the credit UTXO onto the OrdLock script (a BSV-21 transfer inscription + an OrdLock suffix); `cancelOrdLockListing`; `buildOrdLockPurchase(wallet, listingOutpoint)` (the buyer side; `verifyLineage` first). Our own `SINGLE|ACP` listings (phase 2) **stay**; OrdLock is a second channel.
- 6.3 Overlay: an OrdLock-suffixed BSV-21 output → `decodeBsv21Owned` → `owner.kind:'ordlock'` (the third kind of the phase 5 extension). A request to B in STATUS for the rule and a lookup `{ op:'listings', source:'ordlock' }`.
- 6.4 Tests: on the mock chain list → buy → the buyer's overlay balance; the seller's cancellation; a fake listing (fake credits) fails in `verifyLineage`.
- 6.5 Mainnet: 1 OrdLock listing + purchase (T8b); a screenshot and link of it showing in the 1Sat Market / BananaBlocks into STATUS.
- 6.6 **Covenant vault research (time box 3 hours):** with the opcodes Chronicle restored (`OP_CAT`, `OP_SUBSTR`, `OP_LEFT`/`OP_RIGHT`, `OP_SPLIT`, numeric opcodes; the list taken **from the official Chronicle spec**) and the OP_PUSH_TX technique (verifying the sighash preimage inside the script): a script prototype that enforces, without a guard, the rule "the output may go only to an allowlisted `payScript` and ≤ X sat, change returns to the same script". Output: `plan/phases/A-P6-covenant-report.md` (feasible or not, script size, fee cost, the local verification result with the SDK's `Spend`, a recommendation). Code only under `src/research/`, not imported from the core. Does not go to mainnet.

**Status (30.10):** the 6.1 finding is in `plan/phases/A-P6-ordlock-notes.md`: OrdLock v1 creation was removed in 1Sat (2026-09-11), v2 (2026-10-27, `@bsv/sdk ^4`) is too new → by user decision **6.2–6.5 skipped**. 6.6 done: `plan/phases/A-P6-covenant-report.md`.

**Acceptance:** an OrdLock listing matching the 1Sat format bought on mainnet (txid in STATUS) **or** the reason the format could not be verified written into STATUS; the covenant report exists; the core tests green unchanged.

**Outputs:** `src/market/ordlock.ts`, tests, `plan/phases/A-P6-*.md`, `src/research/covenant/*`.

### ✋ Checkpoint (end of phase 6)
1. **Is the plan still good?** If the covenant turned out feasible, write it into STATUS as a suggestion for FINAL-IDEA §13 "future vision" (taking it into the core is a post-S4 decision). If OrdLock failed, the README describes only our own market.
2. **This phase is done** → STATUS Track A.
3. **What did the other tracks do?** Was `source` added to B's listings index; did D take the 1Sat link into the README?
4. **Next phase:** phase 4 (wrap-up).
5. If an interface changed, MASTER §3 + STATUS.

---

## Phase 4 — Wrap-up → S4

**Tasks**
- 4.1 `packages/core/README.md`: the mechanism diagram (FINAL-IDEA §4.4), the function list, the signature scopes, error codes, a "why ACP+ALL" note (§4.6 shortened).
- 4.2 Test coverage: all e2e tests in `npm test` ≤ 5 min; no flaky test.
- 4.3 Code cleanup: TODOs either close or move to `FINAL-IDEA.md §13`.
- 4.4 Hand-over to D: a "Protocol" section for the main README and the T1–T8 txid list.

### ✋ Checkpoint (end of phase 4)
1. Does the plan need a change (e.g. leaving a builder out of scope)? Write it into STATUS.
2. STATUS Track A: "Done".
3. Is any of the other tracks' open blockers yours? If so, take it.
4. A items ✓ in the S4 checklist.
