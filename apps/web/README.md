# apps/web — AgentCoop frontend (Track E)

Role consoles (provider, agent owner, human participant, observer/jury) and the pixel-art **Town**, one store.
Every signature happens in the user's **BSV Desktop** (`WalletClient('auto')`); the browser never sees a key.
Design rules: [`DESIGN.md`](./DESIGN.md). Plan: `plan/track-E-frontend.md`, phases in `plan/phases/E-P*.md`.

## Open the town

- **Public URL:** _not published yet_ (Cloudflare Pages, see Deploy below). Until then: `npm run web:mock` → http://localhost:5173.
- **Mock mode** needs nothing: a scripted village (pools, pledges, one settlement, a GPU job, a prompt injection the guard refuses, a failed pool, a market sweep, a Coop Rail crossing) loops every ~35 s, and a mock BSV Desktop approves on screen. `?replay=mock-demo` plays a recording.
- **Live mode** (`npm run web`): the overlay, coordinator, provider-api, guard, agents and maker through the dev proxy; connect the real BSV Desktop from the top bar. Nothing in the browser holds a key: pledges, signatures, redeems, vault funding and withdrawals are all `createAction` / `createSignature` approvals in Desktop.
- **Presenter mode:** `?presenter=1` (larger, no toasts; in replay `1`–`5` jump between stages).
- **Settings:** the ⚙ in the top bar (`/settings`): day/night, sound, walking, presenter mode, reduced motion, replay speed.
- **Already on mainnet:** the Town and the Explorer list the project's real BSV transactions (the S1 run and the BSV Desktop mint, pool and offer) with WhatsOnChain links, in every mode.
- **Sign now and leave:** in the join form, a person can pledge as a *lighthouse* (A-P5): one signature binds the coin to their own credits and the guard co-signs the settlement, so nobody waits for the 60-second round. Live mode needs the coordinator's `POST /pledges/lighthouse`.
- **Avatar mode:** "Walk the town" under the canvas (or `V`, `?avatar=1`): your own villager starts in front of the fountain and walks with WASD / arrows, the camera follows, `E` opens whatever is in front of you (board, stall, house, vault chest, workshop, harbor). Works without a wallet as a guest. Outside avatar mode the view rests on the square (wheel zooms, nothing pans it away).

![The Town by day](../../docs/screenshots/web/01-town-day.png)

| | |
|---|---|
| ![overview](../../docs/screenshots/web/02-town-overview.png) | ![night](../../docs/screenshots/web/03-town-night.png) |
| ![participant](../../docs/screenshots/web/05-participant.png) | ![owner](../../docs/screenshots/web/07-owner.png) |
| ![agents](../../docs/screenshots/web/08-agents-injection.png) | ![market](../../docs/screenshots/web/09-market.png) |

More: `docs/screenshots/web/` (pools, provider, explorer, metrics + harbor). Regenerate with `BASE=http://localhost:5178 node tools/screenshots.mjs` while `npm run web:mock` runs.

## What the Town shows

Agents are villagers; a pool is the notice board with a chest that fills; a pledge is a coin into the chest while the villager's purse only glows (the sats stay in their wallet); the settlement is one horse ride that drops a credit chest at every participant's house; the guard at the gate nods on an approved co-sign and raises "!" on a refusal; a stranger whispering is a prompt injection; vault chests sit in front of the agents' houses; the market stalls show listings; the harbor is Coop Rail (experimental). Every object opens a drawer with the transaction and a WhatsOnChain link. Corner counters: **Held in custody: 0 sat** (by construction), settlements, participants, village savings (`demo pricing`).

## Known limitations

- Desktop browsers only (≥ 1024 px); English. Multiplayer only with the Supabase transport (below), up to 8 players, names as each visitor announces them (cosmetic).
- Mainnet acceptance not done yet. The live flows (pledge, review + sign, redeem + job, mint + open pool, vault create/fund/policy/withdraw, list + sweep) run end to end on the mock chain against the real overlay, coordinator, provider-api and guard with a wallet-toolbox wallet (`test/web.live-flows.mockchain.test.ts`); BSV Desktop itself and mainnet are the untested part. `AuthFetch` from the browser to the provider-api and the guard needs their CORS in production (the dev proxy covers local).
- GPU jobs are simulated (`simulated GPU jobs`); pool discounts are `demo pricing`; Coop Rail is `experimental` (quotes only; no swap API yet).
- In live mode the agents' bubbles come from Track C's feed (`AGENTS_URL`, `/events`); that path is wired and the event shapes match, but it has not been run from the browser against the real agents yet.
- No real mainnet replay yet: record one from `/_debug` during a live run.
- No `/design-review` browser loop was run; the DESIGN.md checklist was applied by hand with screenshots.

## Live over Supabase (optional)

With `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in the root `.env`, live mode reads the relay's Supabase mirror ([`apps/relay`](../relay/README.md)) instead of opening the overlay, guard, agents and maker streams and polls itself: the town is full on the first frame, the feed survives a reload, and every visitor's browser holds one Realtime connection. The coordinator's WebSocket and every wallet flow stay direct (signing rounds need them). If the snapshot fails, takes over 5 s, or no tick (heartbeats included) arrives for 45 s, the web falls back to the direct streams on its own. `?transport=direct` (or `VITE_TRANSPORT=direct`) skips Supabase.

In avatar mode (`?avatar=1`) the same connection runs the multiplayer town: visitors see each other walk (a destination at most every 1.5 s, then the others walk there on the same map, because the free Realtime quota counts every recipient). Supabase is a view: nothing that signs or pays reads from it.

## Assets and licences

Town and UI art: **Kenmi — Cute Fantasy RPG (Premium)**, processed atlases only (the raw pack is not in the repo: `assets/packs/`, gitignored; rebuild with `npm -w apps/web run packs`). A few icons and all UI frames are drawn in the same style by `tools/ui.mjs`. Fonts: Pixelify Sans, IBM Plex Sans, VT323 (OFL). Sound is synthesised (no files). Full table: [`assets/LICENSES.md`](./assets/LICENSES.md). No BSVA logo is used in the app.

## Run

```bash
npm install                 # repo root (workspace)
npm run web:mock            # http://localhost:5173 — mock mode: MSW + scripted scenario + mock Desktop, no services
npm run web                 # live mode: Vite proxies /api/* to the local services (node infra/run.mjs, npm run provider, guard)
npm run web:build           # static build in apps/web/dist (VITE_* URLs from the root .env at build time)
npm run web:test            # vitest (unit + React Testing Library); the pure tests also run in the root `npm test`
npm -w apps/web run test:e2e   # Playwright, mock mode (first time: npx playwright install chromium)
npm -w apps/web run packs      # assets/packs (Kenmi, gitignored) → public/game atlases and terrain tilesets
npm -w apps/web run map        # src/town/map/*.ts → public/game/map.json (Tiled-compatible)
npm -w apps/web run ui         # public/ui icons strip + 9-slice frames
```

## Deploy (Vercel, public demo)

The public pitch demo runs on Vercel + Supabase with no backend: see [`plan/DEMO-HYBRID.md`](../../plan/DEMO-HYBRID.md). Import the `web` (Vite) project with Root Directory `apps/web` and Node 22.x; `vercel.json` sets install (`cd ../.. && npm ci`), build (`npm run build:demo`), output, the SPA rewrite and the headers below. Env: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (anon key only), `VITE_NETWORK=main`.

## Deploy (Cloudflare Pages)

- Build command `npm run web:build`, output `apps/web/dist`, Node 22+. `public/_redirects` routes every path to `index.html`; `public/_headers` sets CSP and long caches for `/game`, `/ui`, `/assets` (fill the service origins into `connect-src`).
- Build-time env (`VITE_*`, MASTER §3.9): `VITE_COOP_API_URL`, `VITE_OVERLAY_URL`, `VITE_PROVIDER_API_URL`, `VITE_GUARD_URL`, `VITE_AGENTS_URL`, `VITE_MAKER_URL`, `VITE_ARCADE_URL`, `VITE_NETWORK=main`, `VITE_DATA_MODE=live`. The services must send CORS for the Pages origin (the dev proxy is not there in production).
- Replays: `public/replays/*.jsonl`; record one from `/_debug` ("record a replay" → downloads `mainnet-<date>.jsonl`), open with `?replay=mainnet-<date>`.
- Sound is synthesised in the browser (no audio files). Keyboard: `T` town, `P` pools, `A` agents, `E` explorer, `K` market, `O` owner, `M` sound, `N` day/night, `?` tour.

`PORT=5180 npm run web:mock` picks another port. Modes can also be forced from the URL: `?mode=mock`, `?mode=live`, `?replay=<name>`.

## Pages

| Route | What |
|---|---|
| `/` | Town square: live feed, open pools, corner counters (Phaser scene in Phase 1) |
| `/pools`, `/me`, `/provider`, `/owner`, `/agents`, `/market`, `/explorer`, `/metrics` | the consoles: pools, participant, provider, owner (vault + guard), agents, market, ledger, metrics + harbor (Coop Rail, experimental) |
| `/_kit` | the design system: tokens, type, every component and state, sprites, Phaser atlas |
| `/_debug` | events, state, service health, mode controls, the core-in-browser smoke test |
| `/film` | film mode: a scripted Town scene on a 16:9 stage for the demo video (`?film=pool&subs=1&tc=1`; render with `npm run film:render`, see VIDEO.md) |

## Layout

`src/env.ts` modes and URLs · `src/events` CoopEvent envelope, bus, adapters (coordinator WS, overlay SSE + derive, envelope SSE), replay ·
`src/store` Zustand store, pure reducers, selectors · `src/api` service clients + TanStack queries · `src/wallet` WalletClient controller and error translation ·
`src/mock` MSW handlers, scenario, mock Desktop · `src/ui` components on the DESIGN.md tokens · `src/shell` top bar · `src/consoles` pages · `src/town` Phaser ·
`src/audio` synthesised sound · `src/replay` player + recorder · `assets/` raw packs (gitignored) and `LICENSES.md` · `tools/` pack pipeline, map export, UI assets, screenshots.
