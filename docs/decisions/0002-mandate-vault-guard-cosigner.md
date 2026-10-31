# 0002: Mandate Vault with a policy co-signer

**Status:** accepted, implemented (`packages/core/src/scripts/vault.ts`, `apps/guard/`), on mainnet since 31 October 2026.
**Sources:** [agent-spending-vault.md](../archive/hackathon-2026/ideas/agent-spending-vault.md), design document §2 and §4.9 ([FINAL-IDEA.md](../archive/hackathon-2026/FINAL-IDEA.md)), covenant research [A-P6-covenant-report.md](../archive/hackathon-2026/plan/phases/A-P6-covenant-report.md).

## Context

An agent that spends money can be prompt-injected or buggy. The owner needs limits that hold even when the agent is compromised, and must keep the ability to take the money back, without handing custody to a third party.

## Decision

The agent's budget sits on `OP_IF <owner> OP_CHECKSIG OP_ELSE 2 <agent> <guard> 2 OP_CHECKMULTISIG OP_ENDIF`. The guard is a server that co-signs only spends that pass the owner's policy (allowlisted providers with derived-key payee proofs, per-pool, weekly, fee and hot-wallet caps) and, for pools, the same settlement and lineage checks a participant runs. The owner withdraws alone through the `OP_IF` branch.

## Reasoning

- The owner's authority is enforced by the chain, not by the agent's prompt.
- Neither the guard nor the agent can move funds alone; a compromised guard can only refuse to sign.
- The guard sees the whole transaction, so it can enforce delivery versus payment for pool settlements, which no script can (BSV-21 is not script-enforced).

## Alternatives considered

- **A team-issued demo stablecoin (tUSD) and an x·y=k swap pool** around the vault (the original vault proposal). Dropped: a stablecoin issued by the team is an IOU, and third-party liquidity deposits into a pool need either custody or a covenant.
- **A guard-less covenant vault** (OP_PUSH_TX, researched on 30 October). It enforces a static payee, a per-spend cap, change back to the vault and a fee cap on chain, at about 239 sat per spend against about 50 sat for the guard path. It cannot do per-pool payee derivation, rolling caps (without a stateful covenant) or settlement DvP. Kept as unexported research in `packages/core/src/research/covenant/`, interpreter-tested only.

## Consequences

- If the guard is down the agent cannot spend; the owner still can.
- Agent and guard compromised together can spend up to the vault balance within the caps (T-12).
- Credits bought by a vault agent needed their own lock to stay under the policy; vault-locked credits (`creditLock: 'vault'`) were added for that (T-10).
