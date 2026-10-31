# E-P5 — Delivery

> Track E phase 5 (`plan/track-E-frontend.md` §8 phase 5). Author: E, 2026-10-31 02:00 CET. Time box 1.5 hours. Branch `main`. Previous: `E-P4.md` (✅ `780d5b7`).

## 0. Goal
The frontend delivery package: presenter mode, the delivery section of `apps/web/README.md` (link/summary for D's root README), screenshots, a list of video material, known limitations, STATUS "Done" + the human to-dos.

## 1. Tasks
- 5.1 **Presenter mode** `?presenter=1` (or `settings.presenter`): main content at 115 %, tour banner hidden, toasts silent (notifications stay in the Explorer), scene jumps in replay: `1` pool opens, `2` lock-in, `3` settlement, `4` guard refusal, `5` market.
- 5.2 `apps/web/README.md`: "Open the town" (URL after publishing), running locally, modes, the Desktop connection, screenshots (`docs/screenshots/web/`), shortcuts, known limitations, asset licence summary. The root README's `apps/web` row already exists; a STATUS note to D.
- 5.3 Screenshots: update `tools/screenshots.mjs` (town day/night, pools, participant, provider, owner, agents, market, explorer, metrics) → `docs/screenshots/web/*.png` (1440×900).
- 5.4 Video material: `apps/web/VIDEO.md` (scene list, which mode, which shortcut, duration).
- 5.5 Final check: typecheck, vitest, Playwright 6/6, build, grep for the honesty labels, no BSVA logo used (no rule violation).
- 5.6 STATUS Track E "Done (mock)"; the human to-dos in one place.

## 2. Checkpoint (end of phase 5, 31.10 02:40)

- **Presenter mode** `?presenter=1`: `main` at 115 % (`zoom`), toasts off, tour banner hidden; `1`–`5` scene jumps in replay (`pool_opened`, `sign_request`, `pool_settled`, `cosign_denied`, `listing_added`).
- **README** `apps/web/README.md`: "Open the town", modes, Desktop, screenshots, a Town glossary, known limitations, licence summary, Deploy. The root README has the `apps/web` row (D); D can take the "Open the town" paragraph if wanted (STATUS note).
- **Screenshots** `docs/screenshots/web/` (11 PNGs, 1440×900): town day/overview/night, pools, participant, provider, owner, agents + injection, market, explorer, metrics + harbour. `tools/screenshots.mjs` regenerates them.
- **Video material** `apps/web/VIDEO.md` (9 scenes, mode, shortcut, duration).
- **Final check:** typecheck clean, vitest 59, Playwright 6/6, `vite build` ✓; the honesty labels (`demo pricing`, `simulated GPU jobs`, `experimental`, `MOCK`) in place; no BSVA logo used.
- **STATUS:** Track E "Done (mock)"; the human to-dos in one list.

**Delivery package:** URL (after publishing), `docs/screenshots/web/*`, `public/replays/mock-demo.jsonl` (the real recording comes from the human run), `assets/LICENSES.md`, `VIDEO.md`.
**Open blockers → "Known limitations":** mainnet acceptance, publishing, C's agent SSE, a real replay.
