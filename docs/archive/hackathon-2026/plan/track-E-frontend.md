# Track E — Frontend: "Coop Town" (pixel-art live view) + working consoles (`apps/web`)

> **Role:** the whole user-facing side of AgentCoop. Two layers, one data model: (1) **Consoles** — a fast interface with forms and tables for the provider, the agent owner, the human participant and the observer/jury; every chain transaction is approved in the user's **own BSV Desktop**. (2) **The Town** — a pixel-art, Stardew-inspired live view of the same data: agents are villagers, the provider a workshop, a pool the noticeboard on the square, settlement a bell and a cart, the guard a watchman. The Town is designed to grow into a game later (avatar, multiplayer).
> **References:** `00-MASTER-PLAN.md §3` (especially §3.5 coordinator WS, §3.6 provider API, §3.7 guard, §3.8 overlay lookup/SSE, **§3.10 frontend event streams**), `FINAL-IDEA.md §3, §4.3–4.10, §11 (demo scenario)`, `docs/BSV_STACK_COMPLETE_GUIDE.md §4 (WalletClient), §6, §9, §10 (AuthFetch/402), §17 (TokenKit)`, the kit's `web/src/main.ts` (a reference that connects to Desktop from the browser), `docs/TBC26_BSV_Track_Requirements.pdf` (B2: "connect user-facing flows to BSV wallets").
> **Owner:** a separate person (E). Does not change the other tracks' files; passes requests through STATUS.

## How to use this file with an AI

1. Give the AI **only one phase**:
   > "Read §3 (especially §3.5–3.10) and §4 of `plan/00-MASTER-PLAN.md`, `plan/STATUS.md` and **Phase N** of `plan/track-E-frontend.md`. Implement only Phase N. First write the detailed plan to `plan/phases/E-P<N>.md`, then code. When done, run the Checkpoint and update the Track E section of STATUS.md."
2. **The user's key is never asked for, stored or shown.** Every signature is made in Desktop through `WalletClient('auto')`. No server wallet, `.env` or private key anywhere in this app.
3. **The three run modes always work:** `live` (real services), `mock` (MSW + a fake event stream; for development and e2e tests while the other tracks are not ready), `replay` (recorded real mainnet events). A feature that does not work in mock is not done.
4. **Execution order:** P0 → P1 → P2 → P3 → P4 → *(if time allows P6 avatar → P7 multiplayer)* → **P5 submission** (always last, never skipped). With 4 hours left before submission, move to P5 wherever you are.
5. Copyright: Stardew Valley is only an **atmosphere reference**. Its sprites, characters, names and UI pieces are not used. Every visual asset is either CC0, made by the team (with Claude, as code) or explicitly permitted; all are recorded in `apps/web/assets/LICENSES.md`. **bsvmunich.com** (BSVA's workshop site, very likely the jury's work) is reference only: no code, sprites or scenes are copied without permission (§6.4).
6. **The anti-slop rules (§6.3) are binding.** In P0 `apps/web/DESIGN.md` is written with `/design-consultation`; at every phase's Checkpoint `/design-review` is run, and anything outside DESIGN.md counts as a finding.

---

## 0. Decisions (final)

| Topic | Decision |
|---|---|
| Approach | **Hybrid.** The consoles do the work; the Town is a live view and entry screen reading the same data layer. Both carry the same pixel-art identity (pixel font headings, "signboard" cards, the town palette) |
| Interaction | **Clicking** first (camera + click a building/agent → panel). Avatar (WASD) in **P6**, only if there is time |
| Player count | **Single player.** Multiplayer (seeing other visitors) in **P7**, only if there is time |
| Platform | **Desktop browser only** (with BSV Desktop). Mobile/BSV Browser out of scope; on a narrow screen an "open on desktop" warning |
| Language | **English**; i18n infrastructure (a single dictionary file) exists, one translation |
| Visitor without a wallet | Live watching (Town, pools, explorer, metrics) + **replay** mode. Making transactions needs Desktop |
| Publishing | A public static site (Cloudflare Pages) **and** locally `npm run web`. Service URLs from `VITE_*` env; changed when B's Phase 5 URLs arrive |
| Sound | Yes, **muted by default**, on with one click (browser autoplay rule). CC0 sound packs |
| Visuals | CC0 packs (Kenney first) + sprites **drawn in code** by Claude (colour matrix → SVG/PNG, §6.2). No AI raster generation. bsvmunich.com reference only (§6.4) |
| Stack | §1 (as is, unless person E has preferences) |

---

## 1. Stack and rationale

| Layer | Choice | Why | Alternative (why not) |
|---|---|---|---|
| Build / development | **Vite** + TypeScript (the root TS version), `apps/web` a workspace member | Fast HMR, static output, `define`/env, CORS-free local development with a dev **proxy** (`/api/coop` → :8090 etc.) | Next.js: SSR unnecessary, the Desktop connection is client-side anyway |
| UI | **React 19** + **React Router 7** (library mode) | Forms, tables, panels; team experience; works fine next to Phaser | Svelte/Solid: fewer ecosystem and test tools |
| State | **Zustand 5** (vanilla store + React hook) | The same store can be written and read from outside React (Phaser scenes, event adapters); few renders with selectors | Redux: too much ceremony; Jotai: awkward to reach from Phaser |
| Server data | **TanStack Query 5** (REST: pools, listings, catalogue, vaults) + `invalidate` on event streams | Cache, retry, background refresh; when an SSE/WS event arrives the related query is invalidated | Hand-written fetch + store: retry/cache written by hand |
| Town engine | **Phaser 3** (latest stable 3.x; pin the version at install) | Tilemap (Tiled JSON), sprite animation, tween, camera, particles, sound, input ready; `pixelArt: true` + `roundPixels`; Arcade Physics ready for the P6 avatar | PixiJS: lower level (tilemap/animation by hand); Phaser 4: do not take the risk if not yet stable |
| Map | **Tiled** (free editor) → JSON tilemap, 16×16 tiles, **3× scale** (48 px) | A layered map, "buildings" and "points" (agent houses, noticeboard, stalls) as data in the object layer | Hand coordinates: quick to start, unmanageable as it grows |
| Style | **Tailwind CSS 4** + **8bitcn/ui** (open-source 8-bit components installed with the shadcn CLI; accessible) as the base, with our own tokens and custom components on top (`ui/`: Signboard card, Scroll modal, UnderTheHood panel, counter). 21st.dev / Magic MCP (the team's premium account) only for complex interaction skeletons (table, drawer, command palette, step-by-step form) and **always** restyled with the DESIGN.md tokens; a component with an "unknown" licence is not installed | A pixel identity needs custom components; plain shadcn/21st.dev defaults look like "AI SaaS" | Pixelact UI (fewer components), nes-ui-react (retro console feel, does not fit the village theme) |
| Fonts | Google Fonts (OFL): **Pixelify Sans** (headings/labels), **VT323** (big numbers, counters); the body font is chosen in P0 with `/design-consultation`: readable, with character, **not Inter/Roboto/Arial/Space Grotesk** (the jury's site uses Inter + Silkscreen; to differ from it, Silkscreen is not used either) | Pixel identity + readability in long text + standing apart from the jury's site | Press Start 2P everywhere: unreadable in tables/forms |
| Wallet | `@bsv/sdk` **`WalletClient('auto')`** (browser; originator = the page origin), `AuthFetch` (BRC-103/104 + BRC-105 402), **`@agentcoop/core`** builders (`buildPledge`, `signSettlementInput`, `reserveListing`, `buildSweep`, `TokenKit` …) | All signatures in Desktop; the same core code also runs in the CLIs (a single source of truth) | Our own tx builder: never |
| Mock | **MSW 2** (REST) + an in-process fake event producer (`mock/scenario.ts`) + a fake `WalletClient` (`mock/wallet.ts`: simulates the approval window) | The full flow before the other tracks are ready; the basis of the e2e tests | A separate fake server: maintenance in two places |
| Tests | **Vitest** (store, adapters, replay, flow logic) + **React Testing Library** (panels) + **Playwright** (e2e, in mock mode; screenshot comparison for the Town) | In line with the root vitest; e2e runs without Desktop | Cypress: Playwright is faster and parallel |
| Sound | **Howler 2** (a single sound manager; works on screens outside the Town too) | Phaser's sound manager is tied to the scene; UI sounds must play without a scene | Phaser Sound: only in the scene |
| Visual pipeline | `assets/sprites/*.ts` (colour matrices + palette written by Claude) → `tools/sprites.mjs` (`crispEdges` SVG for React, PNG + atlas for Phaser; `sharp`, `free-tex-packer-core`); `tools/px.mjs` for CC0 PNGs (palette alignment) | Real pixel art: sharp, never leaves the palette, no blurry AI image. The jury's site draws its sprites the same way (a matrix in code → SVG `crispEdges`, canvas `fillRect`) | AI raster generation (PixelLab, Retro Diffusion etc.): slop and provenance risk; if used, "AI-generated" in `LICENSES.md` |
| Publishing | **Cloudflare Pages** (or Vercel) static build; `VITE_*` at build time | Free, fast, easy custom domain; `app.<domain>` under B's domain | Putting it on the VPS: depends on B's Caddy |

**The single-SDK-copy rule in the browser (the browser counterpart of MASTER §3.1):** there is no wallet-toolbox in the browser, so the **ESM** build of `@bsv/sdk` is used. Because `packages/core/src/sdk.ts` re-exports the CJS build by relative path, Vite redirects `/@bsv\/sdk\/dist\/cjs\/mod\.js$/` → `@bsv/sdk` with `resolve.alias` (E.P0 0.6 verifies this with a smoke test; otherwise A is asked for a `"browser"` condition in `exports`). The `@agentcoop/core` **index** exports only browser-safe modules (`node/*` is a separate entry); this is checked in E.P0 and any leaking `node:` import is reported to A through STATUS.

---

## 2. Architecture

### 2.1 Layers

```
┌──────────────────────── apps/web ────────────────────────────────────────────┐
│  UI (React)                         Town (Phaser)                              │
│  routes/ consoles/ ui/              town/scenes/ town/entities/ town/fx/       │
│        │  useStore(selector)                │  store.subscribe(selector)       │
│        ▼                                    ▼                                  │
│  ┌──────────────────── store (Zustand, single source of truth) ─────────┐     │
│  │ pools · pledges · listings · vaults · agents · jobs · txs · me ·      │     │
│  │ notifications (sign requests) · settings · mode (live|mock|replay)    │     │
│  └───────────────▲──────────────────────────────────────────▲───────────┘     │
│                  │ reducers (events → state)                 │ queries          │
│  ┌────────────── event bus (CoopEvent) ──────────────┐  ┌── api/ (TanStack) ─┐ │
│  │ adapters: coordinatorWs · overlaySse · agentsSse  │  │ coop · overlay ·   │ │
│  │           guardSse · providerSse · replayFile     │  │ provider · guard   │ │
│  └───────────────────────────────────────────────────┘  └────────────────────┘ │
│  ┌── wallet/ ──────────────────────────────────────────────────────────────┐   │
│  │ WalletClient('auto') · AuthFetch · flows/ ("transaction flows" that wrap │   │
│  │ the core builders: pledge, sign, cancel, mint, openPool, listing, sweep, │   │
│  │ redeem, job, vault fund/withdraw/policy)  → every step a Desktop approval │   │
│  └─────────────────────────────────────────────────────────────────────────┘   │
└───────────────────────────────────────────────────────────────────────────────┘
        ▲ WS /ws          ▲ SSE               ▲ REST                ▲ BRC-100 (3321/2121)
   coordinator (B)   overlay (B), agents (C), guard (D), maker (D)   BSV Desktop
```

- **The store is the single source of truth.** Both the consoles and the Town read the same store; the Town fetches no data itself. This is the technical counterpart of the "add a game later" decision: as the game grows, the data layer does not change.
- **Events → reducer → state; queries → state.** A full list from REST changes the state; events both update the state and trigger Town animations (the `fx` queue).
- **`flows/`**: each user action is one function (`flows/pledge.ts: pledge(poolId, credits)`), containing the core builder + Desktop calls + error mapping; the same core functions as the CLIs, a different `WalletInterface`. In mock mode `flows` runs with the fake wallet and produces fake events.

### 2.2 Folder layout

```
apps/web/
├─ package.json  vite.config.ts  tsconfig.json  index.html  playwright.config.ts
├─ public/             favicon, replays/*.jsonl (recorded real events), audio/
├─ assets/             source sprites/tiles/sounds + LICENSES.md (+ tools/px.mjs outputs → public/game/)
├─ tools/              px.mjs (pixel pipeline), atlas.mjs, record.mjs (event recorder), log-relay.mjs (agent log → SSE fallback)
├─ src/
│  ├─ main.tsx  app.tsx  routes.tsx  env.ts (VITE_*, mode)
│  ├─ store/           slices: pools, listings, vaults, agents, jobs, txs, me, notifications, settings; selectors; reducers
│  ├─ events/          types.ts (CoopEvent, MASTER §3.10), bus.ts, adapters/{coordinatorWs,overlaySse,agentsSse,guardSse,providerSse,replay,mock}.ts, derive.ts (overlay SSE → meaningful events)
│  ├─ api/             coop.ts, overlay.ts (lookup), provider.ts, guard.ts, arcade.ts, woc.ts (link helpers)
│  ├─ wallet/          client.ts (WalletClient, connection state), authFetch.ts, flows/*.ts, errors.ts (turns Desktop errors into plain language)
│  ├─ consoles/        pools/ market/ owner/ provider/ participant/ explorer/ agents/ metrics/ settings/
│  ├─ ui/              Signboard, PixelButton, Scroll (scroll modal), Counter, Timer, TxLink, IdentityChip, Toast, Drawer, EmptyState, ErrorState
│  ├─ town/            game.ts (Phaser config), scenes/{Boot,Town,UI}.ts, entities/{Villager,Workshop,Board,Chest,Guard,Stall,Harbor,Cart}.ts, fx/{bubbles,coins,bell,smoke}.ts, map/ (Tiled JSON), bridge.ts (store ↔ Phaser)
│  ├─ replay/          player.ts (speed, pause, skip), recorder.ts
│  ├─ mock/            handlers.ts (MSW), scenario.ts (event scenario), wallet.ts (fake Desktop)
│  ├─ audio/           sounds.ts (Howler), map: event → sound
│  └─ i18n/            en.ts, t()
└─ test/               unit (vitest), components (RTL), e2e/ (Playwright)
```

### 2.3 Run modes

| Mode | How | Use |
|---|---|---|
| `live` | `VITE_DATA_MODE=live`; adapters connect to the real WS/SSE, REST to the real services; locally the Vite proxy (`/api/coop`, `/api/overlay`, `/api/provider`, `/api/guard`, `/api/agents`) bypasses CORS | Demo, mainnet |
| `mock` | `VITE_DATA_MODE=mock` (`npm run web:mock`); MSW imitates REST, `mock/scenario.ts` the events, `mock/wallet.ts` Desktop (a fake "Approve in BSV Desktop" dialog on screen instead of the approval window) | Development, e2e, while the other tracks are not ready |
| `replay` | URL `?replay=<name>` or a setting; the file `public/replays/<name>.jsonl` is played (speed 0.5×–8×, pause, "skip to settlement"); real txids, real links | Video, live demo fallback, jury |

Whatever the mode, **the UI code does not change**; only the adapters and the `WalletInterface` change.

---

## 3. Data model and event streams

### 3.1 Store (summary)

| Slice | Source | Content |
|---|---|---|
| `me` | WalletClient | `connected`, `identityKey`, `network`, information derived for roles (provider: does it have its own pool; owner: does it have a vault), the Desktop baskets (`agentcoop`, `agentcoop vault`, `agentcoop offers`, `agentcoop listings`, `bsv21`) |
| `pools` | `GET /pools`, `/pools/:id`, `/pools/:id/pledges` (B §3.5) + `pool_update` | `ApiPool` + the pledge list (`context`: participant, credits, height, valid, spent) + `coordinator` (round, blacklist) |
| `listings` | `GET /listings?tokenId=` | `Listing` + seller + unit price |
| `vaults` | overlay `{ op:'vaults', owner }`, guard `GET /policies/:agent`, `GET /decisions` | balance, UTXOs, policy, decisions (the 403s) |
| `agents` | `config/identities.json` (+ C's profiles) + the agent event stream | name, profile, identity, last thought, last decision, position (Town), purse (balance, derived from the overlay) |
| `jobs` | provider `GET /v1/jobs/:id` (+ events) | status, log, result hash, who |
| `txs` | derived from every event | type (T1–T11), txid, time, actor, link |
| `notifications` | `sign_request`, errors, info | sign requests **with a countdown** (60 s round), a persistent notification centre |
| `metrics` | derived (+ B Phase 6 `/metrics`) | settlement count, participants, fee, **custodiedSats = 0**, "village savings" |

### 3.2 The event envelope (defined in MASTER §3.10; a summary here)

Each source arrives in its own format; the adapters turn them all into the envelope `CoopEvent { id, ts, src, type, data, txid?, poolId?, agent? }`. A replay file is this envelope's JSONL; the recorder writes it too. So **live, mock and replay go through the same reducer.**

| Source | Protocol | State | Note |
|---|---|---|---|
| Coordinator | WS `/ws` (`hello`, `pool_update`, `sign_request`, `settled`, `round_failed`, `pool_failed`, `error`) | **Exists** (B.P2) | `hello` only while Desktop is connected, with its own identity; a watcher without a wallet sends no `hello` — does `pool_update` still arrive? → verify in E.P0; poll if not |
| Overlay | SSE `GET /agentcoop/events` → `{ type:'admitted'\|'spent', txid }` | **Exists** (B.P3) | A coarse event; on each event `events/derive.ts` rereads the related queries (pools/pledges/listings/vaults) and turns the **difference** into a meaningful event (`pledge_added`, `listing_filled`, `vault_funded` …) |
| Agents | SSE `GET {AGENTS_URL}/events` | **Request (C)**; fallback: `tools/log-relay.mjs` turns `DATA_DIR/agents/*/activity.log` into SSE | Thought bubbles and the decision stream come from here |
| Guard | SSE `GET {GUARD_URL}/events` + `GET /decisions` | **Coming in D.P1** (MASTER §3.7 updated) | Watchman animation, 403 reasons |
| Provider | SSE `GET /v1/events` (optional) | **Request (C, low priority)**; fallback: `GET /v1/jobs/:id` poll | Workshop smoke and job progress |
| Maker (Rail) | SSE `GET /events` | Together with D.P3 | Harbour scene |

### 3.3 What is asked of the other tracks (written in STATUS; confirmed at the start of E.P0)

| From | What | Why | E's workaround |
|---|---|---|---|
| **A** | The `@agentcoop/core` index compiles in the browser (no node import); a `"browser"` condition in `exports` if the Vite alias for `sdk.ts` is not enough | The consoles use the core builders directly | E.P0 0.6 smoke test; otherwise alias/regex |
| **B** | Overlay and coordinator **CORS** (in Phase 5.3); WS `pool_update` also going to watchers without `hello`; `pledges` also in the `GET /pools` response (optional, one request) | A jury without a wallet must see the Town | Vite proxy; separate `/pledges` requests |
| **C** | provider-api **CORS** + exposed headers (`x-bsv-auth-*`, `x-bsv-payment-*`, guide §10.5); `apps/agents` SSE `GET /events` (`AGENTS_URL`, port 8093) and the profile list `GET /agents`; the wallet-side logic of `apps/provider-cli` (`openPool`, `sweepRevenue`, `syncRevenue`) able to run in the browser too (no node import) | 402 payment from the browser; agent bubbles; the provider console | `log-relay.mjs`; E rebuilds the provider flows with core and tells C |
| **D** | Guard `GET /policies/:agent`, `GET /decisions?agent=&limit=`, `GET /events` (SSE), `GET /vaults/:vaultId` (summary from the overlay); the owner-cli flows (`createVault`, `fund`, `policy`, `withdraw`) in a browser-safe module; for the Rail, maker `GET /quote`, `GET /events` | Owner console, watchman, harbour | Mock guard |
| **B (Phase 5)** | Public URLs + an `app.<domain>` DNS record | Publishing | The Cloudflare Pages default domain |

---

## 4. Screens and flows

### 4.1 General layout

- **Top bar:** logo (AgentCoop, pixel), navigation (Town · Pools · Market · My Agents · Provider · Explorer · Metrics), on the right the **wallet chip** (not connected → "Connect BSV Desktop"; connected → a shortened identity, network badge `mainnet`), the **notification bell** (sign requests with a countdown), a sound button, the mode badge (`LIVE` / `MOCK` / `REPLAY`).
- **The Town** is the home page (`/`). Other screens are a **Drawer** opening from the right (clicking a building) or a full page (from the navigation). The `Tab` key switches Town ↔ the related table ("Ledger view").
- Every action is confirmed with a **"Scroll"** dialog: what will be done, how many sats, which address, then the "Approve in BSV Desktop" step (the Desktop window opens; a waiting animation on screen), the result txid + WhatsOnChain link.
- **The "Under the hood" panel** (on the right of every action screen): each step of the action as one line in plain language + a protocol label (`BRC-29`, `AtomicBEEF`, `SPV`, `SINGLE|ACP`, `ALL`, `2-of-2`, `internalizeAction`, `0-conf`) + the measured time (ms) + a WhatsOnChain link; the fee in satoshis and euros, against a "1 euro cent" scale. AgentCoop-specific lines: "Your coin stays in your wallet (pledge)", "The provider signed once and went offline (SINGLE|ACP)", "Every participant checked the whole transaction before signing (ALL)", "N participants · 1 transaction · 0 sat held by anyone", "The guard checked the policy and co-signed / refused: <reason>". The idea is from bsvmunich.com (the jury likes this pattern); the look and text are ours.
- Every page has **empty**, **loading**, **service down** (which service, retry) and **error** (in plain language; Desktop errors translated with `wallet/errors.ts`) states.

### 4.2 Roles and what they can do (each row is a `flows/` function + a Desktop approval point)

**Observer / jury (no wallet)**
| Screen | Content | Source |
|---|---|---|
| Town | the live town; clicking any object opens a scroll (with the txid) | store |
| Pools | open/locking/completed/failed/cancelled pools; fill, deadline (block + estimated time), discount (versus retail), the pledge list, `coordinator` round info and blacklist reasons | B §3.5 |
| Explorer | every transaction with the T1–T11 types, actor, time, WoC link; filter | derived `txs` |
| Metrics | settlement count, participants, fee/settlement, bytes, **Held in custody: 0 sat**, **Village savings**, a failed pool = 0 loss | derived + B Phase 6 `/metrics` |
| Audit (if B Phase 6 exists) | the `GET /pools/:id/audit` result: the ordering recomputed, does the hash match | B |
| Replay | player controls | `replay/` |

**Human participant (Desktop)**
| Flow | Core / API | Desktop approvals |
|---|---|---|
| Join a pool (pledge) | `buildPledge(wallet, terms, credits, 'p2pkh', { tokenIndex })` → overlay submit (done by core) | 1 (`createAction`) |
| Cancel a pledge | `cancelPledge(wallet, outpoint)` | 1 |
| **Signing centre** | WS `hello { identity, poolIds }` (automatic on connecting) → `sign_request` → **a 60 s countdown notification** → the user "Review & sign" → a plan summary on screen (my credits, my change, fee, the hash check result) → `verifySettlementPlan(plan, offer, myOutpoint, { expectedCredits, verifyLineage: true })` → `signSettlementInput(plan, i, new P2pkhWalletSigner(wallet, { protocolID, keyID }))` → `sign_response` | 1 (`createSignature`) |
| After settlement | `settled` → `internalizeSettlement(wallet, tx, plan, myOutpoint, pledgeInstructions)` (change into the `agentcoop` basket, credits into `bsv21`; `TokenKit.sync`) | 0–1 |
| My credits | `TokenKit.balances()` (overlay-validated), the `bsv21` basket | — |
| Use credits (redeem) | `TokenKit.send(tokenId, n, catalog.credits.redeemTo)` → `POST /v1/credits/redeem { beef, outputIndex }` (AuthFetch) | 1 |
| Run a job | `POST /v1/jobs { kind, minutes }` (AuthFetch; 0 if the prepaid balance covers it, otherwise 402 → Desktop pays) → `GET /v1/jobs/:id` poll → "GPU log" + result scroll | 0–1 |
| Get credits back | `POST /v1/credits/return` | 0 |
| Market: sell | `reserveListing` → `signListing` → `POST /listings` | 2 |
| Market: cancel | `cancelListing` | 1 |
| Market: buy (sweep) | select listings → `buildSweep(wallet, kit, listings, { verifyLineage: true })` | 1 |

**Agent owner (Desktop)**
| Flow | Core / API (in D.P1) | Desktop approvals |
|---|---|---|
| Create + fund a vault | `vaultLockingScript(ownerPub, agentPub, guardPub)` + `OP_RETURN vault {…}` → `createAction` (basket `agentcoop vault`) | 1 |
| Write the policy | guard `PUT /policies/:agent` (AuthFetch, owner identity); templates (D Phase 5B) | 0 (auth signature) |
| Watch the agent | decisions, spending, the remaining weekly cap, guard 403s (reason) | guard `GET /decisions`, overlay `vault` |
| Pause / withdraw | `pause` (guard, D Phase 5B); `withdraw` (the OP_IF branch: `createAction + signAction`) | 0 / 1 |
| Fund from Base (Rail; if D.P3 succeeds) | maker `GET /quote` → Base HTLC `lock` with MetaMask → BSV side claim (agent+guard) → into the vault | MetaMask 1–2, Desktop 0 |

**Provider (Desktop)**
| Flow | Core / API | Desktop approvals |
|---|---|---|
| Mint credits | `TokenKit.deploy({ sym, amt, dec })` → the tokenId is written to the product (C's `products/*.json` is on the server; the UI shows the tokenId and tells C) | 1 |
| Open a pool | `buildReserveAndAnnounce` → `signOffer` → `POST /offers` | 2 |
| Cancel a pool | `cancelPool(wallet, kit, poolId)` | 1 |
| My pools | pledges, fill, round state | B |
| Revenue | overlay `pledges`/`settlement` → `internalizeAction` into the `agentcoop revenue` basket (`sync-revenue`), `sweep-revenue` (to default) | 0 / 1 |
| Usage | redeemed credits, running jobs (provider-api) | C (a request if a new endpoint is needed) |

### 4.3 The notification and signing centre (critical path)

- When Desktop connects, the WS `hello` is automatic; if the connection drops it reconnects (backoff) and repeats the `hello`.
- When a `sign_request` arrives: the bell turns red, a card with a countdown at the bottom right (`ROUND_TIMEOUT_MS`), a sound (if on), a **browser notification** (if permitted) and the tab title "(1) Sign request". The user sees it even on another page.
- Verification **before signing**, on screen: my credits ✓, my change ✓, Σcredits = N ✓, hash ✓, lineage (`verifyLineage`) ✓/✗. If a check fails, "Reject" is one click (`sign_reject { reason }`).
- When time runs out the card becomes "missed"; `round_failed` → shows whether the user is on the waiting list or the blacklist (reason).

---

## 5. The Town design contract

### 5.1 Concept mapping (final)

| AgentCoop concept | Its counterpart in the Town | Data / event |
|---|---|---|
| Agent | A villager sprite (colour/clothes per profile: finetune, eval, inference), a name tag, a purse (sats) above the head | `agents` |
| The agent's thought / decision | A thought bubble ("Retail 50 sat/h, pool 25 sat/h. Joining with 8 credits.") visible for 4 s; the decision log in the drawer | `agent_thought`, `agent_decision` |
| Human participant / visitor | For now a **visitor** figure for "you" at the edge of the town (becomes the avatar in P6) | `me` |
| Provider | The **workshop / forge**; smoke from the chimney while a job runs; the product on the sign ("H100 GPU-hour") | `jobs`, provider events |
| Pool | The **noticeboard** on the square + a **sack** filling under it (progress), a label ("8×H100 · 1 week", "1000 credits · 25,000 sat"), a **festival counter** ("Festival in 3 days" = blocks left to the deadline, ~10 min/block) | `pools` |
| Pledge | The villager walks to the board, drops a coin into the sack, a "+300 credits" bubble; **the purse does not shrink, it glows and becomes "reserved"** (the money is still in its own wallet) | `pledge_added` |
| Pledge cancellation | The coin flies back out of the sack, the purse returns to normal | `pledge_cancelled` |
| Lock-in / signing round | An hourglass over the board; the villagers gather on the square, a ✓ over each head on signing; if the round fails, ✗ and the blacklisted villager turns red | `pool_update(locking)`, `sign_*`, `round_failed` |
| **Settlement** | **The bell rings**, a cart crosses the square, leaves a **credit chest** in front of each participant's house, gold purses fly to the workshop; one scroll on screen: "1 transaction · N participants · 0 sat in custody" + WoC link | `settled` |
| Failed pool | The board fades and falls; the purses **do not move at all**; a bubble: "Nobody lost a satoshi" | `pool_failed` |
| Cancelled pool | The provider takes the notice down | `pool_cancelled` |
| Credit token | The chest in front of the house; the amount on top | overlay `utxos` / basket |
| Credit use (redeem) + job | The villager walks with the chest to the workshop, the door light turns on, a progress bar, finally a **result scroll** comes out | `credits_redeemed`, `job_*` |
| Retail 402 payment | The villager goes to the workshop, a coin from the purse (it shrinks), a scroll | `agent_payment(402)` |
| Vault | A **locked chest** in the owner's house; the balance and a policy badge on top | `vaults` |
| Guard | The **watchman** at the village gate; nods on approval, a "!" bubble and a shield on refusal | `cosign_approved/denied` |
| Prompt injection | A **suspicious stranger** comes up to the agent and whispers (bubble: the injected text); the agent runs to the chest; the watchman steps in, "!" and the 403 reason ("maxPerPoolSats exceeded") | `agent_injected` → `cosign_denied` |
| Owner withdrawal | The owner opens the chest, the gold goes back to the house | `vault_spent(owner)` |
| Market | **Market stalls**; a listed credit on a stall with a price tag; sweep = a merchant collects the whole stall | `listing_*` |
| Coop Rail | A **harbour/bridge** at the edge of the town; a ship arriving with USDC, the money turns into BSV while crossing the bridge; links for both chains | maker events |
| Transaction record | Clicking any chest/gold/board opens a **scroll**: type, txid, WoC link, actors | `txs` |
| Day/night | A soft day cycle tied to the deadline blocks; window lights at night | Arcade height (every 30 s) |
| Corner counters | "Village savings: X sat" (the sum of retail − pool price, a "demo pricing" label), **"Held in custody: 0 sat"**, settlement count | `metrics` |

### 5.2 Scene and technical rules

- **Size:** 16×16 tiles, a map of ~60×34 tiles, 3× scale; a 960×540 logical canvas, `Scale.FIT` to the screen. `pixelArt: true`, `roundPixels: true`, `antialias: false`.
- **Camera:** pan by dragging, 2×–4× zoom with the wheel (integer scale), "focus on an agent" (from the drawer). When the avatar arrives the camera follows it (P6).
- **Layers:** ground, decor, buildings (in the object layer `kind: workshop|house|board|stall|gate|harbor`, `agent?: name`), top decor, UI (a separate `UIScene`, unaffected by zoom).
- **Entity placement:** the map's object layer gives the buildings; **agent houses** are assigned from the `agents` slice (profile → house), a new agent gets an empty house; beyond 3 agents a queue (in the Phase 6 scale test with 50 agents: crowd mode, small figures, name tags off).
- **Movement:** villagers wander randomly when idle (waiting points) and walk to the target on an event (no A* needed; a waypoint graph). Every animation is **interruptible** (a new event cancels the old target), **queued** (the `fx` queue; big scenes like settlement wait their turn) and follows the **replay speed** (tween durations divided by `speed`).
- **Click → panel:** each entity's `onClick` → `store.ui.open({ kind, id })`; a React drawer opens. A short label on hover.
- **Store ↔ Phaser bridge:** `town/bridge.ts` subscribes to the store, computes the difference (agents added/removed, pool state) and gives the scene commands; it feeds the event queue to `fx`. Phaser **never** fetches, and writes **only** the `ui` slice of the store.
- **Performance:** sprite atlases (≤ 2 atlases), object pools (bubbles, coins), a 60 fps target; the loop slows while the tab is hidden; bubbles off in crowd mode.
- **Accessibility:** the Town is decorative; all information is in the consoles too. `prefers-reduced-motion` → big scenes are cut short; sound off by default.

### 5.3 Sound map (Howler; CC0)

| Event | Sound |
|---|---|
| pledge | coin |
| settlement | bell + cart |
| guard refusal | a shield "tink" + a short warning |
| sign_request | bell (notification) |
| job done | scroll |
| ambient | a light village background (loop, low volume) |

---

## 6. Visual identity, asset sources and anti-slop

- **Palette:** a warm palette of 32–48 colours derived from a CC0 tile pack (earth, wood, grass, sunset); UI tokens (`--wood`, `--parchment`, `--ink`, `--gold`, `--grass`, `--danger`) in the Tailwind theme; the Town and the consoles use the same palette. Dark mode: a "night" palette (the same tokens).
- **Sources:** §6.1. Every file in `assets/LICENSES.md`: file, source URL, licence, hand-drawn / AI / code, changes.
- **Claude's visual pipeline (§6.2):** Claude does not generate raster images; it draws sprites **as code**.
- **UI pieces:** 9-slice "signboard" and "scroll" frames (CC0 or made), a pixel icon set (coin, chest, bell, shield, ship, GPU).
- **Logo:** a pixel logo for AgentCoop; the BSVA logo only under the `BSVA Logo Guidance` rules, in a "Built on BSV" area, unchanged.


### 6.1 Asset sources (in order of priority)

| Source | For | Licence | Note |
|---|---|---|---|
| **Kenney** (kenney.nl): *Tiny Town* (16×16, 130 files), *Tiny Dungeon*, *RPG Urban*, *Pixel UI Pack*; sound: *RPG Audio*, *Interface Sounds*, *Impact Sounds* | Ground, buildings, UI frames, effect sounds | **CC0** (no attribution needed) | First choice; the Tiny Town licence was verified |
| **LimeZu – Serene Village (revamped)** (itch.io) | A warm village feel (closest to Stardew) | **CC-BY 4.0** | Usable; attribution required in the README + `LICENSES.md` |
| ellen0ra – Cozy Farm Tileset; tofupixel – Fields of Adventure (itch.io) | Farm/village decor | Not stated on the page | The licence field is checked before downloading; not used if unclear |
| **Claude, in code** (§6.2) | Distinctive objects: the GPU workshop, the noticeboard + sack, the locked chest, the watchman, the suspicious stranger, the cart, the bell, the market stall, the harbour/ship, villagers (per profile), a pixel icon set, the logo | The team's work | Workshop/board/chest/watchman are our identity; not taken from CC0 |
| Google Fonts (OFL) | Pixelify Sans, VT323 + a body font | OFL | §1 |

**To avoid:** packs on itch.io tagged "CC0" but AI-generated (e.g. village packs made with Seedream; FreePixelFarm, with AI suspicion in the comments). For every pack, the question "was it drawn by hand" is written in `LICENSES.md`.

### 6.2 The code-drawn sprite pipeline

1. **Palette:** `assets/palette.ts`: 32–48 colours extracted from the chosen CC0 pack, named (`wood-1`, `grass-2`, `ink`, `gold` …). Colours outside the pack are forbidden.
2. **Sprite source:** `assets/sprites/<name>.ts` → `{ w, h, palette: 'town', frames: string[][] }`. Each row a string, each character a palette index ('.' = transparent). Claude writes and edits these files; a human reviews them.
3. **Build:** `tools/sprites.mjs` → (a) `crispEdges` SVG components for React (`<Sprite name="chest" zoom={3} />`), (b) PNG frames and an atlas for Phaser (`public/game/atlas.png|json`). Integer scale; `image-rendering: pixelated`.
4. **Review:** on the `/_kit` page all sprites side by side at 1×/3× and in the night palette. For characters 4 directions × 4 frames (or 2 directions + mirroring).
5. **Way of working:** 2–3 variants first, compared with `/design-shotgun`, one chosen. The reason for the choice goes into DESIGN.md.

### 6.3 Anti-slop rules (binding)

The common points of the "AI slop" lists on the internet + project-specific rules. At every phase's Checkpoint, `/design-review` (gstack) and the "AI Slop Detection" category of `~/.claude/skills/gstack/review/design-checklist.md` are applied.

**Forbidden**
- Purple/indigo/violet gradients, blue-to-purple transitions (e.g. `#667eea → #764ba2`, the `#6366f1–#8b5cf6` range); decorative gradients in general.
- Gradient text in a heading or a number.
- Default fonts: Inter, Roboto, Arial, the system font, Space Grotesk (body included; no Silkscreen either, to stand apart from the jury's site).
- The "three boxes with icons" grid, a "Welcome to AgentCoop" type hero, generic marketing copy ("Unlock the power of…", "Seamless", "Revolutionize").
- Unjustified glassmorphism, blur panels, glow, soft/blurry shadows, a large `border-radius`.
- Emoji used as icons; mixing more than one icon set.
- The plain shadcn/21st.dev default look (grey-white card, thin border, soft shadow).
- Lorem ipsum, made-up numbers; demo values always labelled "demo".

**Required**
- A single palette (§6.2), CSS variables with defined roles (`--surface-parchment`, `--surface-night`, `--ink`, `--wood`, `--gold`, `--grass`, `--danger`, `--ok`); no hex value written in a component.
- Integer scale (2×, 3×, 4×), `image-rendering: pixelated`, anti-aliasing off.
- Square or pixel-stepped corners; shadows a hard 1–2 px offset.
- Product-specific, concrete text: "Festival in 3 days · 600/1000 credits", "Guard refused: maxPerPoolSats exceeded (6,000 > 5,000)".
- Hover, `:focus-visible`, disabled and loading states on every interactive element.
- Empty / loading / error / service-down states designed on every screen (not a generic spinner: an hourglass, a waiting villager etc.).
- Meaningful motion (it tells about an event); honours `prefers-reduced-motion`.
- **DESIGN.md** (`apps/web/DESIGN.md`): written in P0 with `/design-consultation` (palette, typography, spacing scale, component rules, tone). Every later screen draws from it; a change goes into DESIGN.md first.

### 6.4 bsvmunich.com (a reference, not a copy)

BSVA's "BSV × TUM Blockchain workshop" site, very likely the jury's work. Reviewed (30.10): **no** licence, source link or asset credit (default: all rights reserved). The sprites sit in the code as colour matrices, drawn with SVG `crispEdges` and canvas `fillRect`; the fonts are Silkscreen (pixel), Inter (body), JetBrains Mono.

- **Taken (at the level of ideas):** the code-drawn sprite method (§6.2), the "Under the hood" step panel (§4.1), protocol labels + ms + a fee bar, the idea of light gamification (levels, trophies).
- **Not taken:** the sprites, the hall scene, the colour palette as is, the layout, the texts, the code.
- **Differentiation:** theirs is indoors, a beer hall and payments between people; ours is outdoors, a village square, agents and group buying.
- **Permission:** D is asking Axel (MASTER §6.4 question 7). If permission + a licence come, reuse with attribution is considered and written here; until then, reference only.

---

## 7. Quality, security, resilience

- **Tests:** `vitest` → reducers (event → state), `derive.ts` (the overlay SSE difference), the replay player (speed/skip), `flows` (with the fake wallet; the order and parameters of Desktop calls), missing i18n keys; RTL → panels (empty/error/loading), the sign card countdown; **Playwright (in mock mode)** → "jury tour" (no wallet), "participant" (pledge → sign → settlement → redeem → job), "owner" (vault → policy → injection 403 → withdraw), "provider" (mint → open-pool → settle → revenue), replay; scene screenshot comparison for the Town (with a tolerance threshold).
- **Errors/resilience:** an independent health badge per service (`/healthz`); while one is down the other screens work; WS/SSE reconnection (backoff); REST retries; "Reconnect" when Desktop drops and cancelling the pending action; a clear message when a Desktop approval is refused ("Nothing was sent").
- **Security:** no key is asked for; `WalletClient` only with the page origin; no identity sent except through AuthFetch; guard/coordinator answers are **never signed without verification** (the plan verification on screen); external links only to WhatsOnChain/BaseScan; CSP (script-src self + no cdnjs, everything bundled); no secrets in env (`VITE_*` URLs only).
- **Performance:** first load < 2 MB (Phaser a separate chunk, the Town lazy), compressed PNG atlases, code splitting (consoles lazy), a 60 fps Town.
- **Honesty labels:** "demo pricing" (discount), "simulated GPU jobs" (jobs), "experimental" (Rail) are **always** visible on the related screens (the FINAL-IDEA §9 note).

---

## 8. Phases

Time boxes assume heavy parallel AI use. Each phase: first `plan/phases/E-P<n>.md`, then code. A Checkpoint at the end of each phase.

### Phase 0 — Skeleton, design system, data layer, mock, Desktop connection (time box 3 hours) → S1

**Goal:** a skeleton where the full flow works in mock without depending on the other tracks, that really connects to Desktop, with the pixel identity settled.

**Dependency:** the root workspace (A.P0, **exists**). No other services needed (mock).

**Tasks**
- 0.1 The `apps/web` workspace package: Vite + React + TS + Tailwind 4 + Router + Zustand + TanStack Query + MSW + Vitest/RTL + Playwright; add `"web": "npm -w apps/web run dev"`, `"web:mock"`, `"web:build"` to the root `package.json` (additions only). `vite.config.ts`: dev proxies (`/api/*`), `resolve.alias` (the §1 SDK rule), `define`.
- 0.2 **Design system:** first `apps/web/DESIGN.md` with `/design-consultation` (§6.3; the palette from a CC0 pack, the body font choice, tone). Then installing 8bitcn/ui (shadcn CLI) and restyling it with the tokens; palette tokens, fonts, `ui/` components (Signboard, PixelButton, Scroll modal, Counter, Timer, TxLink, IdentityChip, Toast, Drawer, EmptyState, ErrorState), a dark/"night" theme, a hidden `/_kit` page instead of Storybook (all components together; for design review).
- 0.3 **Store + event envelope + reducers:** `events/types.ts` (MASTER §3.10), `bus.ts`, slices, selectors; unit tests.
- 0.4 **Adapters (skeleton):** `coordinatorWs` (hello, reconnection), `overlaySse` + `derive.ts`, `agentsSse`, `guardSse`, `replay`, `mock`. The live ones try to connect to the real URLs; otherwise the health badge is red.
- 0.5 **Mock:** MSW handlers (in the shapes of MASTER §3.5/3.6/3.7/3.8), `mock/scenario.ts` (3 agents, 1 provider: a pool opens → pledges → lock-in → settlement → redeem → job → injection 403 → an unfilled pool; cyclic, can be sped up), `mock/wallet.ts` (a fake Desktop; an approval dialog; fake txids prefixed `mock_`, no links).
- 0.6 **Wallet:** `wallet/client.ts` (`WalletClient('auto')`, `waitForAuthentication`, `getNetwork`, `getPublicKey`, a state machine), the wallet chip, the "Connect" flow, a network mismatch warning. **Smoke:** in the browser `buildOpReturn`, `vaultLockingScript`, `TokenKit` are imported from `@agentcoop/core` and called (a single SDK copy, no node import). The result to STATUS (for A).
- 0.7 **Shell:** top bar, routes (empty pages), a notification centre skeleton, the mode badge, i18n `t()`.
- 0.8 **Asset pipeline:** `assets/palette.ts`, the `assets/sprites/*.ts` format, `tools/sprites.mjs` (matrix → SVG + PNG/atlas), `tools/px.mjs` (CC0 palette alignment), `assets/LICENSES.md`; Kenney Tiny Town + 1 code-drawn object (the noticeboard) end to end (`<Sprite>` in React, an atlas in Phaser), a first draft of the Tiled map (square, workshop, 3 houses, market, gate, harbour site).
- 0.9 CI: `npm -w apps/web run lint|test|build` included in the root `npm test` (`apps/web/test` in the vitest include).

**Acceptance:** `apps/web/DESIGN.md` exists and `/design-review` gives no AI-slop finding on the P0 screens; `npm run web:mock` opens; while the mock scenario runs the store fills (a developer panel `/_debug` shows the events and the state); connecting to a real Desktop shows the identity and the network; the `/_kit` page shows the design system; unit tests green; build < 2 MB.

**Outputs:** the `apps/web/*` skeleton, `plan/phases/E-P0.md`, STATUS Track E, requests to A/B/C/D (STATUS "Interface changes").

#### ✋ Checkpoint (end of Phase 0)
1. **Is the plan still good?** If the SDK alias did not work, a `"browser"` `exports` request to A; if an originator/permission problem came up connecting from Desktop to the browser, the solution goes into STATUS (it applies to C's CLIs and D's owner-cli too).
2. **This phase is done** → `/design-review` (anti-slop, §6.3) clean → STATUS Track E.
3. **What did the other tracks do?** Does B's WS/SSE work (`npm run infra`); did C's provider-api give CORS; did D open the guard?
4. **Dependencies of the next phase:** B.P1–P3 (`/pools`, WS, SSE) for live; otherwise continue in mock.
5. If there is an interface change, MASTER §3.10 + STATUS.

---

### Phase 1 — Pool explorer, live feed, Town v1, replay v1 (time box 4 hours) → S2

**Goal:** a jury member without a wallet opens the site and sees the live pools and, in the Town, agents pledging, the settlement and an unfilled pool; can click real txids.

**Dependency:** B.P1–P3 (live), otherwise mock. C's agent event stream (otherwise `log-relay.mjs` or mock bubbles).

**Tasks**
- 1.1 **Pools** page: list (status filter, sort: deadline, fill, discount), card (progress, festival counter, price/credit vs retail, "demo pricing" label), detail (terms, pledge table, `coordinator` round/blacklist, is there an offer, settlement txid).
- 1.2 **Explorer**: the `txs` slice (T1–T11 records derived from events), filter, WoC links; the **Metrics** page (derived counters; an addition when B Phase 6 `/metrics` arrives).
- 1.3 **Live feed**: coordinator WS (watcher mode) + overlay SSE + the `derive.ts` difference → events; a "Live feed" panel (the last 50 events, in plain language).
- 1.4 **Town v1**: the Tiled map, workshop, board+sack, 3 villagers (idle wandering), the pledge animation, the lock-in hourglass, **the settlement scene** (bell, cart, chests, gold), a failed pool, corner counters, click → drawer (pool detail, agent card, scroll), camera pan/zoom, day/night.
- 1.5 **Agent bubbles**: `agent_thought/decision` → bubble; the decision log on the agent card. Mock if there is no source.
- 1.6 **Replay v1**: `public/replays/mock-demo.jsonl` (recorded from the mock scenario) + a player (speed, pause, "skip to settlement"); opened with `?replay=`; mode badge `REPLAY`.
- 1.7 e2e: "jury tour" (Playwright, mock).

**Acceptance:** in live mode with B's services (if present) the pools and events show; in the Town a settlement scene plays from start to end and the txid in the scroll is real (live) or `mock_`; replay works; e2e green.

**Outputs:** `consoles/pools`, `consoles/explorer`, `consoles/metrics`, `town/*` v1, `replay/*`, `plan/phases/E-P1.md`.

#### ✋ Checkpoint (end of Phase 1)
1. **Is the plan still good?** If deriving differences from the overlay SSE is slow/complicated, ask B for rich events (`pledge_added` etc.) and write it in STATUS; if the Town's performance is low, bring crowd mode forward.
2. **This phase is done** → `/design-review` (anti-slop, §6.3) clean → STATUS Track E.
3. **What did the other tracks do?** Did the mainnet settlement (S1) happen? If so, record the real events (`tools/record.mjs`) and produce the first real replay.
4. **Dependencies of the next phase:** A core (exists), Desktop (human), C provider-api CORS.
5. If there is an interface change, MASTER §3.10 + STATUS.

---

### Phase 2 — Participant and provider flows (real transactions with Desktop) (time box 4 hours) → S2/S3

**Goal:** a person joins a pool from the browser with BSV Desktop, completes the signing round with one click, gets their credits and runs a job; a provider mints credits and opens a pool. The B2 requirement ("user-facing flows via BSV wallets") closes here.

**Dependency:** A.P1/P2 (core builders, **exist**), B.P2 (coordinator round, **exists**), C.P1 (provider-api + the CORS request), a human + Desktop + sats (D).

**Tasks**
- 2.1 `wallet/flows/`: `pledge`, `cancelPledge`, `reviewAndSign` (signing centre), `afterSettlement` (`internalizeSettlement` + `TokenKit.sync`), `redeem`, `runJob`, `returnCredits`, `mint`, `openPool`, `cancelPool`, `syncRevenue`, `sweepRevenue`. Each one: scroll summary → Desktop → result; error mapping.
- 2.2 **Participant** screens: "Join" on the pool card → credit picker (min/max, cost, buffer, fee share) → confirm; "My pledges" (active/cancelled/settled); the **signing centre** (§4.3); "My credits" (TokenKit balance, overlay-validated); "Use credits" (redeem amount ≤ maxRedeem) → "Run a job" (kind, minutes; price preview: 0 if prepaid minutes are enough, otherwise the 402 sats) → job card (log stream, result) → "Return unused".
- 2.3 **Provider console**: "Mint credits" (sym, amt, dec) → the tokenId is shown and copied (a "write it into C's `products/*.json`" note; manual because the automatic write is on the server), the "Open pool" form (credits, price, deadline +blocks, fee, min, label; preview: price per credit, discount versus retail) → 2 approvals → `POST /offers`; "My pools"; "Cancel"; "Revenue" (sync + sweep); "Usage".
- 2.4 Town wiring: on a human pledge the visitor figure goes to the board; when a provider opens a pool the board goes up; on mint a sign is hung on the workshop.
- 2.5 e2e (with the mock wallet): participant and provider tours. **Mainnet acceptance:** with a member who has Desktop, one pledge (T3) + a signing round (taking part in T5) + a redeem (T6) + a 402 job (T7); provider mint (T1) + open-pool (T2). The txids to STATUS (a joint run with C/A; the same sats).

**Acceptance:** both tours' e2e green in mock; on mainnet at least T3 + taking part in T5 done from the browser (txid in STATUS); the signing centre gets the signature within 60 s.

**Outputs:** `wallet/flows/*`, `consoles/participant`, `consoles/provider`, `plan/phases/E-P2.md`.

#### ✋ Checkpoint (end of Phase 2)
1. **Is the plan still good?** If there are more Desktop approvals than expected (A test 3), merge flows; if AuthFetch could not pay a 402 in the browser (CORS headers), solve it with C and write it in STATUS.
2. **This phase is done** → `/design-review` clean → STATUS Track E (the txids in "Mainnet transactions").
3. **What did the other tracks do?** Is D.P1's guard API ready; A.P2 market builders (exist); are C.P2's agent decisions flowing?
4. **Dependencies of the next phase:** D.P1/P2 (guard, owner flows), B.P3 (listings, vaults; **exists**).
5. If there is an interface change, MASTER §3.10 + STATUS.

---

### Phase 3 — Owner console (vault + guard), agents, market, Town v2 (time box 4 hours) → S3

**Goal:** an owner gives their agent a budget from the browser, writes the policy, sees the injection refused at the watchman and withdraws the money; the market stalls work.

**Dependency:** D.P1/P2 (vault script, guard API + SSE, owner flows), A.P2 (market builders, exist), B.P3 (listings/vaults queries, exist), C.P2/P3 (agent events, a vault agent).

**Tasks**
- 3.1 **Owner console**: "Create vault" (pick an agent: `config/identities.json` + C's profiles; guard identity; vaultId) → fund (sats) → 1 approval; the "Policy" form (allowProviders multi-select, maxPerPool, weekly, maxFee, hotDaily; a template picker if the D Phase 5B templates arrive); "Activity": decisions, spending, remaining cap, **Denials** (403 reasons, time, what was asked); "Withdraw" (full/partial) → 1 approval; "Pause" (D Phase 5B).
- 3.2 **Agents** page: a card per agent (profile, identity, purse, credits, the balance/policy if it has a vault, recent decisions, jobs); a live decision stream; when `demo-injection` is triggered (C's script) it shows in the event stream.
- 3.3 **Market**: listings (unit price, seller, credits), "Sell" (amount, price → reserve + sign → POST), "Buy" (select several listings → total → sweep → 1 approval; the lineage verification on screen), "Cancel".
- 3.4 **Town v2**: vault chests in front of the houses (balance), the watchman at the village gate (approve/refuse animation), the suspicious stranger + the injection scene, market stalls (listing/sweep animation), workshop smoke and job progress, the redeem walk, scrolls on every object.
- 3.5 e2e: owner tour (vault → policy → injection 403 → withdraw), market tour. **Mainnet acceptance** (with D): vault funding (T9), a guard-approved spend (T10) and a 403 watched from the browser; a sweep (T8) if possible.

**Acceptance:** mock e2e green; in live mode a guard 403 shows at the watchman and in Denials; T9 on mainnet from the browser.

**Outputs:** `consoles/owner`, `consoles/agents`, `consoles/market`, `town/*` v2, `plan/phases/E-P3.md`.

#### ✋ Checkpoint (end of Phase 3)
1. **Is the plan still good?** Poll if there is no guard SSE; if D's policy fields changed, the form schema is updated.
2. **This phase is done** → `/design-review` (anti-slop, §6.3) clean → STATUS Track E.
3. **What did the other tracks do?** The D.P3 Rail result (`docs/RAIL-POC.md`); B's Phase 5 URLs; is S3 done?
4. **Dependencies of the next phase:** D.P3 (the harbour scene; otherwise a "coming soon" sign at the harbour), B.P5 (publishing URLs; otherwise the Pages default domain).
5. If there is an interface change, MASTER §3.10 + STATUS.

---

### Phase 4 — Rail scene, sound, real replay, polish, public deployment (time box 3 hours) → before S4

**Goal:** the product in a state to show the jury: fast, error-free, public, with a real mainnet replay.

**Dependency:** D.P3 (Rail; optional), B.P5 (URLs; optional), real mainnet runs (S2/S3).

**Tasks**
- 4.1 **Harbour/bridge** (if D.P3 succeeded): maker `GET /quote`, a MetaMask connection (minimal viem/wagmi), Base HTLC `lock`, watching the BSV-side claim, a scroll with two links; the "experimental" label. If it failed, a "closed for season" sign at the harbour + a README note.
- 4.2 **Sound**: Howler, the §5.3 map, settings (on/off, volume), the autoplay lock.
- 4.3 **Real replay**: with `tools/record.mjs`, the real mainnet flow (the S2/S3 runs) into `public/replays/mainnet-<date>.jsonl`; a "This really happened on BSV mainnet" badge in the player; real txids.
- 4.4 **Polish**: onboarding (first visit: a short 3-step tour), empty/error states, keyboard shortcuts (`Tab` ledger, `R` replay, `M` sound), a loading screen, favicon, 404, a narrow-screen warning, `prefers-reduced-motion`.
- 4.5 **Publishing**: Cloudflare Pages (build `npm -w apps/web run build`, env `VITE_*` = B's public URLs), a custom domain `app.<domain>` (DNS from B), CSP, cache headers; the URL to STATUS. Locally: `npm run web` in the README.
- 4.6 **Quality gate**: Lighthouse performance ≥ 85 on desktop; all e2e tours green; `npm run typecheck` clean; bundle analysis.

**Acceptance:** live/replay works at the public URL; a real replay exists; e2e green; the Rail scene either works or shows an honest sign.

**Outputs:** `town/entities/Harbor`, `audio/*`, `public/replays/mainnet-*.jsonl`, the publishing configuration, `plan/phases/E-P4.md`.

#### ✋ Checkpoint (end of Phase 4)
1. **Is the plan still good?** If ≥ 6 hours remain before submission and S4 has not been declared yet, move to P6; otherwise P5.
2. **This phase is done** → `/design-review` clean → STATUS Track E (URL, replay files).
3. **What did the other tracks do?** Does D want the E section for the README; are screen recordings needed for the video?
4. **Next phase:** P6 (optional) or P5.
5. If there is an interface change, MASTER §3.10 + STATUS.

---

### Phase 6 — (optional, if time allows) Avatar mode (time box 2 hours)

**Goal:** the user walks in the town with their own character; approaches a building and opens the same panels with `E`. Click mode stays (a switch in the settings).

**Dependency:** Phase 4 ✓; S4 not declared; ≥ 6 hours before submission.

**Tasks:** Arcade Physics, WASD/arrow keys, a collision layer (Tiled), interaction points (`E`), camera follow, the avatar's outfit (a deterministic colour from the identity), "walk to the board + E = Join" (the same `flows/pledge`), no mobile. e2e: the avatar reaches the board and opens the drawer.

**Acceptance:** avatar mode turns on and off; the same flows work in both modes; performance did not drop.

#### ✋ Checkpoint: P7 if there is time left, otherwise P5.

---

### Phase 7 — (optional, if time allows) Multiplayer town (time box 3 hours)

**Goal:** visitors connected at the same time (human participants, owners, jury) see each other in the town.

**Dependency:** Phase 6 ✓ (avatar); a small **presence** server (`apps/presence`, WS; identity = the Desktop identity or anonymous; position broadcast at 10 Hz; no chat). Hosted on B's VPS (Phase 5) or a Cloudflare Durable Object.

**Tasks:** a presence protocol (an addition to MASTER §3), client interpolation, name tags, a crowd limit (50), an abuse limit (speed/rate). e2e: two browsers see each other.

**Acceptance:** two visitors from two different machines in the same town; latency < 300 ms on a LAN.

#### ✋ Checkpoint: STATUS; then P5.

---

### Phase 5 — Submission (always last; time box 1.5 hours) → S4

**Goal:** the frontend's part of the submission package: a README section, a presenter mode, video material, known limits.

**Tasks**
- 5.1 **Presenter mode** (`?presenter=1`): large type, corner counters to the front, notifications silent, "scene skip" shortcuts for the demo scenario (FINAL-IDEA §11) (in replay).
- 5.2 README section (delivered to D): "Open the town" (public URL), running locally, modes, the Desktop connection, screenshots (6–8, pixel art), keyboard shortcuts, known limits (desktop, single player…), a summary of asset licences.
- 5.3 Video material: screen recordings in the Town of a settlement, an injection refusal, the signing centre, a provider opening a pool (a `docs/video/` list).
- 5.4 Final check: e2e green, typecheck, build, the deployment current, replay files with real txids, honesty labels in place, the BSVA logo rules.
- 5.5 STATUS Track E "Done"; the E items in the S4 checklist.

**Acceptance:** an E section in D's README; the public URL works; the video material listed.

#### ✋ Checkpoint (end of Phase 5)
1. A last plan change? STATUS.
2. STATUS Track E: "Done".
3. Open blockers into the README's "Known limitations".
4. Submission package: URL, screenshots, replay files, the licence file.

---

## 9. Risks and plan B

| Risk | Plan B |
|---|---|
| `@agentcoop/core` does not compile in the browser (the SDK CJS path, a node import) | Vite alias/regex; otherwise a `"browser"` `exports` from A; at worst a browser-safe subset of core in `packages/core/src/browser.ts` (with A) |
| The connection from Desktop to the browser (origin/permission) causes trouble | The kit's `web/` example as a reference; if an `https` origin is needed, `vite --https` locally; write it in STATUS (C/D's CLIs are affected too) |
| CORS (provider-api, overlay) is late | The Vite proxy locally; when published, a small proxy with Cloudflare Pages Functions (temporary) |
| No agent event stream | `tools/log-relay.mjs` (activity.log → SSE); mock bubbles |
| Deriving differences from the overlay SSE is expensive | Narrow the queries by `txid` (`outpoint`/`history`); ask B for rich events |
| Town performance | Crowd mode, a bubble limit, low detail; the Town a lazy chunk |
| Making visuals eats time | A full scene with Kenney CC0 first; code-drawn sprites only for the 6–8 distinctive objects |
| The jury says "it looks like bsvmunich" | §6.4 differentiation: outdoors, agents, group buying; no copied assets; with attribution if permission comes |
| The mainnet runs are late | Mock e2e + replay (mock-demo) can be submitted; the file changes when the real replay arrives |
| Time | P6/P7 drop; P4.4 polish shortens; **P5 never drops** |

---

## 10. Mapping to the demo scenario (FINAL-IDEA §11)

| Scene | Screen |
|---|---|
| 0:20 The provider opens a pool; the owner funds the vault | Provider console (the Desktop approval visible) → the board goes up in the Town; Owner console → the chest |
| 0:45 Agents pledge; an agent from Base; the injection refused | Town: bubbles, the sack fills, the harbour (if present), the suspicious stranger + the watchman's "!" |
| 1:30 Lock-in and a single settlement | Town: hourglass → bell, cart, chests; scroll: "1 tx · N participants · 0 sat in custody" + WoC |
| 1:55 Credits are spent, the market | Workshop smoke, the job scroll; a market stall sweep |
| 2:25 An unfilled pool; the owner withdraws | The board fades, the purses stay in place; Owner console withdraw |
| 2:45 The numbers | Metrics page / corner counters (presenter mode) |
