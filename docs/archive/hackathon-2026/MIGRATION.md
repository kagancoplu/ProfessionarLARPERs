# Documentation migration (31 October 2026)

How the hackathon-era documentation was turned into the current structure, starting from commit `cd0c0f5`. The working audit used during the migration was folded into this file and removed.

## Structure after the migration

```
README.md, SECURITY.md, LICENSE, AGENTS.md, CLAUDE.md
docs/
  README.md (new hub), getting-started.md (new), architecture.md (new), OPS.md (English rewrite)
  overview.md     the plain-language overview (formerly README-SIMPLE.md at the root)
  AUDIT-READINESS.md, THREAT-MODEL.md, ROADMAP.md, RAIL-POC.md   (same paths, edited)
  concepts/       pools-and-settlement.md, credits.md, mandate-vault.md   (new)
  reference/      protocol.md, transactions.md, configuration.md          (new)
  decisions/      README.md + ADRs 0001–0005                             (new)
  archive/hackathon-2026/   this folder (translated into English)
  vendor/bsv-hackathon-pack/   BSV Association pack (moved, unchanged) + provenance README
  starter/        BSV Association starter kit (unchanged; tests import it)
  screenshots/    web screenshots (unchanged)
apps/*/README.md, packages/*/README.md, infra/README.md   (edited; apps/maker/README.md new)
```

## Dispositions

| Source | Disposition | Destination |
|---|---|---|
| `README.md` | rewritten, split | landing page; transaction table → `docs/reference/transactions.md`; provider and agent sections → their READMEs; requirements table → this archive's README |
| `README-SIMPLE.md` | moved, fixed | `docs/overview.md`, linked from the README; two transactions credited to BSV Desktop were server-wallet ones, replaced with the Desktop mint and pool |
| `CLAUDE.md`, `AGENTS.md` | rewritten | repository-specific agent guide; the BSV rules kept, the pack's copy in vendor; track workflow, document map and pull/push loop retired |
| `FINAL-IDEA.md`, `idea.md`, `AnyRail-fikir.md`, `agent-spending-vault.md`, `a` | archived and translated (`ideas/AnyRail.md`, `ideas/a.md`) | concepts, ADRs 0001–0003, threat model |
| `plan/**` | archived and translated | ledger and validations → `docs/reference/transactions.md` (English); runbook → `docs/OPS.md` §7; Supabase decision → ADR 0004; OrdLock and covenant research → ADRs 0005 and 0002; backlog → `docs/ROADMAP.md` open work; Supabase setup notes → `apps/relay/README.md`; secret-scan recipe → `docs/AUDIT-READINESS.md` §7 |
| `docs/OPS.md` (Turkish) | rewritten in English in place (section numbers kept, `infra/preflight.mjs` cites them) | original, translated, as `OPS-original.md` here |
| `docs/RAIL-POC.md` | rewritten in place | stale "not run" rows for validations 4 and 6 fixed; component part → `apps/maker/README.md` |
| `docs/AUDIT-READINESS.md`, `docs/THREAT-MODEL.md`, `docs/ROADMAP.md` | kept at their paths, targeted edits | track wording removed, archived paths updated, T-22 scope and T-23 status clarified, market sweep listed as mainnet |
| BSV Association pack (`START-HERE.md`, the stack guide, `AGENTS.md`, track requirements PDF, logo guidance) | moved unchanged | `docs/vendor/bsv-hackathon-pack/` |
| `docs/starter/` | kept in place | three tests import its overlay server, so it cannot move without code changes |
| `CONTRIBUTING.md` (written during the migration) | removed at the maintainers' request: the project is finished and published as is | the README's "Status of the project"; the doc-ownership table is in `docs/README.md` |
| Turkish code comments and printed strings (`packages/core/src/types.ts`, `apps/guard/src/rail.ts`, `apps/guard/src/validation5.ts`, `apps/maker/src/swap-demo.ts`, `scripts/fund.ts`) | translated into English; the printed pointers now name `docs/reference/transactions.md` | — |
| tracked `.DS_Store` files | removed | — |

## Decisions

- **Security documents kept their paths.** External links (the hackathon submission, judges), code comments and CI point at `docs/AUDIT-READINESS.md`, `docs/THREAT-MODEL.md` and `docs/ROADMAP.md`.
- **Flat `docs/` for single documents,** folders only where there are several (concepts, reference, decisions). No guides folder: `getting-started.md` and `OPS.md` cover it.
- **Component interfaces stay in component READMEs;** `docs/` covers what crosses components. Configuration is indexed once in `docs/reference/configuration.md`, with tuning details left in the owning README.
- **Archive in English.** Files were moved with `git mv`, then translated in place at the maintainers' request (the whole project is English); content, numbers, paths and transaction ids were kept, and the Turkish originals stay in history at `cd0c0f5`. Internal links follow the `cd0c0f5` layout.
- **No behaviour changes in code.** Code edits were limited to comments and printed strings: the runbook path printed by `infra/preflight.mjs`, the English translation of Turkish comments and messages listed above, and `scripts/check-docs.mjs`, which now checks every active Markdown file instead of the four security documents.

## Discrepancies found

| # | Finding | Resolution |
|---|---|---|
| 1 | The README called the public URL "the live app on BSV mainnet (Vercel web + a public backend)"; the hybrid-demo plan said no backend; the web README said "not published"; README-SIMPLE said simulated | The deployed bundle (checked twice on 31 October) contains no public service or Supabase URL. Docs now link `?mode=mock` and say live mode needs reachable services |
| 2 | The market sweep (T8) was listed as mock-chain only in the README and ROADMAP but has a mainnet txid | Listed as mainnet |
| 3 | `RAIL-POC.md` listed validations 4 and 6 as not run and passed at the same time | Passed (31 October) |
| 4 | THREAT-MODEL T-23 listed validation 6 as open | Removed |
| 5 | The maker and the optional second coordinator both default to port 8094 | **Open** (configuration); documented in the maker, coordinator, infra and configuration docs |
| 6 | T-22 said the mirror's tables are select-only; the unused `demo_payments` and `demo_receipts` tables accept anonymous inserts | T-22 clarified; RLS tests cover the eight mirror tables only |
| 7 | The guard README still listed "credits go to the agent's own address" as open | Updated: closed by `creditLock: 'vault'` (T-10) for vault pledges that set it |
| 8 | The owner-cli README and the old OPS guide said scripts need an "SDK bridge fix" | Removed: resolved by `register-sdk` before the mainnet run |
| 9 | The agents README said vault agents receive credits "as usual" | Updated: vault agents pledge with `creditLock: 'vault'` |
| 10 | `apps/guard/src/validation5.ts` printed "record in plan/STATUS.md"; code comments cite `FINAL-IDEA §…` and `plan/phases/…` | Printed pointers fixed; code comments keep their citations, which resolve into this (now English) archive through the path map in its README |
| 11 | The BSV Association pack and logos have no licence statement in the repository | **Open** for the maintainers; flagged in the vendor README |
| 12 | The Supabase project ref appears in `plan/HANDOFF.md` and `plan/BACKLOG.md` | Not a secret (it ships in any build that uses Supabase) and already in history; not repeated in new docs |
| 13 | T-19 says "no public deployment yet" | Still true as far as the repository shows; unchanged |

## Remaining documentation work

- Decide whether the hybrid pitch-demo rules (formerly in `CLAUDE.md`) still apply; if so, restore them as a short section in `apps/web/README.md`.
- Enable GitHub private vulnerability reporting and simplify `SECURITY.md`.
- When a public instance of the services runs, document its URLs in the README and tick T-19.
