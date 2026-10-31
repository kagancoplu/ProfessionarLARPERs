# Audit prize (TUM Blockchain Club × Adevar Labs) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** The judges pick "the three most serious projects that most deserve a security audit to keep building"; present AgentCoop as an audit-ready project with verifiable evidence and honest about its gaps.

**Architecture:** Only documents, tests, a check script and CI are added. The product code's behaviour does not change (user rule, 31.10). Holes found are documented, not fixed; fixing is the team's decision.

**Tech Stack:** Markdown, vitest (the existing `@ethereumjs/evm` test setup), a Node script, GitHub Actions.

**Status (31.10 08:00):** done; CI green. The final review's 2 critical + 5 important + 18 minor findings were worked into the documents; F-10 (High) and F-11, which need code, are open. Handoff and what is left: [`plan/HANDOFF.md`](../HANDOFF.md) §2.

**Spec:** The user's request (31.10 06:40): "create a thorough plan, make the needed improvements urgently; you may take the initiative but do not break the main project's code or change its behaviour". Prize page: every project on Devfolio is evaluated automatically; the criterion is "the three most serious projects… that most deserve a security audit to keep building".

## Global Constraints

- Product code (`packages/*/src`, `apps/*/src`, `contracts/*.sol`) does not change. New files: documents, tests, `scripts/check-docs.mjs`, `.github/workflows/ci.yml`, `LICENSE`.
- Documents in English (the judges are international); the plan and STATUS in Turkish.
- Every claim has evidence: a file path, a test name or a txid. A claim without evidence is not written.
- Open risks are not hidden; they are written as "Open"/"Bounded".
- No secret value (keys, `.env` contents) goes into any file, log or commit. The CI workflow references no secret, `permissions: contents: read`.
- CLAUDE.md: `main`, `git pull --rebase --autostash` before a commit, files added by name.

## Review Focus

1. If a test name or file path in a document does not exist, a judge reads it as "fake evidence": Task 1's script checks all of them mechanically.
2. Old claims (the T-10 return path, "nothing ran on mainnet", README limitations) contradict the code and tests: Tasks 2 and 6 fix them, the final review checks again.
3. A red CI is a negative signal: Task 5 confirms a green run with `gh run`; if it is not green, no badge is added.
4. HTLC edge cases (a time exactly at the timeout, a second lock with the same parameters, the balance separation of two locks) are untested: Task 3.
5. If the "our own findings" in the audit document are wrong or exaggerated, trust is lost: every finding is tied to a code line, the final review checks.

---

### Task 0: Gathering evidence (done, 31.10 06:45)

Findings (the input of Task 4):
- Git history scan (`git log --all -p`; `sb_secret_`, 64-hex `*KEY=`, PEM, WIF, JWT patterns): no real key. The only match is the fake `sb_secret_value_that_must_not_leak` in `apps/relay/test/config.test.ts`. `.env`, `data/`, `*.sqlite` have never been committed.
- `npm audit --omit=dev`: 3 high. `zod` < 4.6.6 (GHSA-mrhx-c7xc-m3w5, memory exhaustion; through `@anthropic-ai/sdk` and `viem`), `tmp` (GHSA-7c78-jf6q-g5cm; through the `solc` compiler, compile time). 29 more high in the full tree: `jimp` → `free-tex-packer-core` (a web asset tool, development only).
- Mainnet evidence (`apps/web/src/proof/mainnet.ts`): T1, T2, T3, T4, T5, T5v, T5-L, T6, T7, T9, T10. Missing: T8, T11, T11b.
- T-10: the return now goes back to the vault (`apps/provider-api/src/redeem.ts:215`, test `test/agents.vault.mockchain.test.ts` › "its credits are locked to the vault; it redeems them with the guard; a return goes back to the vault"). THREAT-MODEL and README are stale.
- Self-review of HTLC.sol: the CEI order is right (state before the transfer). Notes: with a fee-on-transfer token the recorded `amount` > the amount received, paid from other locks of the same token; `require(transfer)` reverts with tokens that return no `bool`; a second lock with the same parameters → `lock exists`; the BSV refund is tied to block height (6 blocks), the Base timeout to seconds (≥ 3 h): the safety margin shrinks when block times drift (`apps/maker/src/rail.ts:34-35`).

### Task 1: Document evidence checker

**Files:** Create `scripts/check-docs.mjs`; Modify `package.json` (script `check:docs`)

**Interfaces:** Produces `node scripts/check-docs.mjs [files…]` → exit 0 = every reference exists; 1 = lists the missing ones. Default files: `docs/THREAT-MODEL.md`, `docs/AUDIT-READINESS.md` (if present), `SECURITY.md` (if present).

- [x] Rules: (a) a backticked path that must exist relative to the repo root (contains `/`, ends in `.ts|.sol|.md|.mjs|.json` or `/`) → does the file/directory exist; (b) in a table row, the `` `x.test.ts` › "name" `` pattern → does `name` appear in that file (several names separated by `, `); (c) for paths with a `:N` line suffix, the file has ≥ N lines.
- [x] Run against today's `docs/THREAT-MODEL.md`. Expected: either 0 or genuinely stale references (fixed in Task 2).
- [x] Not added to `npm test` (so another track renaming its test names does not break its package); a separate step in CI.
- [x] Commit: `docs: check-docs verifies paths and test names cited in security docs`

### Task 2: THREAT-MODEL refresh

**Files:** Modify `docs/THREAT-MODEL.md`

- [x] Evidence status line: what was observed on mainnet (Task 0 list, with txids).
- [x] Mainnet column: T-1 (T5 `5314ab8b…`, audit `consistent`), T-4 (T5), T-9/T-11/T-12 (T9/T10), T-10 (T5v `08a64556…`, T10 `43906050…`), T-20 (T5-L `83d339b8…`), T-17 (T7). Txids linked to WhatsOnChain.
- [x] T-10 correction: the indirect path closed (the return goes to the vault); the test name from Task 0.
- [x] New: T-22 the live mirror (Supabase) lies → the browser reads the pool terms from the coordinator (`apps/web/src/wallet/flows/live.ts`), RLS select only, the write key only in the relay; test `test/web.live-flows.mockchain.test.ts` › "a pledge pays the pool's real fee script even when the store holds tampered terms". T-23 Coop Rail timing (height ↔ seconds) and token assumptions: Open, documented.
- [x] §3 "What still needs mainnet" current (2, 5 ✓; 3 partial; 4, 6, T8, T11 waiting).
- [x] `npm run check:docs` → 0. Commit: `docs(threat-model): mainnet evidence, T-10 closed, T-22 live mirror, T-23 rail timing`

### Task 3: HTLC boundary tests (tests only)

**Files:** Create `apps/maker/test/htlc.boundaries.evm.test.ts` (the existing `MemoryEvm`, `deployHtlc`, `lockUsdc`, `claimUsdc`, `refundUsdc`, `getLock`, `usdcBalance` helpers; no `.sol` added, the artifact test is not broken)

- [x] `claim at exactly the timeout reverts; refund one second before it reverts, at it succeeds`
- [x] `a second lock with identical parameters reverts (lock exists); a different timeout makes a new id`
- [x] `zero amount and zero addresses are refused`
- [x] `two locks of the same token are isolated: claiming one leaves the other's tokens in the contract`
- [x] `a refund pays the sender and a claim pays the receiver whoever calls`
- [x] These document the existing behaviour; they are expected to pass on the first run (behaviour does not change). TDD note: to confirm the breakage each test catches, temporarily invert the expectation, see red, revert (the contract does not change).
- [x] `npx vitest run apps/maker/test/htlc.boundaries.evm.test.ts` → PASS. Commit: `test(maker): HTLC boundary and isolation tests`

### Task 4: `docs/AUDIT-READINESS.md`

**Files:** Create `docs/AUDIT-READINESS.md`

Sections: 1) Why an audit (value flow, who loses); 2) System and trust boundaries (mermaid); 3) Scope: paths in priority order + line counts (script templates 504, settlement/pool 1041, signers 668, lineage 154, overlay rules 1265, guard 1794, coordinator 2090, provider-api 1082, HTLC.sol 62, maker 861); out of scope (web, relay, simulated runners); 4) Invariants: each → where enforced → test; 5) Assumptions; 6) Our own findings (the Task 0 HTLC notes, the T-5/T-6/T-12/T-13 bounds, the postponed Supabase security items: `live_health.detail`, unvalidated `move` broadcasts); 7) Dependency and secret scan (Task 0, with commands); 8) Mainnet evidence; 9) How to build/test; 10) Earlier reviews (the Supabase layer's final review: 1 critical + 9 important fixed, commits); 11) The focus we ask of an auditor.

- [x] `npm run check:docs` → 0. Commit: `docs: audit readiness package`

### Task 5: SECURITY.md, LICENSE, CI

**Files:** Create `SECURITY.md`, `LICENSE` (MIT; the README already says MIT), `.github/workflows/ci.yml`

- [x] SECURITY.md: reporting through GitHub private vulnerability reporting, scope, key policy (no keys in the repo; server keys from env), a link to the audit document. Enable the feature with `gh api -X PUT repos/{owner}/{repo}/private-vulnerability-reporting`. **Could not be done:** the account has no admin rights (PUT 404); an issue-based fallback path was written into SECURITY.md, the repo owner must enable it.
- [x] CI: `push`/`pull_request` (main); Node 24; `npx npm@11 ci` (otherwise `install`); `npm run typecheck`; `npm test`; `npm run check:docs`; `npm audit --omit=dev` (informational, `continue-on-error`). No secret reference, `permissions: contents: read`.
- [x] Push → `gh run watch` → green. If red, the cause is fixed without changing product code (environment/setup); if it cannot be fixed, no badge is added and it is reported.
- [x] Commit: `chore: LICENSE, SECURITY.md, CI (typecheck, tests, docs check)`

### Task 6: README and ROADMAP

**Files:** Modify `README.md`; Create `docs/ROADMAP.md`

- [x] README: a CI badge (only if green); a "Security and audit" section (SECURITY.md, AUDIT-READINESS, THREAT-MODEL, check-docs); the old status line and "Known limitations" per the mainnet reality; the T-10 sentence; a License line.
- [x] ROADMAP: gates before mainnet budgets (audit, validations 4/6, provider bond T-5, a real runner/SmartRoute), the plan for using the audit credit (what packages 1/2/3 cover), the next 3 months.
- [x] `npm run check:docs README.md docs/ROADMAP.md` → 0. Commit: `docs: README security section, roadmap`

### Task 7: STATUS, final review, report

- [x] A `plan/STATUS.md` "Plan changes" row.
- [x] A fresh reviewer (the most capable model): compares the documents' claims with the code/tests, lists exaggerations and errors. Critical/important findings are fixed in one round.
- [x] To the user: what was added, the CI result, the human steps left open (the GitHub `WALLET_*` secrets, the Devfolio submission).
