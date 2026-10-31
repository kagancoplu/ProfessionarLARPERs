# Security policy

AgentCoop moves real satoshis between parties who do not trust each other, without an intermediary holding them. A bug in the scripts, the settlement verifier or the guard can cost someone money, so we treat reports as the most important thing in the issue tracker.

## Status

AgentCoop is a hackathon project (TUM Blockchain & AI Hackathon, October 2026) running on BSV mainnet with small amounts. It has **not had an external security audit**. Use it only with amounts you can afford to lose. What we already know is weak is listed in [docs/AUDIT-READINESS.md §6](docs/AUDIT-READINESS.md) and [docs/THREAT-MODEL.md](docs/THREAT-MODEL.md).

Only the `main` branch is supported.

## Reporting a vulnerability

**Please do not open a public issue with details.** Use GitHub's private reporting when it is available: the repository's **Security** tab → **Report a vulnerability** (only the maintainers see the report). Until then, open an issue titled "Security contact request" with no details, and say where we can reach you (an email address or a handle on another platform); a maintainer will contact you there and agree on a private channel.

Helpful to include:

- the component and file (`packages/core/src/scripts/vault.ts`, `apps/guard/src/policy.ts`…);
- what an attacker gains (whose funds, how much, under which assumptions);
- a reproduction, ideally as a failing test on the mock chain (`npm test` runs offline; `test/vault.mockchain.test.ts` is a good template).

We aim to acknowledge a report within three days and to agree on a disclosure date with you. We credit reporters in the fix's commit message unless you ask us not to.

## Scope

In scope: the Bitcoin Script templates, the settlement planner and verifier, signers, lineage verification, the overlay's BSV-21 rules, the guard, the coordinator, the provider API's payment and redeem paths, the Base HTLC and the Coop Rail maker. The full list, by priority and with paths, is [docs/AUDIT-READINESS.md §3](docs/AUDIT-READINESS.md).

Out of scope: the simulated GPU and proxy runners, the Town game, the read-only live mirror's cosmetic features, and findings that require a compromised user wallet.

## Rules for testing

- Use the mock chain (`npm test`), your own local services (`npm run infra`), or your own pools and wallets on mainnet.
- Do not move, lock or burn anyone else's funds, and do not flood public services.
- Report first; give us a reasonable time to fix before you publish.

## How we handle keys

- No private key is in this repository or its history (a full-history scan is described in [docs/AUDIT-READINESS.md §7](docs/AUDIT-READINESS.md)).
- User keys never leave BSV Desktop or BSV Browser. Server wallets load their root keys from environment variables (`.env`, git-ignored), never from files in the repository.
- CI does not use repository secrets.
