# B-P6b — The mock-chain part of phase 6: offer on chain, second coordinator, 50/100 participants

> Track B. `plan/track-B-overlay-coordinator.md` phase 6.1, 6.2, 6.5, 6.6. By user decision, on the mock chain, without waiting for S3. The mainnet parts (coordinator 2's mainnet settlement, a mainnet T5 with ≥ 50 participants) need D's sats and C's agent fleet.
> Written: 30.10 evening, after B-P5a. `git pull` done; no new commit from another track.

## 1. Offer on chain (6.1) — MASTER §3.2 `offer` op, §3.8 `offers` query

- Record: `OP_FALSE OP_RETURN "agentcoop" "offer" { v:'1', poolId, unlockingScriptHex }`, 0 sat, a separate small tx (the signature spends an output of the pool tx itself, so it cannot be in the same tx). The terms and the locking script are already on chain.
- Core (additions only): `offer` in `COOP_OPS`; `packages/core/src/pool/offerRecord.ts` → `publishOffer`, `offerFromRecord`, `offerRecordOf`.
- Overlay: the record is admitted after a structural check; `{ op:'offers', poolId }` returns all of them (unverified: anyone can publish one).
- Coordinator `src/offers.ts` `OfferSource`: its own store first, otherwise the on-chain records → `offerFromRecord` + `verifyOffer` → the first valid one is stored. The terms are built from the pool view **with the `PoolTerms` keys only** (the on-chain record's `nonce` is not in the signed terms), so the `termsHash` equals what the provider signed. The engine looks for one for every open pool (if none is found, again after 15 s; immediately on an overlay event). The audit accepts a settled pool's offer without the "open" condition.
- For C: `provider-cli open-pool` should `publishOffer` + submit to the overlay after `signOffer` (POST /offers still happens).

## 2. Second coordinator (6.2)

Same code, separate DB, same overlay. `infra/run.mjs` starts the second one with `COOP2_PORT` (the Caddy `COOP2_HOST` block is commented out). Test `e2e.second-coordinator.mockchain.test.ts`: C1 closes pool B → C1 shuts down → C2 audits pool B from the chain alone (`consistent`, `termsHashMatches`, the offer byte for byte the same) → pool A's offer exists only on chain (after a bogus record) → C2 finds it, runs the round, settles; `/metrics` counts both settlements.

## 3. Scale (6.5, 6.6)

`e2e.scale.mockchain.test.ts`: every participant a separate wallet-toolbox wallet, a proven WS, A's `verifySettlementPlan` (lineage included) + `signSettlementInput`. Results in STATUS. 6.6: the plan is serialized once per round. Problem found: with 100 participants, lookups racing overlay-express's keep-alive socket close got `ECONNRESET` → `OverlayLookup.lookup` retries twice on a socket error.

## 4. Acceptance (mock chain)

Two coordinators on the same overlay; C2 closed a pool with the on-chain offer and audited C1's settlement; 50 and 100 participants in one settlement, `consistent`, 100 sat/kB; root `npm test` and typecheck clean.
