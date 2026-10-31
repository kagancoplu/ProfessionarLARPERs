# Track D — Vault + Guard, Ops (wallets/funding), Coop Rail PoC, Delivery (`apps/guard`, `apps/owner-cli`, `scripts/`, `apps/maker`, `contracts/base-htlc`)

> **Role:** (1) The team's **operations**: wallets, keys, funding, communication with Axel, `.env`. (2) **Mandate Vault**: the script, the guard policy engine, the owner CLI, `VaultSigner`. (3) **Coop Rail PoC**: a 4-hour time box, Base Sepolia. (4) **Delivery**: README, value note, threat model, tx links.
> **References:** `00-MASTER-PLAN.md §3.7, §6`, `FINAL-IDEA.md §4.9, §4.10, §8, §14`, `agent-spending-vault.md` (threat model draft), guide §5, §6.3, §9, §14; kit `client/signer.ts`, `client/payments.ts`.

## How to use this file with an AI

1. Give the AI **one phase only**:
   > "Read `plan/00-MASTER-PLAN.md` §3, §4 and §6, `plan/STATUS.md` and **phase N** of `plan/track-D-vault-ops-rail.md`. Implement only phase N. When done, run the Checkpoint and update the Track D section of STATUS.md."
2. Private keys are never written to a file/commit/log. `.env` and `data/` are in gitignore; the AI checks this every phase.
3. The Rail PoC is **cut at 4 hours**; whatever the result, it is recorded and the next phase begins.
4. **Execution order:** 0 → 1 → 2 → 3 → **5 → 6 → 7** (extension) → **4** (delivery). The extension phases **do not start before S3 is done**. Phase 4 is always the last phase and is never skipped: **4 hours** before the submission time, whatever extension phase you are in, stop, write where you are into STATUS and move to phase 4.
5. The detailed phase plans are in `plan/phases/D-P<n>.md` (written before writing code).

---

## Phase 0 — Ops: wallets, keys, funding, Axel → S0

**Goal:** money and identities ready so everyone can work on mainnet; the sats request sent; the questions sent to Axel.

**Dependency:** A.P0 repo skeleton (otherwise `scripts/` starts as an independent mini package).

**Tasks**
- 0.1 **Sats request (first 10 minutes):** in the `desktop-treasury` Desktop, Payments → Receive → BSV Address; address + team name → Telegram `@lexamaison`. Write it into STATUS "Wallet/funding status".
- 0.2 **Questions to Axel:** send the MASTER §6.4 message. The answers into STATUS.
- 0.3 `scripts/keygen.ts`: prints 7 `PrivateKey.fromRandom().toHex()` (stdout only). `.env.example` exactly as MASTER §3.9; fill `.env`, check the gitignore (`git check-ignore .env data/`).
- 0.4 `scripts/wallets.ts`: `openWallet(name)` → a wallet-toolbox wallet with guide §14.2 (Arcade primary), `data/wallets/<name>.sqlite`; `monitor.startTasks()` optional. `scripts/identities.ts` → `config/identities.json` (public identity keys; committed).
- 0.5 `scripts/fund.ts`: `WalletClient('auto', APP_ORIGINATOR)` to Desktop; for each target, kit `createBrc29Payment(desktop, targetIdentity, sats)`; if the target is on the same machine, `acceptBrc29Payment(targetWallet, payment, new ArcadeChainTracker())`; otherwise `data/payments/<name>.json` + `scripts/receive.ts`. Desktop approvals in the README.
- 0.6 `scripts/balances.ts`: each wallet's spendable balance (guide §11 `poolBalance`) + `listOutputs` for the Desktops + WhatsOnChain links.
- 0.7 When the sats arrive: fund according to the MASTER §6.1 table (a 1,000 sat trial first, then in full). The funded wallets into STATUS.
- 0.8 `docs/OPS.md`: the wallet inventory, who holds which Desktop, funding steps, the "out of money" procedure, a note on the key vault.

**Acceptance:** `scripts/balances.ts` shows every wallet; at least `agent-1`, `agent-2`, `provider-api` funded (for S1); the message to Axel sent; S0 D ✓.

**Outputs:** `scripts/{keygen,wallets,identities,fund,receive,balances}.ts`, `scripts/lib/*`, `.env.example`, `config/identities.json`, `docs/OPS.md`, `plan/phases/D-P0.md`.

### ✋ Checkpoint (end of phase 0)
1. **Is the plan still good?** If the sats are late, tell everyone "continue on the mock chain, mainnet slips to S1" and write it into STATUS Blockers. If the Desktop Node connection had an originator problem, the fix into STATUS (C uses the same path).
2. **This phase is done** → STATUS Track D.
3. **What did the other tracks do?** A needs 1,000 sat for test 2; fund that first. Which wallets do B/C want, when?
4. **Dependencies of the next phase:** A.P0 (`InputSigner`, `P2pkhWalletSigner`, `opreturn.ts`). Otherwise write phases 1.1–1.2 independently, keep 1.4 waiting.
5. If an interface changed, MASTER §3 + STATUS.

---

## Phase 1 — The vault script, the guard, the owner CLI, validation test 5 → S2 (before)

**Goal:** an owner funds a vault and writes a policy from Desktop; the agent + guard spend with the 2-of-2; the owner withdraws alone. All three paths have run on mainnet.

**Dependency:** A.P0. (No need for A.P1; the vault spend is tested independently.)

**Tasks**
- 1.1 `packages/core/src/scripts/vault.ts` (you fill A's skeleton): `vaultLockingScript(ownerPub, agentPub, guardPub)` = `OP_IF <ownerPub> OP_CHECKSIG OP_ELSE OP_2 <agentPub> <guardPub> OP_2 OP_CHECKMULTISIG OP_ENDIF`; owner unlock: `<sig> OP_1`; 2-of-2 unlock: `OP_0 <sigAgent> <sigGuard> OP_0`. The `unlockingScriptLength` values exported as constants (A's fee computation uses them). An OP_RETURN `vault { v, vaultId, owner, agent, guard }` in the funding tx (B indexes it).
- 1.2 Keys: owner = Desktop `getPublicKey({ protocolID:[1,'agentcoop vault'], keyID: vaultId, counterparty:'anyone', forSelf:true })`; agent and guard = the same protocol in their own wallet-toolbox wallets. **Never lock to the identity key** (guide §5.1).
- 1.3 `apps/owner-cli` (Desktop): `create-vault --agent <identity> --guard <identity>` (generate the vaultId, build the script), `fund <vaultId> <sats>` (`createAction`, output basket `agentcoop vault`, customInstructions = protocol/keyID/script), `policy <vaultId> --allow <provider…> --max-pool 5000 --weekly 20000 --max-fee 500 --hot-daily 2000` (guard `PUT /policies/:agent`, the owner's identity with `AuthFetch`), `withdraw <vaultId>` (the OP_IF branch: the kit's `signWalletP2pkhInput` pattern but with subscript = the vault script; `createAction` + `signAction`), `status` (B's `vaults` query or its own basket).
- 1.4 `apps/guard`: wallet-toolbox (`WALLET_GUARD_KEY`); `PUT /policies/:agent` (only the registered owner identity); `POST /cosign` (MASTER §3.7): build the tx from the AtomicBEEF; is `inputIndex` a vault input; by `context.kind`: **`pay`** → output total ≤ `maxPerPoolSats`/`hotWalletDailySats`, the recipient on the allowlist (payScript → provider mapping: from the overlay's `pools`/`offers`), change to the vault, fee ≤ `maxFeeSats`; **`settle`** → A's `verifySettlementPlan` (DvP: the credit output to the agent's address, amount ≥ `expectedCredits`, `verifyLineage: true` once A.P2 is ready), + the `pay` checks; **`rail`** → is the output the vault script or a pledge coin. A rolling weekly total in `data/guard/ledger.json`. If it passes, `createSignature({ hashToDirectlySign })` → `signatureHex`; otherwise `403 { reason }`. Every decision is logged.
- 1.5 `VaultSigner` (`packages/core/src/signers/VaultSigner.ts`, A's `InputSigner`): the agent's signature (its own wallet, subscript = the vault script, `ALL|FORKID`) + guard `/cosign` → the unlocking script. A's `signSettlementInput` and C's agent use it.
- 1.6 **Validation test 5 (mainnet, 1,000 sat):** `fund` → a 2-of-2 spend (agent+guard) through `pay` → `withdraw` through the owner path. Three txids into STATUS (T9, T10). If bare multisig/OP_IF does not pass the miner policy, an alternative: two separate output types instead of `OP_IF`? No — first write the Arcade `/tx` error message into STATUS and talk to A.
- 1.7 Test: `test/vault.mockchain.test.ts` — fund, 2-of-2 spend, owner withdrawal, a guard refusal (outside the allowlist) → no signature.

**Acceptance:** the mock-chain test green; the three paths on mainnet; the guard starts; `VaultSigner` exported; D ✓ before S2.

**Outputs:** `packages/core/src/scripts/vault.ts`, `packages/core/src/signers/VaultSigner.ts`, `apps/guard/*`, `apps/owner-cli/*`, `test/vault.mockchain.test.ts`, `plan/phases/D-P1.md`.

### ✋ Checkpoint (end of phase 1)
1. **Is the plan still good?** If test 5 fails (a policy refusal), update FINAL-IDEA §4.9 and this phase; STATUS "Plan changes". Does Desktop's signing behaviour with a custom subscript match A's test 2 finding?
2. **This phase is done** → STATUS Track D; write `VaultSigner` and the `unlockingScriptLength` values into "What other tracks expect from me".
3. **What did the other tracks do?** Is A.P2's `verifyLineage` ready (for the guard's `settle` path)? Does B.P2's coordinator plan `signer:'vault'` pledges? Does C.P2's agent configuration have `mode:'vault'`?
4. **Dependencies of the next phase:** A.P2 (`verifyLineage`), A.P3 (`buildPledge(…,'vault')`). Otherwise test phase 2 with a mock plan.
5. If an interface changed, MASTER §3 + STATUS.

---

## Phase 2 — The guard's settlement integration, the injection scenario, the hot wallet → S3

**Goal:** a vault agent signs with the guard in the coordinator's round; the guard refuses on a prompt injection; the hot wallet cap works for retail.

**Dependency:** A.P2/P3, B.P2, C.P2.

**Tasks**
- 2.1 The guard's `settle` path: `verifySettlementPlan` + `verifyLineage: true`; `expectedCredits` from the agent's pledge record; the `pay` checks; update the weekly total.
- 2.1b **(added after D.P1)** A vault pledge tx (A.3.1: vault UTXO → out0 the pledge coin to the vault script, out1 fee → `payScript`, out2 OP_RETURN pledge) comes to the guard with `kind:'pay'`. In D.P1's `pay` rule the pledge coin counts as "returning to the vault", so `maxPerPoolSats` kicks in only at settlement. To stop the injection **at pledge time**: if the tx carries an `agentcoop pledge` record, the out0 pledge coin counts toward `maxPerPoolSats`, the recorded pool's `terms.provider` must be ∈ `allowProviders`, and out1 is proven with the `nonce` in the `pool` record (= the revenue key's keyID, A-P1). Terms: overlay `{ op:'pool' }` (discovery only; the payment proof by derivation).
- 2.2 Hot wallet: a BRC-29 payment from the vault → the agent's `default` basket within a guard-approved daily cap (`context.kind='pay'`, recipient = the agent itself, cap `hotWalletDailySats`); C's agent uses it for retail 402.
- 2.3 The injection scenario (with C): `scripts/demo-injection.ts` → guard 403 `{ reason: 'maxPerPoolSats exceeded' | 'provider not allowed' }`; a log line readable for the jury.
- 2.4 `test/e2e.vault-settlement.mockchain.test.ts` (shared with A) green; a vault settlement on mainnet (one run together with A.P3).
- 2.5 Guard README: the policy fields, which check closes which threat (mapped to FINAL-IDEA §8), "the guard alone cannot move funds, the owner can always withdraw".

**Acceptance:** a vault T5 + T10 and a 403 on mainnet; S3 D (vault) ✓.

**Outputs:** the guard's `settle` path, the hot wallet flow, `scripts/demo-injection.ts`, `test/e2e.vault-settlement.mockchain.test.ts` (with A), `apps/guard/README.md`, `plan/phases/D-P2.md`.

### ✋ Checkpoint (end of phase 2)
1. **Is the plan still good?** If the guard's overlay/Arcade dependencies cannot make the round in 60 s, add pre-verification (at pledge time); STATUS.
2. **This phase is done** → STATUS Track D.
3. **What did the other tracks do?** Did A open the `htlcLockingScript` skeleton; does B have the `/vaults` query; did C run the vault agent?
4. **Dependencies of the next phase:** for the Rail PoC, A.P0 `InputSigner`, Base Sepolia RPC + test USDC + ETH (faucet), the `maker` wallet with 30k sat. Otherwise skip phase 3 and write "Rail PoC not done" into STATUS; phase 5 takes the B path.
5. If an interface changed, MASTER §3 + STATUS.

---

## Phase 3 — Coop Rail PoC (time box: 4 hours) → S3

**Goal:** record a USDC (Base Sepolia) → BSV atomic swap working end to end **once**; validation tests 4 and 6. Not in the live demo. When the 4 hours are up, whatever exists is documented.

**Dependency:** A.P0; a Base Sepolia account (ETH faucet, test USDC or our own mock ERC-20); the `maker` wallet.

**Tasks (the order matters; stop when time is up)**
- 3.1 (30 min) **Validation test 4:** 1,000 sat on mainnet: a tx with nLockTime = `height+1` → what does Arcade `POST /tx` say (a non-final refusal expected) → accepted one block later. A second, time-based (now+15 min) tx: the moment of acceptance vs the header time (an MTP observation). The result into STATUS.
- 3.2 (20 min) **Validation test 6:** a summary of the v1 transaction rules (LOW_S etc.) from the Chronicle spec; if possible, observe a high-S v1 tx being refused. The result into STATUS.
- 3.3 (60 min) `contracts/base-htlc/HTLC.sol`: `lock(hash, receiver, token, amount, timeout)`, `claim(secret)`, `refund()`; Foundry or Hardhat tests; deploy to Sepolia; the address into `.env`.
- 3.4 (60 min) The BSV side: `htlcLockingScript(hash, agentPub, guardPub, makerPub)` (the FINAL-IDEA §4.10 script); `apps/maker`: a quote → the agent locks on Base → the maker builds the funding tx (v1), the agent signs the refund tx (`nLockTime = height+k`, the ELSE branch) → the maker broadcasts → agent + guard claim (`context.kind='rail'`, the output a pledge coin or the vault) → the maker `claim`s on Base with the secret.
- 3.5 (30 min) Recording: the BSV txids (T11) + BaseScan links (T11b) into STATUS; `docs/RAIL-POC.md`: what worked, what did not, the assumptions (height-based refund, v1), open items (no reverse direction, maker inventory).
- 3.6 Time is up → stop. If it did not succeed, "experimental, not in demo" in the README and a note on the plan B in FINAL-IDEA §12.2.

**Acceptance:** `docs/RAIL-POC.md` exists; the results of tests 4 and 6 in STATUS; the time box not exceeded.

**Outputs:** `contracts/base-htlc/*`, `packages/core/src/scripts/htlc.ts`, `apps/maker/*`, `docs/RAIL-POC.md` (with an explicit **"Result: successful / unsuccessful"** line at the end; this line decides which path phase 5 takes), `plan/phases/D-P3.md`.

### ✋ Checkpoint (end of phase 3)
1. **Is the plan still good?** If tests 4/6 disproved the FINAL-IDEA §4.10 assumptions, update §4.10 and §8 (the Rail "not trustless" or "out of scope"); STATUS "Plan changes".
2. **This phase is done** → STATUS Track D.
3. **What did the other tracks do?** Is S3 done (the extension phases start only then)? Is everyone nearing delivery; ask for the README sections now.
4. **Dependencies of the next phase:** S3 ✓; the `docs/RAIL-POC.md` result line (phase 5 A or B). Without S3 the extension does not start: help with D's S3 items or prepare the independent parts of phase 4 (the 4.2 skeleton).
5. If an interface changed, MASTER §3 + STATUS.

---

> **Extension phases (5, 6, 7).** Why they exist: in the jury weights, adoption is 35 %, technical + non-custodial 20 %. Phase 5 ties the claim "liquidity and users from another chain" to real money (or turns the vault into a product for owners); phase 6 ties the "why BSV" and "non-custodial" claims to measurements and attack tests; phase 7 opens the vault to every agent outside AgentCoop. **None of them starts before S3 is done.** Each has a time box; when it runs out, the result is written down and the next one begins. 4 hours before submission, move to phase 4 wherever you are.

---

## Phase 5 — The full Coop Rail (path A) **or** extending the vault with fleets and policy templates (path B) · time box: A 5 hours, B 3 hours

**Goal:** **Path A** (if the Rail PoC succeeded): turn Coop Rail into a two-way product that manages its inventory and has run once with real USDC on Base **mainnet**. That proves the claim "it brings liquidity and users from another chain" with real money. **Path B** (if the PoC failed): turn the Mandate Vault into a product where an owner manages several agents with ready-made policy templates.

**Dependency:** S3 ✓. The result line in `docs/RAIL-POC.md` decides the path. Path A's success condition: validation tests 4 and 6 positive **and** one forward swap completed end to end on Sepolia (T11 + T11b). For path A also: the Base mainnet EVM addresses funded (SETUP-ACCOUNTS #19–20), the maker wallet ≥ 30k sat.

**Tasks — path A (the full Coop Rail)**
- 5.A1 **Reverse direction (BSV → USDC).** The agent holds the secret and locks first, so the refund period is long. The BSV HTLC script: `OP_IF OP_SHA256 <h> OP_EQUALVERIFY <makerPub> OP_CHECKSIG OP_ELSE OP_2 <makerPub> <guardPub> OP_2 OP_CHECKMULTISIG OP_ENDIF`. The claim branch: the maker, with s. The refund branch: the maker and the guard pre-sign the refund tx **before** the funding (`nLockTime = H + k_long`, its output the vault script). The agent is not in the refund branch, so it cannot redirect the refund. Flow: (1) the refund pre-signature → (2) agent + guard fund the HTLC from the vault → (3) the maker locks USDC on Base (`receiver` = the owner's allowed EVM address, `T_base_short`) → (4) the agent calls `claim(s)` on Base and s is revealed → (5) the maker takes the BSV with s. Time margin: `T_base_short` ≪ `k_long` blocks (e.g. 45 min against 18 blocks); the choice and the reasoning in `D-P5.md`.
- 5.A2 **Split the guard's `rail` context in two:** `rail-in` (the existing claim check) and `rail-out`. `rail-out` checks: is the maker on the `allowMakers` list, is the amount ≤ `railMaxSats`, does the pre-signed refund tx pay the vault script and does its `nLockTime` fit the policy, is the Base `receiver` in the quote in `railEvmRecipients`. The threat it closes: a compromised agent taking the USDC out to its own address. The policy fields are added **to MASTER §3.7** and written into STATUS → "Interface changes".
- 5.A3 **Maker inventory balancing** (`apps/maker/src/inventory.ts`): the BSV balance (wallet-toolbox) and the USDC balance (Base RPC) are watched. The price is taken from two public sources and checked against a deviation band. Quote = the mid price ± (a base spread of 1.5 % + a slippage proportional to the imbalance). The direction whose inventory falls below a threshold stops automatically. The `GET /quote?dir=&amount=` result is valid for 60 s and includes `minOut`. The forward direction spends BSV and earns USDC, the reverse the opposite; so the inventory balances itself with flow in both directions. Manual intervention is visible with `scripts/maker-report.ts`.
- 5.A4 **Base mainnet:** `HTLC.sol` deployed to mainnet and verified on BaseScan. **One** real swap in each direction ($1–2 USDC). A one-off ≤ $0.50 trial first. The txids and BaseScan links into STATUS (T11, T11b, T12 = reverse direction).
- 5.A5 **Tests:** `test/rail.mockchain.test.ts` for both directions (the BSV side on the mock chain, the Base side an in-process fake HTLC state); Foundry tests (claim, refund, timeout, wrong preimage, reclaim); guard `rail-out` refusal tests (a maker outside the allowlist, an EVM recipient outside the allowlist, a refund not paying the vault).
- 5.A6 `docs/RAIL.md` (replaces RAIL-POC): both directions, time margins, maker economics, remaining risks (maker liveness, price source). The README label "experimental" → "beta, tested on mainnet with small amounts".

**Tasks — path B (vault: fleets + policy templates)**
- 5.B1 **Fleet:** `owner-cli create-fleet --agents a1,a2,a3 --template research`. Each agent gets its own vaultId and vault. The Desktop approval in one `createAction` (N outputs).
- 5.B2 **An owner-level total cap:** `ownerWeeklyCapSats` added to the guard policy; the weekly total of all the same owner's agents cannot exceed it (the ledger per owner). The threat it closes: N agents each staying under their own cap and together exceeding the budget. MASTER §3.7 updated.
- 5.B3 **Policy templates:** `apps/guard/templates/{conservative,research,procurement}.json` and `owner-cli policy --template <name> [--override …]`. Shows the diff before applying. The templates are validated against a schema.
- 5.B4 **Emergency stop:** `owner-cli pause <agent|all>` makes the guard **immediately** stop signing for that owner's agents (no on-chain transaction, with the owner's signature). `owner-cli withdraw-all` withdraws every vault UTXO through the OP_IF branch in one tx.
- 5.B5 **Policy commitment (transparency):** a `policyHash` added to the funding tx's `OP_RETURN vault` record. The guard does not sign if the hash of the loaded policy does not match the owner's latest on-chain commitment. So the owner can prove which policy the guard applies. Announced to B (the OP_RETURN field), written into STATUS.
- 5.B6 **Tests:** the fleet total cap, pause, template validation, refusal on a policy hash mismatch. On mainnet a 3-agent fleet funding and `withdraw-all`.

**Acceptance:** *Path A:* one swap in each direction on Base mainnet and the BSV-side txids in STATUS; tests green; `docs/RAIL.md` exists. *Path B:* a fleet funding + `withdraw-all` on mainnet; the total cap and pause tests green; templates in the README. On either path, the time box not exceeded.

**Outputs:** *A:* `packages/core/src/scripts/htlc.ts` (reverse direction), `apps/maker/src/{inventory,quote}.ts`, a `contracts/base-htlc` mainnet deploy, `test/rail.mockchain.test.ts`, `docs/RAIL.md`. *B:* `apps/owner-cli` fleet commands, `apps/guard/templates/*`, an owner total in the ledger, tests. On both, `plan/phases/D-P5.md`.

### ✋ Checkpoint (end of phase 5)
1. **Is the plan still good?** If the reverse direction failed on mainnet in path A, write the reason into `docs/RAIL.md` and leave the README label "experimental". If the policy fields changed, update MASTER §3.7. STATUS "Plan changes".
2. **This phase is done** → STATUS Track D (Base addresses, BaseScan links, the USDC/ETH spent included).
3. **What did the other tracks do?** Can C's agents use the reverse direction or the fleet mode; does B index the `policyHash` in the `vault` OP_RETURN?
4. **Dependencies of the next phase:** phase 6 relies on A's settlement builders (there since S1) and B's coordinator (griefing tests). Extra sats for the scale test (Axel). If they did not arrive, the mainnet measurement is done with N=10.
5. If an interface changed, MASTER §3 + STATUS.

---

## Phase 6 — A cost benchmark report + an attack test suite · time box: 4 hours

**Goal:** tie two of the pitch's claims to **measurement and testing**. (1) "A pool of N participants is one cheap transaction on BSV; on EVM it is N deposits + N refunds." (2) "No party can move funds alone." The second is shown with an attack test for every row of FINAL-IDEA §8. Phase 4's `docs/THREAT-MODEL.md` is fed from here.

**Dependency:** S3 ✓; A's `planSettlement`/`assembleSettlement`, B's coordinator (griefing), the guard (D.P2). +250k sat for the scale test (SETUP-ACCOUNTS §5). Foundry (#13). Base Sepolia ETH.

**Tasks — benchmark**
- 6.1 **BSV measurement** (`scripts/bench/bsv-settlement.ts`): settlements with N ∈ {2, 5, 10, 20, 50, 100} participants built on the mock chain with A's builders. For each, record bytes, input/output counts and the fee at the sat/kB read from Arcade `/health`. **Once on mainnet with N=50** (50 temporary wallet-toolbox agents, ~5k sat each; N=10 if the extra sats do not arrive). The txid into STATUS. Record the measurement date and the BSV/USD rate.
- 6.2 **EVM comparison** (`contracts/pool-escrow/PoolEscrow.sol`): a reference "collect up to the target, then pay or refund" escrow contract. Per participant `approve` + `deposit`; on success one `settle` (pay the provider + give credits to the participants), on failure a `refund` per participant. A gas model by N from Foundry `--gas-report`. The model checked with a **real N=5 run on Base Sepolia**. Gas prices taken live for Base mainnet and Ethereum L1 (on Base the L1 data fee with `GasPriceOracle.getL1Fee`). The rate live and timestamped.
- 6.3 **Report** (`docs/BENCHMARK.md` + a table and chart produced by `scripts/bench/report.ts`): by N, (a) the total fee (BSV one tx / Base success / Base failure / ETH L1), (b) the transaction count, (c) **the time spent in custody** (EVM: from the first deposit to settle/refund; BSV: 0), (d) the cost of a failed pool to a participant (BSV: 0 + the non-refundable registration fee; EVM: deposit + refund gas). "Measured" and "modelled" values marked separately, assumptions written down.

**Tasks — attack test suite** (`test/attacks/*.test.ts`; a `// THREAT: FINAL-IDEA §8 "<row>"` tag at the top of each file)
- 6.4 `fake-credit` → "Fake credits" + "the coordinator shows fake credits as valid": a fake BSV-21 input is put into the plan. Expected: `verifySettlementPlan(…, { verifyLineage: true })` throws, guard `/cosign` returns 403.
- 6.5 `coordinator-tamper` → "The coordinator tries to steal": a change output is altered after the signatures were collected. Expected: the `ALL` signatures become invalid, script verification fails, the broadcast is refused.
- 6.6 `griefing` → "A participant runs at lock-in": one participant does not sign, another spends its pledge coin mid-round. Expected: the round fails, the outpoint is blacklisted, filled from the waiting list, at most 3 rounds tried.
- 6.7 `prompt-injection` → "The agent is prompt-injected": the injected instruction asks for 100 % of the budget and points at a provider outside the allowlist. Expected: two separate 403s (`maxPerPoolSats`, `provider not allowed`), nothing happens on chain.
- 6.8 `guard-bypass` → "The guard is compromised" / "a Coop Rail claim bypasses the vault policy" / "agent and guard together": (a) the agent alone tries to spend the vault → the script fails; (b) the guard alone → fails; (c) change not returning to the vault → 403; (d) fee > `maxFeeSats` → 403; (e) trying to exceed the weekly cap with split payments each under the pool cap → 403; (f) the same `/cosign` request replayed → the ledger is idempotent, no double counting; (g) an `inputIndex` or subscript mismatch (the guard computes the sighash itself) → 403; (h) a rail claim to an output outside the vault → 403; (i) the owner can still withdraw while the guard is down → succeeds.
- 6.9 `replay-402` → "402 replay": derived from the kit's test (409).
- 6.10 `blind-sign` → "BRC-100 blind hash signing": the client-side DvP verifier refuses a bad plan; at most 1 active pledge in the `agentcoop` basket.
- 6.11 `scripts/threat-matrix.ts`: scans the tags and produces the table "Threat → test file → last result" (goes into phase 4.2's `docs/THREAT-MODEL.md`). If another track's code fails a test, D does **not change** that code: it writes into STATUS → Blockers with the track's name.
- 6.12 **Mainnet evidence:** the agent's solo attempt to spend the vault is sent to Arcade and the refusal message recorded; the guard's 403 log line recorded. Both go into the README's threat model section.

**Acceptance:** `docs/BENCHMARK.md` contains at least one mainnet measurement (BSV) and one Sepolia measurement (EVM); `test/attacks/` green (or the red ones assigned to their owners in STATUS); every "Closed" row in FINAL-IDEA §8 has at least one test; the time box not exceeded.

**Outputs:** `scripts/bench/*`, `contracts/pool-escrow/*`, `docs/BENCHMARK.md`, `test/attacks/*`, `scripts/threat-matrix.ts`, `plan/phases/D-P6.md`.

### ✋ Checkpoint (end of phase 6)
1. **Is the plan still good?** If the measurements disproved a number in the pitch (e.g. the settlement fee, "a few hundred sat" in FINAL-IDEA §4.4), correct FINAL-IDEA and the value note draft; STATUS "Plan changes".
2. **This phase is done** → STATUS Track D (benchmark txids, red tests and their owners).
3. **What did the other tracks do?** Did the owners take the red attack tests?
4. **Dependencies of the next phase:** for phase 7, the guard + hot wallet (D.P2), the provider API (C). Otherwise skip phase 7.
5. If an interface changed, MASTER §3 + STATUS.

---

## Phase 7 — (D's proposal) Open the vault to every agent: an MCP server + `VaultFetch` · time box: 3 hours

**Why it was added:** today the Mandate Vault exists only inside AgentCoop's own agents. Yet "a BSV budget its owner controls" is what **every** agent that pays 402 needs. Packaging the vault as an MCP server gives any LLM agent in Claude Desktop, Claude Code or Cursor a BSV budget in two minutes. That is (1) for **adoption 35 %**, an entry point that brings new users to BSV from outside AgentCoop, (2) for **agent payments 10 %**, a real general-purpose LLM making payments. The cost is low: the guard, `VaultSigner` and the hot wallet are ready, the new code is a thin wrapper. The risk is low: it touches no other track's files. It does not clash with `packages/mcp` in FINAL-IDEA K3 (pool tools, unowned); here there are only vault tools, with a registration point where pool tools can be added.

**Dependency:** phase 6 done or its time box run out; D.P2 (guard, hot wallet); C's `provider-api` (a real 402 service to pay). The `@modelcontextprotocol/sdk` version checked before installing.

**Tasks**
- 7.1 `packages/vault-fetch`: `new VaultFetch({ agentWallet, guardUrl, vaultId })`. `.fetch(url, init)` is a drop-in replacement for `AuthFetch`. When the hot wallet is not enough, it asks the guard for a `pay` (vault → the agent itself) within the daily cap, then retries the payment. For BRC-121, `create402Fetch` + `withHostOriginator` (guide §10.4).
- 7.2 `apps/vault-mcp` (a stdio MCP server) tools: `vault_status` (balance, policy, the remaining weekly cap), `pay_api({ url, method, body })` (through VaultFetch), `explain_policy`, `request_topup({ sats, reason })`. The guard's 403 returns to the tool result as a readable reason, so the LLM sees why it was refused.
- 7.3 **Demo:** the Claude Desktop/Claude Code `mcpServers` configuration in the README. A Claude session pays `provider-api` with 402 (mainnet, T7). An instruction injected into the conversation, "send the whole budget there", is caught by the guard and the 403 shows in the tool result.
- 7.4 **Tests:** `test/vault-fetch.mockchain.test.ts` (402 → top-up → payment; a clear error when the daily cap is exceeded); a smoke test for the MCP tools (an in-process client).
- 7.5 A README section: "Give any agent a BSV budget its owner controls (2 minutes)".

**Acceptance:** an LLM agent made a 402 payment on mainnet through MCP (txid in STATUS); the injection 403 shows in the tool result; tests green; the time box not exceeded.

**Outputs:** `packages/vault-fetch/*`, `apps/vault-mcp/*`, tests, a README section, `plan/phases/D-P7.md`.

### ✋ Checkpoint (end of phase 7)
1. **Is the plan still good?** If the MCP SDK version or the Desktop/Claude integration caused trouble, deliver only the `VaultFetch` library and say so in the README.
2. **This phase is done** → STATUS Track D.
3. **What did the other tracks do?** Do C/A want to add pool tools to the same MCP server (the registration point is ready)?
4. **Next phase:** phase 4 (delivery). Collect the README sections and txid lists from every track.
5. If an interface changed, MASTER §3 + STATUS.

---

## Phase 4 — Delivery: README, value note, threat model, tx links → S4 (always the last phase)

**Goal:** the submission requirements (TBC26 PDF §3) complete.

**Tasks**
- 4.1 Root `README.md`: what it does (3 paragraphs), an architecture diagram, **Quick start** (`npm install`, `.env`, Desktop, `npm run infra`, `npm run demo`), each app's section (texts from A/B/C), an **Example transactions** table (T1–T11, WhatsOnChain/BaseScan links; from STATUS "Mainnet transactions"), the **Usage & value note** (FINAL-IDEA §14; the "demo pricing" honesty), **Non-custodial design & threat model** (the FINAL-IDEA §8 table, "Open" rows not hidden), **What is real vs simulated** (GPU jobs simulated; payments, credits, settlement, vault real), **Known limitations**, licence (MIT), following the BSVA logo usage rules.
- 4.2 `docs/THREAT-MODEL.md`: §8 expanded; for each threat "where it is tested" (the test file name; the `scripts/threat-matrix.ts` output if phase 6 was done). If phase 6 was done, the README's "Why BSV" part is tied to the measured numbers in `docs/BENCHMARK.md`; otherwise only the FINAL-IDEA §4.4 estimate with an "estimate" label.
- 4.3 Check that the single `npm run demo` command works on a clean machine (a new clone, a new `.env`, mock-chain mode); a list of the steps needed for mainnet mode.
- 4.4 Tx link check: for each T type, at least one link opens and shows the right tx.
- 4.5 A raw material list for the video (where the screen recordings are, which logs) — an inventory, not a plan.
- 4.6 If Axel's answers arrived, reflect them in the README (e.g. the non-custodial assessment).

**Acceptance:** someone who has never seen the README can run the mock-chain demo in 15 minutes; the mandatory items (S1–S4 PDF) ✓; S4 ✓.

**Outputs:** root `README.md`, `docs/THREAT-MODEL.md`, the value note (a README section), the tx link table, the video material inventory, `plan/phases/D-P4.md`.

### ✋ Checkpoint (end of phase 4)
1. Plan change? STATUS one last time.
2. STATUS Track D: "Done"; S4 ✓ in the sync table.
3. Is an open blocker left? If so, write it into the README's "Known limitations".
4. The delivery package: repo link, README, tx links, value note — all in one place.
