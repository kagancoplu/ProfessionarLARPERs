# @agentcoop/coordinator

The AgentCoop coordinator and side API (MASTER §3.5). It reads pools and pledges from the overlay (`ls_agentcoop`), stores providers' pre-signed offers, pushes live pool progress over WebSocket, and runs the lock-in: signing rounds over WebSocket, then the broadcast of the settlement.

**It holds no funds and no keys.** An offer is the provider's `SIGHASH_SINGLE|ANYONECANPAY` signature: it can only ever pay the provider its price at output 0. Every participant checks the whole settlement and signs `SIGHASH_ALL`, so the coordinator cannot change any output. Anyone can run a coordinator (FINAL-IDEA §4.5).

Status: **Track B, Faz 3 + integration with Track A** (mock chain). `npm run coordinator` runs real signing rounds with Track A's protocol. Run it with the overlay via `node infra/run.mjs` (see `infra/README.md`).

## Run

Node 22 or newer (`nvm use 22`). Start the overlay first (`packages/overlay`, `npm run overlay`).

```bash
npm install                                 # repo root (npm workspaces)
npm run coordinator -w @agentcoop/coordinator  # http://localhost:8090, WS ws://localhost:8090/ws
npx vitest run apps/coordinator             # mock chain: API, WS, signing rounds, market, restart, and the full flow with Track A's builders
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
| `POST` | `/listings` | Body: `Listing` (MASTER §3.3). The outpoint (`txid_vout` or `txid.vout`) must be a credit output the overlay admitted and has not seen spent, holding exactly `credits` of `tokenId`; the seller's signature is `SINGLE\|ANYONECANPAY\|FORKID` and unlocks it for "the output at my index pays `askSats` to `payScriptHex`" (valid at any position in a sweep). `201` or `400/404/409 { code, error }` |
| `GET` | `/listings?tokenId=` | unspent listings, cheapest per credit first; swept or cancelled ones are dropped |
| `GET` | `/healthz` | overlay reachable, current height, `engine` (signing rounds on/off) |

`GET /pools/:poolId` also carries `coordinator: { round, signed, total, blacklist: [{ outpoint, reason }], lastRound?: { round, outcome, missing, txid? } }` once the pool has had a round.

`status`: `open`, `locking` (signing round running, Faz 2), `settled`, `failed` (height ≥ `deadlineHeight`, no settlement), `cancelled` (the provider spent the credit UTXO outside a settlement).

Error codes: `LISTING_INVALID_FORMAT`, `LISTING_NOT_ON_OVERLAY`, `LISTING_SPENT`, `BAD_LISTING`, `BAD_OFFER`, `OFFER_INVALID_FORMAT`, `BAD_POOL_ID`, `POOL_NOT_FOUND`, `POOL_INVALID`, `POOL_NOT_OPEN`, `TERMS_MISMATCH`, `OFFER_NOT_FOUND`, `OVERLAY_UNAVAILABLE` (502).

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

Blacklists, attempt counts and last rounds are stored in the coordinator's database, so a restart does not reset the griefing protection. A round in progress is not stored: after a restart the pool is `open` and the next tick starts a fresh round.

Pool updates come from the overlay's event stream (`GET /agentcoop/events`), so a pledge reaches WebSocket clients and can start a round within a second; the periodic poll is a fallback.

The plan itself comes from Track A (`planSettlement`: deterministic order, exact N within a 120 % window, fee from the real signed size; MASTER §3.2/§3.4), injected through `src/protocol.ts` (`SettlementProtocol`, `coreProtocol`). `startCoordinator` without a protocol runs the side API and the feed only (`/healthz` → `engine: false`).

## Layout

npm workspace member of the repo root. The protocol is Track A's (`@agentcoop/core`): `src/protocol.ts` `coreProtocol` wires `planSettlement`, `assembleSettlement` and `broadcastEF` (Arcade) into the engine, and `/offers`, `/listings` delegate signature and credit checks to A's `verifyOffer` / `verifyListing` (errors `BAD_OFFER` / `BAD_LISTING`). Tests pass `coreProtocol` with a fixed chain policy and a mock-chain broadcast.
