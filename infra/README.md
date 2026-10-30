# infra

Runs the overlay (`packages/overlay`) and the coordinator (`apps/coordinator`) together, with persistent data, and restarts either one if it crashes.

```bash
nvm use 22
npm install                 # repo root (npm workspaces)
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

## Public deployment (Track B Faz 5, `plan/phases/B-P5a.md`)

One small VPS (2 vCPU, 4 GB, Ubuntu 22.04/24.04). Caddy terminates HTTPS and proxies `OVERLAY_HOST` → `:8080` and `COOP_HOST` → `:8090` (WebSocket `/ws` included); 8080/8090 are not opened to the outside.

```bash
git clone <repo> && cd <repo>
sudo bash infra/setup-vps.sh          # Node 22, Caddy, user `agentcoop`, /opt/agentcoop, /var/lib/agentcoop, systemd, daily backup, ufw
sudo nano /etc/agentcoop.env          # OVERLAY_HOST, COOP_HOST, ACME_EMAIL (from infra/agentcoop.env.example)
sudo systemctl restart agentcoop caddy
curl -s https://$COOP_HOST/healthz && curl -s https://$OVERLAY_HOST/agentcoop/healthz
```

Track E's web app is served from Cloudflare Pages: add `app.<domain>` as a CNAME to the Pages project in the same DNS zone (not through this VPS).

No domain: use `overlay.<ip-with-dashes>.sslip.io` and `coop.<ip-with-dashes>.sslip.io` (resolve to the IP, Let's Encrypt works).

| File | |
|---|---|
| `Caddyfile` | two hosts, automatic certificates, HTTP → HTTPS, SSE unbuffered |
| `agentcoop.service` | systemd unit: `node infra/run.mjs`, `DATA_DIR=/var/lib/agentcoop`, env from `/etc/agentcoop.env` (600) |
| `agentcoop.env.example` | server env: hosts, ports, round settings, edge limits, backup |
| `backup.mjs` | online SQLite backup (`better-sqlite3` backup API) of `overlay.db`, `coordinator.db` + `overlay.key` into `$BACKUP_DIR/<stamp>/`, keeps 7 days; `restore <dir>` puts one back |
| `setup-vps.sh` | one-time server setup (above) |

**Edge limits** (per client IP; Caddy's `X-Forwarded-For` is trusted from loopback only, the client address is its last hop; loopback callers such as the coordinator reading its overlay are exempt): coordinator GET 120/min, POST 10/min, WS 20 connections per IP, 1000 in total, 40 messages per 10 s per connection; overlay `/lookup` 60/min, `/submit` 30/min, bodies 1 MB JSON / 10 MB binary. Over the limit: `429 { code: 'RATE_LIMITED' }` with `Retry-After`. `RATE_LIMIT=off` turns the HTTP limits off.

**Monitoring.** UptimeRobot (free, 1 min) on `https://$COOP_HOST/healthz` and `https://$OVERLAY_HOST/agentcoop/healthz`; both answer 503 when unhealthy. Alert to the team Telegram. Logs: `journalctl -u agentcoop -f` (the coordinator's decisions are JSON lines).

**Backup and restore.** Cron runs `infra/backup.mjs` daily at 03:17 (`/etc/cron.d/agentcoop-backup`). Restore:

```bash
sudo systemctl stop agentcoop
sudo -u agentcoop DATA_DIR=/var/lib/agentcoop node /opt/agentcoop/infra/backup.mjs restore /var/backups/agentcoop/<stamp>
sudo systemctl start agentcoop
```

Tried locally (30.10): backup while both services ran, data dir deleted, restore, restart: the coordinator's rows and the overlay key (mode 600) came back.

## Mainnet preflight

```bash
node infra/preflight.mjs             # runtime, .env names, identities, Arcade, WhatsOnChain, services, BSV Desktop
node infra/preflight.mjs --wallets   # + server wallet balances against their targets
```

Spends nothing and never prints a key. Exit 1 if something blocks S1. The ordered mainnet steps for every track are in `plan/MAINNET-RUNBOOK.md`.
