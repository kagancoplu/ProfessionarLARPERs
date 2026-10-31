# E-P3 — Owner console (vault + guard), agents, market, Town v2

> Track E phase 3 (`plan/track-E-frontend.md` §8 phase 3). Author: E, 2026-10-30 23:45 CET. Time box 4 hours. Branch `main`. Previous: `E-P2.md` (✅), interim phase `E-V1.md` (✅ visual rebuild).

## 0. Goal
An owner, from the browser with BSV Desktop, opens a vault for their agent, funds it (T9), writes its policy, sees the guard refuse an injection at the gatekeeper and under "Denials", and withdraws the money alone (owner branch). The market stalls work: sell (2 approvals), buy/sweep (1 approval, lineage check on screen), cancel. The agents page shows the live decision feed and the injection demo. Town v2: gatekeeper, stranger, vault chests, stall sellers.

## 1. Dependencies (23:45)
| | Status | In P3 |
|---|---|---|
| D guard | `main`: `PUT/GET /vaults/:id`, `PUT/GET /policies/:agent` (BRC-103 owner), `GET /decisions`, `GET /events` SSE, CORS + `x-bsv-auth-*` exposed; `apps/owner-cli/src/vault-ops.ts` without node imports (`createVault/registerVault/putPolicy/fundVault/withdrawVault/ownerBasketUtxos`) | the owner flows in `flows/live.ts` wrap this library; `AuthFetch` to the guard |
| A core | `reserveListing/signListing/buildSweep/cancelListing(reclaimReserved)`, `VaultOwnerSigner`, vault script helpers | live market flows |
| B coordinator | `POST /listings` (verifies), `GET /listings?tokenId=` (cheapest first) | listings from here; the overlay's `listing_*` events are already in the reducer |
| C agents | `apps/agents` SSE `/events` + `GET /agents` not there yet | mock scenario + a mock "Inject now" trigger |
| Guard `pause` (D phase 5B) | none | not in the UI; a note suggesting `weeklyCapSats: 0` to "pause" |

## 2. Design
- **FlowsApi additions** (`wallet/flows/types.ts`): owner `createVault(agent) → MyVault` (vaultId, script, guard registration; persisted in `mine.vaults`), `fundVault(vaultId, sats)` (1 approval `createAction`: out0 vault coin, out1 `OP_RETURN vault`), `putPolicy(agent, policy)` (BRC-103 `PUT`, no Desktop approval), `vaultStatus(vaultId)` (guard `GET /vaults/:id` + `/decisions`), `withdrawVault(vaultId)` (1 approval: `createAction signAndProcess:false` + `VaultOwnerSigner` + `signAction`); market `listCredits(credits, askSats)` (2 approvals: `reserveListing` createAction, `signListing` createSignature → `POST /listings`), `cancelListing(outpoint)` (1), `sweep(outpoints[])` (1; `buildSweep verifyLineage:true`, total sats and the lineage check on the scroll), `listings()` (coordinator).
- **Mock** (`flows/mock.ts`, `mock/state.ts`): same interface; creating a vault adds a `VaultView` to `world.vaults` + `vault_registered`; funding `vault_funded` (T9); policy `world.policies` + `policy_updated`; withdrawal `vault_spent by:'owner'`; listing `world.listings` + `listing_added`; sweep `listing_filled` + credits to me; cancel `listing_cancelled`. `MockRuntime.injectNow(agent?)`: plays the scenario's injection + 403 beat immediately (the agents page "Inject now (mock)" button, for e2e).
- **`/owner`:** EmptyState without a wallet; when connected: (1) **Open a vault** (agent choice: the store's agents, guard identity from `GET /healthz`), (2) **Fund** (sats, 1 approval), (3) **Policy** (allowProviders: pool providers + catalog + manual; `maxPerPoolSats`, `weeklyCapSats`, `maxFeeSats`, `hotWalletDailySats`; a "weekly 0 to pause" note), (4) **Activity**: decisions (approved/denied, kind, pool, sats, reason), **Denials** highlighted, weekly spend vs cap, (5) **Withdraw** (all, 1 approval). On the right "Under the hood" + "Vaults in the village" (read-only: in mock, finetune's vault and the injection refusal show here).
- **`/agents`:** card = profile, identity, mode, vault (balance + policy summary + last refusal), last thought, last 5 decisions, jobs, an injected banner; live decision feed on the right (`feed` src agents/guard); an "Inject now" button in mock; click a card → drawer.
- **`/market`:** a listing table (credits, asked sats, sats/credit vs retail `demo pricing`, seller chip, select), **Buy selected** (total, "lineage is verified", 1 approval) → `sweep`; **Sell** (credits ≤ my balance, ask sats; 2 approvals) → my listing on a stall; **Cancel** my listing. Empty state: "The stalls are empty".
- **Town v2** (`town/`): **gatekeeper** (Kenmi NPC `bruno`, at the gate; `cosign_approved` → "✓ within policy" bubble; `cosign_denied` → red "!" bubble, walks to the agent, the agent "Refused: …"); **stranger** (`villager_11`, `agent_injected` → walks from the map edge to the agent, whispers (bubble: text), runs off; then the gatekeeper); **vault chests** (a gold chest + label "vault · 40 000 sat" in front of the vault agent's house; `vault_spent by owner` → the chest opens, gold flies to the house/gate); **stalls** (`listing_added` → a chest on an empty stall + label "100 credits · 3 000 sat"; `listing_filled` → the buyer villager walks to the stall and takes the chest; `listing_cancelled` → it empties); **Coop building** `policy_updated` → "Policy updated" bubble; click → `vault`/`listing` drawers (`VaultCard`, `ListingCard` in `TownDrawer`).
- **Desktop approval points:** fund a vault 1, policy 0 (BRC-103 header signature), withdraw 1, list 2, cancel 1, sweep 1. Written on the scroll in advance.

## 3. Tests
Unit: owner and market flows in `flows-mock.test.ts` (create → fund → policy → withdraw; list → sweep → cancel). No RTL (e2e covers it). e2e: `owner.spec.ts` (connect → open vault → fund → policy → the village refusal shows → withdraw), `market.spec.ts` (connect → the scenario's listing arrives → select → Buy → approve → my credit balance 100). The existing 4 e2e stay green.
**Mainnet acceptance (human + D):** `/owner` open + fund a vault (T9) → `npm run adopt` (D) → an agent's guard-approved pledge (T10) → a 403 in the browser; a `/market` sweep (T8) if possible.

## 4. Risks
| Risk | Plan |
|---|---|
| `AuthFetch` from the browser to the guard over BRC-103 (CORS expose ✓) for the first time | same interface in mock; in live, the error on the scroll, a note in STATUS |
| UTXOs for the owner's `withdraw`: no WoC in the browser | `ownerBasketUtxos` (the Desktop basket) is enough: our own fundings are there; if the agent spent, the remaining output is not in the basket → complete with "guard `GET /vaults/:id` utxos", BEEF from Arcade |
| Scenario timing in e2e (listing 28 s, refusal 22.5 s) | `injectNow` and a 45 s test timeout; `postpone` already exists |
| No guard `pause` | not in the UI; note |

## 5. Checkpoint (end of phase 3, 31.10 00:40)

**Acceptance evidence (mock)**
- `wallet/flows/types.ts` `FlowsApi` + owner (`createVault/fundVault/putPolicy/vaultStatus/withdrawVault`) and market (`listings/listCredits/cancelListing/sweep`); `flows/vaultOps.ts` (a browser copy of D's `vault-ops.ts`: the same core primitives; imported if D moves it to core), `flows/live.ts` (guard BRC-103 `AuthFetch`, Arcade BEEF fallback, `reserveListing/signListing/POST /listings`, `buildSweep verifyLineage`), `flows/mock.ts` (same interface, fake Desktop approvals, events), `mine.vaults` (persisted: the vault script in the browser, no key), `MockRuntime.injectNow`.
- `/owner`: open a vault (agent choice, guard identity) → fund (1 approval, T9) → policy form (provider allowlist + 4 caps; "weekly 0 to pause") → decisions table → **withdraw** (owner branch, 1 approval); "Guard refusals in the village" (with 403 reasons), "Vaults in the village". `/agents`: cards (vault balance + refusal count + last refusal, decisions, jobs, injected banner), decision feed, **"Inject now (mock)"**. `/market`: listings (sats/credit vs retail, `demo pricing`), multi-select → **sweep** scroll (total, lineage check, 1 approval) → my credit balance; sell (2 approvals); cancel.
- Town v2: **gatekeeper** at the gate (`cosign_approved` → "✓ within policy · N sat"; `cosign_denied` → "!" + walks to the agent + reason), **stranger** (`agent_injected` → comes from the edge, whispers, runs off after the refusal), **vault chests** (in front of the vault agent's house, "vault · N sat"; open when the owner withdraws, gold flies), **stalls** (`listing_added` → chest + "100 credits · 3 000 sat"; `listing_filled` → the buyer walks to the stall and takes the chest), the Coop building's `policy_updated` bubble; click → `vault`/`listing` drawers.
- Tests: web vitest **18 files / 53 tests** (owner: create→fund→policy→status→withdraw, the injectNow refusal; market: list→cancel, sweep), Playwright **6/6** (smoke, jury, participant, provider, **owner tour**, **market tour**); typecheck clean.

**Mainnet acceptance (human + D, not done yet):** `/owner` open + fund a vault (T9) → D `npm run adopt` → an agent's guard-approved pledge (T10) → a 403 in the browser; a `/market` sweep (T8). Not tried live: `AuthFetch` from the browser to the guard, the `withdrawVault` Arcade BEEF fallback, `buildSweep` from the browser.

**Checkpoint questions**
1. Is the plan still good? Yes. No guard `pause` → not in the UI (weekly 0 note). If D moves `vault-ops` to core, `vaultOps.ts` is deleted (STATUS request).
2. Phase done (mock) → STATUS Track E. The full `/design-review` loop still not run (by hand with screenshots: frames, labels, honesty labels in place).
3. Other tracks: D phase 4a README/threat model; A phases 5–6 lighthouse + OrdLock; C phase 3 market/participant-cli. C's agent SSE still missing → agent bubbles from mock/replay.
4. P4 dependencies: D.P3 Rail (maker `/quote`, `/events` exist → harbour scene "experimental"), B.P5 published URLs (none → Pages default), sound (Kenney CC0 to download).
5. Interface: to D — request to move `vault-ops.ts` to core (or export it from `@agentcoop/owner-cli`); to B — `GET /listings` from the browser works (mock).
