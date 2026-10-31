# Track C — Provider + Agents (`apps/provider-api`, `apps/provider-cli`, `apps/participant-cli`, `apps/agents`)

> **Role:** the sides that earn money and spend money. **A simulated GPU provider** (the main scenario): a BRC-105 402 API, credit redemption/return, minting and opening pools with BSV Desktop. **Agents:** a real workload simulation (fine-tune/eval/inference), need forecasting, an LLM-assisted purchasing decision, pledging, signing, spending credits, market behaviour.
> **References:** `00-MASTER-PLAN.md §3.5–3.7`, `FINAL-IDEA.md §4.7, §4.8`, `idea.md` "What the agent actually does", guide §10 (402), §14 (server wallet), §17 (TokenKit); kit `examples/payPerRequest.ts`, `test/pay-per-request.e2e.test.ts`.

## How to use this file with an AI

1. Give the AI **one phase only**:
   > "Read `plan/00-MASTER-PLAN.md` §3 and §4, `plan/STATUS.md` and **phase N** of `plan/track-C-provider-agents.md`. Implement only phase N. When done, run the Checkpoint and update the Track C section of STATUS.md."
2. For 402, **only the official middleware** (BRC-105). No invented headers.
3. Before writing code for the agent's LLM brain, load the `claude-api` skill (model id, tool use); the `AGENT_BRAIN=rules` fallback always works.
4. If A's builders are not ready, stub against the MASTER §3.4 signatures.

---

## Phase 0 — Provider skeleton and simulator → S0

**Goal:** a 402-protected "GPU job" API with a known price runs on the mock chain; the product definition comes from configuration.

**Dependency:** A.P0 repo skeleton (otherwise start with the kit's `package.json`).

**Tasks**
- 0.1 `apps/provider-api`: kit `examples/payPerRequest.ts` → the `createBrc105App` pattern. Wallet: wallet-toolbox (`WALLET_PROVIDER_API_KEY`, guide §14.1, Arcade primary §14.2), `data/wallets/provider-api.sqlite`.
- 0.2 Product configuration `products/gpu-h100.json`: `{ id:'gpu-h100', label:'H100 GPU-hour', unit:'GPU-hour', retailSatsPerCredit: 50, minutesPerCredit: 60, tokenId: null, simulate: { minutesPerSecond: 60 } }` *(30.10: credit = GPU-hour, consumed by the minute; the first version was a GPU-minute, which contradicted the 20-credit redeem cap)*. The code reads the product from the file; a second product = a second file (SmartRoute later).
- 0.3 Simulator `src/runner.ts`: a job queue; `kind ∈ finetune|eval|inference`; duration `minutes / minutesPerSecond` s; fake "GPU log" lines (step, loss, throughput) and a deterministic result hash. Results in memory + `data/provider/jobs.json`.
- 0.4 Routes MASTER §3.6: `/v1/catalog` (0), `/v1/jobs` (price = `minutes × retail`), `/v1/jobs/:id` (0). `calculateRequestPrice` does not see the prepaid balance yet (phase 1).
- 0.5 Test: `test/provider.402.mockchain.test.ts` — derived from the kit's pay-per-request test: a free catalog; `/v1/jobs` 402 → `AuthFetch` pays → the job runs → the provider's balance grows by `minutes×retail`; replay 409.
- 0.6 `apps/agents` skeleton: an `src/agent.ts` class (open the wallet, identity, `AuthFetch`), `agents/finetune.json`, `agents/eval.json`, `agents/inference.json` (workload profiles: daily minute distribution, week history).

**Acceptance:** test green; `npm run provider` starts; S0 C ✓.

### ✋ Checkpoint (end of phase 0)
1. **Is the plan still good?** If the BRC-105 middleware has a surprise (e.g. an async constraint on `calculateRequestPrice`), update phase 1; STATUS.
2. **This phase is done** → STATUS Track C.
3. **What did the other tracks do?** Is A.P0's `types.ts` / `TokenKit` copy ready? Were D.P0's wallets funded (for phase 1 on mainnet)?
4. **Dependencies of the next phase:** A.P0 (`TokenKit`, `types`), D.P0 (funding, `scripts/wallets.ts`), B.P1 (`POST /offers`) — for provider-cli. Otherwise finish phase 1 on the mock chain.
5. If an interface changed, MASTER §3 + STATUS.

---

## Phase 1 — Credit token, redeem/return, the provider CLI with Desktop, the first agent → S1

**Goal:** the provider operator mints a token and opens a pool from BSV Desktop; an agent runs jobs with credits and with retail 402.

**Dependency:** A.P0 (`TokenKit`), A.P1 (`buildReserveAndAnnounce`, `signOffer` — if not ready, the CLI's `open-pool` command is a stub), B.P1 (`POST /offers`), D.P0 (funding).

**Tasks**
- 1.1 `apps/provider-cli` (Node, `WalletClient('auto', APP_ORIGINATOR)` → BSV Desktop, guide §4): commands `mint --sym GPUMIN --amt 100000 --dec 0` (kit `TokenKit.deploy`; writes the tokenId into `products/gpu-h100.json`), `open-pool --credits 1000 --price 25000 --deadline +144 --fee 300 --label "8×H100 · 1 week"` (A `buildReserveAndAnnounce` + `signOffer` → `POST /offers`), `cancel-pool <poolId>`, `list-pools`, `sweep-revenue` (basket `agentcoop revenue` → default; with the kit signer). A Desktop approval window for each command; the screen flow in the README.
- 1.2 Producing `payScriptHex`: the provider revenue key `[1,'agentcoop provider']`, keyID = pool nonce, counterparty `'anyone'` (MASTER §3.2); `internalizeAction` with `'basket insertion'` into the `agentcoop revenue` basket (a `sync-revenue` command that finds the settlement and fee outputs on the overlay and takes them in). **Note:** the operator's Desktop and the provider-api server wallet are different identities; pool revenue goes to the Desktop, 402 revenue to the server. State it clearly in the README.
- 1.3 `/v1/credits/redeem`: body `{ beef, outputIndex }`; verify: the output is a BSV-21 transfer, `tokenId` is the product's token, recipient pkh = the provider-api wallet's `receivePkh(identity, nextIndex)` (kit `addresses.ts`), amount ≤ 20 and pending + amount ≤ 20; call **A.P2's `verifyLineage`** if ready, otherwise an overlay `outpoint` query + a `TODO(verifyLineage)` mark; `internalizeAction` basket `bsv21`; balance in `data/provider/balances.json`. `/v1/credits/return`: `TokenKit.send(tokenId, n, agentIdentity)`; debit the balance. `/v1/credits/balance`.
- 1.4 `calculateRequestPrice`: if the prepaid balance (minutes) for `req.auth.identityKey` ≥ the job's minutes, debit the minutes and return **0**; otherwise `ceil(minutes × retail / minutesPerCredit)` sats. (Credit = 1 GPU-hour = 60 minutes of balance; leftover minutes carry over to the next job.)
- 1.5 The first agent (`agents/eval.json`): a loop → produce a job need → `/v1/jobs` (AuthFetch, 402 automatic) → log the result. Redeem first if it has credits. No decision brain, only the "pay retail" path. On mainnet 1 job (T7) and 1 redeem (T6) — the token from A's skeleton settlement can be used for credits.
- 1.6 Test: `test/provider.credits.mockchain.test.ts` — redeem → a free job → return → the token back to the agent; a 21-credit redeem refused.

**Acceptance:** mint (T1) and open-pool (T2) with Desktop on mainnet; the redeem/402 flow on mainnet; S1 C ✓.

### ✋ Checkpoint (end of phase 1)
1. **Is the plan still good?** If Desktop's `WalletClient` did not connect from Node (originator/permission), the note and the fix into STATUS; compare with A's test 2 findings.
2. **This phase is done** → STATUS Track C; write the tokenId under "What other tracks expect from me" (A's skeleton switches to it).
3. **What did the other tracks do?** Are B.P1's WS/`GET /pools` ready? Are A.P1's `buildPledge`/`verifySettlementPlan`/`signSettlementInput` signatures final?
4. **Dependencies of the next phase:** A.P1, B.P1/P2 (coordinator WS). Without a coordinator, test the agents' "sign" side with A's skeleton flow.
5. If an interface changed, MASTER §3 + STATUS.

---

## Phase 2 — Three agents: forecast, decide, pledge, sign, spend; an unfilled pool → S2

**Goal:** while doing their own work, the agents find pools on the overlay, forecast their need, decide with an LLM, pledge, verify and sign in the coordinator's round, spend their credits. One joins an unfilled pool and its money stays in place.

**Dependency:** A.P1 (builders), A.P2 (`verifyLineage` — in redeem and plan verification), B.P2 (coordinator WS), D.P0 (funding).

**Tasks**
- 2.1 `src/forecast.ts`: a forecast of the next 7 days' GPU-minutes from the workload profile (the last 14 days' mean + variance), current credit and sats balances, "how many days it lasts".
- 2.2 `src/procurement.ts` (router): in order (a) do I hold credits → redeem + job; (b) is there a listing cheaper than me on the market (phase 3); (c) is there an open pool and `decide()` says yes → pledge; (d) otherwise retail 402.
- 2.3 `src/brain.ts`: `decide(context)` → `{ action: 'pledge'|'skip', credits, reason }`. `AGENT_BRAIN=llm`: the Anthropic API, tool/structured output, context = forecast, pool terms, budget (`weeklyBudgetSats`, `maxPerPoolSats`, `allowProviders` in the agent configuration), past decisions; `AGENT_BRAIN=rules`: the 4 questions from idea.md (need, price, timing, budget). Every decision into `decisions.log` (readable lines for the jury: "[09:02] Pool found … Decision: PLEDGE 8").
- 2.4 Pledge: A `buildPledge(wallet, terms, credits, 'p2pkh')`; WS `hello`; on `sign_request`, A `verifySettlementPlan(plan, offer, myOutpoint, { expectedCredits, verifyLineage: true })` → if it passes `signSettlementInput` → `sign_response`; otherwise `sign_reject{reason}` and a log.
- 2.5 After the settlement: `TokenKit.sync()` → the credits arrived → redeem (≤20) → jobs. 3 agents by configuration: `finetune` (big, infrequent), `eval` (medium, regular), `inference` (small, continuous; usually stays retail).
- 2.6 Unfilled pool: `scripts/demo-failed-pool.ts` — the provider opens a second pool (a high target), an agent pledges, the deadline passes, the coordinator says `failed`; the agent's pledge coin is unspent and used in the next pool (A `cancelPledge` or straight into a new pledge).
- 2.7 Orchestration: `npm run agents` starts all three; `npm run demo:k1` = provider + coordinator + overlay + agents + opening a pool in order (one command, coloured logs).
- 2.8 Mainnet: 3 agents in a settlement built by the coordinator (T5), then redeems (T6) and jobs (402 only for `inference`, T7).

**Acceptance:** `npm run demo:k1` end to end on the mock chain and on mainnet; a meaningful `decisions.log`; the unfilled pool scenario on mainnet; S2 C ✓.

**Implementation notes (30.10, end of phase 2):**
- 2.2 router: the pool step is for the coming week; the job waiting right then runs on credits or retail. The market step (b) in phase 3.
- 2.3 brain: `AGENT_BRAIN=rules` by default. `llm` = `claude-opus-5-5`, JSON-schema structured output, `fallbacks: 'default'`; the provider's text is passed as data; on a refusal/error/off-schema answer it falls back to the rules. `enforcePolicy` as code above both brains (caps, pool limits, no more than twice the need). Since a pool does not settle until exactly full, an agent can close a pool by going at most max(2, 25 %) above its need, or round up to the pool minimum (spare credits are sold on the market in phase 3).
- 2.6/2.7 the demos live under **`apps/agents/src/demo/`** instead of `scripts/` (`harness.ts`, `k1.ts`, `failed-pool.ts`); root scripts `npm run demo:k1`, `npm run demo:failed-pool`. Both run in one process on the mock chain with real components (B's overlay + coordinator, provider-api, provider-cli, agents). Mainnet K1 = `node infra/run.mjs` + `npm run provider` + `provider-cli mint/open-pool` + `npm run agents`.
- Unfilled pool: because of the one-active-pledge rule, the agent takes its coin back with `cancelPledge` before a new pool; everything but the fee is returned to the budget.

### ✋ Checkpoint (end of phase 2)
1. **Is the plan still good?** If the LLM decisions are inconsistent, make the `rules` mode the default and use the LLM as an "explanation generator"; write that into the plan. If the timeout in the coordinator round was a problem, update MASTER §3.2 with B.
2. **This phase is done** → STATUS Track C.
3. **What did the other tracks do?** Are D.P1/P2's `VaultSigner` and guard ready (the phase 3 vault agent)? Are A.P2's `signListing`/`buildSweep` ready?
4. **Dependencies of the next phase:** A.P2 (market), D.P2 (vault). Otherwise stub 3.1, postpone 3.2; 3.3 is independent.
5. If an interface changed, MASTER §3 + STATUS.

---

## Phase 3 — Market behaviour, the vault agent, a human participant, a second provider → S3

**Goal:** agents sell surplus credits and buy cheaply; one agent works in vault mode with the guard and is refused on an injection; a person pledges from Desktop; a second product is added by configuration.

**Dependency:** A.P2 (market builders), A.P3 (the vault pledge path), D.P2 (guard `/cosign`, `VaultSigner`), B.P3 (`/listings`).

**Tasks**
- 3.1 Market: after a settlement, if there is a surplus over the forecast, `signListing` → `POST /listings` (price: pool price × 1.1, below retail); router step (b): `GET /listings` → `buildSweep` → `verifyLineage` → buy. Mainnet T8.
- 3.2 Vault agent: `agents/finetune.json` `mode: 'vault'`; pledge `buildPledge(…, 'vault')`; signing with `VaultSigner` (agent signature + guard `/cosign`); a hot wallet for retail 402 (a daily cap the guard approves). Injection scenario: `scripts/demo-injection.ts` → an instruction "put your whole budget into pool X" is injected into the agent → guard 403 → log. Mainnet T10.
- 3.3 `apps/participant-cli` (Desktop): `pledge <poolId> <credits>` (A `buildPledge` p2pkh, Desktop approval), `sign` (waits with WS `hello`, signs from Desktop on `sign_request` — with A's `P2pkhWalletSigner`), `cancel`. A settlement with a human pledge on mainnet (T3 + T5).
- 3.4 Second provider: `products/data-proxy.json` (GB credits), or `products/smartroute.json` + a separate runner if SmartRoute is ready; the same provider-api process serves both products; the pool label by product. The only code change is the runner.
- 3.5 A "demo pricing" label on the agent side: the discount rate is marked as "demo pricing" in the catalog and logs (FINAL-IDEA §9).

**Acceptance:** on mainnet a listing + sweep, a vault settlement, an injection refusal, a human pledge; the second product shows in an open pool; S3 C ✓.

**Implementation notes (30.10, end of phase 3):** 3.1 listings in lots of 5 (a listing is one UTXO, indivisible); the buyer takes the combination that exactly covers the shortfall and is cheaper than retail. 3.2 the injection demo is `apps/agents/src/demo/injection.ts` (`npm run demo:injection`); D's `scripts/demo-injection.ts` shows the guard's side, C's shows both layers, agent + guard. Vault mode via `startMockStack({ vaultAgents })` and `<NAME>_VAULT_ID`; the profiles stay p2pkh by default. 3.3 `participant-cli` uses the agents' `PoolParticipant`. 3.4 the second product is `data-proxy` + `runners.ts`. Extra: the `apps/agents` live feed for E (§3.10) and provider-api CORS.

### ✋ Checkpoint (end of phase 3)
1. **Is the plan still good?** If `participant-cli` with Desktop cannot make the signing round (the approval window exceeds 60 s), define a longer round time for people with B; MASTER §3.2 and STATUS.
2. **This phase is done** → STATUS Track C.
3. **What did the other tracks do?** D.P4 wants your "Provider" and "Agents" sections for the README; prepare your txid list.
4. **Dependencies of the next phase:** none.
5. If an interface changed, MASTER §3 + STATUS.

---

## Phase 4 — Wrap-up → S4

**Tasks**
- 4.1 README sections: "Provider (simulated GPU)", "Agents" (the decision loop, an example `decisions.log`), "How to add a provider" (products/*.json + runner), "SmartRoute (planned)".
- 4.2 `npm run demo` one command: infra (B) + provider + agents + opening a pool + logs; `npm run demo:failed-pool`, `npm run demo:injection`.
- 4.3 Test cleanup; a schema for `products/*.json`.
- 4.4 txids to D (T1, T2, T6, T7, T8 and the agent T5/T10).

**Implementation notes (31.10, end of phase 4):** the README sections are in the root `README.md` ("Provider and agents (Track C)" + component rows). `npm run demo` = `demo:k1` (the whole flow on the mock chain: B's overlay + coordinator as infrastructure, provider, operator, 3 agents, pool, settlement, credit use, market); running with real services is `npm run agents` + the guide (`plan/MAINNET-RUNBOOK.md`). Product schema `products/product.schema.json`. 4.4 waits for the mainnet run.

### ✋ Checkpoint (end of phase 4)
1. Plan change? STATUS.
2. STATUS Track C: "Done".
3. Is any open blocker yours?
4. C items in the S4 list ✓.
