# 0005: Signed listings instead of OrdLock

**Status:** accepted, implemented (`packages/core/src/market/listing.ts`, the coordinator's listing book), on mainnet since 31 October 2026.
**Sources:** design document §4.8 ([FINAL-IDEA.md](../archive/hackathon-2026/FINAL-IDEA.md)), [A-P6-ordlock-notes.md](../archive/hackathon-2026/plan/phases/A-P6-ordlock-notes.md) (read from the upstream repositories on 30 October 2026).

## Context

The market needs sellers to offer credits that a buyer can take atomically while the seller is offline. The 1Sat ecosystem's OrdLock contract does that and would make listings visible in 1Sat's market and indexer.

## Decision

A listing is the seller's `SIGHASH_SINGLE|ANYONECANPAY` signature over its credit output: "the output at my index pays me `askSats`". Buyers sweep several listings in one transaction after verifying each listing's lineage. OrdLock listings are not used.

## Reasoning

- It is the same primitive as the provider's offer: one mechanism, two products, no covenant.
- OrdLock v1 listing creation was disabled upstream on 11 September 2026 (`ORDLOCK_CREATE_DISABLED`) pending a replacement.
- OrdLock v2 (`@1sat/templates` 0.1.1, published 27 October 2026) requires `@bsv/sdk` ^4.0.0; this repository pins 3.2.1.
- OrdLock's only extra value here would be visibility in 1Sat's market.

## Consequences

- Listings are visible through the coordinator (`GET /listings`) and optional on-chain records, not in 1Sat's market.
- OrdLock v2 support remains possible once the SDK is upgraded.
