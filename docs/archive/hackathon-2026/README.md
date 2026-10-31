# Hackathon archive (October 2026)

AgentCoop was built at the TUM Blockchain & AI Hackathon on 30–31 October 2026, for the BSV Association track "DeFi Rails for Agentic Payments", by a small team working with several AI coding agents in parallel. This folder keeps the documents that coordinated that work: the original ideas, the design document, the plans, the live status log, handoff notes and the backlog.

**These documents are historical.** They describe intentions and progress at the time they were written. The code, the tests and the current documentation ([docs/README.md](../../README.md)) take precedence wherever they differ. You do not need to read anything here to use or contribute to AgentCoop.

Most of these files were written in Turkish during the hackathon. They have been translated into English here, keeping their content, numbers, paths and transaction ids; the originals are in the repository history at commit `cd0c0f5` (31 October 2026). Their relative links follow the layout of that commit, where `plan/` and the idea files were at the root; browse it on GitHub to follow them.

## Contents

| File | What it is | Where its current knowledge lives |
|---|---|---|
| [ideas/idea.md](ideas/idea.md) | The original AgentCoop proposal: non-custodial buying pools, scenarios, legal model, market evidence | [README](../../../README.md), [concepts](../../concepts/pools-and-settlement.md), [ADR 0001](../../decisions/0001-two-phase-settlement-signing.md) |
| [ideas/agent-spending-vault.md](ideas/agent-spending-vault.md) | The vault proposal that became the Mandate Vault | [concepts/mandate-vault.md](../../concepts/mandate-vault.md), [ADR 0002](../../decisions/0002-mandate-vault-guard-cosigner.md) |
| [ideas/AnyRail.md](ideas/AnyRail.md) | "Pay with anything" rail for agents (originally `AnyRail-fikir.md`); became Coop Rail | [RAIL-POC.md](../../RAIL-POC.md) |
| [ideas/a.md](ideas/a.md) | Three user needs (originally the root file `a`): shared order, order advance, capacity reservation | [concepts › pool types not implemented](../../concepts/pools-and-settlement.md#pool-types-not-implemented) |
| [FINAL-IDEA.md](FINAL-IDEA.md) | The merged design document (v1.1): product, mechanism, threat model, scope, demo, validation list. Code comments cite its sections as `FINAL-IDEA §…` | concepts, [THREAT-MODEL.md](../../THREAT-MODEL.md), ADRs 0001–0003, [reference/transactions.md](../../reference/transactions.md) |
| [plan/00-MASTER-PLAN.md](plan/00-MASTER-PLAN.md) | Frozen interfaces (§3), phases and sync points (§5), wallets (§6). Code comments cite it as `MASTER §…` | component READMEs, [reference/protocol.md](../../reference/protocol.md), [reference/configuration.md](../../reference/configuration.md), [OPS.md](../../OPS.md) |
| [plan/track-*.md](plan/), [plan/phases/](plan/phases/) | Per-track plans and per-phase task lists (`<track>-P<n>.md`) | component READMEs |
| [plan/phases/A-P6-covenant-report.md](plan/phases/A-P6-covenant-report.md) | Research: can a covenant replace the guard? | [ADR 0002](../../decisions/0002-mandate-vault-guard-cosigner.md) |
| [plan/phases/A-P6-ordlock-notes.md](plan/phases/A-P6-ordlock-notes.md) | Research: OrdLock v1/v2 status upstream | [ADR 0005](../../decisions/0005-signed-listings-not-ordlock.md) |
| [plan/phases/AUDIT-PRIZE.md](plan/phases/AUDIT-PRIZE.md) | Plan for the audit-readiness package | [AUDIT-READINESS.md](../../AUDIT-READINESS.md) |
| [plan/phases/SUPABASE-MVP.md](plan/phases/SUPABASE-MVP.md), [plan/SUPABASE-FLOW.md](plan/SUPABASE-FLOW.md) | Design and plan of the Supabase live layer | [ADR 0004](../../decisions/0004-supabase-display-only-mirror.md), [apps/relay](../../../apps/relay/README.md) |
| [plan/STATUS.md](plan/STATUS.md) | The live log: sync points, blockers, interface changes, **the mainnet transaction ledger**, validation tests, per-track progress | [reference/transactions.md](../../reference/transactions.md) (ledger and validations, in English) |
| [plan/BACKLOG.md](plan/BACKLOG.md) | Open work as of 31 October (BL-01…BL-42) | [ROADMAP.md](../../ROADMAP.md#open-work) |
| [plan/HANDOFF.md](plan/HANDOFF.md), [plan/phases/C-HANDOFF.md](plan/phases/C-HANDOFF.md) | Session handoffs: Supabase setup, security work, what was left | [apps/relay](../../../apps/relay/README.md), [AUDIT-READINESS.md](../../AUDIT-READINESS.md) |
| [plan/MAINNET-RUNBOOK.md](plan/MAINNET-RUNBOOK.md) | The ordered steps of the first mainnet run | [OPS.md §7](../../OPS.md#7-a-full-mainnet-run-in-order) |
| [plan/SETUP-ACCOUNTS.md](plan/SETUP-ACCOUNTS.md) | Accounts and services the team set up | [OPS.md](../../OPS.md) |
| [plan/DEMO-HYBRID.md](plan/DEMO-HYBRID.md) | Rules for a pitch demo on Vercel + Supabase only (see below) | [apps/web](../../../apps/web/README.md#deploy) |
| [OPS-original.md](OPS-original.md) | The original operations guide (translated) | [OPS.md](../../OPS.md) (English rewrite) |
| [MIGRATION.md](MIGRATION.md) | How the documentation was reorganised after the hackathon | — |

## Where things went

Code comments and old links use these paths.

| Old path | Now |
|---|---|
| `FINAL-IDEA.md`, `idea.md`, `AnyRail-fikir.md`, `agent-spending-vault.md`, `a` | this folder, `FINAL-IDEA.md` and `ideas/` (`AnyRail-fikir.md` is `ideas/AnyRail.md`, `a` is `ideas/a.md`) |
| `plan/**` | this folder, `plan/**` |
| `docs/OPS.md` (Turkish) | `OPS-original.md` here; `docs/OPS.md` is now the English guide |
| `README-SIMPLE.md` | [docs/overview.md](../../overview.md) |
| `docs/START-HERE.md`, `docs/BSV_STACK_COMPLETE_GUIDE.md`, `docs/AGENTS.md`, `docs/TBC26_BSV_Track_Requirements.pdf`, `docs/BSVA Logo Guidance` | [docs/vendor/bsv-hackathon-pack/](../../vendor/bsv-hackathon-pack/README.md) |
| README › Example transactions | [docs/reference/transactions.md](../../reference/transactions.md) |
| README › Provider and agents | [apps/provider-api](../../../apps/provider-api/README.md), [apps/agents](../../../apps/agents/README.md) |

## How the hackathon was organised

The terms below appear throughout these files and in code comments.

- **Tracks** were parallel work streams, each driven by its own AI agent sessions: **A** protocol (`packages/core`), **B** overlay and coordinator, **C** provider and agents, **D** vault, guard, operations and Coop Rail, **E** frontend. They were coordination boundaries, not component boundaries.
- **Phases** (`A-P0`, `B-P5a`, …) were one prompt-sized step of a track. **Sync points** S0–S4: S1 the first end-to-end mainnet settlement (the walking skeleton), S2 the first settlement through the coordinator, S4 the feature freeze.
- **Layers** K1 (core flow), K2 (vault, market, rail), K3 (stretch ideas) set the build order.
- **T1–T11** name transaction types; **T-1…T-23** name threats; **F-1…F-11** our own security findings; **BL-xx** backlog items; **validation 1–8** the mainnet tests of design assumptions.
- The Town (`Kasaba` in the original Turkish) is the pixel-art live view in `apps/web`.

## The track requirements, and how the submission met them

| Requirement (TBC26 §3) | How | Where |
|---|---|---|
| BSV TypeScript SDK + Wallet Toolbox | Every transaction is built with `@bsv/sdk` 3.2.1; agents, provider API, guard, coordinator tests and maker use `@bsv/wallet-toolbox` 2.14.9 | `packages/core`, `apps/*` |
| User-facing flows on BSV Desktop / Browser | Provider (open pool, mint), owner (vault, policy, withdraw), people (pledge) use `WalletClient('auto')` | `apps/provider-cli`, `apps/owner-cli`, `apps/participant-cli`, `apps/web` |
| Real transactions (mainnet) | Pool, pledge, settlement, redeem, 402, vault, Lighthouse, market sweep | [reference/transactions.md](../../reference/transactions.md) |
| Non-custodial wherever funds are involved | One atomic DvP transaction; the coordinator holds nothing; vault funds need agent + guard and the owner can always exit | [THREAT-MODEL.md](../../THREAT-MODEL.md) |
| At least one AI agent that pays | Three agents forecast demand, pledge, sign the settlement, redeem credits and pay retail over 402 | `apps/agents` |

The requirements document itself is in [the vendor pack](../../vendor/bsv-hackathon-pack/README.md).

## The hybrid pitch demo

For the pitch, the team decided (31 October) that the public demo should run on Vercel and Supabase only, without publishing a backend: the flow mocked in the browser, but every payment a real mainnet transaction from the visitor's BSV Desktop to a provider's, handed over through Supabase (`demo_payments`, `demo_receipts`) and received with SPV and `internalizeAction`. The Supabase tables and the Vercel configuration were added; the in-browser payment step was not built. Later the same day the Vercel build was switched to the live app. The rules are in [plan/DEMO-HYBRID.md](plan/DEMO-HYBRID.md).
