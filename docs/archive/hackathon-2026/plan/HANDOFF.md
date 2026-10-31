# HANDOFF — the 31.10 session: Supabase live layer + audit readiness

> **For a new session:** read this file first, then `plan/STATUS.md` (the CLAUDE.md rule). The tracking list of open work: **[`plan/BACKLOG.md`](BACKLOG.md)** (BL-01…). This file is the record of what a single Claude session did on the night of 31.10 and of the information that is **in no other document**. Whoever looks at security goes straight to **§2**.
>
> Written: 31.10.2026 ~08:00, updated after the F-10 fix and validation 4. The latest commits are on `main`.

## 0. Contents

1. What was done, where (summary)
2. **Security: what was done, what is left, how to repeat it**
3. The audit prize (TUM Blockchain Club × Adevar Labs)
4. The Supabase live layer: setup, keys, decisions, postponed items
5. Facts about the project clarified in conversation
6. Setting up on a new computer
7. Topics awaiting a decision
8. This session's rules and preferences

---

## 1. What was done, where

| Work | Document / code | Commits |
|---|---|---|
| Supabase flow report (moved to Supabase because Firebase wanted a card) | `plan/SUPABASE-FLOW.md` | — |
| The Supabase demo MVP plan and implementation (relay, web transport, multiplayer Town) | `plan/phases/SUPABASE-MVP.md`, `apps/relay/`, `apps/web/src/events/adapters/supabase*.ts`, `apps/web/src/api/supabase*.ts`, `apps/web/src/town/{peers,multiplayer}.ts`, `supabase/` | `d942788` and before |
| An independent review of the Supabase layer: 1 critical + 9 important fixes | — | `cffaaee`, `404a164`, `78bfb0e`, `cc02f38` |
| The audit readiness package | `plan/phases/AUDIT-PRIZE.md` (plan), `docs/AUDIT-READINESS.md`, `docs/THREAT-MODEL.md`, `docs/ROADMAP.md`, `SECURITY.md`, `LICENSE`, `.github/workflows/ci.yml`, `scripts/check-docs.mjs` | `86bc2fc` … `ad04620` |
| New tests (tests only, product code unchanged) | `apps/maker/test/htlc.boundaries.evm.test.ts`, `test/provider.return-vault.test.ts` | `360dde7`, `27c0eab` |
| A rehearsal script (mock chain + local Supabase + 2 browsers) | `scripts/rehearsal-supabase.ts` | `6539b56` |
| **The F-10 fix + validation 4 (mainnet)**: the repo owner's session ("session B"), in parallel with this one | `apps/provider-api/src/redeem.ts`, `test/provider.return-vault.test.ts` (now `it`, 3/3), documents | `740f893` |

Test status (31.10): root `npm test` 86 files passed / 4 skipped (CI and local the same); web 101 tests; Playwright e2e 8/8; typecheck clean; `npm run check:docs` 198 paths, 15 links, 83 test names.

---

## 2. Security: what was done, what is left

### 2.1 Done

- **The audit package** `docs/AUDIT-READINESS.md`:
  - value flow and trust boundaries;
  - the priority scope (with file paths and line counts);
  - 16 invariants (each with the code that enforces it and its test);
  - our own findings F-1…F-11;
  - the dependency and secret scan, mainnet evidence, questions for the auditor.
- **`docs/THREAT-MODEL.md`:**
  - The Mainnet column filled with txids (✅ the control ran on mainnet / ◐ the flow ran, the attack path only on the mock chain / ☐).
  - **T-10 reopened (F-10)**; F-10 was later fixed (`740f893`), T-10 closed again.
  - New T-22 (the live mirror, Supabase), T-23 (Coop Rail timing and cross-chain assumptions).
- **`SECURITY.md`:** the reporting path, scope, testing rules, key policy. `LICENSE`: MIT.
- **CI** `.github/workflows/ci.yml`:
  - steps: typecheck (root + web), `npm test`, `npm run check:docs`, `npm audit --omit=dev` (report only);
  - **references no secret**, `permissions: contents: read`; actions v7 (Node 24).
- **`scripts/check-docs.mjs`** (`npm run check:docs`): checks every file path, `file:line` reference, relative link and every test name in the form `` `x.test.ts` › "name" `` in the security documents.
  - **Deliberately not part of** `npm test`: so that another track renaming a test does not turn its suite red. A separate step in CI.
  - Its limits: it searches test names as substrings; it does not notice skipped (`skipIf`) tests.
- **HTLC boundary tests** (`apps/maker/test/htlc.boundaries.evm.test.ts`, 6 tests). Checked with mutation testing: they caught 5 of 5 broken copies of the contract (method in §2.4).
- **F-10 found, reproduced and fixed.** This session reproduced it with an `it.fails` test (`27c0eab`); the repo owner's session fixed it (`740f893`):
  - `returnCredits` reads the vault before the debit; if the return fails it also writes the vault mapping back.
  - With a balance from the first vault, a redeem from a second vault gets `409 ERR_OTHER_VAULT`.
  - The test is now a normal `it` (3/3). THREAT-MODEL T-10, AUDIT F-10/I-9, README and ROADMAP current.
  - Residual risk (AUDIT F-10): a vault record needs no consent from the agent it names, but only that agent (the authenticated caller) can redeem from it.
- **`apps/web/src/proof/mainnet.ts`:** 7 wrong labels fixed. The S1 and agent txids are "server wallet", not "BSV Desktop"; `5b5e452c…` is the vault funding and was done from BSV Desktop.
- **Two independent reviews were done** (neither is an external audit; separate reviewer sessions):
  - The Supabase layer: 1 critical finding (the pledge's fee script was read from the mirror), fixed.
  - The audit documents: 2 critical, 5 important and 18 minor findings; all worked into the documents. Of those needing code, F-10 was fixed (`740f893`); F-11 was fixed too (31.10, `OP_SIZE <32>`, `test/rail.htlc-preimage.test.ts`).

### 2.2 Left (in priority order)

| # | Item | Why it matters | Who / how |
|---|---|---|---|
| 1 | ~~F-10~~ **fixed** (`740f893`, §2.1) | — | — |
| 2 | ✅ **deleted (31.10, the repo owner's session):** no `WALLET_*` secret left (`gh secret list`). The old description: **Delete the `WALLET_*` GitHub Actions secrets in the public repo** (mainnet wallet private keys, uploaded by someone before this session) | The repo is PUBLIC (`kagancoplu/ProfessionarLARPERs`). Only a workflow that references a secret can read it; fork PRs get no secrets. But anyone with push rights can write a workflow that reads it. No workflow uses them | Needs admin rights (the repo owner). The keys are in `.env`; deleting them does not destroy them |
| 3 | **Enable GitHub "Private vulnerability reporting"** | `SECURITY.md` points to it as the main channel; it is off now (`{"enabled":false}`). This session's account (`kheif`) is not an admin, `PUT` returned 404 | The repo owner: Settings → Security → Private vulnerability reporting. Once on, simplify the "when it is available" wording in `SECURITY.md` |
| 4 | ✅ **F-11 fixed (31.10)**: the claim branch starts with `OP_SIZE <32> OP_EQUALVERIFY`; `test/rail.htlc-preimage.test.ts`. The old description: (before Coop Rail goes live, High). The BSV HTLC claim branch does not check the preimage length (`packages/core/src/scripts/htlc.ts:22`), the Base contract accepts only `bytes32`, the agent picks the secret (`apps/maker/src/swap.ts:78`). If the agent picks a long secret it takes the BSV; the maker can never take the USDC, and the agent refunds the USDC after the timeout | The Rail is not live, a capped PoC; no risk now | The fix: `OP_SIZE <32> OP_EQUALVERIFY` before `OP_SHA256`. Track D/A. `docs/ROADMAP.md` gate 3 |
| 5 | ✅ **in code (31.10):** F-1 (the received balance measured), F-2 (`_call` safe transfer), F-4 (the refund watchdog `apps/maker/src/watchdog.ts`, `minBaseTimeLeftS`, the agent's claim window); details in AUDIT §6. Left: the Base Sepolia deploy, a live run. The old description: **The rest of Coop Rail:** F-1 (cross-lock leakage with fee-taking tokens), F-2 (tokens that return no `bool`, the USDC blacklist), F-4 (height mixed with seconds; no watchdog that broadcasts the refund automatically, `apps/maker/src/swap-demo.ts` saves the refund for a manual broadcast) | Before the Rail goes live | `docs/AUDIT-READINESS.md` §6, `docs/ROADMAP.md` gate 3 |
| 6 | **Mainnet validations 3 and 6**, T8 (market sweep), T11/T11b (Rail) on mainnet. **Validation 4 passed** (31.10 07:32, [2f72e8b4…](https://whatsonchain.com/tx/2f72e8b489bcf3ebae7ce7b4ce0d5bc97202eade0272e59e18135d3dd851c146)). Finding: Arcade refused even at tip = nLockTime, it is accepted in the next block; the Rail refund must be sent at least one block after the lock (T-23) | T-15 and T-23 depend on these | Needs sats and BSV Desktop (STATUS "Validation tests") |
| 7 | ✅ **fixed (31.10):** `publicDetail` + `acceptMove`, AUDIT F-8. The old description: **F-8:** `live_health.detail` exposes service error text (internal URLs included) to anonymous readers; Town `move` broadcasts are not validated | Information disclosure, no money | `apps/relay/src/sources.ts:56` (probe), `apps/web/src/town/multiplayer.ts:76` |
| 8 | ✅ **0 in production (31.10):** root `zod` 4.6.7, `overrides.tmp` 0.2.7; `--audit-level=high` in CI. The 30 warnings under `jimp` are dev, accepted (AUDIT §7). The old description: **Dependency warnings:** 3 high in production: `zod` < 4.6.6 (GHSA-mrhx-c7xc-m3w5; through `@anthropic-ai/sdk` and `viem`), `tmp` (GHSA-7c78-jf6q-g5cm; through `solc`, compile time only). 29 more high in the full tree, all `jimp` → `free-tex-packer-core` (the web sprite tool, a devDependency) | Upgrading versions can change behaviour; not touched in this session | No deep triage done |
| 9 | ✅ **done (31.10):** `npm run mutate`, 49/49 (verify.ts 33, script templates 7, HTLC 9), in CI; AUDIT §4. The old description: **Mutation testing was done only for the HTLC.** Not for `packages/core/src/pool/verify.ts` and the script templates. The "change check" in I-2 has no dedicated tampering test (`verify.ts:102-104` checks it but nothing tests it) | An auditor will ask | `docs/ROADMAP.md` gate 6 |
| 10 | ✅ **run (31.10):** Slither 0.11.6, 6 results triaged, `--fail-high` in CI (AUDIT §7). The old description: **Slither / static analysis not run** (it was not installed on the machine) | The standard signal for Solidity | `python3 -m pip install slither-analyzer solc-select && solc-select install 0.8.37 && solc-select use 0.8.37 && slither contracts/base-htlc/HTLC.sol` |
| 11 | ✅ **closed (31.10):** `FileReplayStore` (`data/provider/replay/`), THREAT-MODEL T-17. The old description: **T-17:** the 402 replay store is not shared (`apps/provider-api/src/server.ts` passes no `replayStore`; the middleware uses its in-process default) | A replay is possible if more than one provider process runs | No problem with one process; before scaling |
| 12 | ✅ **in CI (31.10, `b9c2202` green):** the `supabase-rls` job, a new test "T-22: on every table anon can neither insert, update nor delete". The old description: `apps/relay/test/schema.local.test.ts` (RLS: anon cannot write) does not run in CI; it runs only with a local Supabase | T-22's RLS evidence is not in CI | A manual smoke test was done on the hosted project: an anon insert was refused |
| 13 | **Bounded risks accepted on purpose** (documented, no code needed): T-5 (the provider may not serve), T-6 (≤ 20 credits off-chain balance, per credit token), T-12 (agent + guard compromised together, up to the vault balance), T-13 (BRC-100 hash signing), F-5 (the guard counts the cap at signing time), F-9 (the coordinator's selection is detected, not prevented) | — | — |

### 2.3 Observations (not in any document)

- `WALLET_COORDINATOR_KEY` is in `.env.example` and 5,000 sat were sent to the coordinator, but **the coordinator service loads no key** (no wallet in `apps/coordinator/src`). The plan (`plan/00-MASTER-PLAN.md` §6.1) says "identity + broadcast only". The documents' claim "the coordinator has no key" is right; the slot is unused.
- The provider trusts the overlay for redeem check 4 (who sent the credits) and for vault records (`redeem.ts:145-147`, `:196-198`). The participants and the guard do not. Worked into AUDIT §2 and §5.
- The mirror feeds the provider's revenue sweep (`syncRevenue`/`sweepRevenue`, `apps/web/src/wallet/flows/live.ts:281-312`) its pool list. Wrong data makes the sweep fail, it does not send money elsewhere.
- ~~The `pledge_added` reducer adds once more the credits the coordinator already counted~~ **fixed (31.10, BL-31):** the reducer now takes the larger of the coordinator's count and the pledges still standing in the list, subtracts once on a cancellation; both orders tested (`apps/web/test/reducers.test.ts`).

### 2.4 How to repeat the checks

```bash
# the evidence in the documents
npm run check:docs
node scripts/check-docs.mjs README.md          # to check the README too

# keys leaked into git history (prints no real value; only counts)
git log --all -p --no-color > /tmp/h.patch
for p in 'sb_secret_[A-Za-z0-9_-]{10,}' '(KEY|SECRET)[A-Z_]*[=:] *["'"'"']?[0-9a-f]{64}' 'BEGIN [A-Z ]*PRIVATE KEY' 'eyJ[A-Za-z0-9_-]{20,}\.eyJ[A-Za-z0-9_-]{20,}'; do
  printf '%s: ' "$p"; /usr/bin/grep -E '^\+' /tmp/h.patch | /usr/bin/grep -cE "$p"; done
# expected: only 1 sb_secret_ (the fake value in apps/relay/test/config.test.ts). On macOS `grep` may be aliased to ugrep: use /usr/bin/grep.

# dependencies
npm audit --omit=dev     # runtime
npm audit                # full tree

# HTLC mutation test: break the contract temporarily, recompile, run the test, RESTORE
cp contracts/base-htlc/HTLC.sol /tmp/HTLC.sol.bak && cp contracts/base-htlc/artifacts.json /tmp/artifacts.json.bak
perl -0pi -e 's/block\.timestamp < l\.timeout/block.timestamp <= l.timeout/' contracts/base-htlc/HTLC.sol
npm run compile -w @agentcoop/maker            # regenerates artifacts.json
npx vitest run apps/maker/test/htlc.boundaries.evm.test.ts   # at least one test must be RED
cp /tmp/HTLC.sol.bak contracts/base-htlc/HTLC.sol && cp /tmp/artifacts.json.bak contracts/base-htlc/artifacts.json
git diff --quiet contracts/ && echo restored
# the 5 mutants tried: claim `<`→`<=`, refund `>=`→`>`, no "lock exists" check, claim pays the caller, no "zero amount" check
```

---

## 3. The audit prize (from the Devfolio page)

- **Organiser:** TUM Blockchain Club (tum-blockchain.com). **Sponsor:** Adevar Labs (adevarlabs.com). A total of **$16,000 in audit credits**; not money, a security audit service. Valid for 1 year from the award.
  - 1st: $10,000, a full audit;
  - 2nd: $4,000, "Pre-Audit Core";
  - 3rd: $2,000, "Pre-Audit Express".
- **Selection:** **every project submitted to Devfolio is evaluated automatically**; it is not chosen separately and does not use up one of the 3 partner tracks. The TUM Blockchain Club judges pick "the three most serious projects of the hackathon: the ones that most deserve a security audit to keep building".
- **Our strategy:** a project that looks audit-ready, with verifiable evidence (CI + `check:docs`), and honest about its gaps. In the pitch, put forward `docs/AUDIT-READINESS.md`, `docs/THREAT-MODEL.md` and the "How we would use audit credits" section of `docs/ROADMAP.md`. Having found and written up F-10 ourselves is a plus too.
- Prerequisite: the project must be **submitted to Devfolio**.

---

## 4. The Supabase live layer

### 4.1 Architecture (short)

- **Rule:** Supabase is only **a display layer**. It is not on the signing or payment path; the protocol works without it.
  - The chain and the overlay are the source of truth.
  - Security-critical stores (the guard's ledger, the provider's balances, the replay stores) stay local.
- **Relay** (`apps/relay`): one Node process.
  - Writes the SSE/WS/REST streams of the overlay, coordinator, guard, agents and maker into Postgres tables: `live_pools`, `live_pledges`, `live_listings`, `live_vaults`, `live_agents`, `live_health`, `coop_events`.
  - Writes at most one `live_ticks` row a second, plus a heartbeat every 15 s. Ticks are deleted after 10 min.
  - `npm run infra` also starts the relay if `SUPABASE_URL` and `SUPABASE_SECRET_KEY` are in `.env` (`infra/run.mjs`).
- **Web:** a snapshot first, then ticks through Postgres Changes (through the existing derive/hydrate path).
  - Falls back to the services directly: if the snapshot fails or takes longer than 5 s, or no tick arrives for 45 s. A warning toast: "Live mirror unavailable: reading the services directly".
  - The coordinator WS and the wallet flows are direct in both modes.
  - Pledge terms are **always read from the coordinator** (`cffaaee`).
- **The multiplayer Town:** `?avatar=1`, channel `town:main` (Presence + Broadcast).
  - Sends destinations instead of positions (at most every 1.5 s, ≥ 4 px).
  - At most 8 players; decided at the first presence sync or after a 1.5 s timeout.
  - Presence key `${identity|guest}:${tabId}`.
- **RLS:** all tables `select` only for `anon`/`authenticated`. Writes only with the secret key in the relay. Migration: `supabase/migrations/20261031120000_live_mirror.sql`.

### 4.2 Project and keys (the values are NOT here, never write them)

- **Hosted project:** ref `cwnqclojrnyixetjqqsv`, region eu-west-1 (not Frankfurt as in the plan; the user opened it). The migration applied (`supabase link` + `supabase db push`).
- **Where the values are:**
  - This machine's root `.env`: `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`.
  - GitHub: `SUPABASE_SECRET_KEY` as an Actions **secret** (cannot be read back; no workflow uses it). `SUPABASE_URL`, `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` as repo **variables** (readable: `gh variable list`).
- **Getting the secret on a new machine:**
  - `supabase login`, then `supabase projects api-keys --project-ref cwnqclojrnyixetjqqsv --reveal -o json`. **Without `--reveal` the secret comes back masked;** the relay then says "Invalid API key". This error happened in this session.
  - Or the Supabase dashboard → Project Settings → API keys.
- **Why the web uses the old anon (JWT) key, not the new `sb_publishable_`:** on the local stack no changes reached a Postgres Changes subscriber with the `sb_publishable_` key, they did with the anon JWT. That is also why the variable is named `VITE_SUPABASE_ANON_KEY`. If Supabase removes the old keys, only the variable changes. The publishable key was never tried on the hosted project.
- **`.env` note:** npm output lines (`> …`) on lines 64–65 of the root `.env` broke the Supabase CLI's reading of the file. They were commented out as `# > …`; the keys were not touched. If the same problem appears when copying `.env` to a new machine, do the same.

### 4.3 Local stack and tests

```bash
supabase start                     # Docker; may still be running on this machine: `supabase stop`
supabase db reset                  # applies the migrations locally
eval "$(supabase status -o env | sed -E 's/^([A-Z_]+)=/export SB_\1=/')"
SUPABASE_LOCAL_URL=$SB_API_URL SUPABASE_LOCAL_ANON_KEY=$SB_ANON_KEY SUPABASE_LOCAL_SECRET_KEY=$SB_SECRET_KEY npx vitest run apps/relay
# the *.local.test.ts files are skipped without these variables (in CI too)
npx tsx --import @agentcoop/core/register-sdk scripts/rehearsal-supabase.ts   # an end-to-end rehearsal, LOCAL stack only (deletes the tables; refuses a remote URL)
```

Rehearsal result (31.10 07:55, with the script in the repo):
- Both browsers saw the pool and the 2 pledges: 28 credits, the same as the coordinator.
- After a reload the state is right, no repeated toast.
- **Observation:** the feed of a reloaded page has no `pool_opened` and `pledge_added` rows; the state is right, only the feed is incomplete. These are events derived on the client and not written to the mirror's history.

**Free plan limits:**
- Realtime: 200 concurrent connections, 100 messages/s, 2M messages a month (organisation-wide, **each recipient counted separately**).
- Edge Function: 150 s.
- PostgREST: `max_rows` 1000 per request (which is why the snapshot is read in pages).

### 4.4 Small items postponed from the Supabase review (31.10: all closed or moved to BL-20, except #16)

1. The pool order in the snapshot is by key; with several open pools the board can differ from browser to browser. ✅ (31.10, BL-34)
2. A flush holding only past events sends an empty tick and uses quota. ✅ (31.10, BL-34)
3. `hello_ack` and the `pool_update` bursts after every hello are written to history (noise). ✅ (31.10, BL-34)
4. No protection against a missing or truncated tick payload. ✅ (31.10, BL-34)
5. A refresh arriving during a flush publishes unchanged data once more. ✅ (31.10, BL-34)
6. Concurrent refreshes are not queued; stale data can be staged for a moment. ✅ (31.10, BL-34)
7. The pending event list grows without bound during a Supabase outage. ✅ (31.10, BL-34)
8. The relay's SSE connection has no idle timeout; the coordinator watcher's `close()` does not clear the reconnect timer. ✅ (31.10, BL-34)
9. "Duplicate tab" copies the tab id (sessionStorage); two tabs look like the same player. ✅ (31.10, BL-34)
10. Town `move` messages are not validated (is the sender in presence, are the coordinates numbers) → F-8. ✅ (31.10, F-8)
11. Switching to direct mode on a channel error takes 45 s; hidden tabs stay subscribed and use quota. ✅ (31.10, BL-34)
12. `live_health.detail` lets anyone read internal service addresses → F-8. ✅ (31.10, F-8)
13. The `updated_at` column does not change on updates. ✅ (31.10, BL-34)
14. On fallback there is only a toast, no persistent transport indicator. ✅ (31.10, BL-34)
15. `SUPABASE_SECRET_KEY` sits in GitHub but no workflow uses it. → BL-20 (the repo owner's decision)
16. The publishable key was not tried on the hosted project. (open: to be tried by hand on the hosted project)
17. While a flush runs, `stop()`'s final flush does nothing. ✅ (31.10, BL-34)
18. A heartbeat is sent even while ticks are flowing. ✅ (31.10, BL-34)
19. The arrow character in the `apps/web/package.json` description was re-encoded during a dependency edit. ✅ (31.10, BL-34)

### 4.5 Decisions made in the Supabase implementation (summary)

- The work was done on `main`, a push after every task (CLAUDE.md).
- `apps/web/src/proof/mainnet.ts` was missing and broke the build; it was generated from the README tx table (Task 0).
- The relay logic is in `apps/relay/src/relay.ts` and takes its dependencies from outside (for testing); `server.ts` only wires them. The sources come from one factory: `createSources`.
- The Supabase client is in a file independent of env (`apps/web/src/api/supabaseLiveClient.ts`), so it is tested against the local stack.
- Remote players do not wander by themselves (`busy=true`) and appear where they were first seen.
- `town.events.once('create', sync)` was added to the Town bridge. When the store was quiet the Town stayed empty and the avatar did not open (a race); the rehearsal caught it.
- In Task 4 the coordinator was not started with mainnet data; it could have opened a signing round and blacklisted pledges. So the rehearsal was done on the mock chain.
- **A rehearsal with the real services (mainnet) was never done.** Needed: `npm run infra`, provider, guard, agents; `npm run web` on two machines, `?avatar=1` on one.

---

## 5. Facts about the project clarified in conversation

### 5.1 Running it

| What | Command | Note |
|---|---|---|
| The easiest, for a presentation | `npm run web:mock` → http://localhost:5173 | No services, wallet or sats needed. A ~35 s scenario loop; the transactions are fake |
| Recording | `?replay=mock-demo` | `apps/web/public/replays/mock-demo.jsonl`; no real mainnet recording (`/_debug` → "record a replay") |
| Real (mainnet) | `npm run infra` → `npm run agents` → `npm run web` | Spends real sats. A human pledge needs BSV Desktop. With `infra` off the web panels stay empty |
| Multiplayer | `?avatar=1` | Only with the Supabase transport |

### 5.2 Real and simulated

- **Real:** payments, credits (BSV-21) and settlement. T1–T7, T5v, T5-L, T9, T10 are on mainnet.
- **Simulated:** the GPU and proxy work (`apps/provider-api/src/runner.ts`; a fake log and result hash).
- **Credit tracking:**
  - A credit is a BSV-21 token in the wallet; the overlay verifies it. The types in the code have no expiry field.
  - The `/me` page shows two numbers: "credits in my wallet" and "prepaid minutes at the provider" (refreshed every 4 s).
  - Unused credits can be taken back as tokens with `/v1/credits/return` or sold on the market.
- **Access to the service:**
  - The identity is the wallet key; every request is mutually signed with BRC-103. No API key.
  - `POST /v1/jobs` starts a job, `GET /v1/jobs/:id` fetches its status; only the paying identity sees a job.
- **The missing "My orders":**
  - The provider has no "list my jobs" endpoint.
  - The job on `/me` lives only in React state; it is lost when the page reloads.
  - Suggested (a `GET /v1/jobs` on the provider + a web screen, about 1–2 hours), the user said "we can do it", **not started**.

### 5.3 What is left open against the `FINAL-IDEA.md` goals (other than tests, scenarios and integration)

- **Mandatory submission requirements:**
  - a live demo or a 2–3 min video (§1.1 S2), **not ready**;
  - a public URL (S4);
  - the Devfolio submission.
- **Missing on mainnet:** T8 market sweep, T11/T11b Coop Rail (Base Sepolia not deployed), validations 3/4/6.
- **Claimed in the pitch but not done:**
  - a simulated GPU was used instead of SmartRoute (a real provider); this is the team's scope decision;
  - the LLM agent brain was not tried live (there was no Anthropic key; the default is `rules`).
- **The K3 layer:** not done (MCP server, OrdLock, period credits, organizer agent, reverse-direction Rail). Lighthouse and vault-locked credits were done.

### 5.4 A stale note in STATUS

The Track E section lists `POST /pledges/lighthouse` as "open". The endpoint exists (`apps/coordinator/src/api.ts:90`) and a lighthouse settlement was done on mainnet (T5-L `83d339b8…`). Track E should update its own row.

---

## 6. Setting up on a new computer

1. Node ≥ 22 (24 recommended). `npx npm@11 install`: npm 10.9 cannot install this workspace.
2. **Move the root `.env` by hand** (it is not in git, and must not be). Needed:
   - `WALLET_*_KEY`, `OVERLAY_PRIVATE_KEY`, `BASE_*` if needed, `ANTHROPIC_API_KEY`;
   - the Supabase variables (§4.2);
   - `NETWORK=main`, `VITE_NETWORK=main`, `VITE_DATA_MODE=live`.
   - Do not paste keys into chats, issues or commits.
3. The Supabase CLI (2.122 in this session) + Docker (for the local stack), `gh` (`gh auth login`).
4. `npx playwright install chromium` (for e2e and the rehearsal).
5. Check:
   - `npm run typecheck && npm test && npm run check:docs`;
   - for the web, `npm run web:test`;
   - for e2e, `npm -w apps/web run test:e2e`.

---

## 7. Topics awaiting a decision

- ~~Who will fix F-10?~~ The repo owner's session fixed it (`740f893`).
- The "My orders" screen (§5.2): the user was positive, not started.
- The video / live demo plan and a rehearsal with the real services: human work.
- Deleting the `WALLET_*` secrets and private vulnerability reporting: the repo owner (admin).

## 8. This session's rules and preferences

- The user writes in Turkish; the repo documents are in English (`docs/`, README), the plan and STATUS in Turkish.
- **The user's explicit rule (31.10 06:40):** "do not break the main project's code or change its behaviour". In the audit work only documents, tests, scripts and CI were added. The holes found were documented, not fixed.
- CLAUDE.md:
  - `git pull --rebase --autostash` and STATUS after every message;
  - a pull before committing;
  - files added by name;
  - `.env`, keys and `data/` never committed;
  - push to `main`.
- The local Supabase stack (Docker) may have been left running on this machine: `supabase stop`.
