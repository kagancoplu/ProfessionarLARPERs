# The Supabase layer: review and flow report

> **Implementation:** the demo MVP (F1 live mirror + F2 multiplayer Town, without authentication) was built with `plan/phases/SUPABASE-MVP.md`; the deviations from this report are there under "MVP decisions".
> State: **draft** (31.10.2026). Replaces the Firebase version: Firebase required a paid plan (a card), so we moved to Supabase. Supabase's free plan needs no card and has tools that fill the same roles.
> Goal: put a communication layer, a temporary ledger and a record system between the frontend and the backend; make clear which part of Supabase sits where and the order of the flows. The implementation plan will be written separately after this report is approved.
> Sources: `plan/00-MASTER-PLAN.md` §3 (interfaces), `plan/STATUS.md`, `plan/track-E-frontend.md` (P7), `docs/THREAT-MODEL.md`, `infra/README.md`, `apps/web/src/**`, `apps/coordinator/src/**`, `apps/guard/src/**`, `packages/overlay/src/**`.

---

## 0. Short summary

1. Supabase becomes the **communication, visibility and record** layer; it **never becomes the money and truth layer**. The source of truth stays the chain + the overlay. Every record in Supabase is either a mirror that can be re-derived from the chain, a statement signed by its owner's identity key, or temporary state whose loss does no harm.
2. The protocol keeps working without Supabase. The coordinator, guard, provider-api, overlay and agents do not know about Supabase. The claim "anyone can run a coordinator" (T-3) is not broken.
3. Proposed structure: **a single relay process** (`apps/relay`, on the VPS next to `infra/run.mjs`) subscribes to all of today's streams, writes to Postgres tables and publishes the changes in batches with **Realtime Broadcast**. Instead of the 5 streams + 6 poll loops it opens today, the browser opens a single Supabase connection.
4. **Postgres (+ RLS):** both live state (pools, pledges, rounds, listings) and the record system (identities, providers, services, products, tx ledger, decisions, metric history) in the same database. Because it is relational, the aggregations done in the browser (leaderboard, savings, pool timeline, provider statistics) move down into SQL views.
5. **Realtime:** Broadcast (batched changes from the relay, Town movements), Presence (who is online), Postgres Changes (only low-volume streams such as a personal inbox).
6. **Auth:** an anonymous session + an Edge Function that verifies a BSV signature writes the identity key into the user's `app_metadata`; RLS works with `auth.jwt() -> 'app_metadata' ->> 'identity_key'`. No need to mint custom JWTs.
7. **Edge Functions:** BSV signature verification (login, signed profile/service/intent/handoff writes), optional web push. **pg_cron + pg_net:** scheduled cleanup and summaries. A long-lived subscription (SSE/WS) does not fit an Edge Function (150 s wall clock on the free plan); that job is in the relay.
8. The signing round, guard `/cosign`, provider-api 402/redeem and overlay `submit` **stay direct**. These are authenticated protocol calls; Supabase does not enter that path.
9. **The tightest constraint is the Realtime quota:** on the free plan 100 messages per second and 2 million messages per month; each recipient counts as a separate message. So the live mirror flows with at most one batched broadcast per second, and in the Town a **destination**, not a position, is sent (§9.8).
10. Time: the hackathon ends on 31.10; S3/S4 are open. If it is to make the submission, only F1 + F2 (live mirror + presence/multiplayer) make sense; the rest afterwards.

---

## 1. How the system talks today

### 1.1 Channels (live mode, `apps/web`)

Service URLs come from `VITE_*` at build time; in development the Vite proxy `/api/<svc>` (`apps/web/src/env.ts:40-71`).

| Service | Channel | What it carries | Frequency |
|---|---|---|---|
| coordinator :8090 | WS `/ws` | `challenge`, `hello`/`hello_ack`, `pool_update`, `sign_request`/`sign_response`/`sign_reject`, `settled`, `round_failed`, `pool_failed` | push; reconnect 1→30 s |
| coordinator | REST | `GET /pools` (after every overlay event), `GET /pools/:id/pledges` (separately for each changed pool: N+1), `GET /listings` (10 s poll), `POST /offers`, `POST /listings`, `POST /pledges/lighthouse`, `GET /metrics`, `/healthz` | event + poll |
| overlay :8080 | SSE `/agentcoop/events` | only `admitted`/`spent { txid }`; the web derives the rest itself with `derive.ts` | push, 150 ms debounce |
| overlay | REST `POST /lookup` | `vaults` (20 s poll) + a separate `vaultCredits` per vault (20 s), `settlement`/`outpoint`/`pledges` in the flows | poll |
| provider-api :8092 | REST + BRC-103/105 `AuthFetch` | catalogue, balance (4 s poll), redeem, job (800 ms poll), return | poll; no SSE |
| guard :8091 | SSE `/events` + REST `AuthFetch` | `cosign_*`, `policy_updated`, `vault_registered`; reading vault/policy/decisions (vault state 5 s poll) | push + poll |
| agents :8093 | SSE `/events` + `GET /agents` | `agent_*` events; the agent list every 30 s | push + poll |
| maker :8094 | SSE `/events` + `GET /quote` | `rail_*` | push |
| Arcade | REST | height, BEEF, SPV | 30 s health |

All sources are wrapped in the same envelope in the web: `CoopEvent { id, ts, src, type, data, txid?, poolId?, agent? }` (`apps/web/src/events/types.ts:11-23`, ~45 event types). Flow: adapter → `bus.publish` (deduplication by `src|id`) → `store.applyEvent` → Town, consoles, sound, recorder. This envelope should also be the common language of the Supabase layer.

### 1.2 Backend: who keeps what where

A real database exists only in the overlay and the coordinator (SQLite, knex); both run as one process on the VPS under `infra/run.mjs` and are backed up. The guard, provider-api, agents and maker keep their state in JSON files under `data/` or in memory; `infra/` neither deploys nor backs them up.

Categories: **E** ephemeral (lost on restart), **D** durable and off-chain only, **M** a mirror of the chain.

| State | Owner | Store | Cat. | Meaning for Supabase |
|---|---|---|---|---|
| Admitted outputs, pool/pledge/settlement/vault/list/offer records; pool state derived at query time | overlay | `data/overlay/overlay.db` | M | The source of truth. GASP sync is off: it knows only what was submitted to it. This is the mirror's source |
| Offers (SINGLE\|ACP signature) | coordinator | `coordinator.db` `offers` | D (re-derivable from the on-chain `offer` record) | Can be mirrored |
| **The listing book** | coordinator | `listings` table | D, **single copy** | Mirrored (`listings` table); the authoritative book stays at the coordinator |
| Pool progress: attempts, blacklist, last round, giving up | coordinator | `progress` table | D | `rounds` table |
| Lighthouse pledges (the person's signature + BEEF) | coordinator | `lighthouse_pledges` | D; if lost, the co-signature cannot be made | **Not mirrored** (the signature is usable together with the guard, T-20); only its existence and state |
| The running round (plan, who has signed), WS sessions | coordinator | memory | E | Round progress is not published on WS, only `GET /pools/:id` → `coordinator { round, signed, total, blacklist }`. The relay reads that |
| Vault records, owner policies, spending ledger (7-day / 24 h windows) | guard | `data/guard/state.json` (the whole file rewritten) | D, **security-critical** | **Not moved, not mirrored** (red line 4) |
| Decision log | guard | `data/guard/decisions.jsonl` | D (audit) | Already public on SSE → `guard_decisions` |
| Prepaid balances, redeemed outpoints | provider-api | `data/provider/balances.json` | D (trusted, ≤ 20 credits) | Not moved |
| Jobs; the overlay outbox (ordered token tx queue) | provider-api | `data/provider/jobs.json`, `outbox.json` | D | Job states can be mirrored (if SSE is added) |
| 402 replay store | provider-api | memory (`InMemoryPaymentReplayStore`) | E | Enough in a single process; with several processes, an option of an atomic table in Postgres (T-17) |
| Products + tokenId | provider-api/cli | `apps/provider-api/products/*.json` (5 s poll) | configuration | `products` table |
| Server wallets | each service | `data/wallets/<name>.sqlite` | M + local meta | Not moved |
| Event buffers (500), the agent list | agents, guard, maker | memory; counters reset on restart | E | The relay gives durable ids |
| Weekly spend, `activity.log`, `decisions.log` | agents | `data/agents/<name>/` | D | Decisions to the `agent_decisions` table |
| **Pool record (nonce = the revenue keyID; without it `sweep-revenue` cannot sign)** | provider-cli | `data/provider-cli/pools.json` | D, local | Encrypted `user_records` (the same problem as the web's `mine.ts`) |
| Own lighthouse pledges | participant-cli | `data/participant-cli/pledges.json` | D, local | Encrypted `user_records` |
| Vault handover: `vault.json`, `fund-<txid>.json` → guard `adopt` | owner-cli → guard | `data/vaults/<id>/` (by moving files) | D, file-based handover | Handover between machines with a `handoffs` table (the content is already on chain/public; the guard verifies from the chain) |
| Public identity keys | scripts | `config/identities.json` (committed) | record | Seed for `identities` |

The services find each other only through env URLs (`OVERLAY_URL`, `COOP_API_URL`, `GUARD_URL`, `LIGHTHOUSE_GUARDS`, …); the coordinator learns the guard identities from `/healthz`. Push: overlay → coordinator (SSE), coordinator → participants (WS), guard/agents/maker → web (SSE). Poll: coordinator → overlay 5 s, agents → `/pools` 30 s, provider-api → coordinator (catalogue), web → the loops in §1.1.

Single-process assumptions: the coordinator's round is in memory (two processes on the same DB would run a double round; the design runs a second coordinator with a separate DB), the guard processes `/cosign` in order with an in-process queue (G13), the provider-api balance check + debit is synchronous. Supabase must not change these assumptions; hence rule 4 in §2.

### 1.3 Today's gaps (where Supabase helps)

| # | Gap | Evidence | Counterpart in Supabase |
|---|---|---|---|
| B1 | **No pools on a cold start.** The overlay SSE does not call `refresh()` on opening, the coordinator sends no snapshot to a watcher without a wallet, and a `pool_update` for an unknown pool is ignored. The Town is empty until the first event | `events/adapters/overlaySse.ts`, `store/reducers.ts:109-110`, `apps/coordinator/src/ws.ts:89-104,169-176` | One query (PostgREST) from the `pools`/`pledges`/`rounds`/`listings` tables on opening, then changes through Broadcast |
| B2 | **Aggregation in the browser.** SSE → REST → diff; sha256 + a separate lookup per vault; merging guard vault+policy+decisions; metrics | `overlaySse.ts:24-50`, `livePoll.ts:49-73`, `flows/live.ts:365-372` | The relay writes once; the aggregations are SQL views |
| B3 | **Poll load.** Listings 10 s, vaults 20 s, agents/health 30 s, balance 4 s, vault 5 s, job 800 ms; every `AuthFetch` call is a new BRC-103 handshake | `livePoll.ts`, `ParticipantPage.tsx:82,92`, `OwnerPage.tsx:22`, `live.ts:56` | Public data from Broadcast; authenticated data stays direct but becomes less frequent |
| B4 | **No history.** The store is in memory; on page reload the metric history, timelines and leaderboard are gone | `store/types.ts:141-160`, `store/history.ts` | `pools`, `txs`, `events`, `metrics_snapshots` tables + views |
| B5 | **No identity record.** A name only for agents (`GET /agents`); a person, provider, guard is `short(pubkey)`. A single provider URL is assumed (although each pool has its own `terms.providerApi`), a single guard URL | `reducers.ts:67`, `live.ts:58` vs `:257` | `identities`, `provider_stats` view, `services` |
| B6 | **Critical personal records only in localStorage.** `agentcoop.mine.<id16>`: my pledges + key instructions, my pools + nonce (the revenue keyID), my vaults + script. Withdrawing and revenue sync from another browser do not work | `wallet/mine.ts:23-44`, `live.ts:286,378` | `user_records`, **encrypted with the wallet**, only the owner via RLS |
| B7 | **Optimistic events stamped with a fake source.** The browser produces `src:'guard'`/`'overlay'` events; local `guard:N` ids can collide with the server's `guard:${seq}` and drop the real event in deduplication; agent and maker counters reset on restart | `live.ts:340-428`, `apps/guard/src/guard.ts:121` | The `txs.stage` life cycle + the relay's durable, unique event ids |
| B8 | **Multiplayer (P7) not done:** no presence server | `STATUS.md:455`, `track-E-frontend.md:522` | Realtime Presence + Broadcast (`town:main` channel) |
| B9 | **No notifications.** The user sees the 60 s signing round, a guard refusal or a sold listing only if the tab is open | — | `inbox` table + Postgres Changes (+ an optional web push Edge Function) |
| B10 | **Service URLs baked into the build**, no runtime configuration; the CSP `connect-src` is a placeholder when published | `vite.config.ts:25`, `public/_headers` | `services` table (signed) → read on opening |
| B11 | A replay recording is downloaded by hand and copied into `public/replays`; the mainnet tx table is kept by hand in STATUS and the README | `replay/recorder.ts:37-43` | `txs` table + a Storage `replays` bucket |
| B12 | **The CLIs' records in local files, handovers by moving files.** `provider-cli/pools.json` (the revenue nonce), `participant-cli/pledges.json`, `data/vaults/<id>/` for owner-cli → guard `adopt` | §1.2 | Encrypted `user_records` (the CLI and the web see the same record); `handoffs` |
| B13 | The guard, provider-api, agent and CLI states are not on the VPS and not backed up | `infra/backup.mjs:24-29` | Not Supabase's job (security-critical ones stay in place); `infra/backup.mjs` should be extended. Supabase only becomes a second copy of the public/encrypted records |

**Side findings (independent of Supabase, to pass on to the relevant track):**
- **The web build is broken:** `apps/web/src/consoles/explorer/MainnetProof.tsx:2` imports `../../data/mainnet`; the file exists neither in the repo nor on this machine, the root `.gitignore:16 data/` swallows it (→ E).
- Replay mode also builds `createLiveFlows` with live URLs; in replay a user action goes to the real services (`apps/web/src/boot.ts:69`) (→ E).
- The maker's default port 8094 clashes with `COOP2_PORT=8094` in `infra/agentcoop.env.example` (→ B/D).
- STATUS Track E still counts `POST /pledges/lighthouse` as open; B wrote it was done on 31.10 (→ E).
- `.env.example` has no `VITE_MAKER_URL` (→ D/E).

---

## 2. Red lines (rules that do not change)

1. **Supabase carries no value and holds no keys.** Private keys, seeds, `.env`, the guard secret, the overlay key do not go to Supabase. Supabase's **secret key** (`sb_secret_…`, formerly `service_role`; bypasses RLS) lives only in the relay's `.env` and in the Edge Function secrets. The browser has only the **publishable key** (`sb_publishable_…`, formerly `anon`); it is not secret, RLS provides the protection.
2. **The source of truth is the chain + the overlay.** Pool, pledge, listing and credit data in Supabase is for display. Every check before signing (`verifySettlementPlan`, `verifyLineage`, `verifyListing`) is done independently of Supabase. If money is to be moved based on something seen in Supabase (sweep, pledge), the flow first refreshes the data from the overlay/coordinator. Today's builders already work this way (BEEF from the overlay, lineage from the chain).
3. **The protocol works without Supabase.** If the relay goes down, the web falls back to today's direct adapters. The CLIs and agents are not affected at all.
4. **Security-critical atomic stores stay in place:** the guard's cap counters and decision log, the provider-api's 402 and redeem replay stores, the prepaid balance. These must stay within the boundary of their process. (If provider-api later runs as several processes, there can be an atomic shared replay store in Postgres with `insert … on conflict do nothing`; AGENTS.md says "atomic, shared replay store". Not needed now.)
5. **User statements are signed.** A profile, intent, service record or vault handover is signed with its owner's identity key; the signature is stored with the row and anyone can verify it. Because Postgres cannot verify secp256k1, these writes go not directly to the table but to an Edge Function that verifies the signature.
6. **Personal records are encrypted.** "My records" are encrypted with the user's wallet (`wallet.encrypt`, `counterparty: 'self'`) and written; Supabase sees only ciphertext.
7. **Narrow write permission, default deny.** RLS is on for every table. A client writes only to its own `user_records` rows, its own `txs` `created` record and the `read` column of its own `inbox` row. Only the relay (secret key) writes mirrored data. The policies are proven by tests on the local Supabase stack.

---

## 3. Architectural approaches

| | A. Relay / mirror (**proposed**) | B. Services write directly | C. Supabase as the protocol data path |
|---|---|---|---|
| What | A single `apps/relay` subscribes to the existing WS/SSE/REST, writes to Postgres, publishes Broadcast | A Supabase "sink" is added to the coordinator, guard, agents, provider-api | `sign_request`/`sign_response`, pledge notices etc. flow over Realtime; WS/SSE retired |
| Service code | Unchanged | Every track changes it | The coordinator and all clients are rewritten |
| Secret key | Only in the relay (+ Edge Functions) | In every process | Everywhere |
| Data richness | As much as the existing events; small additions to a service for what is missing | The richest | The richest |
| Centralisation | An optional display layer | Supabase becomes a dependency of the services | Supabase becomes part of the protocol; T-3 "anyone can run a coordinator" weakens, a question mark on the jury's non-custodial/decentralisation score |
| Realtime quota | The relay batches, ≤ 1 broadcast per second | Each service publishes separately, the quota runs out fast | Signing rounds also use quota |
| Risk | The mirror can lag/go stale (closed by the reconciliation loop) | Touching 4 tracks at once | The highest |

**Proposal: A**, with selective B if needed (e.g. the coordinator publishes richer round progress to watchers). C is not recommended.

A BSV-native alternative note: for messages addressed to an identity that wait while the recipient is offline, the ecosystem has **MessageBox** (`@bsv/message-box-client`, BRC-33, guide §5). The inbox (§9.3) could later also be written to MessageBox; a plus for the jury. MessageBox does not suit presence, multiplayer movement or a queryable record; Supabase is the better fit there.

---

## 4. Mapping the Supabase tools

| Need | Tool | Why this one |
|---|---|---|
| Live pool/pledge/round/listing/vault state (temporary ledger, public) | **Postgres tables** + **Realtime Broadcast** (batched changes from the relay) | One query on opening, then a change stream. Broadcast is cheaper than Postgres Changes: no RLS check per subscriber, and the relay can make one packet per second |
| Presence (who is online) | **Realtime Presence** | Drops out by itself when the connection is lost; no table needed |
| Town movements (P7) | **Realtime Broadcast** (`town:main`) | Need not be persistent; a destination, not a position, is sent (§9.8) |
| Personal inbox | `inbox` table + **Postgres Changes** (with RLS, an `identity_key` filter) | Low volume; RLS ensures each user sees only their own rows |
| Record: identity, provider, service, product, pool archive, tx ledger, decisions, metric history | **Postgres** + **PostgREST** (supabase-js `from(...).select()`) + views/materialized views | Relational queries, joins, ordering; the aggregations in the browser move down into SQL |
| "My records" (encrypted) | `user_records` table + **RLS** | A per-row owner rule; across devices |
| Identity | **Auth**: anonymous session + `app_metadata.identity_key` (written by an Edge Function) | RLS reads the identity with `auth.jwt()`; no need to mint custom JWTs |
| Writes that verify a signature (login proof, profile, service, intent, handoff) | **Edge Functions** (Deno, `npm:@bsv/sdk@3.2.1`) | Postgres cannot verify a secp256k1 signature; the function verifies and writes with the secret key |
| Long-lived subscription and projection | **relay** (our own Node process, VPS) | SSE/WS must stay open for hours; an Edge Function closes after 150 s on the free plan |
| Scheduled cleanup, summaries | **pg_cron** (+ **pg_net** for HTTP) | Available on the free plan; most jobs are pure SQL |
| Notification trigger | **Database Webhooks** (trigger → Edge Function) | `inbox` insert → web push (optional; Supabase has no push service of its own, standard Web Push with VAPID) |
| Replay files | **Storage** (`replays` bucket, world-readable) | 1 GB on the free plan |
| Abuse | **CAPTCHA** on anonymous sign-in (Cloudflare Turnstile or hCaptcha) + RLS + Realtime channel authorisation | Protects the public anonymous session |
| Local development and testing | **Supabase CLI** (`supabase start`: Postgres + Auth + Realtime + Storage + Edge runtime in Docker), `supabase/migrations/*.sql`, `supabase functions serve` | The counterpart of the Firebase emulator; rule (RLS) tests run without sats or a real project |
| Static hosting | **Not in Supabase** → Cloudflare Pages (the plan already says so) | No change |

There is no ready-made way to sign in with BSV: Supabase's "Sign in with Web3" supports only Ethereum and Solana. Hence the anonymous session + Edge Function pattern in §7.

---

## 5. Target architecture

```
                         ┌──────────── BSV mainnet ◀── Arcade ─────────────┐
                         │                                                  │
 overlay :8080 ──SSE + /lookup──┐                                           │
 coordinator :8090 ──WS (watcher) + REST──┤                                 │
 guard :8091 ──SSE───────────────┤──▶  relay (apps/relay, secret key)  ──▶  Supabase
 agents :8093 ──SSE + /agents────┤        • projection (derive)               ├─ Postgres (live tables + record + views, RLS)
 maker :8094 ──SSE───────────────┤        • reconciliation loop               ├─ Realtime (Broadcast `live`, Presence/Broadcast `town:main`,
 provider-api :8092 ──/catalog───┘        • ≤ 1 batched Broadcast per second  │            Postgres Changes `inbox`)
                                                                              ├─ Auth (anonymous + app_metadata.identity_key)
                                                                              ├─ Edge Functions (bsv-auth, signed-write, push)
                                                                              ├─ pg_cron / pg_net (cleanup, summary)
                                                                              └─ Storage (replays)
                                                                                     ▲
                                                                                     │ publishable key + user session
 web ──WS (proven hello, signing round) ──────────────────────────▶ coordinator      │
 web ──AuthFetch (BRC-103/105) ───────────────────────────────────▶ provider-api, guard
 web ──POST /submit ──────────────────────────────────────────────▶ overlay          │
 web ──WalletClient('auto') ──────────────────────────────────────▶ BSV Desktop (every signature)
 web ────────────────────────────────────────────────────────────────────────────────┘
```

The calls that stay direct are authenticated protocol calls. Everything that goes to Supabase is either a public mirror, a statement whose signature was verified, or the user's own row.

---

## 6. Definition of the three layers

### 6.1 The communication layer

- **Downstream (server → browser, public):** relay → Postgres (snapshot) + the Broadcast `live` channel (change packets, a `CoopEvent` array) → all browsers. One connection instead of today's 5 streams + 6 polls. The web store and the Town are fed unchanged.
- **Personal downstream:** relay → `inbox` table → Postgres Changes (with RLS) → only the owner (signature waiting, pool filled, settled, round failed, guard refused, your listing sold).
- **Between browsers:** presence and Town movements (`town:main`), published only by clients, nothing written to a table.
- **Upstream (browser → protocol):** unchanged; directly to the services.

### 6.2 The temporary ledger

"Temporary ledger" can cover four separate things; all of them are off chain, and all can be rebuilt from the chain or from their owner:

| Kind | What | Lifetime | Who writes |
|---|---|---|---|
| G1 Live mirror | Open pools, pledges, round progress (round, signed/total, end time, blacklist), open listings, vault balances, service health | Stays in the same tables; live/archive told apart by `status` (no need for Firebase's separate live/archive trees) | relay |
| G2 Tx life cycle | `txs.stage`: `created → broadcast → admitted → mined` (+ `pool_id`, `kind`). Replaces the optimistic events stamped with a fake source in B7 | Durable (the same table as the tx ledger) | The browser opens the `created` row with its own session; the relay advances it from the overlay/Arcade |
| G3 Inbox / pending work | Personal notifications and "signature waiting" records | Deleted by pg_cron once read or after 24 h | the relay writes; the user only marks `read` |
| G4 Intent ledger (an optional product) | Non-binding, signed demand statements: "~16 GPU-hours over the next 7 days, ≤ 30 sat per credit". The provider sees the total demand and opens a right-sized pool; intent holders get a notification and make the real pledge themselves | Time-limited (`expires_at`), closes when the pool opens | Agent/person writes it signed (the Edge Function verifies) |

G4 holds no money and does not break the non-custodial principle. The agents' 7-day forecast (the `apps/agents` brain) is already produced today; turning it into an intent is a small job. It ties directly to the "organizer agents" vision in FINAL-IDEA §13. The demand total becomes an SQL view (`intent_demand`).

### 6.3 The record system

| Table / view | Content | Source | Verification |
|---|---|---|---|
| `identities` | identity key, kind (provider, agent, human, guard, coordinator, maker), display name, colour, links, first/last seen | profile: its owner's signed statement (Edge Function); server wallets: `config/identities.json` + `GET /agents` (seeded by the relay) | `profile_sig` can be verified by anyone; only the Edge Function/relay writes the `verified` column |
| `provider_stats` (materialized view) | settled pools, credits delivered, revenue, last audit verdict | SQL over `pools` + `txs` | The numbers can be recomputed from the chain. The basis of the "on-chain reputation" in T-5 |
| `services` | coordinator, guard, overlay, maker endpoints, network, version, last health | the service's own signed record (Edge Function) | the web matches it with the identity in `/healthz`; does not use one that does not match |
| `products` | a mirror of `provider-api/products/*.json` (unit, retail, tokenId, demo pricing label) | `GET /v1/catalog` | the tokenId is on chain |
| `pools`, `pledges`, `rounds` | terms, state, timeline, participants, settlement txid, audit (`verdict`, `checks`), rounds and blacklist reasons | overlay + coordinator | `GET /pools/:id/audit` recomputes from the chain |
| `txs` | T1–T11 type, network, pool, actors, amount, height, `stage`, WhatsOnChain link | overlay + Arcade (+ the client's `created` record) | the txid is on chain. The hand-kept tx table in the README and STATUS can be generated from this |
| `agents`, `agent_decisions` | profile, mode (p2pkh/vault), vaultId, savings, pools joined; the decision stream | agents SSE | the decisions are already public on SSE |
| `vaults` | owner, agent, guard, script, balance mirror, `verified` | overlay `vaults` | the script is re-derived from the record |
| `guard_decisions` | approve/deny, reason, amount | guard SSE (already open without identity) | — |
| `events` | the `CoopEvent` stream (last 7 days) | relay | — |
| `metrics_snapshots` | a snapshot of coordinator `/metrics` (`custodiedSats` included) | the relay every hour | `/metrics` is computed from the chain |
| `user_records` | encrypted: pledge instructions, pool nonces, vault records (web `mine.ts` + `provider-cli/pools.json` + `participant-cli/pledges.json` in the same schema) | the user's browser or CLI (both connected to Desktop, both can sign in with §7) | RLS: only the owner reads/writes; the content with `wallet.encrypt`. Rebuilding from the wallet itself is tried first (the agents' `PoolParticipant.restore()` pattern); Supabase is an index and backup |
| `handoffs` | owner-cli/web → guard vault handover (`vault.json` + the funding tx) | the owner's signed document (Edge Function) | the guard verifies from the chain; no moving files |
| `replays` (+ Storage) | meta + file path | the recorder | the txids are on chain |
| Ready views | `leaderboard`, `village_savings`, `pool_timeline`, `listing_book` (by price per credit) | SQL | What `store/history.ts` computes in the browser today |

Policy content (guard `/policies`) is **not mirrored**; today only the owner and the agent can read it, with BRC-103. The web keeps reading it directly from the guard.

---

## 7. Identity flow: BSV Desktop → Supabase Auth

The same pattern as the coordinator's proven `hello` (B.P5a, `apps/coordinator/src/auth.ts`); the verification logic is reused.

1. On opening, the web gets an anonymous session with `supabase.auth.signInAnonymously({ options: { captchaToken } })`. A visitor without a wallet stays here (reading + guest presence).
2. The user connects to Desktop (`WalletClient('auto')`) and gets the identity key with `getPublicKey({ identityKey: true })`.
3. Web → Edge Function `bsv-auth` `POST /challenge` (with the session JWT) → `{ nonce }`. The nonce is bound to the user's `user_id` in the `auth_challenges` table, lives 60 s, single use.
4. The web has Desktop sign: `createSignature({ data: utf8("agentcoop supabase\n" + origin + "\n" + nonce), protocolID: [1, 'agentcoop supabase'], keyID: '1', counterparty: 'anyone' })`. Desktop shows a permission window once for this protocol.
5. Web → `bsv-auth` `POST /prove { identityKey, nonce, sig }`. The function verifies the signature, burns the nonce and writes `auth.admin.updateUserById(user_id, { app_metadata: { identity_key, kind } })`. Only the server side (secret key) can change `app_metadata`; the user cannot change it.
6. The web calls `supabase.auth.refreshSession()`; the new JWT has `app_metadata.identity_key`. The RLS policies read it:
   `(auth.jwt() -> 'app_metadata' ->> 'identity_key') = identity_key`.
7. The same identity key can be bound to anonymous users on several devices; each device makes its own proof.

The CLIs (provider-cli, participant-cli) can run the same flow in Node; they need it to access `user_records`. The agents with server wallets need no session; the relay writes their data.

Point to verify (F0 spike): `@bsv/sdk` running in the Deno Edge runtime with the `npm:` specifier. If it does not, the same two endpoints are opened in the relay (Node, where `@bsv/sdk` already works); the flow does not change, only the URL.

---

## 8. Draft data model

### 8.1 Tables (summary; `supabase/migrations/*.sql`)

```sql
-- live mirror + archive (the relay writes, everyone reads)
pools        (pool_id text pk, txid, provider_key, label, terms jsonb, status, pledged_credits int, target int,
              pledge_count int, deadline_height int, created_height int, settled_txid, audit jsonb,
              as_of_height int, updated_at timestamptz)
pledges      (outpoint text pk, pool_id fk, txid, participant_key, credits int, signer, mode, credit_lock,
              coin_sats bigint, height int, spent bool, spending_txid, valid bool, invalid_reason)
rounds       (pool_id, round int, outcome, signed int, total int, started_at, timeout_ms int,
              missing jsonb, blacklist jsonb, txid, primary key (pool_id, round))
listings     (outpoint text pk, token_id, credits int, ask_sats bigint, sats_per_credit numeric generated,
              seller_key, vault_locked bool, status, filled_txid)
vaults       (vault_id text pk, owner_key, agent_key, guard_key, script_hex, verified bool, balance_sats bigint, credits jsonb)
txs          (txid text pk, kind, network, pool_id, actors text[], sats bigint, stage, height int,
              created_by uuid, ts timestamptz)
events       (id text pk, ts, src, type, data jsonb, txid, pool_id, agent)
health       (service text pk, ok bool, last_seen timestamptz, height int, detail jsonb)
-- record
identities   (identity_key text pk, kind, display_name, color, links jsonb, profile jsonb, profile_sig,
              verified bool, first_seen, last_seen)
services     (identity_key text pk, kind, url, network, version, sig, signed_at)
products     (product_id text pk, provider_key, label, unit, retail_sats_per_credit int, units_per_credit int,
              token_id, demo_pricing bool)
agents       (identity_key text pk, name, profile, mode, vault_id, savings_sats bigint)
agent_decisions (id text pk, agent_key, ts, action, pool_id, credits int, sats bigint, reason, brain)
guard_decisions (id text pk, agent_key, vault_id, kind, outcome, reason, sats bigint, ts)
metrics_snapshots (ts timestamptz pk, data jsonb)
replays      (name text pk, storage_path, recorded_at, network, txids text[])
-- personal and signed statements
user_records (id uuid pk, identity_key, kind, ciphertext text, created_at, updated_at)
inbox        (id uuid pk, identity_key, type, payload jsonb, read bool, ts)
handoffs     (vault_id text pk, owner_key, payload jsonb, sig, consumed_at)
intents      (id uuid pk, identity_key, product_id, credits int, max_sats_per_credit int, horizon_days int,
              sig, expires_at)                                                        -- G4, optional
auth_challenges (nonce text pk, user_id uuid, expires_at)                              -- Edge Function only
```

### 8.2 Realtime channels

| Channel | Type | Writer | Reader | Payload |
|---|---|---|---|---|
| `live` | Broadcast, public read | only the relay (REST broadcast endpoint or supabase-js, secret key) | all visitors | `{ events: CoopEvent[] }`, at most one packet per second, none if nothing changed |
| `town:main` | Presence + Broadcast, private channel | signed-in clients (anonymous included) | players in the Town | Presence: `{ name, color, kind }` (only on join/leave/name change); Broadcast: `move { to: [x, y], t }` |
| `inbox` | Postgres Changes, filter `identity_key=eq.<key>` | relay (insert into the table) | only the owner (RLS) | row |

Private channels are protected by Realtime Authorization: RLS policies on `realtime.messages` decide who can join and publish on which topic. A client is forbidden to publish on `live`; it only listens.

### 8.3 RLS principles (summary)

- **Public tables** (`pools`, `pledges`, `rounds`, `listings`, `vaults`, `txs`, `events`, `health`, `identities`, `services`, `products`, `agents`, `agent_decisions`, `guard_decisions`, `metrics_snapshots`, `replays`, views): `select using (true)`. No write policy; only the secret key (relay, Edge Function) writes.
- **`user_records`**: select/insert/update/delete `using (identity_key = auth.jwt() -> 'app_metadata' ->> 'identity_key')`.
- **`txs`** client insert: only `stage = 'created'`, `created_by = auth.uid()`, a session with a proven identity. Only the relay writes the later stages.
- **`inbox`**: select own rows; update only the `read` column (column privilege: `grant update (read) on inbox to authenticated`).
- **Signed statement tables** (`identities.profile`, `services`, `intents`, `handoffs`): no direct client writes; the Edge Function `signed-write` verifies the signature and writes.
- **`auth_challenges`**: closed to clients.
- The policies are tested on the local stack (`supabase start`) with vitest or pgTAP (`supabase test db`): next to the mock-chain tests, no sats or real project needed.

---

## 9. End-to-end flows (in order)

In each flow: what happens **today** → what is added **with Supabase**. The steps that move money do not change.

### 9.0 Opening (a watcher or a user with a wallet)

1. The web opens, reads the endpoints from the `services` table (B10), checks the `/healthz` identity match.
2. Anonymous session (with CAPTCHA). If a wallet connects, the identity is proven with §7.
3. A one-time snapshot: `pools` (open + recently settled), `pledges`, `rounds`, `listings`, `health` → the store fills with `hydrate*` → the Town is full in the first frame (B1 closes).
4. Subscribe to the `live` channel; incoming packets are pushed to the bus.
5. Charts start with history from `metrics_snapshots` and the views (B4).
6. When the tab is hidden (`visibilitychange`) the Realtime subscription closes; when visible again, a snapshot + resubscribe: the quota is preserved (§13).
7. If the relay or Supabase cannot be reached, the web falls back to today's direct adapters (badge: "direct").

### 9.1 A provider opens a pool (T1 mint, T2 pool)

1. Today: `provider-cli` or the web `/provider` → Desktop signs → overlay `submit` → `POST /offers` to the coordinator + to the chain with `publishOffer`. **Unchanged.**
2. Overlay SSE `admitted { txid }` → relay `lookup pool` → `pools` upsert, `txs` (T2), `identities` (provider first seen), `events` + a `live` packet `pool_opened`.
3. The noticeboard goes up at the same time in every open Town. The provider's nonce (the revenue keyID) is written encrypted to `user_records` (B6, B12).
4. If G4 is on: "pool opened" lands in the `inbox` of those who left an intent for this product.

### 9.2 Pledge (T3)

1. Agent: `buildPledge` → overlay `submit`. Person: web "Join" → Desktop → overlay `submit`. **Unchanged.**
2. Right before `submit`, the web opens the `txs` row as `stage: created` (G2); the relay makes it `admitted` when it sees `admitted`, and `mined` when it is mined per Arcade. No optimistic fake-source event needed (B7).
3. Relay: `pledges` upsert, `pools.pledged_credits`, `txs` (T3), `identities` (first seen). Agent SSE `agent_decision` → `agent_decisions` and a `live` packet (bubbles).
4. The person's pledge instructions go encrypted into `user_records` (B6). Cancelling from another device becomes possible.

### 9.3 Lock-in, signing round, settlement (T5): the critical path

1. When the pledges reach the target, the coordinator builds the plan and sends `sign_request` to the **proven WS sessions**. Each signer verifies the plan itself (`verifySettlementPlan` + `verifyLineage`). **Unchanged.** Supabase is not on this path, so an error in Supabase cannot affect what is signed.
2. The relay is connected to the coordinator as a watcher (unsigned `hello`): it receives `pool_update`, `settled`, `round_failed`, `pool_failed`; for round progress, during lock-in it reads the `coordinator { round, signed, total, blacklist }` field of `GET /pools/:id` about once a second (or a `round_progress` broadcast to watchers is added to the coordinator: selective B). → `rounds` upsert + a `live` packet.
3. For each participant in the plan, the relay writes `sign_pending { poolId, round, deadline }` to the `inbox`. If the tab is on another page, the web redirects to the SignCenter; with web push on, a browser notification (Database Webhook → Edge Function `push`).
   - Limit: `sign_request` goes only to a proven session connected at that moment (the coordinator counts an unconnected participant as "offline"). A person whose tab is closed and who returns through a notification will most likely miss the current round; at best they make the next round (≤ 3 rounds). The real solution for an offline person is the lighthouse pledge (A-P5).
4. `settled { txid }` → relay: `pools.status = settled`, `settled_txid`, `GET /pools/:id/audit` → `pools.audit` (`consistent` expected), `txs` (T5), `provider_stats` refreshed, a `live` packet → the cart scene in every Town.
5. `round_failed` → `rounds` outcome + blacklist reasons; a note in the missing signers' `inbox`.

### 9.4 Credits: redeem and 402 (T6, T7)

1. Directly to provider-api with `AuthFetch`: redeem, job, return. **Unchanged.** The prepaid balance stays at provider-api (the T-6 limit), not mirrored.
2. Agent SSE `agent_payment`, `agent_job` → relay → `events`, `txs` (T7), `agents.savings_sats`.
3. Optional: if a `/v1/events` SSE is added to provider-api (low priority in plan §3.10), job states are mirrored too; the web's 800 ms job poll goes away.

### 9.5 Market (T8)

1. The seller `reserveListing` + `signListing` → `POST /listings` to the coordinator (the authoritative book is the coordinator + the chain). **Unchanged.**
2. The relay watches `GET /listings` (and the overlay's `list` admissions) → `listings` upsert. The web's 10 s poll goes away; the `listing_book` view gives them ordered by price per credit.
3. The buyer sees the listings in Supabase, but before `buildSweep` it fetches the listing and the BEEF again from the coordinator/overlay; `buildSweep` already verifies the lineage from the chain (red line 2).
4. When the sweep is mined, the relay produces the `listing_filled` event **with the real txid** (today the web guesses it from the listing disappearing, `txid: ''`). "Sold" in the seller's `inbox`.

### 9.6 Mandate Vault and guard (T9, T10)

1. Owner: guard `PUT /vaults` (BRC-103) → Desktop funds (T9) → policy `PUT`. **Unchanged.**
2. Overlay `vault` admission → relay `vaults` upsert, `txs` (T9). The web's sha256 + `vaultCredits` poll per vault goes away.
3. Guard SSE `cosign_approved`/`cosign_denied` → `guard_decisions`, a `live` packet (the Town watchman) and **the owner's `inbox`**: "this request of your agent was refused: …". A prompt-injection attempt reaches the owner at once.
4. The vault record (script, record) encrypted in the owner's `user_records`; withdrawing alone from another browser works (B6).
5. Today owner-cli writes `data/vaults/<id>/fund-<txid>.json` after funding, and guard `adopt` reads that file on the same disk (B12). If the owner is on another machine, the file is moved by hand. With Supabase: the owner writes a signed handover document (`handoffs`, via the Edge Function `signed-write`; the content is already on chain and public), and the guard/agent side reads it and adopts it **after verifying it from the chain**. The guard's own state still stays local.

### 9.7 Coop Rail (T11)

Maker SSE → relay → `events` + a `live` packet. Low priority; no live swap yet.

### 9.8 Multiplayer Town (P7)

The free Realtime quota does not allow a position stream: 20 players × 5 Hz × (1 sender + 19 recipients) = 2,000 messages per second, the limit is 100 per second. So **a destination, not a position**, is sent:

1. The player joins the `town:main` channel and puts `{ name, color, kind }` in Presence (only on join/leave and on a name change; Presence is limited to 20 messages per second on the free plan).
2. When the avatar starts walking somewhere, a single `move { to: [x, y], t }` is published. The other clients compute and walk the same A* path (already present in the Town for NPCs) on the same collision map themselves. In free WASD walking the destination is updated when the direction changes or at most every 3–4 s.
3. A newly joined player gets the last positions from the Presence state (`{ name, color, kind, at: [x, y] }`, updated only when stopped).
4. Name and colour from `identities` (otherwise a deterministic colour from the identity, "Visitor #xyz" for a guest). The name in Presence is the client's statement; proven identities (with `identity_key` in the session JWT) are shown with a badge, the rest as "unverified". The risk is low because the Town is cosmetic.
5. Crowd limit: 10 players on the free plan (quota calculation in §13). Past the limit, a newcomer stays a watcher (sees the movements, cannot walk).

### 9.9 Profile and record

1. The user picks a display name and colour; the web makes the profile canonical JSON and has Desktop sign it (`protocolID: [1, 'agentcoop profile']`) → the Edge Function `signed-write` verifies → `identities.profile`, `profile_sig`, `verified = true`.
2. Every reader can verify the signature themselves too.
3. Server identities (`config/identities.json`), agents (`GET /agents`), services (`/healthz` identities) are seeded by the relay.

### 9.10 (Optional product) The intent ledger

1. When the agent's brain produces its weekly forecast (written to `decisions.log` today), it leaves a signed intent: `signed-write` → `intents`.
2. The provider console sees the total demand and price curve per product from the `intent_demand` view and says "open a pool for this demand" (the pool size comes pre-filled with a suggestion).
3. When the pool opens, a notification in the intent holders' `inbox`; the agents make the real pledge with their own brain + `enforcePolicy`. The intent is not binding, no money moves. pg_cron deletes expired intents.

---

## 10. The relay service

- **Place:** `apps/relay` (Node ≥ 22, tsx, `@supabase/supabase-js`). `infra/run.mjs` starts it as a third process, only if the `SUPABASE_*` variables exist. On the VPS it reads over loopback, so it does not hit the overlay's and coordinator's IP rate limits (loopback is exempt, `infra/README.md`).
- **Inputs:** `OVERLAY_URL`, `COOP_API_URL`, `GUARD_URL`, `AGENTS_URL`, `MAKER_URL`, `PROVIDER_API_URL`; `SUPABASE_URL`, `SUPABASE_SECRET_KEY` (secret; in `.env`, never committed, never logged).
- **Shared code:** the web's `events/types.ts` (`CoopEvent`, the event map) and `derive.ts` move into a shared package (`packages/events`). The relay and the web use the same projection; no drift between two separate derivations. (Needs coordination with Track E.)
- **Writes:** updates touching several tables are done atomically with one Postgres function (`rpc('apply_pool', …)`), so `pools.pledged_credits` and `pledges` never contradict each other at any moment.
- **Publishing:** after writing, the relay accumulates the changes and publishes **at most one** `live` packet per second (`{ events: [...] }`). No change, no publish. This is the basis of the quota calculation (§13).
- **Event ids:** the relay gives each event a durable, source-independent unique id (`{src}:{txid|outpoint}:{type}`); since `events.id` is the primary key, a rewrite is harmless. Server counters resetting on restart (B7) is no longer a problem.
- **Reconciliation:** every 30–60 s `GET /pools?pledges=1`, `GET /listings`, overlay `vaults` → upsert into the tables. Missed events correct themselves. Every row has `as_of_height`/`updated_at`.
- **Where it left off:** `Last-Event-ID` for the SSE sources in a `relay_cursors` table.
- **Endpoints:** only `GET /healthz` (login is in the Edge Function). If `@bsv/sdk` does not work in the Edge runtime, `POST /auth/challenge` and `/auth/prove` move here (§7).
- **Archiving and summary:** hourly `metrics_snapshots`; pg_cron cleans `events` older than 7 days and expired rows.

---

## 11. What changes on the web side

- A new transport option: `VITE_DATA_MODE=live` + `VITE_TRANSPORT=supabase|direct` (default `supabase`, `direct` on fallback). The Supabase adapter pushes the same `CoopEvent`s to the bus; the store, the Town and the consoles do not change.
- The wallet flows (`wallet/flows/live.ts`) do not change; only the optimistic events move to `txs.stage`, and `mine.ts` to the encrypted `user_records` (localStorage stays as a cache).
- `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` (public, not secret; the protection is in RLS). supabase-js is lazy-loaded. The Supabase domain (`https://<ref>.supabase.co`, `wss://<ref>.supabase.co`) is added to the CSP `connect-src`.
- Profile editing, an inbox badge, the multiplayer Town (the Phase 7 plan already exists; destination-based movement §9.8).

---

## 12. Ordered roadmap

| Phase | Content | Acceptance | Dependency |
|---|---|---|---|
| **F0** Setup | A Supabase project (Free, no card; region `eu-central-1` Frankfurt), anonymous sign-in + CAPTCHA on; `supabase/` in the repo (`config.toml`, `migrations/`, `functions/`); a local stack with the Supabase CLI (`supabase start`, Docker); the secret key into `.env`, `supabase/.temp`, `supabase/.env` into `.gitignore`; **spike:** does `@bsv/sdk` verify signatures in the Deno Edge runtime | RLS tests on the local stack run in vitest/pgTAP; the relay can write to the real project; the spike result in STATUS | — |
| **F1** Live mirror | `packages/events` (types + derive), schema migrations, `apps/relay` (SSE/WS/REST → tables, `live` packet, reconciliation, cursors), the web Supabase adapter + the `direct` fallback | Two browsers: an agent pledge shows on both in < 1 s; the Town is full on a cold start; when the relay stops the web falls back to `direct`; the mock e2e (mockchain + local Supabase) green | F0 |
| **F2** Identity + presence + multiplayer | §7 (the `bsv-auth` Edge Function), `town:main` Presence + destination-based Broadcast (P7), name labels, channel authorisation, player limit | Two visitors on two machines see each other (< 300 ms LAN); a person without an identity cannot get the proven badge; < 30 Realtime messages per second with 10 players | F1 |
| **F3** Record | `identities` (signed profile, `signed-write`), `services` (signed endpoints → runtime configuration), `provider_stats`, `txs` (the README/STATUS table from here), `metrics_snapshots`, `agent_decisions`, `guard_decisions`, views | Chart history survives a page reload; the explorer shows the mainnet txs from the table; a profile with a fake signature is refused | F1 (F2 for the profile) |
| **F4** Personal ledger + inbox | The `txs.stage` life cycle, `user_records` (wallet.encrypt; web + provider-cli + participant-cli), `handoffs`, `inbox` + Postgres Changes (+ optional web push) | Vault withdrawal and revenue sync from another browser work; the revenue of a pool opened in the CLI can be swept from the web; the owner sees a guard refusal as a notification; no B7 deduplication collision | F2 |
| **F5** Scheduled jobs + protection | pg_cron (cleanup, `provider_stats` refresh), Realtime quota monitoring, fallback to a PostgREST poll if needed | A quota warning in STATUS; the web works with a 5 s poll even when the Realtime quota is used up | F3 |
| **F6** (optional) Intent ledger | G4: `intents`, the `intent_demand` view, a provider demand panel, a pool-opened notification | An agent leaves an intent, the provider opens a pool with the suggested size, the agent pledges on the notification (mockchain) | F3, F4 |

Ownership proposal: relay + infra = B's area (VPS, Caddy, `infra/run.mjs`); the web adapter, profile, P7 = E; `packages/events` shared (moved from E's `events/`); the schema and Edge Functions to a new owner (B or a separate "F" track). Requests to the other tracks go only through STATUS.

---

## 13. Cost and limits (Free plan, no card)

| Item | Limit | Note |
|---|---|---|
| Realtime concurrent connections | **200** | Better than Firebase Spark's 100 |
| Realtime message rate | **100 per second** | Connections are cut when exceeded; supabase-js reconnects when the rate drops |
| Realtime message quota | **2 million per month, organisation-wide** | Each recipient counts separately: one broadcast to 4 listeners = 5 messages; one table change to 5 listeners = 5 messages |
| Presence | 20 messages per second, 10 keys per object | Presence only on join/leave |
| Channels | 100 channels per connection, 100 joins per second | Not a problem |
| Postgres | 500 MB | The archive is small; `events` limited to 7 days |
| Storage | 1 GB | Replay files |
| Auth | 50,000 monthly active users | Anonymous users count too; CAPTCHA is a must |
| Edge Functions | 150 s wall clock, 2 s CPU per request, 256 MB | No long subscription; signature verification fits easily |
| Egress | sources conflict (5 GB or less) | Verify in the panel during F0 |
| Project | 2 active free projects per account; **a project inactive for 7 days is paused** | It stays active as long as the relay keeps writing; check before the demo |

**Quota calculation (demo):**
- Live mirror: the relay at most one packet per second; 30 watchers → ≤ 31 messages per second in busy minutes, ~0 when quiet.
- Town: 10 players, one destination every 4 s each → 2.5 broadcasts per second × (1 + 9) = 25 messages.
- Total ~56 messages/s, under the limit. At this rate, under continuous use 2 million messages last ~10 hours: enough for the demo day, not enough for a long-running public deployment.
- Measures: a hidden tab closes the subscription, the Town's multiplayer mode is on only in avatar mode, and if the quota runs out the web pulls a snapshot from PostgREST every 5 s instead of `live` (API requests do not count against the Realtime quota).

Verify the exact numbers in F0 against the official pricing and limits pages.

---

## 14. Risks

| Risk | Mitigation |
|---|---|
| The jury says "they added a central database" | The red lines are explicit in the README: Supabase is an optional display layer, everything can be verified from the chain, the protocol works without it (a relay-off demo); `custodiedSats: 0` stays the same |
| The mirror is stale or wrong | Reconciliation loop, `as_of_height`, a refresh before signing and sweeping; data in Supabase never makes a signing decision |
| The secret key leaks or RLS is wrong | No value; profiles and service records are signed; personal records are encrypted; the secret key only in the relay `.env` and the Edge Function secrets; RLS tests on the local stack in CI; RLS on for every table (default deny) |
| The service record is poisoned (the web is pointed at a fake coordinator) | The record is signed with the service identity; the web matches it with the `/healthz` identity. A fake coordinator still cannot steal (T-1), at most it disrupts the round |
| The Realtime quota runs out | ≤ 1 batched packet per second, a destination-based Town, no subscription in a hidden tab, a PostgREST poll fallback |
| `@bsv/sdk` does not work in Deno | The login and signed-write endpoints are opened in the relay (Node) |
| The free project pauses after 7 days | The relay's continuous writes; a panel check before the demo |
| The anonymous session is abused | CAPTCHA, Realtime channel authorisation, the player limit |
| The two transports (supabase/direct) diverge | A shared `packages/events`; the same e2e scenario in both modes |
| Time (submission 31.10) | Only F1 + F2; the rest after the submission |

---

## 15. Open decisions

1. **Time and scope:** a slice that must make the submission (today) (F1 + F2), or the full roadmap after the submission?
2. **What you mean by "temporary ledger":** the G1 live mirror, the G2 tx life cycle, a new product feature such as the G4 non-binding intent ledger, or all of them?
3. **Ownership:** the relay with B and the web with E, or a separate track for the schema + Edge Functions + relay?
4. **Town scale:** is a 10-player limit on the free plan accepted, or is moving to Pro on the demo day considered (needs a card)?
5. **Inbox transport:** Supabase only, or also written to the BSV-native MessageBox (a plus for the jury)?

---

### Sources (limits)

- [Realtime Limits](https://supabase.com/docs/guides/realtime/limits)
- [Realtime Quotas](https://supabase.com/docs/guides/realtime/quotas)
- [Manage Realtime Messages usage](https://supabase.com/docs/guides/platform/manage-your-usage/realtime-messages)
- [Edge Functions limits](https://supabase.com/docs/guides/functions/limits)
- [JWT Claims Reference](https://supabase.com/docs/guides/auth/jwt-fields)
- [Supabase Free Plan 2026 (costbench)](https://costbench.com/software/database-as-service/supabase/free-plan/)
- [Supabase free tier limits 2026 (automationatlas)](https://automationatlas.io/answers/supabase-free-tier-limits-2026/)
