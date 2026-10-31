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

## Film mode: the opening of the demo video

`/film` plays a scripted scene in the Town on a black 16:9 stage, outside the app shell, the same way in every take. The script drives the Town's own entities (villagers, board, fountain, horse); no protocol events, no data, no chain. The first script is **"The Pool"** (`src/film/pool.ts`, 48 s): Axel needs 50 GPU-hours, the workshop sells 1000, the village pools at the notice board, one transaction settles it, the camera pulls back to the whole town. After it, the video cuts to the app (Pools, Market, My agents) and the real mainnet payment.

### Watch it, record it, render it

```bash
npm run dev:mock -w apps/web
```

Then open `http://localhost:5173/film?subs=1&tc=1` and press Space (or click) to roll.

| Parameter | What it does |
|---|---|
| `film=pool` | which script (`src/film/films.ts`) |
| `subs=1` | the narrator's lines as subtitles (to rehearse the voice-over) |
| `tc=1` | timecode, current beat and late beats in the top-left corner |
| `autostart=1` | roll at once instead of waiting for Space |
| `render=1` | frame-by-frame mode for the renderer (the clock only moves when stepped) |

- **Live take (OBS, Screen Studio):** browser full screen at 1920×1080, `/film`, press Space. The canvas is 1920×1080 scaled to the window; on a smaller screen the pixels are resampled, so prefer the renderer.
- **Render (recommended):** `npm -w apps/web run film:render` writes `apps/web/film-out/pool.mp4` (1920×1080, 30 fps, H.264). It steps the game clock one frame at a time and screenshots each frame, so the result is smooth and on time on any machine, and lines up with the voice-over to the frame. `FPS=60`, `SUBS=1` (burn in subtitles), `GPU=1`, `CHROMIUM=<binary>`; needs ffmpeg. `film-out/` is not committed.

### "The Pool": beats, lines, voice-over

Framing (1920×1080): close = zoom 6 (320×180 world px), medium = 4, wide = 3, the whole map = 2.5.

| s | Beat | Camera | On screen (bubbles) | Narrator (voice-over) |
|---|---|---|---|---|
| 0–10 | hook | close on Axel at the fountain; pans to the workshop's sign "wholesale only · min. 1000" and back | *(thought)* "I need 50 GPU-hours…" · "…but they only sell 1000." · "…" | 0.6 s: "Compute is sold wholesale. Most of us only need a slice." |
| 10–15 | idea | follows Axel to the notice board, zooms to medium | "!" · *(thought)* "What if we buy it together?" · board: "GPU pool · 50 / 1,000" · "Pledged 50. The coins stay in my wallet." | 10.6 s: "So Axel posts a pool on the notice board." |
| 15–28 | village | medium on the board | Baker: "200 for my bakery's AI!" · Farmer: "150 for crop forecasts." · AI agent (AGENT tag, its guard beside it): "My owner set my budget: 300." · guard: "✓ within policy" · Fisher: "300, and that fills it!" · board 1,000 / 1,000 · full! · ♪ | 16 s: "Everyone pledges only what they need, and nobody hands their money to anyone. Even AI agents can join, within the budget their owner set." |
| 28–39 | settlement | wide on the square | the fountain lights up, the horse crosses, a coin from each to the workshop ("paid in full ✓"), a chest drops in front of each, parchment "1 transaction · 5 participants · 0 sat held by anyone" | 30.8 s: "When the pool fills, one Bitcoin transaction pays the provider and delivers everyone's share. All at once, or not at all." |
| 39–48 | payoff, pull-back | close on Axel, then out to the whole town | Axel opens his chest: "50 GPU-hours. Exactly what I needed." | 43.5 s: "Now let's look behind the town." |

The narrator's text lives in `NARRATION` in `src/film/pool.ts` (one place for subtitles and the ElevenLabs script); `test/film.test.ts` checks every line fits its slot at 2.6 words a second. To change timing, edit the `d.at(seconds, 'beat')` sync points in the same file; a beat reached later than scheduled (a walk took longer) is listed in the `tc=1` overlay and by the renderer.

The film is an illustration of the mechanism: no txid is shown in it. The real mainnet transaction is shown afterwards, in the app.
