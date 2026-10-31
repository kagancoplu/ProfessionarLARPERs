# B-P3 — Market index, vault index, live feed, hosting, durability (→ S3)

> Track B, phase 3. Source: `plan/track-B-overlay-coordinator.md` phase 3; MASTER §3.3 (`Listing`), §3.5, §3.8; Track D 1.1 (vault script + `OP_RETURN vault { v, vaultId, owner, agent, guard }`), 1.2 (keys `[1,'agentcoop vault']`, keyID = vaultId, `'anyone'`); Track A 2.3 (`signListing`: SINGLE\|ACP, the primary record is `POST /listings`, `OP_RETURN list` optional).
> Written: 30.10 ~16:46. Branch `trackB`. Node 22.

## 1. Goal

1. **Market:** `POST /listings` (a signed listing, verified against the chain) and `GET /listings?tokenId=` (only the ones still unspent; dropped after a sweep).
2. **Vault index:** vaults and their balances by the owner's identity; the ownership claim is **verified** from the chain.
3. **Live feed ≤ 1 s:** the overlay emits an event on each admission (SSE), the coordinator re-reads immediately.
4. **Hosting:** overlay + coordinator with one command, with persistent data, restarting after a crash.
5. **Durability:** when the coordinator restarts, the blacklist, the round count and the last round's result are not lost.

## 2. State of the dependencies (16:46)

| Dependency | Status | What I do |
|---|---|---|
| A.P2 `Listing`, `signListing`, `buildSweep` | None | `Listing` as a temporary type from MASTER §3.3; `apps/coordinator/src/verifyListing.ts` a temporary verifier (if A has none). In tests, listings and sweeps only with test helpers |
| D.P1 vault script + record | None (D in P0) | `packages/overlay/src/stub/vault.ts`: a temporary copy of the script in D 1.1. Format exactly as in D's plan |
| Root workspace | None | the phase 1 layout; the root script `npm run infra` is A's file → `node infra/run.mjs` for now, A is asked to add `"infra"` to the root `package.json` |

## 3. Design

### 3.1 Vault index (overlay)
- **Topic manager:** admits (a) the OP_RETURN output of a valid `vault` record, (b) **every** output matching the vault template (`OP_IF <33> OP_CHECKSIG OP_ELSE OP_2 <33> <33> OP_2 OP_CHECKMULTISIG OP_ENDIF`). (b) is stateless and structural: change going back to a vault (settlement, payment, hot-wallet top-up) is indexed even though it carries no record.
- **Lookup:** `agentcoop_vaults(vault_id, txid, record_vout, owner, agent, guard, script_hex, verified)` and `agentcoop_vault_outputs(txid, vout, script_hex, satoshis, spent, spending_txid)`; the two join on **script hex** (all outputs of a vault carry the same script).
- **Verification:** the keys are derived with `'anyone'`, so anyone can compute: `script = vault(anyonePub(owner, vaultId), anyonePub(agent, vaultId), anyonePub(guard, vaultId))`. If the record's script matches, `verified: true`. A record that does not match (a claim to own someone else's vault) is not shown in the `owner` query. So a fake "this vault is mine" record does nothing.
- **Queries:** `{ op:'vaults', owner?, includeUnverified? }`, `{ op:'vault', vaultId }` → the vault record's output → `{ vaultId, owner, agent, guard, scriptHex, verified, balanceSats, utxos: [{ outpoint, satoshis }] }`.

### 3.2 Market
- **The primary record is at the coordinator** (A 2.3). `POST /listings` verifies: `outpoint` is a credit output the overlay admitted and has not seen spent; `tokenId` and `credits` are its `tokenId`/`amt`; `lockingScriptHex`/1 sat match; the signature byte is `0xC3`; the signature passes `Spend` with input ↔ the output at the same index = `askSats → payScriptHex` (a SINGLE signature is bound to "the output at the same index", not to the input's index, so it is valid at any position in a sweep). Error codes from the same family as the offer + `LISTING_*`.
- `GET /listings?tokenId=` → the stored listings; any whose outpoint the overlay saw spent drops off (a sweep or the seller's cancellation). Order: `askSats / credits` ascending (cheapest first).
- The overlay's `{ op:'listings', tokenId? }` query returns the optional on-chain `OP_RETURN list` records raw.

### 3.3 Live feed
- The overlay emits an event on each record/credit/vault admission and each spend notification; `GET /agentcoop/events` (SSE, CORS open) → `data: {"type":"admitted"|"spent","txid":…}`.
- The coordinator subscribes to this stream (reconnects after 1→2→4… s, at most 30 s, if it drops); on an event, `feed.poll()` + `engine.tick()` with a 100 ms debounce. The periodic poll (5 s) stays as a fallback.
- Target: ≤ 1 s from a pledge entering the overlay to `pool_update`.

### 3.4 Hosting (`infra/`)
- `infra/run.mjs`: reads the root `.env` (if any), creates the `data/overlay/`, `data/coordinator/` directories, starts the overlay and the coordinator, merges the logs with prefixes, restarts a crashed process with backoff, stops both on SIGINT/SIGTERM.
- Persistent data: `OVERLAY_DB=data/overlay/overlay.db`, the overlay key `data/overlay/overlay.key` (generated if missing, 600), `COORDINATOR_DB=data/coordinator/coordinator.db`. `data/` is in gitignore.
- `.env.example` is D's file: the variables to add are passed to D in STATUS.
- An always-on shared machine/VPS in phase 5; local evidence here.

### 3.5 Durability
- `progress(pool_id, json)` in the coordinator DB: `attempts`, `blacklist`, `lastRound`, `failedAnnounced`, `gaveUp`. Written on each change, loaded at start. An open round is not persisted: after a restart the pool shows `open` and the next tick opens a new round (the participants get a new `sign_request`; the old round's signatures are harmless, none was broadcast).
- Overlay: GASP off (like the kit); missing txs arrive through the client's outbox/`sync` (guide §17.6).

## 4. Files

```
packages/overlay/src/stub/vault.ts      TEMPORARY: D 1.1's script + anyone verification
packages/overlay/src/stub/types.ts      + Listing (MASTER §3.3)
packages/overlay/src/records.ts         + validateVaultRecord
packages/overlay/src/AgentCoopTopicManager.ts   + vault record + vault-template outputs
packages/overlay/src/AgentCoopLookupService.ts  + vault tables/queries, listings query, event emission
packages/overlay/src/events.ts          OverlayEvents + SSE handler
packages/overlay/src/server.ts          the /agentcoop/events route (before start)
packages/overlay/src/views.ts           + VaultView
apps/coordinator/src/verifyListing.ts   TEMPORARY (if A has no verifyListing)
apps/coordinator/src/store.ts           + listings, progress tables
apps/coordinator/src/api.ts             + POST/GET /listings
apps/coordinator/src/events.ts          SSE subscriber
apps/coordinator/src/engine.ts          progress persistence
infra/run.mjs, infra/README.md
```

## 5. Test scenarios

**Overlay (`packages/overlay/test/overlay.vaults.test.ts`):**
1. A correctly built vault funding → `vaults { owner }` shows the vault `verified`, balance = the funding.
2. A record claiming another `owner` for the same script → `verified:false`, not in the owner's query, not in the claimant's either (visible with `includeUnverified`).
3. When a vault output is spent and the change returns to the same script: the old output spent, the new one in the balance (a tx with no record).
4. SSE: an `admitted` event arrives within 1 s after a submit.

**Coordinator (`apps/coordinator/test/e2e.market-live.mockchain.test.ts`):**
5. `POST /listings`: a valid SINGLE\|ACP listing 201; an ALL signature 400; wrong `credits` 400; an outpoint the overlay does not know 404. `GET /listings` cheapest first.
6. A purchase sweeping two listings in one tx (test helper; input i ↔ output i) → the overlay accepts → both listings drop off `GET /listings`; the buyer's credits are right.
7. Live feed: with `pollMs` at 60 s, a pledge's `pool_update` arrives via the event within ≤ 1 s.
8. Restart: with a pool that has a blacklisted pledge, the coordinator is closed and reopened with the same DB, and `coordinator.blacklist` and `lastRound` are the same.

**Infra:** `node infra/run.mjs` starts both services, `/healthz` green; the overlay process restarts after being killed; Ctrl+C stops both.

## 6. Acceptance and evidence

| Acceptance (track file) | Evidence |
|---|---|
| Listings + sweep show correctly on the overlay | tests 5–6 (mock chain); mainnet T8 depends on **A.P2 + C.P3** |
| The vault query works | tests 1–3; mainnet with D.P1's vault funding |
| Live feed ≤ 1 s | tests 4 and 7 |
| infra without interruption | locally `infra/run.mjs` + restarts; 24 hours on the VPS in phase 5 |

## 7. Result (17:05)

Mock-chain acceptance done: overlay 19/19, coordinator 14/14. `infra/run.mjs` tried locally (start, restart after a crash, clean stop). Differences from the plan and findings:
- Shutdown problems fixed: the overlay closes open SSE streams, the coordinator its keep-alive sockets (otherwise a restart hung or a client went to a dead socket).
- The event test's criterion became "≤ 1 s after the overlay confirmed the admission" (the submit itself takes ~2 s because the overlay tries to send the mock txs to real broadcasters).
- The 24-hour uninterrupted run acceptance stays for the VPS in phase 5. The mainnet acceptances (T8 sweep, vault) depend on A.P2/C.P3 and D.P1.
