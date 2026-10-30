# infra

Runs the overlay (`packages/overlay`) and the coordinator (`apps/coordinator`) together, with persistent data, and restarts either one if it crashes.

```bash
nvm use 22
(cd packages/overlay && npm install) && (cd apps/coordinator && npm install)
node infra/run.mjs          # overlay :8080, coordinator :8090 (WS /ws); Ctrl+C stops both
```

`npm run infra` from the repo root once Track A's root `package.json` has `"infra": "node infra/run.mjs"`.

| Variable | Default | |
|---|---|---|
| `DATA_DIR` | `./data` | `overlay/overlay.db`, `overlay/overlay.key` (created, mode 600), `coordinator/coordinator.db`. Git-ignored; back it up |
| `OVERLAY_PORT` / `COOP_PORT` | `8080` / `8090` | |
| `OVERLAY_PRIVATE_KEY` | from `overlay.key` | overlay node identity |
| `NETWORK`, `ARCADE_URL`, `TOKEN_WHITELIST`, `ROUND_TIMEOUT_MS`, `MAX_ROUNDS`, `SPENT_CHECK` | | passed to the services (see their READMEs) |

The root `.env` is read if present; variables already set in the environment win, and no value is ever printed.

Logs are prefixed `[overlay]`, `[coordinator]`, `[infra]`; the coordinator's decision log is one JSON object per line. A crashed service restarts after 2 s, backing off to 30 s if it keeps crashing.

Public deployment (VPS, HTTPS, domain, monitoring) is Track B Faz 5.
