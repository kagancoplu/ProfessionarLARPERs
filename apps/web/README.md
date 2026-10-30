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
npm -w apps/web run sprites    # assets/sprites/*.ts → SVG data + Phaser atlas
```

`PORT=5180 npm run web:mock` picks another port. Modes can also be forced from the URL: `?mode=mock`, `?mode=live`, `?replay=<name>`.

## Pages

| Route | What |
|---|---|
| `/` | Town square: live feed, open pools, corner counters (Phaser scene in Phase 1) |
| `/pools`, `/agents`, `/explorer`, `/metrics` | consoles reading the store (P1–P3 fill them in) |
| `/_kit` | the design system: tokens, type, every component and state, sprites, Phaser atlas |
| `/_debug` | events, state, service health, mode controls, the core-in-browser smoke test |

## Layout

`src/env.ts` modes and URLs · `src/events` CoopEvent envelope, bus, adapters (coordinator WS, overlay SSE + derive, envelope SSE), replay ·
`src/store` Zustand store, pure reducers, selectors · `src/api` service clients + TanStack queries · `src/wallet` WalletClient controller and error translation ·
`src/mock` MSW handlers, scenario, mock Desktop · `src/ui` components on the DESIGN.md tokens · `src/shell` top bar · `src/consoles` pages · `src/town` Phaser ·
`assets/` palette, sprite matrices, `LICENSES.md` · `tools/` sprite/atlas generator, palette aligner.
