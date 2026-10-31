# B-P2 — Coordinator: lock-in, signing round, broadcast (→ S2)

> Track B, phase 2. Source: `plan/track-B-overlay-coordinator.md` phase 2, MASTER §3.2 (ordering, 120 %, 3 rounds, 60 s), §3.4, §3.5 (WS), FINAL-IDEA §4.3–4.5.
> Written: 30.10 ~16:34. Branch `trackB`. Node 22.

## 1. Goal

When a pool fills, the coordinator: (1) has the deterministic plan built, (2) collects a signature from each participant over WS, (3) tries at most 3 rounds (an outpoint that does not sign is blacklisted and replaced from the waiting list), (4) when the signatures are complete, broadcasts the settlement to Arcade and submits it to the overlay. For an unfilled pool past its deadline it publishes `pool_failed` and broadcasts nothing. At no stage does the coordinator hold a key that controls money or funds.

## 2. State of the dependencies (16:34)

| Dependency | Status | What I do |
|---|---|---|
| A.P1 `planSettlement`, `assembleSettlement`, `broadcastEF` | None (A has not started) | The coordinator uses these three through an **injected interface** (`SettlementProtocol`); I do not write my own `planSettlement` into product code (no duplicated code). In tests, `test/helpers/devProtocol.ts` (test only) implements it. When A arrives, a 20-line adapter in `src/protocol.ts` binds A's functions |
| A.P1 `verifySettlementPlan` (participant side) | None | Test participants do a minimal check (are my input and credit output there). The real verification is in C's agents with A's function |
| C.P2 agents (WS client) | None | A test participant bot (`test/helpers/participant.ts`): a wallet-toolbox wallet + WS; behaviours: sign / stay silent / reject / bad signature |
| Root workspace (A.P0) | None | the phase 1 layout continues (a standalone package); the migration is in Blockers |

## 3. Design

### 3.1 `SettlementProtocol` (injected; `apps/coordinator/src/protocol.ts`)

```ts
interface PledgeCandidate { view: PledgeView; sourceTx: Transaction }   // from the overlay, ordered
interface PlanRequest { offer: Offer; creditSourceTx: Transaction; pledges: PledgeCandidate[]; round: number; exclude: string[]; height?: number }
interface SettlementProtocol {
  planSettlement (req: PlanRequest): Promise<SettlementPlan>             // A: planSettlement(offer, pledges, chain)
  assembleSettlement (plan, offer, scripts: Map<inputIndex, hex>): Transaction  // A: assembleSettlement(plan, unlockingScripts)
  broadcast (tx): Promise<string>                                        // A: broadcastEF(tx, ARCADE_URL)
}
```
Without a protocol, the coordinator runs only as the side API + feed (phase 1 behaviour) and `/healthz` returns `engine: false`.

### 3.2 State machine (per pool)

```
open ──(offer present ∧ valid unspent pledges ≥ N ∧ height < deadline ∧ no round)──▶ locking (round r)
locking ──(every input validly signed)──▶ assemble → broadcast → overlay submit ──▶ settled  (WS: settled)
locking ──(timeout / sign_reject / bad signature / offline)──▶ the missing outpoints blacklisted (WS: round_failed)
        ──▶ round r+1 immediately if r < 3;  open if r = 3 (the pool does not die; the counter resets when the pledge set changes)
open ──(height ≥ deadline)──▶ failed (WS: pool_failed, once; no broadcast)
```

- **Round start:** valid + unspent pledges from the overlay (ordered, with their BEEFs) → blacklisted ones removed → a **WoC bulk spent check** (`POST /v1/bsv/{net}/utxos/spent`, groups of 20; spent = blacklisted as `spent`) → no round if the total < N → `planSettlement` → the offer signature is put on the template's in0 and **checked with `Spend`** (if the planner broke version/lockTime/sequence, it is caught before the round starts) → `sign_request { poolId, round, plan, yourInputIndex }` to each participant's WS session. A participant without a session is "offline" at once.
- **Response:** `sign_response { poolId, round, inputIndex, unlockingScriptHex }` is accepted only from a session that said `hello` with that input's `participant` identity; the signature is checked on the template with `Spend`; if invalid, that input is "bad signature". `sign_reject { poolId, round, reason }` marks that participant's input "rejected: reason".
- **Round end:** evaluated once every input is resolved (or after `ROUND_TIMEOUT_MS`, default 60 s). A broadcast error also counts as a round failure (`round_failed` + log; only inputs WoC reports as spent are blacklisted).
- **Blacklist:** per pool `outpoint → reason`; persists across rounds (in memory; reset if the coordinator restarts; phase 3.5 makes it persistent).

### 3.3 WS messages (MASTER §3.5, no change)

To the client: `sign_request`, `round_failed { poolId, round, missing: outpoint[] }`, `settled { poolId, txid }`, `pool_failed { poolId }`. To the server: `sign_response`, `sign_reject`. `round_failed`, `settled` and `pool_failed` are broadcast to the pool's subscribers.

### 3.4 API addition (added to MASTER §3.5)

`coordinator: { round, signed, total, blacklist: [{ outpoint, reason }], lastRound?: { round, outcome: 'settled'|'failed', missing, txid? } }` in the `GET /pools/:id` response (absent if the pool never had a round). `/healthz` → `engine: true|false`.

### 3.5 Logs
Every decision is one JSON line (`{ t, poolId, event, ... }`): `round_start`, `sign_ok`, `sign_bad`, `sign_reject`, `round_failed`, `broadcast`, `settled`, `gave_up`, `pool_failed`, `plan_failed`, `offer_invalid_for_plan`. For the video and debugging.

### 3.6 Coordinator wallet (2.7) — plan change
In the WS-only PoC the coordinator **needs no key at all** (it collects signatures and broadcasts; an Arcade broadcast needs no identity). `WALLET_COORDINATOR_KEY` would only be needed for a MessageBox fallback (optional, not in phase 2) and the `hello` identity proof in phase 5. The non-custodial claim gets stronger: "the coordinator has neither money nor a key that controls funds".

## 4. Files

```
apps/coordinator/src/
├─ protocol.ts     SettlementProtocol, PlanRequest, PledgeCandidate (+ room for the A adapter)
├─ engine.ts       CoordinatorEngine: tick, startRound, onSignResponse/Reject, finish, status
├─ spent.ts        SpentChecker; WocSpentChecker (bulk, groups of 20); NoSpentChecker
├─ script.ts       inputIsValid(tx, i) (Spend)
├─ log.ts          JSON line logger
├─ ws.ts           sign_response / sign_reject → engine
├─ api.ts          the coordinator field, locking from the engine
└─ server.ts       engine setup (if a protocol is given), env: ROUND_TIMEOUT_MS, MAX_ROUNDS, SPENT_CHECK=woc|none
packages/overlay/src/stub/types.ts   + SettlementPlan (a copy of MASTER §3.3)
apps/coordinator/test/
├─ helpers/devProtocol.ts   TEST ONLY: plan (ordered, partial last share), assemble, mock broadcast
├─ helpers/participant.ts   WS participant bot (sign | silent | reject | garbage)
└─ e2e.coordinator.mockchain.test.ts
```

## 5. Test scenarios (`e2e.coordinator.mockchain.test.ts`, round timeout 1.5 s)

1. **Happy path:** N=1000; a1 600 + a2 400 sign → settlement in round 1; WS `settled`; overlay `settled`; credit balances right.
2. **Waiting list:** a1 600, a2 300, a3 100 (silent), a4 200 → round 1 fails (`round_failed`, missing = a3), round 2: a1 600 + a2 300 + a4 **100 (partial)** → settled; `coordinator.blacklist` shows a3 with `timeout`.
3. **Bad signature and rejection:** in round 1 one participant sends a garbage signature, one sends `sign_reject` → both blacklisted, with their reasons.
4. **3-round limit:** participants that always stay silent without enough of a waiting list → `open` after 3 rounds, a `gave_up` log, no broadcast.
5. **Unfilled pool:** 500/1000, the height passes the deadline → WS `pool_failed` **once**, API `failed`, no broadcast.
6. **Someone else's signature:** a `sign_response` for a1's input from a2's session is refused.

## 6. Acceptance and evidence

| Acceptance | Evidence |
|---|---|
| Coordinator round, blacklist, waiting list, 3 rounds, unfilled pool | tests 1–6 green |
| A settlement built by the coordinator on mainnet (T5) + an unfilled pool | **A.P1 (the real `planSettlement`) + C.P2 (agents) + D (sats)** → Blocker |

## 7. Error cases

| Case | Behaviour |
|---|---|
| `planSettlement` throws (e.g. not enough pledges) | a `plan_failed` log, no round, retried on the next tick |
| The offer signature is invalid on the template | `offer_invalid_for_plan`, no round (a planner bug; to A) |
| WoC unreachable / 429 | spentness counted as "unknown"; a failed broadcast is a round failure |
| Broadcast error | `round_failed`, the round counts, inputs WoC reports as spent are blacklisted |
| Overlay submit error (after the broadcast) | log + retry (3×); the tx is on chain, so the `settled` WS is still sent |
| The coordinator restarts | open rounds are lost → pools `open`; the next tick opens a new round (phase 3.5 persistence) |

## 8. Result (16:43)

Mock-chain acceptance done: coordinator 10/10 (P1's 5 + P2's 5; 6 scenarios), overlay 15/15; no flakiness over two consecutive runs. Differences from the plan:
- In the tests the pledges are mined in separate blocks and given to the overlay with merkle paths; this also tests the `(height, txid)` ordering and makes the round composition deterministic.
- Scenario 6 (signing someone else's input) is inside scenario 1.
- No coordinator wallet (§3.6); `WALLET_COORDINATOR_KEY` is not needed until phase 5.
- Mainnet acceptance waits for A.P1 (the real `planSettlement`, `broadcastEF`), C.P2 (agents) and D (sats). A's functions will be bound to `SettlementProtocol` in `apps/coordinator/src/server.ts`.
