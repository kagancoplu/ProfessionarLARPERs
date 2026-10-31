# E-P2 — Participant and provider flows (real transactions with Desktop)

> Track E phase 2 (`plan/track-E-frontend.md` §8 phase 2). Author: E, 2026-10-30 20:10 CET. Time box 4 hours. Branch `main`. Previous: `E-P1.md` (✅ `76fc8da`).

## 0. Goal
A person joins a pool from the browser with BSV Desktop (T3), completes the signing round with one click (taking part in T5), receives their credits (settlement), redeems them (T6) and runs a job (T7, 402); a provider mints credits (T1), opens a pool (T2), cancels it and collects revenue. The **B2 requirement** ("user-facing flows via BSV wallets") closes here. In mock, the same flows end to end with a fake Desktop.

## 1. Dependencies (20:10)
| | Status | In P2 |
|---|---|---|
| A core | `main`: `buildPledge/cancelPledge/verifySettlementPlan/signSettlementInput/internalizeSettlement/P2pkhWalletSigner/TokenKit/buildReserveAndAnnounce/signOffer/publishOffer/cancelPool/receivePkh` | wrapped by `wallet/flows/live.ts` |
| B coordinator | **`hello` now requires a proof** (`challenge { nonce }` → `hello { identity, poolIds, sig }`, `sig` = `createSignature` over `"agentcoop hello\n<host>\n<nonce>"`, `[1,'agentcoop hello']`, keyID `'1'`, `'anyone'`); `GET /pools?pledges=1`; `GET /offers/:poolId` | the adapter handles `challenge`; host = `location.host` behind the proxy (Vite `changeOrigin:false`), the coop URL's host when published |
| C provider-api | BRC-105; **no CORS** → Vite proxy locally; `AuthFetch` in the browser (BRC-103 headers pass through the proxy) | `redeem { beef, outputIndex }`, `POST /v1/jobs`, `/v1/credits/balance`, `/v1/credits/return`, `/v1/catalog` |
| D guard | on `main` | P3 |
| Human | Desktop (mainnet) + sats | mainnet acceptance (T3, taking part in T5, T6, T7; T1, T2) |

## 2. Design
- **One interface, two implementations:** `wallet/flows/types.ts` `FlowsApi`; `flows/live.ts` (real wallet + core + AuthFetch), `flows/mock.ts` (fake Desktop approval + mock world + events). The UI sees only `useFlows()`. In mock, `mock_` txids, no chain.
- **Step log:** every flow publishes `flow_step { flow, step, status, ms, detail, txid }` events → the "Under the hood" panel (plain language + protocol label + ms + link).
- **My pledges** (`wallet/mine.ts`, zustand, localStorage `agentcoop.mine.<identity>`): `{ poolId, outpoint, credits, tokenIndex, instructions, status, plan?, settledTxid? }`. In live mode also recovered from the Desktop basket (`agentcoop`, customInstructions).
- **Signing centre:** `sign_request` (coordinator, proven hello) → notification + countdown card → "Review & sign" → `reviewSignRequest` (`verifySettlementPlan` + `verifyLineage` → checklist: my credits, my change, Σ = N, hash, lineage) → "Sign" → `signSettlementInput` (SIGHASH_ALL, Desktop `createSignature`) → `sign_response`; "Reject" → `sign_reject { reason }`. `settled` → `internalizeSettlement` + `TokenKit.sync()`.
- **Participant screen `/me`:** pledge form ("Join" on Pools opens it too), my pledges, signing centre, my credits (TokenKit overlay/basket), redeem (≤ `maxRedeem`), run a job (kind, minutes; price preview: 0 if prepaid minutes suffice, otherwise 402 sats), job card (log), return.
- **Provider `/provider`:** mint (sym, amt, dec → tokenId, a "write it into C's products/*.json" note), open a pool (credits, price, deadline +blocks, fee, min, label; sats/credit + discount `demo pricing`), my pools, cancel, revenue (sync + sweep), usage (catalog).
- **Town:** when a wallet connects, a "you" villager (visitor); a human pledge → walks to the board; mint → workshop sign; pool opened → board.
- **Desktop approval points:** pledge 1 (`createAction`), signature 1 (`createSignature`), cancel 1, redeem 1 (`TokenKit.send`), 402 job 0–1 (`AuthFetch`), mint 1, open pool 2 (reserve+announce `createAction`, offer `createSignature`) + `publishOffer` 1, cancel pool 1, sweep 1. Each one written on the scroll in advance.

## 3. Tests
Unit: `flows-mock.test.ts` (pledge → sign_request → sign → settled with me → credits → redeem → job → return; reject; cancel), `mine.test.ts` (persistence), `hello.test.ts` (proof data format). RTL: `participant.test.tsx` (Join → approve → "My pledges"), `provider.test.tsx` (mint → tokenId). e2e `participant.spec.ts` and `provider.spec.ts` (mock Desktop approvals included).
**Mainnet acceptance (human):** with a member who has Desktop, T3 + taking part in T5 + T6 + T7; provider T1 + T2. txids in STATUS "Mainnet transactions".

## 4. Risks
| Risk | Plan |
|---|---|
| `hello` host mismatch (proxy) | `changeOrigin:false` + `location.host`; the URL host when published; STATUS note to B |
| AuthFetch in the browser cannot pay the 402 (CORS/expose headers) | proxy locally; CORS from C when published (request open) |
| `verifyLineage` in the browser goes to Arcade (CORS open ✓), the WoC fallback hits 429 | cache + an explicit error instead of a "lineage skipped" warning |
| Too many Desktop approvals | counted on the scroll in advance; merging considered once A's test 3 result arrives |

## 5. Checkpoint (end of phase 2, 30.10 21:00)

**Acceptance evidence (mock)**
- `wallet/flows/`: `types.ts` (`FlowsApi`), `live.ts` (BSV Desktop + core: `buildPledge`/`cancelPledge`/`verifySettlementPlan`+`verifyLineage`/`signSettlementInput`/`internalizeSettlement`/`TokenKit.sync`/`TokenKit.send`+`/v1/credits/redeem`/`AuthFetch` 402/`kit.deploy`/`buildReserveAndAnnounce`+`signOffer`+`POST /offers`+`publishOffer`/`cancelPool`/revenue `internalizeAction`+`signWalletP2pkhInput` sweep), `mock.ts` (same interface, fake Desktop approvals, mock world), `steps.ts` (`flow_step` events → "Under the hood"), `mine.ts` (my pledge/pool records, per identity, localStorage + in-memory fallback), `hello.ts` (the B-P5a proof), `SignCenter.tsx` (countdown card → review scroll: 5 checks → Sign/Reject).
- The coordinator adapter sends `hello { identity, poolIds, sig }` on `challenge { nonce }` (`createSignature`, `[1,'agentcoop hello']`, keyID `'1'`, `'anyone'`); host = `location.host` behind the Vite proxy (`changeOrigin:false`), the coop URL's host when published.
- The `/me` participant page (join → scroll: coin/fee/approval count → Desktop → my pledges → signing centre → my credits → redeem ≤ 20 → job (0 sat prepaid / 402) → return), `/provider` (mint → tokenId note, open pool: sats/credit + discount + approval count, my pools + cancel, revenue sync/sweep), the "Under the hood" panel on both. Town: a "you" visitor at the gate when a wallet connects; a human pledge walks to the board.
- The mock scenario knows the human: at lock-in a `sign_request` (the plan resizes the last agent's share so Σ = N), the settlement waits 60 s for the human's signature, a 4-participant settlement if they sign (credits arrive), "left out" if they reject or are late (the coin stays).
- Tests: web vitest **18 files / 50 tests** (flows-mock: pledge→sign→settle→redeem→job→return, withdraw/reject/left-out, provider mint→open→cancel; hello; mine), **44** inside the root `npm test`; Playwright **4/4** (smoke, jury, **participant tour**, **provider tour**); web + root typecheck clean; first-load build ≈ 1.4 MB (index 605 kB + sdk 830 kB). Anti-slop grep clean; every input labelled.

**Mainnet acceptance (human, not done yet):** with a member who has Desktop: `PORT=5178 OVERLAY_URL=… npm run web` + `node infra/run.mjs` + `npm run provider` → `/provider` mint (T1) + open pool (T2); `/me` join (T3) → agents (`npm run agents`) → signing round (taking part in T5) → redeem (T6) → 402 job (T7). txids in STATUS "Mainnet transactions". **Not tried in live mode:** `AuthFetch` from the browser to provider-api (CORS/proxy; the request to C for expose headers is open), `verifyLineage` from the browser to Arcade/WoC, `publishOffer`.

**Checkpoint questions**
1. Is the plan still good? Yes. The Desktop approval counts are on the scroll in the flows (pledge 1, signature 1, redeem 1, 402 0–1, mint 1, open pool 2+1, sweep 1); merging considered once A's test 3 result arrives.
2. Phase done (mock) → STATUS Track E.
3. Other tracks: D guard on `main` ✓ (ready for P3); A market builders ✓; C agent decisions do not stream live (no SSE).
4. P3 dependencies: D.P1/P2 (on `main`), B.P3 listings/vaults (exist), C.P3 vault agent (none → mock).
5. Interface: note to B — the `hello` proof is implemented; behind the proxy the host is `location.host` (STATUS).
