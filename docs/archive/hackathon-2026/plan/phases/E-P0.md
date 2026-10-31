# E-P0 — Skeleton, design system, data layer, mock, Desktop connection

> The detailed plan of Track E phase 0 (`plan/track-E-frontend.md` §8 phase 0). Author: E (a Claude session), 2026-10-30 18:45 CET. Time box 3 hours (target ~21:45).
> Branch: **`main`** (CLAUDE.md rule). The Track E plan had lived only on `trackD`; it moved to `main` in this session (details in STATUS "Plan changes").

## 0. Scope and the definition of "done"

An `apps/web` skeleton that runs **the full data flow in mock mode** without depending on the other tracks, **connects to a real BSV Desktop**, and has its pixel identity settled with `DESIGN.md`. The console screens and the Town scene are in P1; in P0 only the shell, store, adapters, mock, wallet connection, design system (`/_kit`), developer panel (`/_debug`) and asset pipeline.

Acceptance (track §8 phase 0): `apps/web/DESIGN.md` exists and `/design-review` gives no AI-slop finding on the P0 screens; `npm run web:mock` opens; the store fills while the mock scenario runs (`/_debug`); connecting to a real Desktop shows the identity and the network; `/_kit` shows the design system; unit tests green; build < 2 MB.

## 1. Decisions and pinned versions

| Package | Version | Note |
|---|---|---|
| vite / @vitejs/plugin-react | 8.3.5 / 6.1.2 | the kit's web is Vite 8 too |
| react / react-dom / @types | 19.3.1 / 19.3.0 | |
| react-router | **7.18.5** | v8 is out; plan §1 "Router 7 library mode" → stayed on 7 (known API) |
| zustand / @tanstack/react-query | 5.0.16 / 5.105.0 | |
| phaser | **3.90.0** | 4.2.1 is out; plan §1 "do not risk Phaser 4" → 3.90 |
| tailwindcss / @tailwindcss/vite | 4.3.3 | |
| msw | **2.15.0** | 3.0 is out; plan MSW 2 → 2.15 |
| vitest / jsdom / RTL / jest-dom / user-event | 4.1.12 (same as the root) / 30.1.3 / 16.3.3 / 6.10.0 / 14.6.8 | |
| @playwright/test | 1.64.1 | |
| howler / @types/howler | 2.2.4 / 2.2.13 | to be used in P4; in P0 only the dependency + an `audio/sounds.ts` skeleton |
| @fontsource/pixelify-sans, @fontsource/vt323 (+ body font) | 5.3.0 | from packages instead of the Google Fonts CDN (CSP: everything in the bundle) |
| sharp / free-tex-packer-core | 0.35.5 / 0.3.9 | only `tools/` (devDependency) |
| clsx / tailwind-merge / class-variance-authority | 2.1.1 / 3.7.0 / 0.7.1 | `ui/` variants |
| @bsv/sdk | 3.2.1 (root) | ESM build; the `@agentcoop/core` workspace |

Other decisions:
- **Tests in two layers:** `apps/web/test/*.test.ts` pure logic (store, reducer, derive, replay, mock scenario, i18n) → both the root `npm test` (the root vitest pattern `apps/*/test/**/*.test.ts`) and `npm -w apps/web test`; the `*.test.tsx` RTL tests only in the web's jsdom vitest (the root pattern does not take `.tsx`). Logic tests import nothing DOM/CSS/Vite-specific.
- **Root `tsconfig.json`:** the `apps/*/src` include also takes `.tsx` files and there is no `jsx` setting at the root → the root `npm run typecheck` would break. One line `"exclude": ["apps/web"]` added (A told in STATUS; `apps/web` is checked with its own `tsconfig.json` + `npm -w apps/web run typecheck`).
- **Root `package.json`:** only scripts added: `web`, `web:mock`, `web:build`, `web:test`.
- **One `@bsv/sdk` copy (browser):** `packages/core/src/sdk.ts` re-exports `../../../node_modules/@bsv/sdk/dist/cjs/mod.js`. Vite `resolve.alias` `[{ find: /\/@bsv\/sdk\/dist\/cjs\/mod\.js$/, replacement: '@bsv/sdk' }]` → the package's `exports.import` (ESM) build. Verification: not `test/sdk-single-copy.test.tsx` but the "core smoke" panel in `/_debug` **in the browser** (`buildOpReturn`, `vaultLockingScript`, `TokenKit` import + call) and the absence of the string `dist/cjs` in the `vite build` output.
- The `@agentcoop/core` index is browser-safe (grep: no `node:` import outside `node/*` ✓).
- Phaser is **loaded in P0 but only a small scene opens in `/_kit`** for an atlas preview (end-to-end evidence of the atlas); the Town scene is P1.

## 2. Files to create

```
apps/web/
├─ package.json  vite.config.ts  tsconfig.json  index.html  playwright.config.ts  vitest.config.ts  DESIGN.md  README.md
├─ public/   favicon.svg, game/atlas.{png,json} (tools output), replays/ (P1)
├─ assets/   LICENSES.md, palette.ts, sprites/{board,chest,coin,villager,workshop}.ts (in P0 at least board + coin + tiles), kenney/ (download; human)
├─ tools/    sprites.mjs (matrix → SVG tsx + PNG frames + atlas), px.mjs (CC0 PNG → palette alignment), record.mjs (P1), log-relay.mjs (P1)
├─ src/
│  ├─ main.tsx  app.tsx  routes.tsx  env.ts
│  ├─ store/   index.ts (vanilla + hook), slices/{me,pools,listings,vaults,agents,jobs,txs,notifications,metrics,ui,settings,health}.ts, reducers.ts, selectors.ts
│  ├─ events/  types.ts (CoopEvent + all types), bus.ts, derive.ts, adapters/{coordinatorWs,overlaySse,agentsSse,guardSse,replay,mock}.ts, sse.ts (a shared EventSource wrapper, Last-Event-ID, backoff)
│  ├─ api/     http.ts (baseUrl + JSON + errors), coop.ts, overlay.ts, provider.ts, guard.ts, agents.ts, arcade.ts, woc.ts, queries.ts (TanStack query keys + the invalidate mapping)
│  ├─ wallet/  client.ts (state machine), authFetch.ts, errors.ts, flows/ (P2; only `connect` in P0), types.ts (WalletLike)
│  ├─ mock/    handlers.ts (MSW), data.ts (fixed identities/pool/agents), scenario.ts, wallet.ts, browser.ts (worker start)
│  ├─ consoles/ (P1+; empty page components in P0: Town, Pools, Market, Agents, Provider, Explorer, Metrics, Owner, Settings)
│  ├─ ui/      Signboard (signboard card), PixelButton, Scroll (parchment modal), Counter, Timer, TxLink, IdentityChip, Toast, Drawer, EmptyState, ErrorState, LoadingState, ServiceBadge, Tag (honesty labels), Sprite (SVG), tokens.css
│  ├─ shell/   TopBar, WalletChip, ModeBadge, NotificationBell, SoundToggle, Nav, NarrowScreenNotice
│  ├─ dev/     KitPage (/_kit), DebugPage (/_debug: event feed, state tree, core smoke, health)
│  ├─ town/    (P1; in P0 a `game.ts` config + `scenes/AtlasPreview.ts` only for /_kit)
│  ├─ audio/   sounds.ts (skeleton, Howler; silent by default)
│  └─ i18n/    en.ts, t.ts
└─ test/     store.test.ts, reducers.test.ts, derive.test.ts, scenario.test.ts, i18n.test.ts, env.test.ts, wallet-state.test.ts; ui.test.tsx, shell.test.tsx; e2e/smoke.spec.ts
```

## 3. Store slices and event types

### 3.1 `CoopEvent` (MASTER §3.10 exactly) and the derived types the web produces

`src/events/types.ts`:
- Envelope: `{ id, ts, src: 'coordinator'|'overlay'|'provider'|'agents'|'guard'|'maker'|'web', type, data, txid?, poolId?, agent? }`.
- Coordinator (wrapped from the WS): `pool_update { poolId, pledgedCredits, status }`, `sign_request { poolId, round, plan, yourInputIndex }`, `settled { poolId, txid }`, `round_failed { poolId, round, missing[] }`, `pool_failed { poolId }`, `hello_ack`, `error`.
- Overlay (raw SSE): `admitted { txid }`, `spent { txid }`. From these `derive.ts` produces: `pool_opened`, `pledge_added`, `pledge_cancelled`, `pool_settled`, `pool_cancelled`, `listing_added`, `listing_filled`, `listing_cancelled`, `vault_funded`, `vault_spent` (all `src:'overlay'`, with the related view in `data`).
- Agents: `agent_started`, `agent_thought`, `agent_decision`, `agent_job`, `agent_payment`, `agent_injected` (the §3.10 shapes).
- Guard: `cosign_approved`, `cosign_denied`, `policy_updated`, `vault_registered`, `vault_paused`/`vault_resumed`.
- Provider (optional): `job_queued|job_running|job_done`, `credits_redeemed`, `payment_received`.
- Web (local): `wallet_connected`, `wallet_disconnected`, `service_health { service, ok }`, `flow_step` (P2), `mode_changed`.

Type safety: `CoopEventMap` (type → data) + `EventOf<T>`; an `isEvent(e, type)` narrower.

### 3.2 Slices (`src/store/slices/*`)

| Slice | Fields | Source |
|---|---|---|
| `mode` | `'live'|'mock'|'replay'`, `replayName?` | env / URL `?mode=` `?replay=` |
| `me` | `status: 'idle'|'connecting'|'connected'|'error'`, `identityKey?`, `network?`, `error?`, `roles: { provider, owner, participant }` (derived) | wallet/client |
| `health` | per service `{ ok: boolean|'unknown', checkedAt, detail? }` (coop, overlay, provider, guard, agents) | a `/healthz` poll every 30 s + the adapters' connection state |
| `pools` | `byId: Record<poolId, ApiPool & { pledges?: PledgeView[] }>`, `order` | REST `GET /pools` + `pool_update` + derived events |
| `listings` | `byOutpoint`, `byToken` | REST `GET /listings` + events |
| `vaults` | `byId: VaultView & { policy?, decisions? }` | overlay `vaults` lookup, guard `/policies`, `/decisions`, events |
| `agents` | `byIdentity: { name, profile, identity, mode, vaultId?, lastThought?, lastDecision?, purseSats? }` | `GET {AGENTS_URL}/agents` + agent events |
| `jobs` | `byId` | provider events / poll (P2) |
| `txs` | `list: TxRecord[]` (`kind: T1..T11`, txid, ts, actor, poolId?, label) | derived from events (`reducers.ts` `txFromEvent`) |
| `notifications` | `items: { id, kind: 'sign_request'|'info'|'error', ts, expiresAt?, poolId?, read }` | `sign_request`, errors |
| `metrics` | `settlements`, `participants`, `feeSats`, `custodiedSats: 0`, `villageSavingsSats` (labelled demo pricing) | derived; added to once B's `/metrics` arrives |
| `feed` | the last 200 `CoopEvent`s (Live feed + `/_debug`) | bus |
| `ui` | `drawer?: { kind, id }`, `toasts[]`, `narrowScreen` | React/Phaser |
| `settings` | `sound: false`, `reducedMotion`, `theme: 'day'|'night'|'auto'`, `presenter` | localStorage |

`store/index.ts`: `createStore` (zustand vanilla) + a `useStore` hook + `applyEvent(e)` (the single entry: `reducers.ts`), `hydrate(queryResult)` (REST lists). Phaser later reads with `store.subscribe` and writes only `ui`.

### 3.3 Event flow

`bus.ts`: `publish(e)` → append to `feed` → `applyEvent` → the TanStack `invalidate` mapping (`queries.ts`: `pool_update` → `['pools']`, `['pool', id]`; `admitted/spent` → derive; guard events → `['vault', id]` …) → the `fx` queue (the Town in P1). The replay recorder subscribes to the bus too (P1).

## 4. The service endpoints used (MASTER §3)

| Service | Endpoint | In P0 |
|---|---|---|
| Coordinator (§3.5) | `GET /pools`, `GET /pools/:id`, `GET /pools/:id/pledges`, `GET /listings`, `GET /healthz`, `GET /metrics` (if present), `WS /ws` (`hello` only while Desktop is connected; `pool_update` arrives without hello too — checked in `apps/coordinator/src/ws.ts`) | queries + the WS adapter |
| Overlay (§3.8) | `POST /lookup { service:'ls_agentcoop', query }` (`pools`, `pledges`, `vaults`, `listings`, `outpoint`), `GET /agentcoop/events` (SSE, `Access-Control-Allow-Origin: *`) | the SSE adapter + derive |
| Provider (§3.6) | `GET /healthz`, `GET /v1/catalog` (auth; only mock in P0) | mock handler |
| Guard (§3.7, D.P2 ✅ on trackD) | `GET /healthz`, `GET /events` (SSE), `GET /policies/:agent`, `GET /decisions` | mock handler + SSE adapter (the same adapter once the live guard reaches main) |
| Agents (§3.10, requested from C) | `GET /agents`, `GET /events` (SSE) | mock |
| Arcade (§20) | `GET /chaintracks/v2/height` (30 s; the day/night and "festival" countdown) | `api/arcade.ts` |

The Vite dev proxy (local, without CORS): `/api/coop → :8090` (ws:true), `/api/overlay → :8080`, `/api/provider → :8092`, `/api/guard → :8091`, `/api/agents → :8093`. `env.ts`: proxy paths when `VITE_*_URL` is empty and in dev, the direct URLs when published.

## 5. Wallet (0.6)

`wallet/client.ts`: `WalletClient('auto')` (originator = the page origin; in the constructor). State machine `idle → connecting → connected | error`; `connect()`: `waitForAuthentication({})` (20 s timeout), `getNetwork({})`, `getPublicKey({ identityKey: true })`. `network !== VITE_NETWORK` → a warning badge. `disconnect()` only resets the local state. Error mapping in `errors.ts`: Desktop closed/unreachable ("Open BSV Desktop and unlock it"), the user refused ("Nothing was sent"), network mismatch, timeout. In mock mode `mock/wallet.ts` gives the same interface (`MockWallet implements WalletLike`: `waitForAuthentication`, `getNetwork`, `getPublicKey`, `createAction`/`createSignature` → a fake on-screen "Approve in BSV Desktop" dialog, txids prefixed `mock_`).

**Desktop approval points (P0):** only connecting: Desktop may ask for identity key permission the first time (1 window). No other operation.

**Core smoke (in the browser, `/_debug`):** `buildOpReturn('pool', {...})` hex, `vaultLockingScript(a,b,c)` length 109 B, a `new TokenKit(wallet, new OverlayClient(url))` instance, reading back with `parseOpReturn`; the result and the `@bsv/sdk` build path (ESM or not) on the panel. The result into STATUS (A).

## 6. Mock scenario (0.5)

`mock/data.ts`: 1 provider (identity `02…`), the provider-api server identity, 3 agents (`finetune`, `eval`, `inference`), 1 human participant (you), 1 owner, 1 guard, token `gpu-h100` (`<mocktxid>_0`), product at 50 sat/credit.

`mock/scenario.ts` (in-process; a `speed` multiplier, `pause/resume`, looping):
1. `t=0` a pool opens: `pool_opened` (1000 credits, 25,000 sat, deadline +60 blocks, fee 300) → `pools` updated
2. `t+2s…+10s` agent thoughts + decisions + pledges: `agent_thought`, `agent_decision(pledge)`, `pledge_added` (300/400/300), `pool_update` progress
3. `t+12s` lock-in: `pool_update(locking)`, `sign_request` (only if Desktop is connected and you joined; a notification demo for `me` in mock)
4. `t+16s` `settled { txid: mock_settle_1 }`, `pool_settled`, `txs` T5
5. `t+18s` redeem + job: `credits_redeemed`, `agent_job(queued→running→done)`
6. `t+24s` injection: `agent_injected`, `cosign_denied { reason: 'maxPerPoolSats exceeded (6,000 > 5,000)' }`
7. `t+28s` a second pool opens, 1 pledge, the deadline passes → `pool_failed` ("Nobody lost a satoshi")
8. loop back to the start (with new poolIds)

MSW handlers (`mock/handlers.ts`): `GET /pools`, `/pools/:id`, `/pools/:id/pledges`, `/listings`, `/healthz` (coop); `POST /lookup` (overlay: `pools`, `pledges`, `vaults`); provider `/healthz`, `/v1/catalog`; guard `/healthz`, `/policies/:agent`, `/decisions`; agents `/agents`. All read from `mock/data.ts` + the scenario state (single truth: `mock/state.ts`). No SSE/WS in mock: the scenario writes straight to the bus (the adapters do not connect in mock mode).

## 7. Design system (0.2)

1. `/design-consultation` → `apps/web/DESIGN.md`: palette (a warm palette derived from Kenney Tiny Town + a night palette; token names `--surface-parchment`, `--surface-night`, `--ink`, `--wood`, `--gold`, `--grass`, `--danger`, `--ok`), typography (Pixelify Sans headings, VT323 counters, body font **not** Inter/Roboto/Arial/Space Grotesk/Silkscreen), spacing scale (4 px based, pixel steps), corners (square / 2 px steps), shadows (1–2 px hard offset), motion (meaningful; `prefers-reduced-motion`), tone (concrete, product-specific copy).
2. Tailwind 4 `@theme` tokens in `ui/tokens.css`; no hex in components.
3. 8bitcn/ui: try `button`, `card`, `badge`, `progress`, `dialog`, `input`, `table`, `tabs`, `toast` with `npx shadcn@latest add`; no component whose licence is not MIT is installed; the installed ones are restyled with the tokens. If the CLI/network has trouble, `ui/` is written by hand (same names).
4. `/_kit`: every `ui/` component day/night, states (hover/focus/disabled/loading), sprites at 1×/3×, palette cards, the type scale, honesty labels.
5. `/design-review` at the end of the phase → findings fixed.

## 8. Asset pipeline (0.8)

- `assets/palette.ts`: `TOWN_PALETTE` (name → hex; ≤ 48 colours) + `NIGHT_PALETTE` (the same names). Source: Kenney Tiny Town colours (checked with `tools/px.mjs --extract` once a human downloads them; in P0 a hand-picked warm palette, justified in DESIGN.md).
- `assets/sprites/<name>.ts`: `{ name, w, h, frames: string[][], anchor?, fps? }`; a character = a palette index letter, `.` transparent. In P0: `board` (notice board 32×32), `sack` (16×16, 4 fill frames), `coin` (8×8, 4 frames), `tile_grass`, `tile_dirt`, `tile_road` (16×16).
- `tools/sprites.mjs`: (a) `src/ui/sprites.generated.tsx` (`<Sprite name zoom />`, `shape-rendering: crispEdges`, `<rect>`s merged by row), (b) `public/game/atlas.png` + `atlas.json` (Phaser JSONHash; PNG with `sharp`, packing with `free-tex-packer-core`). `npm -w apps/web run sprites`.
- `tools/px.mjs`: CC0 PNG → the nearest palette colour + transparency cleanup (for Kenney PNGs; checked by a unit test in P0, the real pack when a human downloads it).
- `assets/LICENSES.md`: a table (file, source URL, licence, hand/AI/code, changes). The Kenney row "not downloaded; human list".
- Tiled map: in P0 `src/town/map/town.json` a **hand-written Tiled JSON draft** (60×34, 16 px, layers: ground, decor, buildings(object), points(object)); objects: square, workshop, 3 houses, market, gate, harbour spot. Edited with Tiled in P1.

## 9. Tests

**Unit (vitest, root + web):** `env.test.ts` (mode/URL resolution), `store.test.ts` (slices, selectors), `reducers.test.ts` (each event type → state; `txFromEvent` T1–T11), `derive.test.ts` (overlay `admitted/spent` + the lookup diff → derived events), `scenario.test.ts` (the mock scenario is deterministic; event order in a sped-up run), `i18n.test.ts` (no missing key), `wallet-state.test.ts` (state machine + error mapping, with a fake wallet), `sprites.test.ts` (matrix → SVG rect count; an off-palette colour errors).
**Component (RTL, web):** `ui.test.tsx` (Signboard, PixelButton states, EmptyState/ErrorState/LoadingState), `shell.test.tsx` (TopBar: not connected → "Connect BSV Desktop", with the mock wallet connected → a shortened identity + network badge, mode badge MOCK).
**e2e (Playwright, mock):** `smoke.spec.ts`: the page opens, mode badge `MOCK`, ≥ 5 events in `/_debug` within 10 s, `/_kit` renders, "Connect" fake Desktop dialog → identity chip.
**Build:** `vite build` < 2 MB (Phaser a separate, lazy chunk).

## 10. State of the dependencies (30.10 18:45)

| Track | Status | P0 effect |
|---|---|---|
| A core | P2 ✓ on `main`; the index browser-safe ✓; the `sdk.ts` CJS path → Vite alias | checked with the smoke test |
| B overlay+coordinator | P3 + P6a ✓ on `main`; CORS: coordinator `*` ✓, overlay SSE `*` ✓, overlay-express `corsPolicy` (lookup; checked live); WS `pool_update` without hello ✓ | the live adapters can connect; `npm run infra` is **not** at the root (B's request to A), `node infra/run.mjs` exists |
| C provider-api | P1 ✓ on `main`; **no CORS** (request open); no agents SSE | mock + Vite proxy |
| D guard | D.P2 ✓ on `origin/trackD` (E endpoints + CORS); not on `main` | mock; adapter ready |
| Human | Desktop (mainnet) exists on this machine (D's note); no sats | a connection test can be done, no transactions |

## 11. Human to-dos (also written into STATUS)

1. With BSV Desktop open, `npm run web` → "Connect BSV Desktop" → the permission window → the identity/network chip should appear (the result into STATUS).
2. Download the Kenney *Tiny Town* zip (kenney.nl, CC0) and unpack it under `apps/web/assets/kenney/tiny-town/`; palette alignment with `npm -w apps/web run px`.
3. Review `apps/web/DESIGN.md` and the `/_kit` page and confirm (or change) the palette/body font choice.
4. A Cloudflare Pages account (P4).

## 12. Risks (P0)

| Risk | Plan |
|---|---|
| The Vite alias does not catch the CJS path (`export *` from CJS) | a `resolve.alias` regex; otherwise `optimizeDeps.include`; at worst a `"browser"` condition in `exports` from A |
| 8bitcn/ui CLI network/licence trouble | `ui/` by hand (same API) |
| Breaking the root typecheck/tests | `exclude: ["apps/web"]`; logic tests node-safe |
| Desktop origin permission (`http://localhost:5173`) | the kit's web uses the same path; if there is a problem, STATUS |
| Time | no Town in P0; the atlas only as a `/_kit` preview |

## 13. Checkpoint (end of phase 0, 30.10 19:30)

**Acceptance evidence**
- `apps/web/DESIGN.md` exists (`/design-consultation`, an autonomous run; decisions in the "Decisions made without user confirmation" table). Anti-slop: a grep over the code for gstack `design-checklist.md` §1–3 (gradients 0, `rounded`/`border-radius` 0, `text-center` 0, blur/glow 0, banned fonts 0, marketing copy 0, emoji icons 0) + 7 screenshots (day/night). Findings fixed: the connected wallet chip's night colours, the top bar line wrap, the feed timestamp wrap, inconsistent number formatting, the `⚠` glyph. The full `/design-review` browser loop (gstack browse/bun) not run → human list.
- `npm run web:mock` opens; the scenario runs; `/_debug` shows the events and the state (e2e: ≥ 1 event within 10 s, core smoke `data-ok=true`, the fake Desktop connects).
- `/_kit` shows the design system in the day + night palettes; the Phaser atlas preview with 17 frames.
- Tests: web `vitest` 10 files / **33 tests**; **28 tests** from apps/web inside the root `npm test` (pure logic); Playwright **1/1**; `npm -w apps/web run typecheck` and the root `npm run typecheck` clean.
- Build: `dist/` 3.9 MB total; **first load ≈ 1.3 MB** (index 436 kB + sdk 830 kB; Phaser 1.19 MB and MSW lazy chunks). Fonts bundled. No `dist/cjs` reference (one SDK copy).
- **Core smoke (browser, for A):** `@agentcoop/core` 111 exports; `buildOpReturn` 43 B + reading back with `parseOpReturn` ✓; `vaultLockingScript` 109 B ✓; `new TokenKit(wallet, new OverlayClient(url))` ✓; core's `LockingScript` is an instance of `@bsv/sdk`'s `Script` (one copy) ✓. The Vite alias was enough; the `exports` "browser" condition is **not needed**.
- A real BSV Desktop connection was not tried in this session (human list).

**Checkpoint questions**
1. Is the plan still good? Yes. Changes: the Town scene to P1; the Kenney download to a human; ports via the `PORT` env (5173 is taken on this machine).
2. Phase done → STATUS Track E updated.
3. Other tracks: B's overlay+coordinator is on `main` and **tried live** (with `node infra/run.mjs`; coop/overlay/arcade green, WS + SSE connected; STATUS Track E); C's provider-api has no CORS (request open); D's guard endpoints on `origin/trackD`, not on `main`.
4. P1 dependencies: B.P1–P3 exist for live; no agent event stream → mock/log-relay.
5. Interface change: no addition to MASTER §3.10; the root tsconfig row (A) and info notes in STATUS.
