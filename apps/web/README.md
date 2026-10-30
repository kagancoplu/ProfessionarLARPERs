# apps/web — AgentCoop frontend (Track E)

Role consoles (provider, agent owner, human participant, observer/jury) and the pixel-art **Town**, one store.
Every signature happens in the user's **BSV Desktop** (`WalletClient('auto')`); the browser never sees a key.
Design rules: [`DESIGN.md`](./DESIGN.md). Plan: `plan/track-E-frontend.md`, phases in `plan/phases/E-P*.md`.

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

## Layout

`src/env.ts` modes and URLs · `src/events` CoopEvent envelope, bus, adapters (coordinator WS, overlay SSE + derive, envelope SSE), replay ·
`src/store` Zustand store, pure reducers, selectors · `src/api` service clients + TanStack queries · `src/wallet` WalletClient controller and error translation ·
`src/mock` MSW handlers, scenario, mock Desktop · `src/ui` components on the DESIGN.md tokens · `src/shell` top bar · `src/consoles` pages · `src/town` Phaser ·
`src/audio` synthesised sound · `src/replay` player + recorder · `assets/` raw packs (gitignored) and `LICENSES.md` · `tools/` pack pipeline, map export, UI assets, screenshots.
