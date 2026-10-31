# D-P4 — Delivery: README, threat model, value note, tx links

> Track D. `plan/track-D-vault-ops-rail.md` phase 4. Execution order 0→1→2→3→5→6→7→**4**; phase 4 is always the last phase. This file has two parts:
> - **D-P4a (now, 30.10 ~21:10):** while waiting for S3, the parts that depend on no other track and on no mainnet: the README skeleton, the threat model, the value note, the tx table skeleton, README section requests to the other tracks, the video inventory skeleton. User decision (task text b).
> - **D-P4b (4 hours before submission, or when 5/6/7 are done):** mainnet txids, a clean-machine try of `npm run demo`, a link check, Axel's answers, the S4 checkpoint.
>
> First: `git pull` + main merged (`0771075`; A P3, C P3 partial, E P2). Root `npm test` 55 files / 267 tests green, typecheck clean. No connected computer (`list_computer_folders` empty) → the mainnet steps (task a) cannot be done.

## 1. Submission requirements (TBC26 PDF §3) → where they are met

| Requirement | Where | At the end of D-P4a |
|---|---|---|
| Open-source repo + a README explaining what it does and how to run it | root `README.md` | skeleton + working mock-chain commands |
| A live demo or a 2–3 min video (end to end, including an agent payment) | the FINAL-IDEA §11 scenario; the video material inventory (§6 below) | inventory skeleton |
| Example transaction links on BSV (WhatsOnChain) | README "Example transactions" (T1–T11) ← STATUS "Mainnet transactions" | table skeleton, txids empty ("pending mainnet run") |
| Usage and value note | README "Usage & value note" ← FINAL-IDEA §14 | text |
| (Build requirements) SDK + Wallet Toolbox, BSV Desktop, real transactions, non-custodial, a paying agent | README "How it meets the track requirements" table | table; the "real transactions" row ☐ until mainnet |

## 2. README skeleton (root `README.md`, English)

Sections (ordered by the jury weights: adoption 35 % first):
1. Title + one-sentence pitch (FINAL-IDEA §0 EN)
2. **What it does** (3 paragraphs) + architecture diagram (text/mermaid; actors FINAL-IDEA §6, components §3.1)
3. **Usage & value note** (FINAL-IDEA §14; the "demo pricing" honesty)
4. **How it meets the track requirements** (PDF §3 → component → evidence file)
5. **Quick start (mock chain, no wallet, no sats)**: `npm install` (`npx npm@11 install`), `npm test`, `npm run demo:k1`, `npm run demo:failed-pool`, `npm run demo-injection -w @agentcoop/scripts`, `npm run infra`, `npm run web:mock`. Each one run in this environment and its output checked.
6. **Mainnet run** (a list of steps: `.env`, keygen, BSV Desktop, funding, `npm run infra`, provider-cli, agents); first tries ≤ 1,000 sat
7. **Example transactions** (T1–T11 + T11b; a status column)
8. **Non-custodial design & threat model** (a FINAL-IDEA §8 summary, "Open" rows not hidden; detail in `docs/THREAT-MODEL.md`)
9. **What is real vs simulated**
10. **Components** (one paragraph per track + a link to its README; texts requested from A/B/C/E, until then links to the existing app READMEs and D's short summary)
11. **Known limitations** (from STATUS Blockers: no mainnet, S3 open, Rail not live, vault-locked credits A.P5)
12. Licence (MIT; if there is no `LICENSE` in the repo, SETUP-ACCOUNTS #5 → human), the BSVA logo: not used (text only until the guideline permission is clear)

## 3. `docs/THREAT-MODEL.md`

For each row of FINAL-IDEA §8: threat → control → **where it is enforced** (file) → **where it is tested** (test file + test name, checked with `grep`; no guesses) → status (`Closed` / `Detectable` / `Open, bounded` / `Open`) + mainnet check (☐). An extra table: guard checks G1–G13, P1–P6, S1–S7, H1–H3, R (rail) → §8 row → test. The guard README's "What each check closes" table is not moved here but merged (the guard README links to this file).

Since phase 6 is not done, the "where it is tested" column comes from the existing tests; when `test/attacks/*` (phase 6.2) arrives, each row is tied to an attack test.

## 4. The tx link table

README rows T1–T11b: transaction, who signs, what you see on WhatsOnChain (FINAL-IDEA §7), txid (from STATUS "Mainnet transactions"), mock-chain evidence (which test builds this transaction). The txid column stays empty and says "pending mainnet run"; filled in D-P4b.

## 5. Requested from the other tracks (a D → A/B/C/E row in STATUS "Interface changes")

From each track, for the README: (1) a 5–8 line component paragraph (English), (2) its own Quick start command, (3) a "real vs simulated" item, (4) the txids of the T types it built on mainnet (into STATUS "Mainnet transactions"). Until they arrive, the README links to the existing app READMEs.

## 6. Video material inventory (skeleton)

For each scene of FINAL-IDEA §11: what to show, the source (command / page / log), ready on the mock chain, mainnet needed. Kept in this file (§9).

## 7. Files

```
README.md                    (new content; one line today)
docs/THREAT-MODEL.md         (new)
apps/guard/README.md         (a link to THREAT-MODEL instead of the §8 table; the G/P/S/H table stays)
plan/phases/D-P4.md          (this file; §9 inventory, §10 checkpoint)
plan/STATUS.md               (only the Track D section and D rows)
```

## 8. Acceptance (D-P4a)

Every mock-chain command in the README run in this environment and its result written down; every test name in THREAT-MODEL exists in the repo (`grep`); root `npm test` + typecheck clean; the request row to the other tracks in STATUS; S4 and the phase 4 checkpoint stay for D-P4b.

## 9. Video material inventory (FINAL-IDEA §11; skeleton, D-P4a)

| Scene | What to show | Source | Ready on the mock chain | Mainnet needed |
|---|---|---|---|---|
| 0:00–0:20 Problem | packages that need commitments, group buying with custody | slide/narration | — | no |
| 0:20–0:45 Pool + vault | the provider opens a pool from BSV Desktop (approval windows); the owner funds the vault and writes the policy | `npm run provider-cli -- open-pool`, `npm run owner -w @agentcoop/owner-cli -- create-vault/policy/fund`; the web provider/owner console | web mock tour (E P2) | **yes** (Desktop windows) |
| 0:45–1:30 Agents pledge; Rail; injection refused | decision logs, progress bar, an agent coming from Base, guard DENY | `npm run demo:k1`, `npm run demo-injection -w @agentcoop/scripts`, `test/e2e.rail.mockchain.test.ts`, the web Town | yes (Rail offline only) | yes (real txids) |
| 1:30–1:55 Lock-in and one settlement | signing round logs (coordinator JSON lines), T5 on WhatsOnChain | `npm run infra` logs, `GET /pools/:id/audit` | yes | **yes** (WhatsOnChain) |
| 1:55–2:25 Spending credits, 402, market | redeem + job, listing + sweep | `npm run demo:k1` (job), `test/e2e.market.mockchain.test.ts` | yes | yes |
| 2:25–2:45 An unfilled pool, the owner's withdrawal | balances unchanged; `owner withdraw` | `npm run demo:failed-pool`, owner-cli `withdraw` | yes | yes (Desktop) |
| 2:45–3:00 Numbers | participants, transaction count, fee, 0 sat in custody | `GET /metrics`, B's scale table (`apps/coordinator/README.md`) | yes (mock-chain numbers) | mainnet numbers preferred |

## 10. Checkpoint (D-P4a, 30.10 ~21:30)

1. **Is the plan still good?** Yes. Phase 4 was split in two (D-P4a now, D-P4b 4 hours before submission or when 5/6/7 are done); the execution order rule is unchanged, phase 4 is still the last phase. Written to STATUS "Plan changes".
2. **This part is done:** root `README.md` (skeleton + value note + requirements table + checked Quick start + T1–T11b table + real vs simulated + components + known limitations), `docs/THREAT-MODEL.md` (17 + 2 threats, each with its enforcement file + exact test name; names and paths checked by a script), guard README → THREAT-MODEL link, video inventory (§9). The Quick start commands were run in this container: `npm test` 55/267 green, `demo:k1`, `demo:failed-pool`, `demo-injection` (2 DENY + 1 ALLOW), `infra` (`/healthz` ok), `web:mock` (the page loaded).
3. **Other tracks:** A P3 ✓ (`buildPledge('vault')` delegates to D's `pledgeFromVault`), C P3 partial, E P2; B phases 5/6 on the mock chain. README component paragraphs requested in STATUS (D → A/B/C/E).
4. **Dependencies of the next phase:** D-P4b: mainnet txids (sats), `LICENSE` (human, SETUP-ACCOUNTS #5), Axel's answers, the track paragraphs. Phases 5/6/7: S3 (A.P3 ✓; waiting for C.P3's vault agent and the S3 sync).
5. **Interface change:** none.
