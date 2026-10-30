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
