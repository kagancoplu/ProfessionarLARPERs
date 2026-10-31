# E-P4 — Harbour/Rail scene, sound, replay recording, polish, publishing

> Track E phase 4 (`plan/track-E-frontend.md` §8 phase 4). Author: E, 2026-10-31 00:50 CET. Time box 3 hours. Branch `main`. Previous: `E-P3.md` (✅ `3c0f8c6`).

## 0. Goal
The product in a state to show the jury: the harbour scene honestly tied to D's Rail PoC ("experimental"), sound, real runs can be recorded, the first visit is understandable, keyboard shortcuts, a build ready for Cloudflare Pages.

## 1. Dependencies (00:50)
| | Status | In P4 |
|---|---|---|
| D.P3 Rail | **partly successful (offline)**: maker HTTP `GET /quote?dir=usdc-bsv&amount=` (USDC base units → sats, spread 150 bps), `GET /events` SSE (`rail_quote/locked_base/funded_bsv/claimed/refunded`), `/healthz`; no swap API (phase 5 A) | harbour office + boat scene, quote card, `experimental` label; **no** MetaMask/HTLC (no API) |
| B.P5 published URLs | none | Pages default domain; `VITE_*` at build time |
| Real mainnet runs | none (human + sats) | recorder ready; `mainnet-*.jsonl` when a human runs it |
| Sound assets | Kenney CC0 not downloaded (curl blocked) | **synthesised with Web Audio** (chiptune; no assets, no licence) |

## 2. Design
- **Maker service**: `env.urls.maker` (`VITE_MAKER_URL`, proxy `/api/maker` → :8094), `api/maker.ts` (`quote`, `healthz`, `eventsUrl`), envelope SSE at boot (`src:'maker'`), **optional** in the health probe (does not affect the summary badge). Mock: a `/quote` handler + one Rail beat in the scenario (quote → Base lock → BSV HTLC funded → agent+guard claim; T11).
- **Harbour**: clicking the harbour office (the fisherman's house) opens the `rail` drawer: "Coop Rail · experimental", maker health, a USDC → sats quote form (`/quote`), a rules summary (lands in the BSV vault, agent+guard claim, refund H+6), recent Rail events (T11 links). Town: `rail_funded_bsv` → a boat crosses the pond ("USDC → BSV · N sat"), `rail_claimed` → gold flies from the boat to the vault chest; `rail_refunded` → the boat turns back.
- **Sound** (`audio/sfx.ts`): 6 short effects from Web Audio oscillators (coin, bell, shield, chime, scroll, cart); tied to bus events while `settings.sound` is on (`pledge_added` coin, `pool_settled/settled` bell, `cosign_denied` shield, `sign_request` chime, `job_done` scroll, `listing_filled` coin); the AudioContext opens on the first click (autoplay lock), volume 0.25; `M` shortcut.
- **Replay recording** (`replay/recorder.ts`): `/_debug` "Record" → collects bus events → downloads `mainnet-<date>.jsonl` (first line a comment: mode, URLs, date). A human puts the file in `public/replays/`; `?replay=mainnet-<date>` and a "This really happened on BSV mainnet" badge (when the name starts with `mainnet`).
- **Polish**: a 3-step **tour banner** above the Town page on the first visit (not a modal: it does not interrupt e2e or the jury's flow; `localStorage agentcoop.tour`), keyboard shortcuts (`T` town, `P` pools, `E` explorer, `M` sound, `N` night/day, `?` help; off in input fields); loading/empty/error states already exist, 404 exists.
- **Publishing**: `public/_headers` (CSP: self + service URLs + Arcade + WoC; `X-Frame-Options`; caching: `/game/*`, `/ui/*`, `/assets/*` 1 year), `public/_redirects` (SPA), README "Deploy" section (Pages: build `npm run web:build`, output `apps/web/dist`, env `VITE_*`). The account and DNS are human work.
- **Quality gate**: typecheck, vitest, Playwright 6/6, `vite build` sizes into STATUS.

## 3. Tests
Unit: the `rail` scenario (T11 records), `recorder` (jsonl output and reading it back with `parseJsonl`), `sfx` (event → effect mapping, pure). e2e: the existing 6 green; the harbour drawer added to smoke.

## 4. Risks
| Risk | Plan |
|---|---|
| Maker not live | optional in health; the harbour card says "closed for season", the quote form disabled |
| Autoplay lock | `resume()` on the first pointer/keydown; silent until then |
| CSP service URLs differ when published | `_headers` template; updated when D/B URLs arrive |

## 5. Checkpoint (end of phase 4, 31.10 01:50)

**Acceptance evidence (mock)**
- **Harbour / Coop Rail:** `api/maker.ts`, `env.urls.maker` (+ proxy `/api/maker`, `VITE_MAKER_URL`), maker SSE and health at boot (optional: does not lower the badge). `RailCard` (`/metrics` "Harbor · Coop Rail" and the harbour office drawer in the Town): experimental label, maker status, USDC → sats quote (mock `/quote` handler, D's `/quote` when live), rules, recent Rail events (T11). Town: `rail_funded_bsv` → the boat crosses the pond ("USDC → BSV · N sat"), `rail_claimed` → gold into the vault chest. One Rail beat per scenario cycle (quote → Base lock → BSV funding → claim → vault +985 sat). No MetaMask/HTLC (D has no swap API; phase 5 A).
- **Sound:** `audio/sfx.ts` Web Audio synthesis (coin, bell, shield, chime, scroll, cart), `audio/index.ts` bus → effect, `settings.sound` (off by default), opens on the first gesture; no assets, no licence. The old `audio/sounds.ts` skeleton deleted.
- **Replay recording:** `replay/recorder.ts` + `/_debug` "record a replay" → downloads `mainnet-<date>.jsonl` (read back with `parseJsonl`; tested). A real mainnet recording waits for a human run.
- **Polish:** `TourBanner` (first visit, 3 steps, not a modal, `localStorage agentcoop.tour`), keyboard shortcuts (`T P A E K O`, `M` sound, `N` night/day, `?` tour; off in fields), the scenario postpones eval's sweep while a human is connected (so the human can take the stall), Phaser `CANVAS` in Playwright (headless WebGL framebuffer error).
- **Publishing:** `public/_redirects`, `public/_headers` (CSP + caching), README "Deploy" (Pages: `npm run web:build`, `apps/web/dist`, `VITE_*`). Build: index 631 kB (gzip 187), sdk 830 kB (239), phaser 1,194 kB (318, lazy), MSW 356 kB (mock only), css 52 kB. The Cloudflare account/DNS is human work.
- **Tests:** web vitest **19 files / 59 tests** (+ sfx, recorder, Rail beat), Playwright **6/6** (harbour quote added to smoke), typecheck clean.

**Checkpoint questions**
1. Is the plan still good? Yes; Lighthouse not run (note), a real replay depends on a human run.
2. Phase done (mock) → STATUS Track E.
3. Other tracks: D Rail "partly successful (offline)" → the harbour is honest; B has no published URLs.
4. Next: **P5 delivery** (README frontend section, screenshots, flow for the video, final STATUS). P6 avatar if time is left.
5. Interface: to D — maker `/healthz` and `/quote` from the browser (in mock) work; when a swap API arrives, the harbour card gets the MetaMask step.
