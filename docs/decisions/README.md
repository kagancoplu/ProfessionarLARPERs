# Architecture decision records

Decisions that shape the protocol or the system, with the reasoning the team wrote down when it made them. Each record cites its source in the [hackathon archive](../archive/hackathon-2026/README.md). Small implementation choices are not recorded here.

| # | Decision | Status |
|---|---|---|
| [0001](0001-two-phase-settlement-signing.md) | The provider pre-signs `SINGLE\|ANYONECANPAY`; participants sign `ALL` in a round | Accepted, implemented |
| [0002](0002-mandate-vault-guard-cosigner.md) | Agent budgets live in a 2-of-2 vault with a policy co-signer and an owner exit | Accepted, implemented |
| [0003](0003-coop-rail-presigned-refund.md) | Coop Rail's BSV refund is a pre-signed, height-locked version 1 transaction | Accepted, proof of concept |
| [0004](0004-supabase-display-only-mirror.md) | Supabase is a display-only mirror written by one relay | Accepted, implemented |
| [0005](0005-signed-listings-not-ordlock.md) | The market uses signed `SINGLE\|ACP` listings, not OrdLock | Accepted, implemented |

To add one: copy the structure of an existing record (context, decision, reasoning, alternatives, consequences, status), number it next, and add a row here.
