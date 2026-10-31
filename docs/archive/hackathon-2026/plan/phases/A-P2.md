# A-P2 — `verifyLineage`, market builders, hardening (detailed plan)

> Phase 2 of the track file. Priority: **2.1 `verifyLineage` first** (C's redeem check and D's guard DvP are waiting for it). Date: 2026-10-30.

## 1. Dependencies (STATUS)
B, C, D are still in P0 / not started → no stubs needed; A's phase 2 depends only on phase 1. Mainnet (test 7, T8) waits for D.P0.

## 2. `verifyLineage` design (2.1)

```ts
export type TxFetcher = (txid: string) => Promise<Transaction>
export interface LineageOptions { arcadeUrl?: string, wocUrl?: string, fetchTx?: TxFetcher, maxDepth?: number /* 50 */, cache?: LineageCache }
export interface LineageResult { ok: boolean, tokenId?: string, amt?: bigint, ownerPkh?: string, depth: number, reason?: string }
verifyLineage(outpoint, opts): Promise<LineageResult>
arcadeTxFetcher(arcadeUrl, wocUrl?): TxFetcher      // GET /tx/{txid} (raw/EF) → otherwise WoC GET /v1/bsv/main/tx/{txid}/hex
```
Algorithm (without trusting the overlay, the kit's `rules.ts` run locally):
1. Memoised recursion `genuine(outpoint)`. Fetch the tx, **recompute the txid and compare** (refuses fake data).
2. If the output is not BSV-21 → `ok:false`. If it is a `deploy+mint` → genuine (id = its own outpoint).
3. Otherwise: fetch the source tx of each input of the tx; if the source output is a BSV-21 output of the same token, this is a **token input**: (a) the input script is verified with `Spend` (the ancestors' signatures are real too), (b) `genuine(source)` recursively.
4. `identifyAdmissible(tx, previousCoins = indexes of the genuine token inputs)` — `UnknownTokenInputError` → `ok:false`; if the target vout is not in `outputsToAdmit` → `ok:false`.
5. Depth > `maxDepth` → `ok:false, reason:'too deep'`. Cache: outpoint → result (positive and negative).
Note: the kit's rules ignore inputs that **do not belong to the token**, so only inputs of the same token are walked (the plain pledge inputs of a settlement are not walked → fast).

## 3. Market (2.3, 2.4)
- `reserveListing(wallet, kit, tokenId, credits, askSats)`: moves the credits to a P2PKH on `[1,'agentcoop market']` keyID `list <nonce>` (basket `agentcoop listings`, for the same reason as the offer), with an `OP_RETURN list` in the same tx. Change to its own token address.
- `signListing(wallet, outpoint, askSats)`: SINGLE|ACP, in i ↔ out i = askSats → the seller's P2PKH on `[1,'agentcoop market']` keyID `pay <nonce>`. → `Listing`.
- `verifyListing(listing, { sourceTx })` (offline, like `verifyOffer`).
- `buildSweep(wallet, kit, listings[], opts)`: the buyer; `verifyLineage` for each listing (can be turned off with opts), `createAction(inputs = the listings in order with their ready signatures, outputs = the payments in order + Σk credits to the buyer + wallet funding/change)`; submit to the overlay. Returns `{ txid, credits, tx }` (instead of MASTER's `{ plan }`; nobody uses it → §3.4 is updated).
- `cancelListing(wallet, kit, outpoint)`: takes the credits back to its own token address.
- Add `[1,'agentcoop market']` + basket `agentcoop listings` to MASTER §3.2.

## 4. Hardening (2.2, 2.5–2.7)
- 2.2 `verifySettlementPlan(..., { verifyLineage: true, lineage?: LineageOptions })` → input 0 `verifyLineage` ok, `tokenId` and `amt = N`.
- 2.5 fee: done in phase 1 (real size × `fetchChainPolicy`); nothing left.
- 2.6 blacklist / round: `exclude` + `round` exist since phase 1; tested.
- 2.7 error codes: add `LINEAGE_FAILED`, `BAD_LISTING`; the code list into MASTER §3.4.

## 5. Tests
| File | Scenario |
|---|---|
| `packages/core/test/lineage.test.ts` (no network, `ProtoWallet` + a hand-built tx chain, `fetchTx` from a map) | deploy → transfer → split → merge chain ok; amt/ownerPkh correct; a "transfer" forged from plain sats `ok:false`; inflation (output > input) `ok:false`; cross-token `ok:false`; an ancestor with a bad signature `ok:false`; fetched data that does not match its txid `ok:false`; depth limit |
| extra step in `test/skeleton.mockchain.test.ts` | `verifySettlementPlan(..., { verifyLineage: true, lineage: { fetchTx: mockchain } })` passes |
| `test/market.mockchain.test.ts` | after a settlement agent-1 lists 200 credits, 2 listings from agent-2 in one sweep; the buyer's overlay balance; a fake listing (fake credits) gets `LINEAGE_FAILED` in the sweep; cancel |
| mainnet | test 7: `verifyLineage` on a fresh transfer (`scripts/lineage-check.ts <outpoint>`); T8 sweep — after D.P0 |

## 6. Risks
| Risk | Mitigation |
|---|---|
| Arcade may not know old txs it did not broadcast | WoC `/tx/{txid}/hex` fallback; on 429, 3 tries with increasing waits |
| A long lineage (many transfers) is slow | memo + `maxDepth`; a typical AgentCoop lineage is deploy → reserve → settlement (≤ 5) |

## 7. Result (2026-10-30)

- 2.1 `verifyLineage` ✓ (`src/verify/lineage.ts`, `arcadeTxFetcher`), 2.2 `verifySettlementPlan({ verifyLineage: true })` ✓, 2.3/2.4 market ✓ (`src/market/listing.ts`), 2.5/2.6 were done in phase 1, 2.7 error codes in MASTER §3.4.
- Tests: `packages/core/test/lineage.test.ts` (5), `test/market.mockchain.test.ts` (5), a lineage step in skeleton. 49 green in total.
- Deviation from the plan: `buildSweep`'s signature is `(wallet, kit, listings, opts)` and it returns `{ txid, credits, tx }` (MASTER + STATUS updated). The reserve logic moved into a `reserveTokens` helper (shared by offer + listing).
- Open: mainnet validation 7 (`scripts/lineage-check.ts`) and T8 — waiting for funds.
