# @agentcoop/coordinator

The AgentCoop coordinator and side API (MASTER §3.5). It reads pools and pledges from the overlay (`ls_agentcoop`), stores providers' pre-signed offers, and pushes live pool progress over WebSocket. In Faz 2 it also runs the lock-in and signing rounds and broadcasts settlements.

**It holds no funds.** An offer is the provider's `SIGHASH_SINGLE|ANYONECANPAY` signature: it can only ever pay the provider its price at output 0. Every participant checks the whole settlement and signs `SIGHASH_ALL`, so the coordinator cannot change any output. Anyone can run a coordinator (FINAL-IDEA §4.5).

Status: **Track B, Faz 1**.

## Run

Node 22 or newer (`nvm use 22`). Start the overlay first (`packages/overlay`, `npm run overlay`).

```bash
cd apps/coordinator
npm install
npm run coordinator      # http://localhost:8090, WS ws://localhost:8090/ws
npm test                 # mock chain: overlay + API + WS end to end
```

| Variable | Default | Meaning |
|---|---|---|
| `PORT` | `8090` | `COOP_API_URL` in the root `.env` |
| `OVERLAY_URL` | `http://localhost:8080` | overlay to read |
| `ARCADE_URL` | `https://arcade-v2-us-1.bsvblockchain.tech` | block height, to report pools past their deadline as `failed` |
| `COORDINATOR_DB` | `./data/coordinator.db` | offers (git-ignored) |
| `COORDINATOR_POLL_MS` | `5000` | how often the WS feed re-reads pools |

## HTTP

| Method | Path | |
|---|---|---|
| `POST` | `/offers` | Body: `Offer` (MASTER §3.3). Checked against the chain: the pool is on the overlay, valid and `open`; `lockingScriptHex`/`satoshis` are the pool's credit UTXO; `terms` equal the on-chain pool record; the signature's sighash byte is `0xC3` (`SINGLE\|ANYONECANPAY\|FORKID`) and it unlocks the credit UTXO for output 0 = `priceSats` → `payScriptHex`. `201`, or `400/404/409 { code, error }` |
| `GET` | `/offers/:poolId` | the stored offer, or `404` |
| `GET` | `/pools` | every pool: overlay view + `status` + `hasOffer` + `height` |
| `GET` | `/pools/:poolId` | one pool |
| `GET` | `/pools/:poolId/pledges` | valid unspent pledges in coordinator order; `?all=1` adds spent and invalid ones with `invalidReason` |
| `GET` | `/healthz` | overlay reachable, current height |

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
- Faz 2: `sign_request`, `sign_response`, `sign_reject`, `settled`, `round_failed`, `pool_failed`.

## Temporary layout

Until Track A's root workspace exists, this is a standalone package. Its tests import the overlay and test helpers from `packages/overlay` by relative path, and `vitest.config.ts` dedupes the overlay packages so the process has one `@bsv/sdk`. `src/verifyOffer.ts` stands in for A's `verifyOffer`. When A's workspace lands: delete `package-lock.json`, import types from `@agentcoop/core` and `@agentcoop/overlay`.
