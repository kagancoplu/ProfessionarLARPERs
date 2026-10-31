# B-P0 — Stand up the overlay from the kit, validation tests 1 and 8 (→ S0)

> Track B, phase 0. Source: `plan/track-B-overlay-coordinator.md` phase 0, `00-MASTER-PLAN.md` §3.2/§3.8, `FINAL-IDEA.md` §4.4, §12.1.
> Written: 30.10, ~16:00. Branch: `trackB`. Node 22 (`nvm use 22`; the system default is 20, the kit wants ≥ 22).

## 1. Goal

1. An overlay **copied** from the kit, running under the names `tm_agentcoop` / `ls_agentcoop`: `npm run overlay` → `http://localhost:8080`.
2. **Validation test 1:** does the overlay accept a settlement with mixed inputs (1 provider credit input `SINGLE|ACP|FORKID` + plain-sats pledge inputs `ALL|FORKID`) and mixed outputs (provider payment + 3 credit outputs + change + OP_RETURN)? The result into STATUS **as soon as possible** (A's phase 1 decisions depend on it).
3. **Validation test 8:** Arcade's policy and the size and fee estimate of settlements with 20 / 50 / 100 participants.

## 2. State of the dependencies (16:00)

| Dependency | Status | What I do |
|---|---|---|
| A.P0 root skeleton (workspaces, root `vitest.config.ts`, `.gitignore`) | None (A on its own branch) | `packages/overlay` is set up as a **standalone package**: its own `package.json` (named `@agentcoop/overlay`, workspace-ready), its own `vitest.config.ts`, its own `.gitignore`. **Root files are not touched** (no merge conflicts). When A's root arrives: delete `package-lock.json`, move `node_modules` to the root, move the tests to the root config |
| A.P0 `packages/core` (`kit/inscription.ts`, `kit/rules.ts`, `kit/addresses.ts`, `types.ts`, `opreturn.ts`) | None | The kit's `core/{inscription,rules,addresses}.ts` as a **temporary copy** under `packages/overlay/src/kit/` (header: "TEMPORARY: the import changes when @agentcoop/core is ready"). No changes, an exact copy. A small local helper for `opreturn` in tests (the MASTER §3.2 envelope) |
| `test/helpers/mockchain.ts` (A will copy it) | None | a temporary copy at `packages/overlay/test/helpers/mockchain.ts` |
| Sats (D.P0) | Not needed | phase 0 is entirely mock chain + Arcade `/health` (read) |

## 3. Files

```
packages/overlay/
├─ package.json            derived from the kit; versions exactly as docs/AGENTS.md (fixed, no ^);
│                          wallet-toolbox only as a devDependency (mock-chain tests), no 402/auth packages
├─ package-lock.json       derived from the kit's lock (deleted when A's root arrives)
├─ .gitignore              node_modules/, data/, .env, *.sqlite
├─ tsconfig.json           the kit's; include src, scripts, test
├─ vitest.config.ts        the kit's @bsv/sdk → CJS alias (resolved with createRequire: works both in this
│                          package's node_modules and in a hoisted root)
├─ README.md               how it starts, env, topic/service, queries, test 1/8 results
├─ src/
│  ├─ kit/inscription.ts   TEMPORARY copy (kit core/inscription.ts)
│  ├─ kit/rules.ts         TEMPORARY copy (kit core/rules.ts)
│  ├─ kit/addresses.ts     TEMPORARY copy (kit core/addresses.ts)
│  ├─ AgentCoopTopicManager.ts   kit Bsv21KitTopicManager; TOPIC='tm_agentcoop'. In phase 0 the rules = the kit's rules
│  ├─ AgentCoopLookupService.ts  kit Bsv21KitLookupService; SERVICE='ls_agentcoop'; tables renamed
│  ├─ chainTracker.ts      kit (ResilientChainTracker, testnet/WoC path)
│  ├─ noopAdvertiser.ts    kit
│  └─ server.ts            kit startOverlay; name 'agentcoop'; env reading
├─ scripts/
│  └─ arcadePolicy.ts      validation test 8: GET /health → policy summary + size/fee model
└─ test/
   ├─ helpers/mockchain.ts TEMPORARY copy (kit)
   ├─ helpers/settlement.ts  TEST ONLY: a mixed-settlement builder (NOT A's builder; when A.P1 arrives
   │                         the tests can move to A's planSettlement/assembleSettlement)
   └─ validation1.mixed-settlement.test.ts  (the size model's consistency with a real tx is here too; no separate file needed)
```

## 3a. Result (16:15)

Phase 0 done. Test 1 ✅ (8/8 green), test 8 ✅; both in STATUS. Differences from the plan: the size test is not a separate file; `tsconfig` keeps `test/` out of the typecheck like the kit (the copied `mockchain.ts` gives a double-SDK type error; the alias resolves it at runtime). A finding carried to phase 1: §8.

### 3.1 Renames (kit → AgentCoop)

| Kit | AgentCoop | Why |
|---|---|---|
| `tm_tokenkit` | `tm_agentcoop` | MASTER §3.2; BRC-87 `^tm_[a-z]+(_[a-z]+)*$` (no digits) |
| `ls_tokenkit` | `ls_agentcoop` | same |
| tables `bsv21kit_outputs` / `bsv21kit_tokens` | `agentcoop_token_outputs` / `agentcoop_tokens` | `agentcoop_pools`, `agentcoop_pledges`… are added in phase 1; keep the prefix consistent |
| migration `2026-10-17-001-bsv21kit` | `2026-10-30-001-agentcoop-tokens` | the phase 1 migration will be `…-002-agentcoop-records` |
| `OverlayExpress('bsv21kit', …)` | `OverlayExpress('agentcoop', …)` | — |

The rules (`rules.ts`) and the query behaviour **do not change**. The `identity` scan in the lookup (GAP_LIMIT 20) and the other kit queries (`token`, `tokens`, `utxos`, `outpoint`, `history`) stay as they are, as MASTER §3.8 requires.

### 3.2 Environment variables (server.ts)

| Variable | Default | Note |
|---|---|---|
| `PORT` | `8080` | MASTER §3.9 `OVERLAY_URL` |
| `OVERLAY_DB` | `./data/overlay.db` | gitignore |
| `NETWORK` | `main` | `main` / `test` |
| `CHAINTRACKS_URL` | `https://arcade-v2-us-1.bsvblockchain.tech` | same as MASTER §3.2 `ARCADE_URL`; `ARCADE_URL` is used if given |
| `CHAIN_TRACKER=woc` | — | fallback |
| `OVERLAY_PRIVATE_KEY` | generated into `./data/overlay.key` | never committed |
| `TOKEN_WHITELIST` | empty | can be filled with C's credit token id in phase 1 |

## 4. Validation test 1 — scenario (mock chain, the overlay over HTTP, SPV on)

The kit's `e2e.mockchain.test.ts` pattern: `createMockChain()`, real wallet-toolbox wallets, the overlay started with `startOverlay({ chainTracker: chain.chainTracker })`.

**Actors:** `provider`, `agent1`, `agent2`, `agent3` (all wallet-toolbox; funded).

**Steps**
1. **T1 deploy:** the provider locks a `deploy+mint amt=1000 dec=0` output to `receivePkh(provider, 0)` with `createAction` (randomizeOutputs:false, basket `bsv21`). AtomicBEEF → `POST /submit` (`X-Topics: ["tm_agentcoop"]`). Expected: `outputsToAdmit=[0]`.
2. **T3 pledge coins:** each agent creates a P2PKH output with `createAction`: key `[1,'agentcoop pledge']`, a random keyID, counterparty `'anyone'` (MASTER §3.2), basket `agentcoop`. Amounts 3,000 / 2,000 / 1,000 sat. (No OP_RETURN pledge record and no registration fee in phase 0; those are a phase 1 indexing topic.)
3. **T5 settlement template** (`test/helpers/settlement.ts`, the FINAL-IDEA §4.4 layout):
   - `in0` = the deploy output (1 sat, N=1000), `in1..3` = the pledge coins.
   - `out0` = P=4,500 sat → the provider's revenue script (P2PKH, `[1,'agentcoop provider']`, keyID poolNonce, `'anyone'`).
   - `out1..3` = BSV-21 `transfer` 600 / 300 / 100 → `receivePkh(agentN, 0)`, 1 sat.
   - `out4..6` = change (to each agent's pledge coin script; the MASTER §3.3 change rule), the fee deducted equally.
   - `out7` = `OP_FALSE OP_RETURN "agentcoop" "settle" {"v":"1","poolId":…,"pledgeListHash":…}`.
4. **Signatures:** the provider signs `in0` with `SIGHASH_SINGLE|ANYONECANPAY|FORKID` (0xC3), the agents sign their own inputs with `SIGHASH_ALL|FORKID` (0x41). Signing: a scope-parameterised copy of the kit's `signWalletP2pkhInput` (`createSignature({ hashToDirectlySign })`, counterparty `'anyone'`). Switch to A's `P2pkhWalletSigner` when it arrives.
5. **Broadcast:** mock chain `postBeef` (the mock-chain counterpart of Arcade; it verifies the scripts). Then `POST /submit` (plain BEEF).

**Expected (pass criterion)**
- STEAK `tm_agentcoop.outputsToAdmit` = `[1,2,3]` (only the credit outputs; the payment, change and OP_RETURN are not BSV-21).
- `coinsToRetain` = `[0]` (the provider's credit input marked spent, kept in history).
- `ls_agentcoop` `identity` query: agent1 600, agent2 300, agent3 100; the `outpoint` query for the deploy gives `spent:true, spendingTxid = settlement txid`.
- The credit total is conserved (600+300+100 = 1000).

**Extra checks (same test file; needed for the coordinator design)**
- **1b — The offer is reusable:** the provider signature (SINGLE|ACP) is made **once**; two different plans are built (round 1: agent1+agent2+agent3; round 2: different shares/change and a different participant order) and the SDK's `Spend.validate()` shows that `in0` with the same unlocking script is **valid in both plans**. This proves that the 3-round re-planning in phase 2 does not need the provider to sign again.
- **1c — The coordinator cannot change the provider payment:** lowering `out0` by 1 sat makes the `in0` validation fail.
- **1d — Inflation refusal works in a mixed tx too:** when the credit outputs exceed 1,000 (601/300/100), the overlay does not admit the credit outputs (the input is still spent, the kit rule).
- **1e — A credit input the overlay never admitted:** a settlement made without submitting the deploy to the overlay is refused entirely (`UnknownTokenInputError` → no admission in the STEAK).

If it fails: diagnose which `rules.ts` line refused it (pass 1/pass 2/the per-token decision), write it into STATUS, and add FINAL-IDEA §12.2's plan B (extending the rule in our own topic manager) as a task to phase 1. **Expectation from reading the code:** it passes. Pass 2 skips plain inputs with `decodeBsv21 === null`; the token input is in `previousCoins` (since the deploy was admitted), so `tokensIn = 1000 ≥ out = 1000`.

## 5. Validation test 8 — Arcade policy and size model

- `scripts/arcadePolicy.ts`: `GET {ARCADE_URL}/health` → each datahub's `miningFee`, `maxtxsizepolicy`, `maxscriptsizepolicy` values; the worst case (highest fee, lowest limits) summarised.
- Size model (a tx built with real scripts and fake but maximum-length signatures, measured with `toBinary().length`, no assumptions):
  - fixed part: version/locktime/counters + the provider input + `out0` + the OP_RETURN settle
  - per participant: a pledge input (p2pkh, 108-byte unlock) + a credit output (inscription) + change
  - D's 2-of-2 unlock (≈ OP_0 + 2×73 + OP_FALSE) for a vault participant's input, estimated as a separate row.
- Output: bytes and fee for n = 2, 3, 20, 50, 100 (at 100 sat/kB, and at the lowest 1 sat/kB).
- `settlementSize.test.ts`: the size of the real settlement in test 1 is within ±2 % of the model's estimate.

**First measurement (16:00, `curl /health`):** Arcade v0.16.0, height 973321; most datahubs `miningFee 100 sat / 1000 B`, one at 1 sat/kB; `maxtxsizepolicy 100 MB`; the strictest `maxscriptsizepolicy` 500 kB; no sigops limit in practice. So there is no policy limit on the settlement size; the fee is ~0.1 sat/byte.

## 6. Error cases

| Case | Behaviour |
|---|---|
| Arcade `/health` unreachable | `arcadePolicy.ts` exits with an error code; "unreachable + time" written into STATUS, test 8 repeated |
| A temporary overlay chain tracker (Arcade) error | kit behaviour: the engine returns 4xx/5xx; the client (A's `OverlayClient` outbox) retries |
| Mock chain `postBeef` refusal | the test fails at that step with the error message (a script error = a signature/sighash problem; the first suspect is the scope byte) |
| Empty overlay STEAK | the test prints an `outpoint` lookup + the overlay log to tell the cause |

## 7. Acceptance and evidence

| Acceptance | Evidence |
|---|---|
| The overlay starts | `npm run overlay` → `tm_agentcoop` in `GET /listTopicManagers`, `ls_agentcoop` in `GET /listLookupServiceProviders` (log into STATUS) |
| Test 1 result in STATUS | `npx vitest run test/validation1.mixed-settlement.test.ts` green; the STEAK and lookup results in STATUS "Validation tests" #1 |
| Test 8 result in STATUS | `npm run arcade-policy` output in STATUS #8 + the size table |
| S0 B items | STATUS Track B: phase 0 done, file paths, a note to A (the test 1 result, the SINGLE\|ACP offer reuse) |

## 8. Notes carried to phase 1

- The engine puts the input spending **any** output admitted in the topic into `previousCoins` and marks it spent. In phase 1, once pledge coins are admitted, settlement and cancellation (T4) pledges will automatically go to `outputSpent`; the kit rule's pass 2 skips non-token inputs, so the rules do not conflict. But `coinsToRetain` contains only token inputs; if the pledge coins are not retained, the engine may delete them. In phase 1 pledges should be added to `coinsToRetain` too (for history and the audit, phase 6.3).
- `previousCoins` also containing the pledges does not affect the "unknown token input" check as in 1e.
