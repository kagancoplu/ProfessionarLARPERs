# B-P1 — `tm_agentcoop` indexing + side API (offers, pools, WS) (→ S1)

> Track B, phase 1. Source: `plan/track-B-overlay-coordinator.md` phase 1, MASTER §3.2/§3.3/§3.5/§3.8, FINAL-IDEA §4.3–4.5.
> Written: 30.10 ~16:18. Branch `trackB`. Node 22.

## 1. Goal

1. Pool announcements (T2), pledges (T3), pledge cancellations (T4) and settlements (T5) are counted **from the chain**: `ls_agentcoop` returns the pools, their progress (`pledgedCredits`) and their status (`open/settled/cancelled`).
2. A side API for A's skeleton and C's agents (`apps/coordinator`, :8090): `POST/GET /offers`, `GET /pools`, `/pools/:id`, `/pools/:id/pledges`, `WS /ws` (`hello`, `pool_update`).
3. An end-to-end mock-chain test: pool → 2 pledges → offer record → 1 cancellation → a new pledge → settlement → `GET /pools/:id` = `settled`.

## 2. State of the dependencies (16:18)

| Dependency | Status | What I do |
|---|---|---|
| A.P0 `types.ts`, `opreturn.ts` (`buildOpReturn/parseOpReturn`) | None (A has not pushed) | `packages/overlay/src/stub/{types,opreturn}.ts`: a **temporary copy** of the MASTER §3.3 types and the §3.2 envelope. Deleted when A arrives, the import goes back to `@agentcoop/core` |
| A.P1 builders (`buildReserveAndAnnounce`, `buildPledge`, `signOffer`, `planSettlement`…) | None | In tests, B-P0's `test/helpers/settlement.ts` is extended (test only). The format follows the tx layout in MASTER §3.3 exactly |
| A.P1 `verifyOffer` | None | `apps/coordinator/src/verifyOffer.ts`: verifies the SINGLE\|ACP signature with the SDK's `Spend`. Replaced when A's arrives |
| A's `scripts/skeleton.ts` + D.P0 funding (1.6, mainnet) | None | The mainnet part of the acceptance depends on A.P1 + D.P0 → Blocker. The end-to-end mock-chain test mimics the skeleton flow exactly |
| Root workspace | None | `apps/coordinator` is a standalone package too. In tests the overlay runs in the same process; for one SDK copy the coordinator's `vitest.config.ts` uses `resolve.dedupe` |

## 3. Design decisions (and why)

### 3.1 OP_RETURN record outputs **are admitted**
The engine resolves each `(txid, outputIndex)` in a lookup answer from its store to a BEEF (`Engine.lookup` → `loadOutputWithBEEF`; a result that is not found is **skipped**). So the only way to make a pool, a pledge or a settlement queryable is to have an output of the record admitted. Every structurally valid OP_RETURN output carrying the `agentcoop` envelope is admitted (0 sat, never spent, harmless in the store). Each record tx (pool/pledge/settle/list/vault; offer in phase 6) is thus indexable on its own.

### 3.2 Lookup in `whole-tx` mode
`admissionMode = 'whole-tx'`: the lookup gets the whole tx (AtomicBEEF) for each admitted output, so it sees the OP_RETURN, the inputs and the other outputs. `spendNotificationMode = 'txid'` (like the kit).

### 3.3 The topic manager is structural, the lookup semantic
The topic manager is stateless (no DB access): it runs the kit's token rules unchanged and checks the records **structurally**. The check "does this pledge fit its pool's terms" is done **at query time** in the lookup (independent of the order in which the pool and the pledge reach the overlay; a pledge counts correctly even if it arrives before its pool).

| Record (`op`) | The topic manager admits (structural condition) | The lookup indexes |
|---|---|---|
| `pool` | the OP_RETURN (valid json, required fields strings) | `pools`: `poolId = ${txid}_0`; out0 being BSV-21, `id = terms.tokenId`, `amt = terms.credits` checked at query time (`invalidReason`) |
| `pledge` | out0 (the pledge coin; P2PKH if `signer='p2pkh'`), the OP_RETURN | `pledges`: out0 sats, out1 sats + script, participant, credits, tokenIndex, signer, height (if the BEEF has a merklePath) |
| `settle` | the OP_RETURN | `settlements`: valid only if **in0 = the poolId outpoint**; the pool `settled` |
| `list`, `vault` | the OP_RETURN | raw json (structured in phase 3) |
| credit outputs | the kit rules (unchanged) | the kit tables |

`coinsToRetain` = **all of `previousCoins`** (token inputs + pledge coins + other records). The B.P0 finding: the engine deletes those not retained. The kit rule not retaining an "unrelated token input" thereby keeps history (harmless; it stays spent).

### 3.4 Statuses
The overlay says what it knows from the chain: `open` (the credit UTXO unspent), `settled` (a valid settle record exists), `cancelled` (the credit UTXO spent by a tx other than a settlement). `failed` (height ≥ `deadlineHeight` and no settle) and `locking` (the coordinator's round is running) are derived in the side API: the overlay need not know the height.

### 3.5 The pledge validity rule (at query time; written into MASTER §3.8)
A pledge counts ⇔ the pool exists and is `open`; `minCredits ≤ credits ≤ N`; `out1.satoshis ≥ feeSats` and `out1.script = payScriptHex`; `out0.satoshis ≥ ceil(credits × priceSats / N) + 1` (the share + the 1-sat credit output; the miner fee share comes out of the change, and the coordinator puts the ones that fall short on the waiting list when planning). `pledgedCredits = Σ` the `credits` of valid unspent pledges. Invalid pledges come back with `invalidReason` (the agent/person sees why it does not count).

### 3.6 Offers at the coordinator, not on the overlay
Track file 1.2 lists an `offers` table on the overlay, but in phase 1 the offer is not on chain (`POST /offers`). Offers live in `apps/coordinator`'s own SQLite (`data/coordinator.db`). If phase 6.1 (an on-chain `offer` record) is accepted, they move to the overlay.

## 4. Interface changes (MASTER §3 first, then STATUS)

1. **§3.3 `PoolTerms` cannot carry `poolId` on chain:** `poolId` = the pool tx's `${txid}_0`; a tx cannot contain its own txid. The OP_RETURN `pool` json has **no** `poolId`, the overlay derives it; `PoolTerms.poolId` stays filled in off-chain objects (Offer, API answers).
2. **§3.5 `status`:** `open | locking | settled | failed | cancelled` (`cancelled` added).
3. **§3.8:** the `context` fields of the query answers and the pledge validity rule (§3.5 above) are written down; `{ op:'pledges', poolId, includeSpent?, includeInvalid? }`.
4. **Note to A (MASTER §3.4 `cancelPledge`):** the cancellation tx must be submitted to `tm_agentcoop`; otherwise the overlay counts the pledge as live (the coordinator still checks spentness with Arcade at lock-in, phase 2.1).

## 5. Files

```
packages/overlay/src/
├─ stub/types.ts            TEMPORARY: MASTER §3.3 PoolTerms, PledgeRecord (+ SettleRecord)
├─ stub/opreturn.ts         TEMPORARY: buildOpReturn / parseOpReturn (the MASTER §3.2 envelope)
├─ records.ts               record json validators (string fields, required fields) — shared by the topic manager and the lookup
├─ AgentCoopTopicManager.ts kit rules + records (§3.3)
└─ AgentCoopLookupService.ts whole-tx; tables + queries (§6)

apps/coordinator/           a standalone package (@agentcoop/coordinator)
├─ package.json, package-lock.json, tsconfig.json, vitest.config.ts (dedupe), .gitignore, README.md
├─ src/
│  ├─ config.ts             env: PORT=8090, OVERLAY_URL, ARCADE_URL, COORDINATOR_DB
│  ├─ overlay.ts            ls_agentcoop HTTP client (pools/pool/pledges/outpoint)
│  ├─ chain.ts              height (Arcade /chaintracks/v2/height, 30 s cache; injected in tests)
│  ├─ verifyOffer.ts        TEMPORARY (until A's verifyOffer arrives)
│  ├─ store.ts              offers table (knex/better-sqlite3)
│  ├─ api.ts                Express router: /offers, /pools…
│  ├─ ws.ts                 /ws: hello, pool_update (5 s poll, publish only what changed)
│  └─ server.ts             createCoordinatorServer(opts) + main
└─ test/
   └─ e2e.pools.mockchain.test.ts
packages/overlay/test/
└─ overlay.agentcoop.test.ts  the overlay's own indexing tests
```

## 6. Overlay schema and queries

| Table | Columns |
|---|---|
| `agentcoop_pools` | `pool_id` PK, `txid`, `record_vout`, `provider`, `token_id`, `credits`, `price_sats`, `fee_sats`, `min_credits`, `deadline_height`, `pay_script_hex`, `label`, `terms` (json), `credit_amt`, `credit_token_id` (from out0), `status`, `spending_txid`, `settled_txid`, `created_height`, `created_at` |
| `agentcoop_pledges` | `outpoint` PK (`txid_vout`), `txid`, `vout`, `record_vout`, `pool_id` idx, `participant`, `credits`, `token_index`, `signer`, `coin_sats`, `fee_out_sats`, `fee_out_script_hex`, `height`, `spent`, `spending_txid`, `created_at` |
| `agentcoop_settlements` | `txid` PK, `record_vout`, `pool_id` idx, `pledge_list_hash`, `inputs` (json list of outpoints), `created_at` |
| `agentcoop_records` | `txid`, `vout` PK; `op`, `json` (raw list/vault records, phase 3) |

| Query | Returns (output → `context`) |
|---|---|
| `{ op:'pools', status? }` | each pool's record output → `PoolView` |
| `{ op:'pool', poolId }` | one pool → `PoolView` |
| `{ op:'pledges', poolId, includeSpent?, includeInvalid? }` | pledge coin outputs → `PledgeView` (order: `height` asc, null last, then `txid`) |
| `{ op:'settlement', poolId }` | the settle record output → `{ poolId, txid, pledgeListHash, inputs }` |
| kit queries | unchanged |

`PoolView = { poolId, txid, terms (with poolId), status, pledgedCredits, pledgeCount, target, settledTxid?, spendingTxid?, createdHeight?, invalidReason? }`
`PledgeView = { outpoint, txid, vout, poolId, participant, credits, tokenIndex, signer, coinSats, height?, spent, spendingTxid?, valid, invalidReason? }`

## 7. Side API and WS

| Method | Path | Behaviour / errors |
|---|---|---|
| `POST` | `/offers` | body `Offer`. Verifies: the pool is `open` and valid on the overlay; `offer.lockingScriptHex/satoshis` = the pool's credit UTXO; the signature byte `0xC3` (SINGLE\|ACP\|FORKID); `Spend.validate()` passes with input 0 + output 0 (`payScriptHex`, `priceSats`); `offer.terms` equal the terms on the overlay (the overlay's are authoritative). `201` / `400 {code,error}` / `404` no pool / `409` pool closed |
| `GET` | `/offers/:poolId` | `200 Offer` / `404` |
| `GET` | `/pools` | `PoolView[]` + the derived `status` (`failed`, `locking`) + `hasOffer` |
| `GET` | `/pools/:poolId` | one `PoolView` |
| `GET` | `/pools/:poolId/pledges` | valid + unspent pledges (`?all=1` all of them) |
| `GET` | `/healthz` | overlay reachability, height |
| `WS` | `/ws` | `hello { identity, poolIds[] }` → `{ type:'hello_ack' }`; the server reads the pools every 5 s and publishes `pool_update` for a pool whose `pledgedCredits`/`status` changed (only those pools to clients that gave poolIds in hello; everything for an empty list) |

## 8. Test scenarios

**`packages/overlay/test/overlay.agentcoop.test.ts`** (mock chain, overlay only):
1. A pool tx (deploy → N credits to itself + OP_RETURN pool) → `pools` has 1 pool, `open`, `pledgedCredits 0`, the out0 check passes.
2. Two pledges (600 + 400) → `pledgedCredits 1000`; one pays too small a registration fee → `valid:false, invalidReason`; not counted.
3. If a pledge is submitted **before** its pool (the pool later), the query is still right (order-independent).
4. Cancellation (T4): the pledge coin is spent → `spent:true`, `pledgedCredits` drops, it stays in history with `includeSpent`.
5. Settlement → `status settled`, `settledTxid`, the `settlement` query; the pledges `spent` + `spendingTxid = settlement`.
6. A fake settle record (in0 not the pool) → the pool stays `open`.
7. The pool's credit UTXO is spent by another tx → `cancelled`.

**`apps/coordinator/test/e2e.pools.mockchain.test.ts`**: overlay + side API + WS in the same process; the provider's offer `POST /offers` (valid → 201; a fake signature → 400; an offer signed with ALL → 400), a WS client receives `pool_update`, after the settlement `GET /pools/:id` → `settled`.

## 9. Acceptance and evidence

| Acceptance | Evidence |
|---|---|
| The records are counted from the chain | overlay tests 1–7 green |
| The side API works | coordinator e2e green; `npm run coordinator` → curl examples in the README |
| The mainnet skeleton settlement is `settled` on the overlay | **depends on A.P1 + D.P0** (Blocker). When A connects the skeleton to `POST /offers` + `tm_agentcoop`, the txid into STATUS |

## 10. Error cases

| Case | Behaviour |
|---|---|
| A record's json is broken / a number is not a string | the topic manager does not admit the OP_RETURN; the tx's other (token) outputs are judged by the kit rule |
| The pledge's pool is unknown | admitted, `valid:false, invalidReason:'unknown pool'` in the query |
| The overlay is unreachable (side API) | `502 {code:'OVERLAY_UNAVAILABLE'}`; the WS poll moves silently to the next round |
| The Arcade height cannot be fetched | the last known height; if none, `failed` is not derived (the status stays `open`) and `heightUnknown:true` |

## 11. Result (16:30)

Mock-chain acceptance done: overlay 15/15 (P0's 8 + P1's 7), coordinator e2e 5/5. Differences from the plan:
- The view types moved to `packages/overlay/src/views.ts` (no runtime import), so the coordinator and C's agents can use the types without pulling in an SDK copy.
- The coordinator tests start the overlay in the same process; for one SDK copy `vitest.config.ts` uses `resolve.dedupe` (unnecessary once the root workspace arrives).
- A new interface note (MASTER §3.2): the offer signature fixes the settlement's `version`, `lockTime` and in0 `sequence`.
- The mainnet acceptance (A's skeleton settlement `settled`) waits for A.P1 + D.P0.
