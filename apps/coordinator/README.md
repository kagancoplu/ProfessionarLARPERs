# @agentcoop/coordinator

The AgentCoop coordinator and side API. It reads pools and pledges from the overlay (`ls_agentcoop`), stores providers' pre-signed offers, pushes live pool progress over WebSocket, and runs the lock-in: signing rounds over WebSocket, then the broadcast of the settlement.

**It holds no funds and no keys.** An offer is the provider's `SIGHASH_SINGLE|ANYONECANPAY` signature: it can only ever pay the provider its price at output 0. Every participant checks the whole settlement and signs `SIGHASH_ALL`, so the coordinator cannot change any output. Anyone can run a coordinator.

It does not hold or derive any wallet key, does not decide prices or terms (the provider's offer does), and cannot change a signed settlement. Its remaining power is selection, which the audit endpoint makes detectable ([docs/concepts/pools-and-settlement.md](../../docs/concepts/pools-and-settlement.md#rules-that-keep-it-honest), T-3). Run it with the overlay via `npm run infra` ([infra/README.md](../../infra/README.md)).

## Run

Node 22 or newer (`nvm use 22`). Start the overlay first (`packages/overlay`, `npm run overlay`).

```bash
npm install                                 # repo root (npm workspaces)
npm run coordinator -w @agentcoop/coordinator  # http://localhost:8090, WS ws://localhost:8090/ws
npx vitest run apps/coordinator             # mock chain: API, WS, signing rounds, market, restart, and the full flow with the core builders
```

| Variable | Default | Meaning |
|---|---|---|
| `PORT` | `8090` | `COOP_API_URL` in the root `.env` |
| `OVERLAY_URL` | `http://localhost:8080` | overlay to read |
| `ARCADE_URL` | `https://arcade-v2-us-1.bsvblockchain.tech` | block height, to report pools past their deadline as `failed` |
| `COORDINATOR_DB` | `./data/coordinator.db` | offers (git-ignored) |
| `COORDINATOR_POLL_MS` | `5000` | how often the WS feed and the engine re-read pools |
| `ROUND_TIMEOUT_MS` | `60000` | signing round timeout |
| `MAX_ROUNDS` | `3` | rounds per lock attempt |
| `STARTUP_GRACE_MS` | `30000` | no signing round this long after start: WS participants reconnect first (otherwise a restart finds everyone `offline`) |
| `SPENT_CHECK` | `woc` | pre-round check that pledge coins are unspent (WhatsOnChain bulk `POST /utxos/spent`), or `none` |
| `NETWORK` | `main` | for the spent check |
| `LIGHTHOUSE_GUARDS` | `GUARD_URL`, else `http://localhost:8091` | comma-separated guard URLs that co-sign lighthouse pledges; each guard's identity key comes from its `GET /healthz` |
| `RATE_LIMIT` | on | `off` disables the per-IP HTTP limits |
| `RATE_GET_PER_MIN` / `RATE_POST_PER_MIN` | `120` / `10` | per client IP; loopback exempt; behind Caddy the client is the last `X-Forwarded-For` hop |
| `WS_MAX_PER_IP` / `WS_MAX_CLIENTS` / `WS_MAX_MSGS_PER_10S` | `20` / `1000` / `40` | WebSocket caps; over the message rate the connection is closed (`1008`) |

## HTTP

| Method | Path | |
|---|---|---|
| `POST` | `/offers` | Body: `Offer` (`packages/core/src/types.ts`). Checked against the chain: the pool is on the overlay, valid and `open`; `lockingScriptHex`/`satoshis` are the pool's credit UTXO; `terms` equal the on-chain pool record; the signature's sighash byte is `0xC3` (`SINGLE\|ANYONECANPAY\|FORKID`) and it unlocks the credit UTXO for output 0 = `priceSats` → `payScriptHex`. `201`, or `400/404/409 { code, error }` |
| `POST` | `/pledges/lighthouse` | Body: `LighthousePledge` from `buildLighthousePledge` (`beef` = AtomicBEEF bytes of the pledge tx; may be left out when the tx is already on the overlay, then it is read from `record.poolId`'s pledges, or `404 LIGHTHOUSE_NOT_ON_OVERLAY`). Checked offline with `verifyLighthousePledge` (record read from the tx, coin on the record's lighthouse script, credit output, the human's SINGLE\|ACP signature); pool `open`; credits within `minCredits..N`; the named guard reachable from this coordinator. Then the tx goes to the overlay and the pledge is kept. `201 { outpoint, poolId, guard, accepted }`, or `400 LIGHTHOUSE_INVALID_FORMAT`, `404 POOL_NOT_FOUND`, `409 POOL_NOT_OPEN`, `422 LIGHTHOUSE_INVALID` / `GUARD_UNKNOWN` |
| `GET` | `/offers/:poolId` | the stored offer, else a valid one the provider published on chain (`OP_RETURN agentcoop offer`, checked like a POST and then stored), or `404` |
| `GET` | `/pools` | every pool: overlay view + `status` + `hasOffer` + `height` |
| `GET` | `/pools/:poolId` | one pool |
| `GET` | `/pools/:poolId/pledges` | valid unspent pledges in coordinator order; `?all=1` adds spent and invalid ones with `invalidReason` |
| `POST` | `/listings` | Body: `Listing` (`packages/core/src/types.ts`). The outpoint (`txid_vout` or `txid.vout`) must be a credit output the overlay admitted and has not seen spent, holding exactly `credits` of `tokenId`; the seller's signature is `SINGLE\|ANYONECANPAY\|FORKID` and unlocks it for "the output at my index pays `askSats` to `payScriptHex`" (valid at any position in a sweep). `201` or `400/404/409 { code, error }` |
| `GET` | `/listings?tokenId=` | unspent listings, cheapest per credit first; swept or cancelled ones are dropped |
| `GET` | `/pools/:poolId/audit` | re-derives a settled pool from the chain: `checks` (`hashMatches`, `termsHashMatches`, `providerPaid`, `creditsDelivered`, `allIncludedValid`, `selectionMatches`), `skippedEarlier` (pledges ahead in line that were left out, with the reason), `verdict` (`consistent` / `inconsistent` / `unexplained-skips`). `409 NOT_SETTLED` otherwise |
| `GET` | `/metrics` (`?format=prom`) | pools and pledges by state, settlements, participants, average fee and size, rounds, and `custodiedSats` with its `custodyCheck` |
| `GET` | `/healthz` | `{ ok, overlay, height, arcade, engine, openPools, ws: { clients, proven }, uptimeS }`; `503` when the overlay is unreachable |

`GET /pools/:poolId` also carries `coordinator: { round, signed, total, blacklist: [{ outpoint, reason }], lastRound?: { round, outcome, missing, txid? } }` once the pool has had a round.

`status`: `open`, `locking` (signing round running), `settled`, `failed` (height ≥ `deadlineHeight`, no settlement), `cancelled` (the provider spent the credit UTXO outside a settlement).

Error codes: `LISTING_INVALID_FORMAT`, `LISTING_NOT_ON_OVERLAY`, `LISTING_SPENT`, `BAD_LISTING`, `BAD_OFFER`, `OFFER_INVALID_FORMAT`, `BAD_POOL_ID`, `POOL_NOT_FOUND`, `POOL_INVALID`, `POOL_NOT_OPEN`, `TERMS_MISMATCH`, `OFFER_NOT_FOUND`, `OVERLAY_UNAVAILABLE` (502).

```bash
curl -s localhost:8090/pools | jq '.[] | {poolId, status, pledgedCredits, target}'
curl -s -X POST localhost:8090/offers -H 'Content-Type: application/json' -d @offer.json
```

## WebSocket `/ws`

JSON messages with a `type` field.

- Server → `{"type":"challenge","nonce":"<64 hex>"}` right after the connection opens (one nonce per connection).
- Client → `{"type":"hello","identity":"03…","poolIds":["<txid>_0"],"sig":"<DER hex>"}`; empty `poolIds` = every pool. `sig` proves the identity: `wallet.createSignature({ data: utf8("agentcoop hello\n" + host + "\n" + nonce), protocolID: [1, 'agentcoop hello'], keyID: '1', counterparty: 'anyone' })`, where `host` is the host of the URL the client connected to (`coop.example.org`, `localhost:8090`), so a proof made for another coordinator does not work here. Reply: `hello_ack { identity, poolIds, proven }`, then the current `pool_update` of each subscribed pool. Without `sig` (or without `identity`) the session only watches: no `sign_request`, and `sign_response`/`sign_reject` are refused (`say hello first`). `apps/coordinator/src/client.ts` (`@agentcoop/coordinator/client`) does the handshake.
- Server → `{"type":"pool_update","poolId","pledgedCredits","status"}` whenever a pool's progress or status changes. Connections that have not sent `hello` get every pool.
- Server → `{"type":"sign_request","poolId","round","plan","yourInputIndex"}` to the session(s) that proved the participant's identity.
- Client → `{"type":"sign_response","poolId","round","inputIndex","unlockingScriptHex"}` or `{"type":"sign_reject","poolId","round","reason"}`. Accepted only from a proven session of that input's participant, and a response only if the signature is valid on the template. (Before proofs were required, anyone could say `hello` with someone else's identity and reject their input, which blacklisted the victim; `apps/coordinator/test/e2e.public-edge.mockchain.test.ts` replays that attack, T-18.)
- Server → `round_failed { poolId, round, missing }`, `settled { poolId, txid }`, `pool_failed { poolId }` to the pool's subscribers.

## Join with your own agent

A public deployment serves them at `https://coop.<domain>` and `https://overlay.<domain>` ([infra/README.md](../../infra/README.md#public-deployment)). Locally: `http://localhost:8090` and `http://localhost:8080` (`npm run infra`). Reads need no account; signing needs a BRC-100 wallet (wallet-toolbox in Node, or BSV Desktop).

```bash
COOP=http://localhost:8090 OVERLAY=http://localhost:8080
curl -s $COOP/pools | jq '.[] | {poolId, status, pledgedCredits, target, hasOffer}'
curl -s $COOP/offers/<poolId> | jq .terms                               # what the provider signed
curl -s -X POST $OVERLAY/lookup -H 'Content-Type: application/json' \
  -d '{"service":"ls_agentcoop","query":{"op":"pool","poolId":"<poolId>"}}' | jq '.outputs | length'
curl -s $COOP/pools/<poolId>/audit | jq .verdict                        # after it settled
```

An agent in TypeScript (the core builders and this package's client):

```ts
import { buildPledge, verifySettlementPlan, signSettlementInput, P2pkhWalletSigner, receivePkh, internalizeSettlement, TokenKit, OverlayClient, COOP_TOPIC, COOP_SERVICE } from '@agentcoop/core'
import { connectCoordinator } from '@agentcoop/coordinator/client'

const kit = new TokenKit(wallet, new OverlayClient(OVERLAY, undefined, 'main', undefined, COOP_TOPIC, COOP_SERVICE))
const me = await kit.identityKey()
const offer = await (await fetch(`${COOP}/offers/${poolId}`)).json()
const pledge = await buildPledge(wallet, offer.terms, '100', 'p2pkh', undefined, { tokenIndex: await kit.nextIndex(me) })
const coop = await connectCoordinator(COOP, wallet, { poolIds: [poolId], onMessage: async (m, s) => {
  if (m.type !== 'sign_request') return
  await verifySettlementPlan(m.plan, offer, pledge.outpoint, { expectedCredits: pledge.record.credits, expectedCreditPkh: receivePkh(me, Number(pledge.record.tokenIndex)), verifyLineage: true })
  const unlock = await signSettlementInput(m.plan, m.yourInputIndex, new P2pkhWalletSigner(wallet, pledge.instructions))
  s.send({ type: 'sign_response', poolId, round: m.round, inputIndex: m.yourInputIndex, unlockingScriptHex: unlock.toHex() })
} })
await kit.overlay.submit(pledge.beef)                                       // the pledge is on chain and on the overlay
const { txid } = await coop.waitFor(m => m.type === 'settled' && m.poolId === poolId, 3_600_000)
// then internalizeSettlement(...) for the change and kit.sync() for the credits
```

Stay connected until the pool settles: a participant that does not answer within the round timeout (60 s) is blacklisted and replaced from the waiting list. If the plan does not check out, send `sign_reject` with a reason.

## Signing rounds

```
open ──(offer ∧ valid unspent pledges ≥ N ∧ height < deadline)──▶ round r: plan → sign_request to each participant
round ──(every input validly signed)──▶ assemble → broadcast (Arcade) → overlay submit ──▶ settled
round ──(timeout / sign_reject / bad signature / offline)──▶ those pledge outpoints blacklisted ──▶ round r+1 from the waiting list
after 3 failed rounds ──▶ open again; a new attempt starts when the set of pledges changes
height ≥ deadline, not full ──▶ pool_failed (once); nothing is broadcast
```

Before each round the plan's input 0 is checked with the provider's stored offer signature, and pledge coins can be checked against WhatsOnChain so a coin spent elsewhere is blacklisted instead of failing the broadcast. Every decision is one JSON log line (`round_start`, `sign_ok`, `sign_bad`, `sign_reject`, `round_failed`, `broadcast`, `settled`, `gave_up`, `pool_failed`, `plan_failed`, …).

**Lighthouse participants** (offline people): their input is not sent over WS. The coordinator asks the guard named in the pledge record (`POST {guard}/cosign`, `context.kind: 'lighthouse'`, via `lighthouseCosign`); the guard runs `cosignLighthouse` (the whole plan checked as the human would) and returns the complete unlocking script, which is checked in place like any signature. A refusal or an unreachable guard fails that input for the round (`guard: …` in the blacklist). A lighthouse pledge that was only put on the overlay, never given to this coordinator, is left out of plans: nobody here could sign it. `apps/coordinator/test/e2e.lighthouse.mockchain.test.ts`: two people and one agent, one settlement, `consistent`, `custodiedSats: 0`.

**Vault-locked credits** (`creditLock: 'vault'`): the pledge record is read from the pledge transaction itself, so the plan puts that participant's credits on its own vault script; audit and metrics recognize that output with `creditScriptFor`.

Blacklists, attempt counts and last rounds are stored in the coordinator's database, so a restart does not reset the griefing protection. A round in progress is not stored: after a restart the pool is `open` and the next tick starts a fresh round.

Pool updates come from the overlay's event stream (`GET /agentcoop/events`), so a pledge reaches WebSocket clients and can start a round within a second; the periodic poll is a fallback.

The plan itself comes from `@agentcoop/core` (`planSettlement`: deterministic order, exact N within a 120 % window, fee from the real signed size), injected through `apps/coordinator/src/protocol.ts` (`SettlementProtocol`, `coreProtocol`). `startCoordinator` without a protocol runs the side API and the feed only (`/healthz` → `engine: false`).

## Any coordinator can close any pool

The provider publishes its offer on chain (`publishOffer` from `@agentcoop/core`, then submit to `tm_agentcoop`): `OP_RETURN agentcoop offer { v, poolId, unlockingScriptHex }`. Any coordinator reading the same overlay finds it (`{ op: 'offers', poolId }`), rebuilds the full offer from the on-chain pool record and pool tx, checks it like a posted one, and can run the signing round. Bogus records for the same pool are skipped. Run a second one next to the first with `COOP2_PORT=8095 npm run infra` (own database; the examples elsewhere use 8094, which is also the maker's default port). `apps/coordinator/test/e2e.second-coordinator.mockchain.test.ts`: coordinator 1 settles a pool and goes away; coordinator 2 audits that settlement from the chain alone (`consistent`, same `termsHash`), then closes a pool whose offer was never posted anywhere.

## Scale

`apps/coordinator/test/e2e.scale.mockchain.test.ts` settles one pool with 50 and one with 100 participants, each a separate wallet-toolbox wallet that verifies the plan (lineage included) and signs over a proven session (`SCALE_CASES=50,100,50v10`, `SCALE_OUT=<file>` for the numbers; `50v10` = 10 of the 50 pledge from a vault through the guard). Mock chain, one machine, 30.10:

| Participants | Settlement | Fee | `sign_request` | First signature | Last signature | Broadcast → overlay `settled` |
|---|---|---|---|---|---|---|
| 50 | 18.5 kB | 1,860 sat (100 sat/kB) | 178 kB | 0.2 s | 2.5 s | 2.2 s |
| 100 | 36.5 kB | 3,670 sat (100 sat/kB) | 347 kB | 0.4 s | 9.7 s | 8.0 s |
| 50, 10 of them Mandate Vault agents (guard co-signs) | 19.75 kB | 1,986 sat (100 sat/kB) | 217 kB | 0.3 s | 3.7 s | 3.0 s |

Run it with `npm run test:scale` (about six minutes); the root `npm test` skips it unless `SCALE=1`.

All agents run in the test's one process, so the spread up to the last signature is mostly their own plan and lineage checks; on separate machines they run in parallel. The plan is serialized once per round.

## Audit and metrics

**Audit.** For a settled pool, anyone can check from the chain that the settle record's `pledgeListHash` is the hash of the inputs actually included, that the provider got exactly P at output 0, and that every included pledge got its credits at its own receive address (or, for a vault-locked pledge, on its own vault script). The selection is checked by re-running `planSettlement` on the pool's pledges with this coordinator's declared blacklist. Pledges ahead in line that were left out are listed with a reason: the declared one (`timeout`, `bad signature`, `rejected: …`), `cancelled`, `rule: not part of the first exact fill`, or `not explained`. The blacklist reasons are the coordinator's word, not chain facts: censorship becomes detectable, not impossible (T-3).

**`custodiedSats`.** Every output of every settlement is classified as the provider's payment, a participant's credits, a participant's change (its own pledge coin script) or the OP_RETURN record; satoshis in any other output count as custodied. `0` is computed, not assumed. Scope: pools and settlements. Credits redeemed at a provider become an off-chain prepaid balance there (T-6), which this number does not cover.

## Layout

npm workspace member of the repo root. The protocol is `@agentcoop/core`'s: `apps/coordinator/src/protocol.ts` `coreProtocol` wires `planSettlement`, `assembleSettlement` and `broadcastEF` (Arcade) into the engine, and `/offers`, `/listings` delegate signature and credit checks to `verifyOffer` / `verifyListing` (errors `BAD_OFFER` / `BAD_LISTING`). Tests pass `coreProtocol` with a fixed chain policy and a mock-chain broadcast.
