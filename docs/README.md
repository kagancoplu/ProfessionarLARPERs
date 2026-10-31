# AgentCoop documentation

Start with the [project README](../README.md) for what AgentCoop is. This page is the map of everything else, ordered from first contact to exact contracts.

## Start here

- [Getting started](getting-started.md): install, run the tests and demos offline, open the web app, run the live stack locally.
- [Architecture](architecture.md): the components, how they talk, where data lives, what each run mode needs.

## Concepts

- [Pools and atomic settlement](concepts/pools-and-settlement.md): the pool lifecycle, the one-transaction settlement, the coordinator's role, Lighthouse pledges for offline people.
- [Credits, redemption and the market](concepts/credits.md): BSV-21 credits, lineage, spending through redeem or HTTP 402, signed listings and sweeps.
- [Mandate Vault and the guard](concepts/mandate-vault.md): owner-controlled agent budgets, the policy co-signer, vault-locked credits.
- [Coop Rail](RAIL-POC.md): the USDC (Base) → BSV swap into a vault. Proof of concept, offline.

## Components

| Component | What |
|---|---|
| [packages/core](../packages/core/README.md) | Protocol library: builders, signers, verifiers, scripts |
| [packages/overlay](../packages/overlay/README.md) | Overlay topic and lookup service |
| [apps/coordinator](../apps/coordinator/README.md) | Signing rounds, offers, listings, audit and metrics |
| [apps/guard](../apps/guard/README.md) | Mandate Vault policy engine and co-signer |
| [apps/provider-api](../apps/provider-api/README.md) | Simulated provider: HTTP 402 jobs, credit redemption |
| [apps/agents](../apps/agents/README.md) | Autonomous buying agents and their event feed |
| [apps/maker](../apps/maker/README.md) | Coop Rail maker and Base HTLC tooling |
| [apps/relay](../apps/relay/README.md) | Supabase live mirror (display only) |
| [apps/web](../apps/web/README.md) | Web consoles and the Town ([design system](../apps/web/DESIGN.md), [video and film mode](../apps/web/VIDEO.md), [asset licences](../apps/web/assets/LICENSES.md)) |
| [apps/provider-cli](../apps/provider-cli/README.md), [apps/participant-cli](../apps/participant-cli/README.md), [apps/owner-cli](../apps/owner-cli/README.md) | BSV Desktop command lines for providers, participants and vault owners |
| [infra](../infra/README.md) | Running the services, public deployment, backups, preflight |

## Operations

- [OPS.md](OPS.md): wallets, keys, funding, a full mainnet run in order, troubleshooting.
- [Public deployment](../infra/README.md#public-deployment) of the services; [web deployment](../apps/web/README.md#deploy).

## Security

- [SECURITY.md](../SECURITY.md): how to report a vulnerability.
- [AUDIT-READINESS.md](AUDIT-READINESS.md): scope, invariants, our own findings, scans, mainnet evidence.
- [THREAT-MODEL.md](THREAT-MODEL.md): every threat with its control, code, test and mainnet transaction.
- [ROADMAP.md](ROADMAP.md): what has to happen before real budgets, and open work.

## Reference

- [Protocol](reference/protocol.md): transaction layouts, records, scripts, signature scopes, key derivations.
- [Transactions and mainnet evidence](reference/transactions.md): transaction types, validation tests, the full mainnet ledger.
- [Configuration](reference/configuration.md): every environment variable and who reads it.
- [Decisions](decisions/README.md): architecture decision records.

## Background material

- [Overview in plain words](overview.md): AgentCoop for readers who know BSV but do not write code.
- [Hackathon archive](archive/hackathon-2026/README.md): the original ideas, design document, plans and logs from the TUM Blockchain & AI Hackathon (October 2026). Historical; the code and the documents above take precedence.
- [BSV developer pack](vendor/bsv-hackathon-pack/README.md): the BSV Association's guide and starter kit, third-party material.

## Keeping the docs current

Each fact has one home; link to it instead of copying it.

| What changed | Update |
|---|---|
| A service's endpoints, messages, configuration or state | that component's `README.md` |
| How components interact, run modes, data ownership | [architecture.md](architecture.md) |
| A transaction format, record, script or signature scope | [reference/protocol.md](reference/protocol.md) |
| An environment variable | the component README, and [reference/configuration.md](reference/configuration.md) if it is new |
| A new mainnet transaction or validation | [reference/transactions.md](reference/transactions.md) |
| A threat, control or finding | [THREAT-MODEL.md](THREAT-MODEL.md), [AUDIT-READINESS.md](AUDIT-READINESS.md) |
| A significant design decision | a new record in [decisions/](decisions/README.md) |
| Open work done or added | [ROADMAP.md](ROADMAP.md) |

`npm run check:docs` (run by CI) checks every active Markdown file: each backticked repository path (and `file:line`) must exist, each relative link must resolve, and each test cited as `` `file.test.ts` › "name" `` must exist in that file. Write repository paths from the root (`apps/guard/src/policy.ts`, not `src/policy.ts`). `docs/vendor/` and `docs/starter/` are third-party material and are not checked.
