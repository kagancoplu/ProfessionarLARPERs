# Track B — Overlay + Coordinator (`packages/overlay`, `apps/coordinator`)

> **Role:** the verified view of the chain (overlay) and the process that fills and closes pools (coordinator). Overlay = the source of discovery and progress; coordinator = deterministic lock-in, signing round, broadcast. **The coordinator holds no money.**
> **References:** `00-MASTER-PLAN.md §3.2, §3.5, §3.8`, `FINAL-IDEA.md §4.3–4.5`, guide §16, §20; kit `overlay/*`, `client/overlayApi.ts`, `test/e2e.mockchain.test.ts`.

## How to use this file with an AI

1. Give the AI **one phase only**:
   > "Read `plan/00-MASTER-PLAN.md` §3 and §4, `plan/STATUS.md` and **phase N** of `plan/track-B-overlay-coordinator.md`. Implement only phase N. When done, run the Checkpoint and update the Track B section of STATUS.md."
2. The overlay is copied from the kit (`overlay/server.ts`, `Bsv21KitTopicManager.ts`, `Bsv21KitLookupService.ts`, `chainTracker.ts`, `noopAdvertiser.ts`), not rewritten.
3. If A's `types.ts` and `planSettlement` are not ready, proceed with a stub against the types in MASTER §3.3.

---

## Phase 0 — Stand up the overlay from the kit, validation tests 1 and 8 → S0

**Goal:** an overlay running under the name `tm_agentcoop`; evidence that a settlement with mixed inputs is accepted.

**Dependency:** A.P0 repo skeleton (otherwise start `packages/overlay` with the kit's own `package.json`, then move it into the workspace).

**Tasks**
- 0.1 `packages/overlay`: copy the kit's `overlay/`; topic `tm_agentcoop`, service `ls_agentcoop` (BRC-87, no digits); env `PORT=8080`, `OVERLAY_DB=./data/overlay.db`, `CHAINTRACKS_URL` Arcade. `npm run overlay` starts.
- 0.2 **Validation test 1:** derived from the kit's `test/e2e.mockchain.test.ts`: 1 token input (N=1000) + 2 plain-sats inputs, 3 credit outputs (600/300/100) + 1 plain output + OP_RETURN. Overlay `/submit` → `outputsToAdmit` must contain the 3 credit outputs. The result into the STATUS "Validation tests" table. If it refuses, write the reason (which `rules.ts` line); the topic manager is extended together with A.
- 0.3 **Validation test 8:** Arcade `GET /health` → policy (sat/kB, max tx size, max inputs?) into STATUS. Write the estimated settlement size for 20 and 100 participants.
- 0.4 `packages/overlay/README.md`: how it starts, env, queries.

**Acceptance:** the overlay starts; the results of tests 1 and 8 in STATUS; S0 B items ✓.

### ✋ Checkpoint (end of phase 0)
1. **Is the plan still good?** If test 1 fails, add an "extend the rules" task to phase 1 and tell A (not STATUS Blockers but "Interface/Plan changes"). If the Arcade policy limits the settlement size, update the MASTER §3.2 120 % / participant count limit.
2. **This phase is done** → STATUS Track B.
3. **What did the other tracks do?** Is A.P0's `types.ts` ready? Does C.P0 have a product definition (the `label` fields to index)?
4. **Dependencies of the next phase:** A.P0 `types.ts`, `opreturn.ts`. Otherwise start with your own temporary copy from MASTER §3.3, change the import when A is ready.
5. If an interface changed, MASTER §3 + STATUS.

---

## Phase 1 — `tm_agentcoop` indexing + side API (offers) → S1

**Goal:** pool announcements, pledges, settlements and offer records are counted from the chain; A's skeleton can work with `POST /offers` and `GET /pools/:id`.

**Dependency:** A.P0 (`types.ts`, `parseOpReturn`). A.P1's builders are developed in parallel; build your own fake txs for test data.

**Tasks**
- 1.1 `AgentCoopTopicManager`: runs the kit's token rules **unchanged** (for credit outputs) **and** recognises txs carrying the OP_RETURN `agentcoop` envelope: `pool` → out0 credit UTXO + terms; `pledge` → out0 pledge coin, out1 fee, out2 record; `settle` → settlement; `list` → listing; `vault` → vault output (D's format, stored raw for now). Admitted outputs: credit outputs (kit rule), pledge coins, vault outputs. OP_RETURN outputs are not admitted but parsed and written to the lookup. **Besides the kit rule's token inputs, inputs spending pledge coins and vault outputs also go into `coinsToRetain`** (the B.P0 finding: the engine deletes previous topic outputs that are not in `coinsToRetain`; without retaining them, the settlement/cancellation history and the phase 6.3 audit are lost).
- 1.2 `AgentCoopLookupService` (knex/SQLite): tables `pools(poolId, terms json, status, createdHeight)`, `pledges(outpoint, poolId, participant, credits, signer, height, spent, spendingTxid)`, `settlements(poolId, txid, pledgeListHash)`, `listings(outpoint, …, spent)`, `vaults(outpoint, owner, agent, guard, spent)`. **(B.P1 change:** offers are not on chain, so they are not on the overlay but in the coordinator's own SQLite; moved to the overlay if phase 6.1 is accepted. Listings/vaults in a raw `agentcoop_records` table in phase 1.) Spent marking: the engine's `outputSpent` call (the pattern in the kit lookup).
- 1.3 Lookup queries MASTER §3.8. The `pool` query computes the progress: `pledgedCredits = Σ unspent pledge.credits`, `status`.
- 1.4 **Side API**: Express inside `apps/coordinator` (port 8090): `POST/GET /offers`, `GET /pools`, `/pools/:id`, `/pools/:id/pledges` (wraps the overlay lookup + verifies the `Offer`: A's `verifyOffer`; if not ready, only the signature format). A `WS /ws` skeleton in the same process: `hello`, `pool_update` publication (on each new admission to the overlay — the simple way: a lookup poll every 5 s).
- 1.5 Test: `test/overlay.agentcoop.test.ts` — fake pool/pledge/settle txs (with A's builders if they exist) → correct lookup results; progress drops when a pledge is spent.
- 1.6 Skeleton integration: A's `scripts/skeleton.ts` writes the offer to `POST /offers` and submits the settlement to `tm_agentcoop`; `GET /pools/:id` shows `settled`.

**Acceptance:** the mainnet skeleton settlement `settled` on the overlay; S1 B items ✓.

### ✋ Checkpoint (end of phase 1)
1. **Is the plan still good?** If the engine behaves differently than expected in OP_RETURN parsing or spent tracking, update phase 2; write it into STATUS.
2. **This phase is done** → STATUS Track B; `COOP_API_URL` and example curls.
3. **What did the other tracks do?** Is A.P1's `planSettlement` signature final? Did C.P1 read how the agents connect to the WS (MASTER §3.5)?
4. **Dependencies of the next phase:** A.P1 (`planSettlement`, `assembleSettlement`, `broadcastEF`). Otherwise write the coordinator's round logic with a stub that produces a `plan`; connect the real builder when it arrives.
5. If an interface changed, MASTER §3 + STATUS.

---

## Phase 2 — Coordinator: lock-in, signing round, broadcast → S2

**Goal:** when a pool fills, the coordinator builds the deterministic plan, collects the participants' signatures, tries up to 3 rounds and broadcasts; an unfilled pool becomes `failed` when its time is up.

**Dependency:** A.P1. C.P2's agents will come as WS clients; until then, fake participants inside `test/`.

**Tasks**
- 2.1 `apps/coordinator/src/engine.ts`: a pool-watching loop (overlay poll or WS admission); condition: `pledgedCredits ≥ N` and `height < deadlineHeight` → `locking`. Call `planSettlement(offer, pledges, { excluded })` (the MASTER §3.2 ordering + 120 %). Check one last time with Arcade `/tx` that each pledge is **still unspent**.
- 2.2 Signing round: a `sign_request` to each participant (WS; a MessageBox fallback if the participant is not registered with `hello` — guide §9.5, `@bsv/message-box-client`; for the PoC WS alone is enough, MessageBox "if available"). A 60 s timeout. Combine the incoming `sign_response`s with A's `assembleSettlement`. Missing ones → `round_failed`, blacklist the missing outpoints, fill from the waiting list, `round+1`. After 3 rounds go back to `open` (the pool does not die, the pledges stay).
- 2.3 Broadcast: `broadcastEF` → Arcade; if successful, submit to the overlay; publish `settled`; the `settlements` table fills from the overlay.
- 2.4 Unfilled pool: `height ≥ deadlineHeight` and `pledgedCredits < N` → `pool_failed`, status `failed`. No broadcast at all.
- 2.5 State and logs: `GET /pools/:id` → `round`, `signed/total`, `blacklist`. Every decision a log line (can be shown in the jury video).
- 2.6 Test: `test/e2e.coordinator.mockchain.test.ts` (shared with A): 3 fake participants, one does not sign in round 1 → round 2 completes with the waiting list; an unfilled pool `failed`.
- 2.7 Coordinator wallet: wallet-toolbox (`WALLET_COORDINATOR_KEY`) only for identity (the `AuthFetch` server side and MessageBox). It holds no money; written in the README. **(B.P2: not needed; in the WS-only round the coordinator has no key at all. Identity is added in phase 5 for the `hello` proof.)**

**Acceptance:** a settlement built by the coordinator on mainnet with C's agents (T5) in STATUS; the unfilled pool scenario once on mainnet (pledge txs + `failed`); S2 B ✓.

### ✋ Checkpoint (end of phase 2)
1. **Is the plan still good?** If you were forced to use MessageBox instead of WS, or 60 s was not enough, update MASTER §3.2; write it into STATUS.
2. **This phase is done** → STATUS Track B.
3. **What did the other tracks do?** Are A.P2's `signListing`/`buildSweep` types ready (phase 3 indexes them)? Is D.P1's vault OP_RETURN format final? When do C.P2's agents send `sign_reject` (a policy refusal) — let it show in the logs.
4. **Dependencies of the next phase:** A.P2 (listing types), D.P1 (vault format). Otherwise write phase 3.1 against MASTER §3.3 `Listing`.
5. If an interface changed, MASTER §3 + STATUS.

---

## Phase 3 — Market index, vault index, live feed, hosting → S3

**Goal:** listings and vaults on the overlay; `pool_update` in real time; the overlay and the coordinator running continuously on one machine.

**Dependency:** A.P2 (listing), D.P1 (the vault output format).

**Tasks**
- 3.1 `POST /listings` (A's `Listing` type; signature and unspentness checks), `GET /listings?tokenId=`; `spent` tracking in the overlay's `listings` table (dropped after a sweep).
- 3.2 `vaults` query: vault outputs and balances by owner identity (D's owner-cli uses it).
- 3.3 Live feed: an overlay admission hook instead of polling (if the engine has an event) → WS `pool_update` ≤ 1 s.
- 3.4 Hosting: overlay + coordinator in one `docker-compose.yml` or `npm run infra`; `data/` persistent; `.env.example` current. Runs continuously on the team's shared machine (or a VPS); the URLs in STATUS.
- 3.5 Durability: when the coordinator restarts it returns open rounds to `open`; when the overlay restarts `GASPSync` stays off (like the kit), missing txs are called in with `sync` (guide §17.6).

**Acceptance:** on mainnet a listing + sweep shows correctly on the overlay; the vault query works; infra up for 24 hours without interruption; S3 B ✓.

### ✋ Checkpoint (end of phase 3)
1. **Is the plan still good?** If hosting needed a VPS and there is none, STATUS Blockers.
2. **This phase is done** → STATUS Track B.
3. **What did the other tracks do?** D.P4 wants an overlay/coordinator section for the README from you.
4. **Dependencies of the next phase:** none.
5. If an interface changed, MASTER §3 + STATUS.

---

> **Extension phases (5 and 6).** Phases 0–3 describe the minimum. Two things are missing: the jury and outside agents cannot try the product (everything is local), and neither permissionlessness nor scale is shown. Phases 5 and 6 close these. **Rule: they do not start before S3 is done.** Order 5 → 6 → 4: phase 4 (wrap-up) is always last. If time runs out, phase 6 is cut before phase 5; 5.1–5.3 of phase 5 are valuable even on their own.

## Phase 5 — Public deployment (overlay + coordinator + side API) → after S3

**Goal:** the jury, other teams and outside agents can try AgentCoop from their own machines: see the pools, do lookups, connect to the WS through `https://overlay.<domain>` and `https://coop.<domain>`, and pledge and join a signing round with their own agent. The jury criteria "adoption" (35 %) and "clear demo" depend directly on this; a demo running locally cannot show it.

**Dependency:** S3. D's account and domain setup (`plan/SETUP-ACCOUNTS.md` §3: VPS, DNS, certificate). That file is not in the repo yet; if it is missing, do 5.1 yourself and write "SETUP-ACCOUNTS §3 missing" into STATUS Blockers. C's agents reading `OVERLAY_URL` / `COOP_API_URL` from env (MASTER §3.9).

**Tasks**
- 5.1 **Server:** one small VPS (2 vCPU, 4 GB, Ubuntu; Node 22 + pm2 or docker compose). `packages/overlay` and `apps/coordinator` start with phase 3.4's `npm run infra`. `data/` in a separate directory (`/var/lib/agentcoop`), a daily `sqlite3 .backup` (cron) + `overlay.key` / the coordinator key only on the server (`.env`, mode 600).
- 5.2 **HTTPS + domain:** a Caddy reverse proxy (automatic Let's Encrypt). `overlay.<domain>` → :8080, `coop.<domain>` → :8090 (WS included, the `/ws` upgrade). HTTP → HTTPS redirect. Without a domain, a stopgap: `<ip>.sslip.io` subdomains (no DNS needed, works with Let's Encrypt).
- 5.3 **CORS and edge policy:** overlay `configureEdgePolicy` / side API `cors()`: GET/lookup public; `POST /offers`, `POST /listings` public but verified (signature + unspentness). No BRC-105/402 headers needed (those are in C's provider). A body limit (e.g. 1 MB; 10 MB for the overlay `/submit` for settlement BEEFs).
- 5.4 **Abuse limits:** a per-IP rate limit (`express-rate-limit`; lookup 60/min, POST 10/min); WS: a message limit per connection, an **identity proof** in `hello` (the participant signs the coordinator's nonce with its identity key; `sign_request` goes only to a proven identity). The overlay `/submit` is already protected by SPV + rules; a size limit is enough.
- 5.5 **Monitoring:** `GET /healthz` (overlay: DB access + last admission time; coordinator: open pool count, connected WS clients, Arcade access). UptimeRobot (or a similar free service) watches both URLs every minute; on failure, a notification to the team's Telegram. Structured logs (JSON lines) → `journalctl`/pm2 log; every coordinator decision one line (phase 2.5).
- 5.6 **Outside joining guide:** a "Join with your own agent" section in `apps/coordinator/README.md`: the public URLs, lookup examples (curl), the WS protocol (MASTER §3.5), a 10-line example with C's agent SDK. Try the guide end to end from a machine outside the team (e.g. a team member's phone hotspot + a clean clone).
- 5.7 **Mainnet evidence:** an agent on a non-local machine joins a pool through the public coordinator and enters a settlement; the txid in STATUS.

**Acceptance:** both HTTPS URLs reachable from outside and the 5.5 monitoring green; CORS checked from a browser (another origin) with a lookup; a pledge + settlement made with the guide from a machine outside the team (txid in STATUS); no data loss when the server restarts (restoring from the 5.1 backup tried once).

**Outputs:** `infra/` (Caddyfile, `docker-compose.yml` or `ecosystem.config.cjs`, `backup.sh`, an `.env.example` addition), `apps/coordinator/src/auth.ts` (the hello identity proof), `apps/coordinator/README.md` "Join with your own agent", the public URLs in STATUS.

### ✋ Checkpoint (end of phase 5)
1. **Is the plan still good?** If the WS identity proof changed the MASTER §3.5 `hello` message (`hello { identity, poolIds[], nonceSig }`), MASTER §3 first, then STATUS "Interface changes"; tell C. If no VPS was found, STATUS Blockers.
2. **This phase is done** → STATUS Track B; the public URLs into the "What other tracks expect from me" row (C agents, D README and video).
3. **What did the other tracks do?** Do C's agents work with the public URLs? Did D take the URLs into the README?
4. **Dependencies of the next phase:** for phase 6, C's agent fleet (many wallet-toolbox agents) and funding (D).
5. If an interface changed, MASTER §3 + STATUS.

---

## Phase 6 — Evidence of permissionlessness and scale: a second coordinator, metrics, audit, 50+ participants → after S3

**Goal:** prove three claims on chain: (1) the coordinator is a **permissionless** role, another independent coordinator can also close the same offer; (2) the coordinator's selection is **auditable**, anyone can recompute the deterministic ordering and compare it with the hash in the OP_RETURN; (3) the mechanism **scales**, 50+ participants in one settlement transaction. This is the concrete evidence for the "technical implementation and non-custodial design" (20 %) criterion and for FINAL-IDEA §8's row "the coordinator's power to choose: detectable". It is also the source of the numbers in the FINAL-IDEA §11 demo closing (participant count, transaction count, fee per settlement, **sats in custody = 0**).

**Dependency:** S3, phase 5 (the second coordinator reads the public overlay). A's `planSettlement` being deterministic (the A.P2.8 test). C's agent fleet: 50+ wallet-toolbox agents and automatic pledging (with C; if not in C's track file, ask C through STATUS). Funding from D: 50 agents × (pledge + registration fee + fee share); the sats go to the provider at settlement, i.e. back to the team.

**Tasks**
- 6.1 **Publishing the offer on chain (a proposed interface addition):** today the `Offer` (the provider's SINGLE|ACP signature) lives only in coordinator 1's `POST /offers`; this makes a second coordinator depend on the first. The offer signature spends an output of the pool tx itself, so it cannot be put in the same tx; so it is written on chain with a separate small `OP_RETURN agentcoop offer <json>` tx (or a second tx in provider-cli's `open-pool` step), the overlay indexes it into an `offers` table, and an `{ op:'offer', poolId }` lookup is added. **First `offer` is added to the MASTER §3.2 op list and the lookup to §3.8**, announced to A and C in STATUS. If A/C do not accept it, a stopgap: coordinator 2 fetches the offer from coordinator 1's `GET /offers/:poolId` (written honestly in the README).
- 6.2 **A second independent coordinator:** the same `apps/coordinator` code, a different identity key (`WALLET_COORDINATOR_2_KEY`), a different port/subdomain (`coop2.<domain>`), the same public overlay. Scenario: coordinator 1 is shut down (or deliberately "censors" a pool); coordinator 2 finds the offer from the chain/overlay, builds the same deterministic plan, the agents (C, with a `COOP_API_URL` change) join coordinator 2's round, the settlement is broadcast. Once on mainnet; the txid and "which coordinator closed it" in STATUS.
- 6.3 **(B.P6a ✅ 30.10, mock chain)** **An audit endpoint (proposed addition):** `GET /pools/:poolId/audit` → the pool's on-chain pledges (from the overlay), the ordering and `pledgeListHash` recomputed with the MASTER §3.2 rule, the hash in the settlement tx's OP_RETURN and `match: true|false`; the skipped (blacklisted) outpoints and their reasons (the `round_failed` records). Works for any pool closed by any coordinator, so coordinator 2 can audit coordinator 1. A command-line twin: `npx tsx apps/coordinator/scripts/audit.ts <poolId>`.
- 6.4 **(B.P6a ✅ 30.10, mock chain)** **A metrics endpoint:** `GET /metrics` (JSON; also Prometheus text `?format=prom`): `settlements` (count), `participants` (total and average per pool, the largest settlement), `avgFeeSats` and `avgFeeSatsPerParticipant`, `avgSettlementBytes`, `pledges` (open/cancelled/settled), `failedPools`, `rounds` (average round count), and **`custodiedSats = 0`** with how it is computed: for each settlement tx it is checked one by one that no input came from the coordinator's keys and no output is locked to the coordinator's keys; the coordinator wallet's balance as a time series decreases only with identity/broadcast fees. The values are computed from the chain records on the overlay (not from the coordinator's own declaration).
- 6.5 **Scale test (with C):** first the mock chain: `test/e2e.scale.mockchain.test.ts` with 50 and 100 participants (a separate wallet-toolbox wallet per agent; measuring the round timeout, WS concurrency, BEEF size, overlay `/submit` time). Then mainnet: **a settlement with 50+ participants** (T5). By validation test 8, 50 participants ≈ 17–18 kB ≈ 1,800 sat fee; the Arcade policy (max tx 100 MB, max script ≥ 500 kB) is not a limit. Measured into STATUS: the signing round's duration, tx size, fee, overlay admission time.
- 6.6 Coordinator optimisation if needed: send the `sign_request`s in parallel, serialize `templateBEEF` once (no copy per participant), make signature verification incremental per input.

**Acceptance:** two coordinators run on the same overlay and coordinator 2 closed a pool on mainnet (txid in STATUS); `/pools/:id/audit` returns `match: true` for that settlement and returning `false` with a fake hash is tested; `/metrics` at the public URL with `custodiedSats: 0`; a mainnet settlement txid with ≥ 50 participants in STATUS, the 100-participant test green on the mock chain.

**Outputs:** `apps/coordinator/src/{audit,metrics}.ts`, `apps/coordinator/scripts/audit.ts`, a `packages/overlay` `offer` index (if 6.1 was accepted), `test/e2e.scale.mockchain.test.ts`, a second coordinator service in `infra/`, the scale results in STATUS and numbers for the README (to D).

### ✋ Checkpoint (end of phase 6)
1. **Is the plan still good?** If 6.1 was refused, soften the README's permissionlessness claim to "the offer is on a public API"; if the scale test found a bottleneck (WS, BEEF size, overlay time), write the limit into STATUS.
2. **This phase is done** → STATUS Track B; the metrics URL and the scale numbers into the "What other tracks expect from me" row (D: README, value note, video closing).
3. **What did the other tracks do?** Were C's agent fleet and D's funding enough? Did D take the numbers into the README?
4. **Dependencies of the next phase:** phase 4 (wrap-up): none.
5. If an interface changed (6.1 the `offer` op, the 6.3/6.4 endpoints), MASTER §3.2/§3.5/§3.8 + STATUS.

---

## Phase 4 — Wrap-up → S4

> Done after phases 5 and 6 (if they were done).

**Tasks**
- 4.1 `apps/coordinator/README.md` and `packages/overlay/README.md`: queries, the WS protocol, the ordering rule, the "the coordinator holds no money, anyone can run one" note, how to run your own coordinator; if phases 5/6 were done, the public URLs, `/metrics`, `/audit` and the second coordinator's settlement.
- 4.2 Test durations and flaky cleanup.
- 4.3 Hand-over to D: the README "Overlay & Coordinator" section; the txids of the settlements the coordinator built on mainnet.

### ✋ Checkpoint (end of phase 4)
1. Plan change? STATUS.
2. STATUS Track B: "Done".
3. Is any open blocker yours?
4. B items in the S4 list ✓.
