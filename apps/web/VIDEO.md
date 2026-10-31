# Video material — apps/web (Track E, P5)

Scenes to record from the browser (mock mode unless noted), 1440×900, `?presenter=1` for bigger type and no toasts.
Keys in replay mode: `1` pool opens · `2` lock-in · `3` settlement · `4` guard refusal · `5` market.

| # | Scene | Where | What to show | ~s |
|---|---|---|---|---|
| 1 | The square at work | `/` (mock) | villagers pledge at the notice board, the chest fills, "Held in custody 0 sat" | 20 |
| 2 | One transaction settles | `/` at ~11 s of the cycle (or `?replay=mock-demo` + `3`) | fountain sparkle, the horse crosses, chests land at the houses, the parchment "1 transaction · N participants · 0 sat held" | 15 |
| 3 | A human joins and signs | `/me` (mock Desktop) | Join → approval scroll → pledge pending → sign request card → 5 checks → Sign → settled → credits | 40 |
| 4 | Prompt injection refused | `/agents` → "Inject now", then `/` | stranger whispers, agent tries, the guard's "!" and the 403 reason; `/owner` Denials | 25 |
| 5 | Owner gives a budget | `/owner` | create vault → fund (T9) → policy → withdraw alone | 30 |
| 6 | Market sweep | `/market` (~28 s of the cycle) | pick the listing → sweep scroll (lineage, 1 approval) → credits; stall empties in the Town | 20 |
| 7 | Provider opens a pool | `/provider` | mint → open pool (2 approvals, SINGLE\|ACP) → board shows it | 25 |
| 8 | Harbor (experimental) | `/metrics` → Harbor, `/` pond | quote from the maker; the boat crosses, gold to the vault chest; "experimental" visible | 15 |
| 9 | Live mode (if services run) | `PORT=5178 npm run web` + `node infra/run.mjs` | services badge green, real pools on the board, WhatsOnChain links | 20 |

Honesty tags must stay in frame where they apply: `demo pricing`, `simulated GPU jobs`, `experimental`, `MOCK`.

## Film mode: the demo video (2:30)

The video is made from code, so every take is the same and the picture lines up with the narrator to the frame. Four segments, 48 + 70 + 18 + 14 s:

| s | Segment | Where | What |
|---|---|---|---|
| 0:00–0:48 | **The Pool** | `/film?film=pool` (`src/film/pool.ts`) | Axel needs 50 GPU-hours, the workshop sells 1000; the village pools at the notice board; the fountain lights up, the horse crosses, a chest for everyone; the camera pulls back |
| 0:48–1:58 | **App tour** | `/?tour=main` over the real app in mock mode (`src/film/tourMain.ts`) | the film shrinks into the Town; a pixel cursor visits **Town** (0 sat in custody), **Pools** (the provider's offer signed once, a pool that did not fill, the settlement), **Market** (an agent buys spare credits), **My Agents** (vault and budget, the 5 checks, "Inject now" and the guard's refusal, Coop Rail); two **real mainnet transactions** read from the WhatsOnChain API |
| 1:58–2:16 | **Why BSV** | `/film?film=why` (`src/film/WhyBsv.tsx`) | split screen: Ethereum escrow (5 deposits + 5 refunds) against one BSV transaction; the BSV stack |
| 2:16–2:30 | **Manifesto** | `/film?film=manifesto` (`src/film/manifesto.ts`) | the square at dusk, then the end card for the last 4.6 s: logo, line, live demo URL and repo, **Try now** with a QR code to the live demo (`public/ui/qr-live-demo.svg`) |

Every narrator line lives in `src/film/narration.ts` (segment, start second, subtitle length, spoken form); `apps/web/test/film.test.ts` checks they fit. Honesty: the app tour shows the `MOCK` and `demo pricing` tags as the app does; the two transactions are real (T5 settlement `6d320c9a…`, T8 market sweep `675c3334…`), shown as our own card with data read from the WhatsOnChain API, not as a copy of the site. Screenshots of the real WhatsOnChain pages can replace the cards: save them as `public/_film/woc-settlement.png` and `woc-sweep.png` (the site's bot check blocks a headless browser).

### Make it

```bash
npm i --no-save kokoro-js
```

```bash
VOICE=af_heart npm -w apps/web run film:voice
```

```bash
npm -w apps/web run film:make
```

- `film:voice`: Kokoro-82M (Apache-2.0, CPU) speaks every line into `film-out/voice/`; `VOICE` picks the voice (`af_heart`, `am_michael`, `bm_george`, …), `SPEED` the pace (1.1). The model downloads from Hugging Face on the first run (behind a proxy: `NODE_USE_ENV_PROXY=1`).
- `film:make` runs, in order: `film:render` for "The Pool"; `film:assets` (the two transactions from the WhatsOnChain API and the film's last frame, into `public/_film/`); `film:render` with `SEG=tour`, `SEG=why`, `SEG=manifesto`; `film:mix`. `ONLY=tour,mix` runs only those steps.
- `film:render` steps the page's clock one frame at a time (`src/film/vclock.ts`: timers, animation frames, Date, CSS animations) and screenshots each frame into ffmpeg: smooth 30 fps on any machine. `FPS=60`, `SUBS=1` (burn in subtitles), `GPU=1`, `CHROMIUM=<binary>`. Its own dev server runs without hot reload, so editing `src/` during a render is safe.
- `film:mix` writes the soundtrack and the cut: an original chiptune generated in code (120 bpm, so the segments fall on bar lines; it ducks under the narrator), sound effects synthesised from the cues the scripts logged (the app's own effect scores plus speech blips, hooves, sparkles, clicks), the narrator, then `film-out/agentcoop-demo.mp4` (1920×1080, H.264/AAC, −16 LUFS) with the narrator's lines **burnt in as subtitles** (IBM Plex Sans from the app's font package, cream on a dark see-through box; `SUBS=0` for a clean cut), `agentcoop-demo.srt` and `.ass`, `mix.wav` and `music.wav`. `film-out/` and `public/_film/` are not committed.

### Watch a segment live

```bash
npm run dev:mock -w apps/web
```

Then open `http://localhost:5173/film?film=pool&subs=1&tc=1` (or `film=why`, `film=manifesto`) and press Space. The tour: `http://localhost:5173/?tour=main&presenter=1&subs=1&tc=1`, Space (it waits until the mock scenario reaches its first beat, about 25 s after the page loads).

| Parameter | What it does |
|---|---|
| `film=pool` / `why` / `manifesto` | which segment (`src/film/films.ts`) |
| `tour=main` | the app tour, on any app page (`src/film/TourRunner.tsx`) |
| `subs=1` | the narrator's lines as subtitles |
| `tc=1` | timecode, current beat and late beats in the corner |
| `autostart=1` | roll at once instead of waiting for Space |
| `render=1` | virtual clock for the frame-by-frame renderer |

To change timing, edit the `d.at(seconds, 'beat')` sync points in the segment's script and the line's `at` in `narration.ts`; a beat reached later than scheduled is listed in the `tc=1` overlay and by the renderer.

### "The Pool": beats and lines

Framing (1920×1080): close = zoom 6 (320×180 world px), medium = 4, wide = 3, the whole map = 2.5.

| s | Beat | On screen (bubbles) |
|---|---|---|
| 0–10 | hook | *(thought)* "I need 50 GPU-hours…" · the workshop's sign "wholesale only · min. 1000" · "…but they only sell 1000." · "…" |
| 10–15 | idea | "!" · *(thought)* "What if we buy it together?" · board "GPU pool · 50 / 1,000" · "Pledged 50. The coins stay in my wallet." |
| 15–28 | village | Baker "200 for my bakery's AI!" · Farmer "150 for crop forecasts." · AI agent (AGENT tag, its guard beside it) "My owner set my budget: 300." · guard "✓ within policy" · Fisher "300, and that fills it!" · 1,000 / 1,000 full · ♪ |
| 28–39 | settlement | the fountain lights up, the horse crosses, a coin from each to the workshop ("paid in full ✓"), a chest in front of each, "1 transaction · 5 participants · 0 sat held by anyone" |
| 39–48 | payoff | Axel opens his chest: "50 GPU-hours. Exactly what I needed." · the camera pulls back to the whole town |
