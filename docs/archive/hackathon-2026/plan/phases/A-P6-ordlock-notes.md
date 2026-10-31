# A-P6 6.1 — OrdLock: what the official sources say (2026-10-30)

> Track A Faz 6.1: "verify the OrdLock format from the source; if it cannot be verified, 6.1–6.3 stop and STATUS says why."
> Everything below was read from the upstream repositories on 2026-10-30; nothing is from memory.

## 1. OrdLock v1 (the format the plan assumed): creation retired

- Source: `BitcoinSchema/js-1sat-ord`, `src/templates/ordLock.ts` (master).
  Script = `oLockPrefix` ‖ `<ordAddress pkh>` ‖ `<payout output>` ‖ `oLockSuffix` (both constants are in that file).
  Purchase unlock: `<serialized outputs> <preimage> OP_0`-style (`purchaseListing`), cancel: `<P2PKH sig> <pubkey> OP_1`.
- **Commit `ba9a705667` (2026-09-11), "OPL-4695: disable OrdLock listing creation":** `lock()` now throws
  `ORDLOCK_CREATE_DISABLED` = "OrdLock listing creation is deprecated pending a replacement contract. Existing listings can still be cancelled or bought."
- README: "js-1sat-ord (deprecated) … Use 1Sat SDK … OrdLock is being deprecated in favor of a more advanced locking contract."

**Result:** the v1 format can be verified, but its upstream maintainers stopped creating it. Building new v1 listings would
ship a deprecated contract.

## 2. OrdLock v2 (the replacement): new and on a newer SDK

- Source: `b-open-io/1sat-sdk`, `packages/templates/src/ordlock/ordlockV2.ts` (720 lines); constants in `@1sat/types`
  (`ORD_LOCK_V2_TEMPLATE`, `ORD_LOCK_V2_PREFIX`, `ORD_LOCK_V2_SLOTS`, `ORD_LOCK_V2_CODESEP_INDEX`, `ORD_LOCK_V2_CANCEL_MARKER`).
- npm: `@1sat/templates` and `@1sat/types` **0.1.1, published 2026-10-27**; peer dependency **`@bsv/sdk ^4.0.0`**
  (this repo pins `@bsv/sdk` 3.2.1, AGENTS.md).
- Design (from the file's own doc comment): Rúnar contract `OrdLockV2Batch`, a compiled template with constructor slots.
  - **purchase:** no signature, unlock `<preimage> OP_0`. An OP_PUSH_TX covenant under SIGHASH_SINGLE|ANYONECANPAY|FORKID:
    output `i` of the spending tx must equal the seller's payout embedded in the listing at input `i`. Several listings per tx.
  - **cancel:** `<"ol2:cancel"> <sig> <pubkey> OP_1`, wallet signs ALL|ANYONECANPAY|FORKID.
  - "The covenant binds the seller's payment, not the buyer's delivery." Layout: front funding inputs, listings, fee inputs;
    outputs: cushion + 0-sat fillers, seller payouts (same index as each listing), buyer receives, change.
- BSV-21: `@1sat/actions` `utils/listingToken.ts` handles listed BSV-21 transfers (`{ id, amt }`), so token listings are in scope.

**Not verified:** whether 1Sat Market / the GorillaPool indexer already shows v2 BSV-21 listings in production; whether the
v2 template can be filled and spent with `@bsv/sdk` 3.2.1 (the script is raw bytes, so probably, but untested).

## 3. Our own market vs OrdLock

Our Faz 2 listings (`SINGLE|ACP`, `market/listing.ts`) already give "pay me X at this index for these credits" with the
seller's signature, buyer-side `verifyLineage` before paying, and one-tx sweeps. OrdLock's only extra value is
**visibility in 1Sat's market and indexer**.

## 4. Relevance to 6.6 (covenant vault research)

OrdLock v2 is a production OP_PUSH_TX covenant on BSV (Chronicle-era) that enforces "output i equals X" without a signature:
the same primitive a guard-less vault needs ("outputs only to an allowlisted payScript, change back to the same script").
Its template size and the preimage-in-unlock cost are a direct data point for the covenant report.
