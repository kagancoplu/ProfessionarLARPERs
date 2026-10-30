# @agentcoop/coordinator

The AgentCoop coordinator and side API (MASTER §3.5). It reads pools and pledges from the overlay (`ls_agentcoop`), stores providers' pre-signed offers, pushes live pool progress over WebSocket, and runs the lock-in: signing rounds over WebSocket, then the broadcast of the settlement.

**It holds no funds and no keys.** An offer is the provider's `SIGHASH_SINGLE|ANYONECANPAY` signature: it can only ever pay the provider its price at output 0. Every participant checks the whole settlement and signs `SIGHASH_ALL`, so the coordinator cannot change any output. Anyone can run a coordinator (FINAL-IDEA §4.5).

Status: **Track B, Faz 2** (mock chain). Signing rounds run once Track A's protocol is plugged in (see below).

## Run

Node 22 or newer (`nvm use 22`). Start the overlay first (`packages/overlay`, `npm run overlay`).

```bash
cd apps/coordinator
npm install
npm run coordinator      # http://localhost:8090, WS ws://localhost:8090/ws
npm test                 # mock chain: overlay + API + WS + signing rounds end to end
```

| Variable | Default | Meaning |
|---|---|---|
| `PORT` | `8090` | `COOP_API_URL` in the root `.env` |
| `OVERLAY_URL` | `http://localhost:8080` | overlay to read |
| `ARCADE_URL` | `https://arcade-v2-us-1.bsvblockchain.tech` | block height, to report pools past their deadline as `failed` |
| `COORDINATOR_DB` | `./data/coordinator.db` | offers (git-ignored) |
| `COORDINATOR_POLL_MS` | `5000` | how often the WS feed and the engine re-read pools |
| `ROUND_TIMEOUT_MS` | `60000` | signing round timeout (MASTER §3.2) |
| `MAX_ROUNDS` | `3` | rounds per lock attempt (MASTER §3.2) |
| `SPENT_CHECK` | `woc` | pre-round check that pledge coins are unspent (WhatsOnChain bulk `POST /utxos/spent`), or `none` |
| `NETWORK` | `main` | for the spent check |

## HTTP

| Method | Path | |
|---|---|---|
| `POST` | `/offers` | Body: `Offer` (MASTER §3.3). Checked against the chain: the pool is on the overlay, valid and `open`; `lockingScriptHex`/`satoshis` are the pool's credit UTXO; `terms` equal the on-chain pool record; the signature's sighash byte is `0xC3` (`SINGLE\|ANYONECANPAY\|FORKID`) and it unlocks the credit UTXO for output 0 = `priceSats` → `payScriptHex`. `201`, or `400/404/409 { code, error }` |
| `GET` | `/offers/:poolId` | the stored offer, or `404` |
| `GET` | `/pools` | every pool: overlay view + `status` + `hasOffer` + `height` |
| `GET` | `/pools/:poolId` | one pool |
| `GET` | `/pools/:poolId/pledges` | valid unspent pledges in coordinator order; `?all=1` adds spent and invalid ones with `invalidReason` |
| `GET` | `/healthz` | overlay reachable, current height, `engine` (signing rounds on/off) |

`GET /pools/:poolId` also carries `coordinator: { round, signed, total, blacklist: [{ outpoint, reason }], lastRound?: { round, outcome, missing, txid? } }` once the pool has had a round.

`status`: `open`, `locking` (signing round running, Faz 2), `settled`, `failed` (height ≥ `deadlineHeight`, no settlement), `cancelled` (the provider spent the credit UTXO outside a settlement).

Error codes: `OFFER_INVALID_FORMAT`, `BAD_POOL_ID`, `POOL_NOT_FOUND`, `POOL_INVALID`, `POOL_NOT_OPEN`, `CREDIT_MISMATCH`, `TERMS_MISMATCH`, `SIGHASH_NOT_SINGLE_ACP`, `SIGNATURE_INVALID`, `OFFER_NOT_FOUND`, `OVERLAY_UNAVAILABLE` (502).

```bash
curl -s localhost:8090/pools | jq '.[] | {poolId, status, pledgedCredits, target}'
curl -s -X POST localhost:8090/offers -H 'Content-Type: application/json' -d @offer.json
```

## WebSocket `/ws`

JSON messages with a `type` field (MASTER §3.5).

- Client → `{"type":"hello","identity":"03…","poolIds":["<txid>_0"]}`; empty `poolIds` = every pool. Reply: `hello_ack`, then the current `pool_update` of each subscribed pool. The identity is how the coordinator reaches a participant for signing rounds (Faz 2; Faz 5 adds a proof that the client holds the key).
- Server → `{"type":"pool_update","poolId","pledgedCredits","status"}` whenever a pool's progress or status changes. Connections that have not sent `hello` get every pool.
- Server → `{"type":"sign_request","poolId","round","plan","yourInputIndex"}` to the session(s) that said `hello` with the participant's identity.
- Client → `{"type":"sign_response","poolId","round","inputIndex","unlockingScriptHex"}` or `{"type":"sign_reject","poolId","round","reason"}`. A response is accepted only from the session of that input's participant, and only if the signature is valid on the template.
- Server → `round_failed { poolId, round, missing }`, `settled { poolId, txid }`, `pool_failed { poolId }` to the pool's subscribers.

## Signing rounds

```
open ──(offer ∧ valid unspent pledges ≥ N ∧ height < deadline)──▶ round r: plan → sign_request to each participant
round ──(every input validly signed)──▶ assemble → broadcast (Arcade) → overlay submit ──▶ settled
round ──(timeout / sign_reject / bad signature / offline)──▶ those pledge outpoints blacklisted ──▶ round r+1 from the waiting list
after 3 failed rounds ──▶ open again; a new attempt starts when the set of pledges changes
height ≥ deadline, not full ──▶ pool_failed (once); nothing is broadcast
```

Before each round the plan's input 0 is checked with the provider's stored offer signature, and pledge coins can be checked against WhatsOnChain so a coin spent elsewhere is blacklisted instead of failing the broadcast. Every decision is one JSON log line (`round_start`, `sign_ok`, `sign_bad`, `sign_reject`, `round_failed`, `broadcast`, `settled`, `gave_up`, `pool_failed`, `plan_failed`, …).

The plan itself comes from Track A (`planSettlement`, `assembleSettlement`, `broadcastEF`, MASTER §3.4), injected through `src/protocol.ts` (`SettlementProtocol`). Without it, `npm run coordinator` runs the side API and the feed only, and `/healthz` reports `engine: false`. The tests use `test/helpers/devProtocol.ts`, a test-only stand-in.

## Temporary layout

Until Track A's root workspace exists, this is a standalone package. Its tests import the overlay and test helpers from `packages/overlay` by relative path, and `vitest.config.ts` dedupes the overlay packages so the process has one `@bsv/sdk`. `src/verifyOffer.ts` stands in for A's `verifyOffer`. When A's workspace lands: delete `package-lock.json`, import types from `@agentcoop/core` and `@agentcoop/overlay`, and wire A's functions into `SettlementProtocol` in `src/server.ts`.
