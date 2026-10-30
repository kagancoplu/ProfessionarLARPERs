# @agentcoop/overlay

AgentCoop's overlay: topic **`tm_agentcoop`**, lookup service **`ls_agentcoop`**. It is the BSV-21 overlay from the starter kit (`docs/starter/bsv21-token-kit/overlay/`), copied and renamed. The token rules (`src/kit/rules.ts`) are the kit's, unchanged: a credit output is admitted only if it descends, input by input, from its deploy.

Status: **Track B, Faz 3**: AgentCoop records (pools, pledges, settlements, Mandate Vaults, optional listing records) are indexed in the same topic, and every admission is announced on an event stream. See `plan/track-B-overlay-coordinator.md` and `plan/phases/B-P1.md` … `B-P3.md`.

## Run

Node 22 or newer (`nvm use 22`).

```bash
npm install                          # repo root (npm workspaces)
npm run overlay -w @agentcoop/overlay   # http://localhost:8080
npx vitest run packages/overlay      # mock chain: validation test 1, size model, pools/pledges/settlements, vaults, events
npm run arcade-policy -w @agentcoop/overlay  # validation test 8: Arcade policy + settlement size/fee table
```

| Variable | Default | Meaning |
|---|---|---|
| `PORT` | `8080` | HTTP port (`OVERLAY_URL` in the root `.env`) |
| `OVERLAY_DB` | `./data/overlay.db` | SQLite file |
| `NETWORK` | `main` | `main` or `test` |
| `CHAINTRACKS_URL` / `ARCADE_URL` | `https://arcade-v2-us-1.bsvblockchain.tech` | SPV block headers (Arcade go-chaintracks) |
| `CHAIN_TRACKER=woc` | – | WhatsOnChain headers instead (`WOC_API_KEY` optional) |
| `TOKEN_WHITELIST` | empty = all | Comma-separated credit token ids to index |
| `OVERLAY_PRIVATE_KEY` | generated into `./data/overlay.key` | Overlay node identity. Never commit it |

`data/`, `.env` and `*.sqlite` are git-ignored.

## Endpoints

Standard overlay endpoints from `@bsv/overlay-express`:

```bash
# submit a transaction (BEEF) to the topic
curl -s -X POST http://localhost:8080/submit -H 'Content-Type: application/octet-stream' \
  -H 'X-Topics: ["tm_agentcoop"]' --data-binary @tx.beef

# lookup
curl -s -X POST http://localhost:8080/lookup -H 'Content-Type: application/json' \
  -d '{"service":"ls_agentcoop","query":{"op":"identity","identityKey":"03…"}}'
```

Queries (MASTER §3.8). Each returned output carries a BEEF and a UTF-8 JSON `context`.

| Query | Output → `context` |
|---|---|
| `{ op:'pools', status? }` / `{ op:'pool', poolId }` | the pool's OP_RETURN record → `PoolView`: `poolId`, `terms` (with `poolId`), `status` (`open`/`settled`/`cancelled`), `pledgedCredits`, `pledgeCount`, `target`, `settledTxid?`, `invalidReason?` |
| `{ op:'pledges', poolId, includeSpent?, includeInvalid? }` | pledge coins → `PledgeView` (`valid`, `invalidReason?`, `spent`, `spendingTxid?`); order: height, then txid |
| `{ op:'settlement', poolId }` | the settle record → `{ poolId, txid, pledgeListHash, inputs }` |
| `{ op:'vaults', owner?, includeUnverified? }` / `{ op:'vault', vaultId }` | the vault record → `VaultView`: `vaultId`, `owner`, `agent`, `guard`, `scriptHex`, `verified`, `balanceSats`, `utxos` |
| `{ op:'listings', tokenId? }` | optional on-chain `OP_RETURN list` records (raw); the listing book is the coordinator's `GET /listings` |
| kit: `identity`, `utxos`, `token`, `tokens`, `outpoint`, `history` | credit outputs → `tokenId`, `amt`, `ownerPkh`, `spent`, `spendingTxid`, `index`, `sym`, `dec` |

Types: `src/views.ts` (no runtime imports, safe to import from other packages).

### How records are indexed

- **Topic manager** (`src/AgentCoopTopicManager.ts`): the kit's credit rules, unchanged, plus the first well-formed `OP_FALSE OP_RETURN "agentcoop" <op> <json>` output (all json values strings, `src/records.ts`). That record output is admitted (0 sat, never spent) because lookup answers must point at stored outputs. For a pledge, the pledge coin (out0) is admitted too. Every previous topic coin is retained, so cancelled and settled pledges stay as history.
- **Lookup** (`whole-tx` mode) stores pools, pledges and settlements. Whether a pledge counts is decided **at query time** against its pool's terms, so arrival order does not matter: pool `open`; `minCredits ≤ credits ≤ N`; out1 pays at least `feeSats` to `payScriptHex`; out0 ≥ `ceil(credits × priceSats / N) + 1`.
- A settle record counts only if the transaction spends the pool's credit UTXO at input 0. A pool whose credit UTXO is spent by anything else is `cancelled`.
- **Vaults:** every output with the Mandate Vault script shape is admitted (funding and change back to a vault), and joined to its `vault` record by script. A record is `verified` only if its script equals the one derived from its `owner`, `agent` and `guard` identity keys for that `vaultId` (`[1,'agentcoop vault']`, counterparty `'anyone'`, so anyone can recompute it). Unverified records are hidden by default, so a record claiming someone else's vault does nothing.

### Events

`GET /agentcoop/events` is a Server-Sent Events stream: `data: {"type":"admitted"|"spent","txid":"…"}` for every admission and spend. The coordinator subscribes to it so pool progress reaches WebSocket clients within a second.

## Validation results

**Test 1, mixed settlement (mock chain, `test/validation1.mixed-settlement.test.ts`): passes with the kit rules unchanged.**
A settlement with the provider's credit UTXO as input 0 (signed `SINGLE|ANYONECANPAY|FORKID`) and three pledge coins (signed `ALL|FORKID`), paying the provider at output 0 and delivering 600/300/100 credits at outputs 1–3, with change and an `OP_RETURN agentcoop settle`, gets STEAK `{"outputsToAdmit":[1,2,3],"coinsToRetain":[0]}`. The overlay checks SPV and every script on submit. The same file also shows:
- the provider's `SINGLE|ACP` signature stays valid when the settlement is re-planned with other participants, shares and change (a coordinator retry round needs no new provider signature);
- lowering the provider payment by 1 sat invalidates it;
- inflation inside a mixed settlement is not admitted;
- a settlement that spends a credit UTXO the overlay never admitted is refused.

**Test 8, Arcade policy (30.10):** Arcade v0.16.0; mining fee 1–100 sat/kB across datahubs; strictest max tx size 100 MB, strictest max script size 500 kB. Settlement size measured with real script shapes (`scripts/settlementSize.ts`; matches a real settlement within 0.3 %):

| Participants | Bytes | Fee at 100 sat/kB | Per participant |
|---|---|---|---|
| 3 | 1,486 | 149 sat | 50 sat |
| 20 | 7,674 | 768 sat | 39 sat |
| 50 | 18,594 | 1,860 sat | 38 sat |
| 100 | 36,794 | 3,680 sat | 37 sat |
| 80 p2pkh + 20 vault | 39,314 | 3,932 sat | 40 sat |

Policy is not a limit on settlement size.

## Layout

npm workspace member of the repo root. Credit rules, inscriptions, addresses, the OP_RETURN envelope, types and the vault script come from `@agentcoop/core` (Track A); this package adds the topic manager, the lookup service, record validation (`src/records.ts`), vault helpers (`src/vault.ts`), the event stream (`src/events.ts`) and the views other packages import (`src/views.ts`). `test/helpers/{settlement,pool}.ts` are test-only builders for edge cases; the end-to-end flow with Track A's real builders is `apps/coordinator/test/e2e.integration.mockchain.test.ts`.

## Public edge (B-P5a)

- `GET /agentcoop/healthz` → `{ ok, db, lastEventAt, sseClients, uptimeS }` (`503` if the database does not answer). overlay-express's own `/healthz` stays.
- Bodies: JSON 1 MB, binary (`/submit` BEEF) 10 MB. CORS: overlay-express default (public).
- Per client IP (behind Caddy: last `X-Forwarded-For` hop; loopback exempt): `/lookup` 60/min, `/submit` 30/min → `429 { code: 'RATE_LIMITED' }`. Env `OVERLAY_RATE_LOOKUP_PER_MIN`, `OVERLAY_RATE_SUBMIT_PER_MIN`, `RATE_LIMIT=off`.

## Offers on chain (B-P6b)

`OP_RETURN agentcoop offer { v, poolId, unlockingScriptHex }` is admitted (structural check only). `{ op: 'offers', poolId }` returns every published record for the pool, oldest first, as `{ txid, v, poolId, unlockingScriptHex }`: unverified, since anyone can publish one; readers check each with `offerFromRecord` + `verifyOffer`.
