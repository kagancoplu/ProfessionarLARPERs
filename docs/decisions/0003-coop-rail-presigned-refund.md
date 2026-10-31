# 0003: Coop Rail refunds by pre-signed, height-locked transaction

**Status:** accepted for the proof of concept. The swap runs offline (mock chain and in-memory EVM); the Base contract is not deployed. See [RAIL-POC.md](../RAIL-POC.md).
**Source:** design document §4.10 and §12 ([FINAL-IDEA.md](../archive/hackathon-2026/FINAL-IDEA.md)).

## Context

Coop Rail swaps USDC on Base for BSV through hash time-locked contracts. An HTLC needs a refund path after a timeout. On BSV, `OP_CHECKLOCKTIMEVERIFY` and `OP_CHECKSEQUENCEVERIFY` have been NOPs since Genesis and were not restored; `nLockTime` keeps its original meaning.

## Decision

- The BSV HTLC has no time branch: `OP_IF OP_SIZE <32> OP_EQUALVERIFY OP_SHA256 <h> OP_EQUALVERIFY 2 <agent> <guard> 2 OP_CHECKMULTISIG OP_ELSE 2 <maker> <agent> 2 OP_CHECKMULTISIG OP_ENDIF`.
- Before the maker broadcasts the funding, the agent checks and signs the maker's refund: a transaction spending the HTLC through the `OP_ELSE` branch, with `nLockTime` = current height + 6 and a non-final sequence.
- The refund lock is a **block height**, not a time, and the funding is **version 1**.
- The claim branch needs the guard, so swapped funds land in the agent's Mandate Vault.

## Reasoning

- A pre-signed `nLockTime` transaction is the only refund mechanism left on BSV without a script time lock.
- Height avoids depending on median-time-past semantics.
- Chronicle lifted the malleability rules only for transactions with version > 1; a version 1 funding keeps its txid, so the pre-signed refund stays valid. Validation 6 confirmed it on mainnet.
- The agent signs the refund before the funding exists, so it never risks both sides.

## Consequences

- The clocks differ: the BSV refund is height-based (6 blocks) while the Base timeout is in seconds. The maker funds only if the Base timeout survives blocks three times slower than 10 minutes, its watchdog broadcasts the refund one block after the lock height (validation 4: Arcade refused it at the lock height itself), and the agent refuses to claim within 2 blocks of the refund becoming final (F-4, T-23).
- The claim branch itself never expires.
- One direction only (USDC → BSV); the maker's inventory is rebalanced by hand.
