# AgentCoop roadmap

Where the project stands after the hackathon, what has to happen before anyone pools a real budget through it, and how an external audit fits in. Security context: [AUDIT-READINESS.md](AUDIT-READINESS.md), [THREAT-MODEL.md](THREAT-MODEL.md).

## Where we are (31 October 2026)

- **On mainnet:** DvP settlements through the coordinator (agents and a human with BSV Desktop), a vault agent whose credits stay locked to its vault, a Lighthouse settlement with the humans offline, credit redeems with lineage checks, agent payments over HTTP 402, and the Mandate Vault (owner exit, agent + guard spend, an injected payment refused).
- **On the mock chain only:** the market sweep, Coop Rail (USDC on Base → BSV), the 100-participant settlement.
- **Simulated:** the GPU and proxy work behind the provider API. Payments, credits and settlement are real.

## Gates before real budgets

Nothing below changes the protocol's shape; each one closes a known gap.

0. ~~Fix F-10~~ **done (31 Oct):** the vault is read before the debit (and restored if the return fails), and a redeem from a second vault is refused (`ERR_OTHER_VAULT`) while a balance from the first remains; `test/provider.return-vault.test.ts` guards it.
1. **External audit of the priority-1 scope:** the script templates, signers, settlement planner and verifier, lineage verification, the guard and the vault operations ([AUDIT-READINESS.md §3](AUDIT-READINESS.md)). Fix what it finds, with a regression test per finding.
2. ~~The remaining mainnet runs~~ **done (31 Oct):** the market sweep (T8) and validations 3 (BSV Desktop's approval windows), 4 (nLockTime height semantics) and 6 (v1 malleability).
3. **Coop Rail before it goes live.** Done on 31 Oct: F-11's `OP_SIZE 32` check, F-1 (the contract refuses a token that delivers less than the amount), F-2 (a safe-transfer wrapper), and F-4's mitigations (a maker watchdog that broadcasts the BSV refund one block after it is final, a Base timeout margin for blocks 3 times slower, and an agent that will not claim close to the refund). Validation 6 passed (version 1 is not malleable). Left: deploy on Base Sepolia, run a live swap (T11, T11b), and consider a claim branch that expires.
4. **Provider accountability (T-5):** a provider bond forfeited if a pool's credits are not served, and on-chain delivery reputation.
5. **Public infrastructure:** coordinator and overlay behind a proxy with the existing per-IP limits (T-19), the audit endpoint public, and a second independent coordinator.
6. **Deeper testing:** mutation testing is done for `packages/core/src/pool/verify.ts`, the script templates and the Base HTLC (49 of 49 mutants killed, `npm run mutate` in CI). Left: property tests over random settlement plans.

## Product

- **A real provider.** SmartRoute, an LLM router selling reserved model capacity, plugs in as a product file and a runner (README › How to add a provider or product); pools, credits, redeem and agents stay the same.
- **Order history.** A provider endpoint that lists an identity's jobs and receipts, and a "my orders" view in the web app (today a job is visible only by its id).
- **Guard decision log with txids,** so an owner can match every co-signature to the chain.
- **Coop Rail's reverse direction** (BSV → USDC), so agents in unfilled pools can exit to Base (T-16).

## How we would use audit credits

We would scope an audit by the priorities in [AUDIT-READINESS.md §3](AUDIT-READINESS.md) and hand the auditor that document, the threat model and the questions in its §11.

| Budget | What we would put in front of the auditor |
|---|---|
| A full audit | Priorities 1 and 2: script templates, signers, settlement, lineage, guard, vault operations, BSV-21 rules and overlay, the Base HTLC and the maker |
| A core pre-audit | Priority 1 only: the code that decides whether a participant's or an owner's coins can move |
| An express pre-audit | The script templates (`packages/core/src/scripts/`), the settlement verifier (`packages/core/src/pool/verify.ts`) and the Base HTLC (`contracts/base-htlc/HTLC.sol`) |

Every finding becomes a failing test first, then a fix, and the threat model's row for it is updated in the same commit.
