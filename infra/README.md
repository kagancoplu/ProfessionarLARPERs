# infra

Runs the AgentCoop services together with persistent data, restarts any that crash, and deploys them on one public host. By default `infra/run.mjs` starts the overlay (`packages/overlay`) and the coordinator (`apps/coordinator`); optional switches add a second coordinator, the Supabase relay, and the guard, provider API and agents.

```bash
nvm use 22
npm install                 # repo root (npm workspaces)
npm run infra              # = node infra/run.mjs: overlay :8080, coordinator :8090 (WS /ws); Ctrl+C stops all
```

| Variable | Default | |
|---|---|---|
| `DATA_DIR` | `./data` | `overlay/overlay.db`, `overlay/overlay.key` (created, mode 600), `coordinator/coordinator.db`. Git-ignored; back it up |
| `OVERLAY_PORT` / `COOP_PORT` | `8080` / `8090` | |
| `OVERLAY_PRIVATE_KEY` | from `overlay.key` | overlay node identity |
| `NETWORK`, `ARCADE_URL`, `TOKEN_WHITELIST`, `ROUND_TIMEOUT_MS`, `MAX_ROUNDS`, `SPENT_CHECK` | | passed to the services (see their READMEs) |
| `COOP2_PORT` | unset | also start a second, independent coordinator on the same overlay (own database `coordinator2/coordinator.db`). Do not reuse 8094 if the maker runs on this machine |
| `SUPABASE_URL` + `SUPABASE_SECRET_KEY` | unset | both set: also start the relay ([apps/relay](../apps/relay/README.md)) |
| `FULL_STACK=1` | unset | also start the guard (`GUARD_PORT`, 8091), the provider API (`PROVIDER_PORT`, 8092) and the agents (`AGENTS_PORT`, 8093), for a single-box live deployment. Needs the server wallet keys and, for LLM agents, `AGENT_BRAIN` and its API key |

The root `.env` is read if present; variables already set in the environment win, and no value is ever printed.

Logs are prefixed `[overlay]`, `[coordinator]`, `[infra]`; the coordinator's decision log is one JSON object per line. A crashed service restarts after 2 s, backing off to 30 s if it keeps crashing.

## Public deployment

One small VPS (2 vCPU, 4 GB, Ubuntu 22.04/24.04). Caddy terminates HTTPS and proxies `OVERLAY_HOST` → `:8080` and `COOP_HOST` → `:8090` (WebSocket `/ws` included); the service ports are not opened to the outside. With `FULL_STACK=1`, `GUARD_HOST`, `PROVIDER_HOST` and `AGENTS_HOST` are proxied the same way (SSE unbuffered). A full-stack box holds hot server wallets: fund them with only what the demo needs ([docs/OPS.md](../docs/OPS.md)).

```bash
git clone <repo> && cd <repo>
sudo bash infra/setup-vps.sh          # Node 22, Caddy, user `agentcoop`, /opt/agentcoop, /var/lib/agentcoop, systemd, daily backup, ufw
sudo nano /etc/agentcoop.env          # OVERLAY_HOST, COOP_HOST, ACME_EMAIL (from infra/agentcoop.env.example)
sudo systemctl restart agentcoop caddy
curl -s https://$COOP_HOST/healthz && curl -s https://$OVERLAY_HOST/agentcoop/healthz
```

The web app is served from a static host, not this VPS ([apps/web/README.md](../apps/web/README.md#deploy)); point its `VITE_*` URLs at these hosts and allow its origin in the services' CORS settings.

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

Spends nothing and never prints a key. Exit 1 if something blocks a first mainnet run (the walking skeleton, "S1"). The ordered mainnet steps are in [docs/OPS.md §7](../docs/OPS.md#7-a-full-mainnet-run-in-order).
