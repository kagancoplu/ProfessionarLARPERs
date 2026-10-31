# Configuration

Every service reads the root `.env` (copied from [`.env.example`](../../.env.example), git-ignored). `infra/run.mjs` loads it for the services it starts and never overrides a variable already set in the environment. This page lists which component reads which variable; tuning variables that belong to a single component are documented in that component's README, which is their canonical source.

Nothing here is needed for `npm test`, the demos or `npm run web:mock`.

## Shared

| Variable | Default (`.env.example`) | Read by |
|---|---|---|
| `NETWORK` | `main` | every service and CLI (`main` or `test`) |
| `ARCADE_URL` | `https://arcade-v2-us-1.bsvblockchain.tech` | broadcast, headers, fee policy, ancestor fetches |
| `OVERLAY_URL` | `http://localhost:8080` | coordinator, provider API, agents, CLIs, relay |
| `COOP_API_URL` | `http://localhost:8090` | provider API (open pools in its catalog), agents, CLIs, relay |
| `GUARD_URL` | `http://localhost:8091` | guard (its own port), agents in vault mode, owner and participant CLIs, coordinator (Lighthouse), maker |
| `PROVIDER_API_URL` | `http://localhost:8092` | agents, relay |
| `AGENTS_URL` | `http://localhost:8093` | agents (their event feed's port), relay |
| `MAKER_URL` | `http://localhost:8094` | maker (its port), relay |
| `DATA_DIR` | `<repo>/data` | `infra/run.mjs` and the provider and agent apps; `scripts/` and the guard always use `<repo>/data` |
| `APP_ORIGINATOR` | `agentcoop.local` | CLIs that connect to BSV Desktop |
| `WALLET_SUBSTRATE` | empty (`auto`) | `provider-cli`, `participant-cli`: `json-api` pins BSV Desktop to `http://localhost:3321` |

## Server wallet keys (secret)

64 hex characters each, generated with `npx tsx scripts/keygen.ts --only-missing >> .env` ([OPS.md](../OPS.md#2-setup-once-per-machine)). Never commit, log or paste them.

| Variable | Wallet |
|---|---|
| `WALLET_PROVIDER_API_KEY` | provider API |
| `WALLET_GUARD_KEY` | guard |
| `WALLET_AGENT_1_KEY`, `WALLET_AGENT_2_KEY`, `WALLET_AGENT_3_KEY` | agents `finetune`, `eval`, `inference` |
| `WALLET_MAKER_KEY` | Coop Rail maker |
| `WALLET_COORDINATOR_KEY` | reserved; the coordinator service does not load it |
| `OVERLAY_PRIVATE_KEY` | overlay node identity; empty = generated once into `data/overlay/overlay.key` (mode 600) |

## By component

| Component | Variables | Details |
|---|---|---|
| Overlay | `PORT`, `OVERLAY_DB`, `CHAINTRACKS_URL`, `CHAIN_TRACKER`, `WOC_API_KEY`, `TOKEN_WHITELIST`, `OVERLAY_RATE_LOOKUP_PER_MIN`, `OVERLAY_RATE_SUBMIT_PER_MIN`, `RATE_LIMIT` | [packages/overlay/README.md](../../packages/overlay/README.md#run) |
| Coordinator | `PORT`, `COORDINATOR_DB`, `COORDINATOR_POLL_MS`, `ROUND_TIMEOUT_MS`, `MAX_ROUNDS`, `STARTUP_GRACE_MS`, `SPENT_CHECK`, `LIGHTHOUSE_GUARDS`, `RATE_LIMIT`, `RATE_GET_PER_MIN`, `RATE_POST_PER_MIN`, `WS_MAX_PER_IP`, `WS_MAX_CLIENTS`, `WS_MAX_MSGS_PER_10S` | [apps/coordinator/README.md](../../apps/coordinator/README.md#run) |
| Guard | `GUARD_URL` (port), `GUARD_CORS_ORIGIN` | [apps/guard/README.md](../../apps/guard/README.md#run) |
| Provider API | `PROVIDER_API_URL` (port), `PROVIDER_CORS_ORIGIN` | [apps/provider-api/README.md](../../apps/provider-api/README.md) |
| Agents | `AGENT_BRAIN` (`rules`, `llm`, `openai`), `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `OPENAI_MODEL`, `AGENTS_CORS_ORIGIN`, `<NAME>_VAULT_ID` (e.g. `FINETUNE_VAULT_ID`) | [apps/agents/README.md](../../apps/agents/README.md#run-against-real-services) |
| Maker (Coop Rail) | `BASE_RPC_URL`, `BASE_PRIVATE_KEY`, `BASE_AGENT_PRIVATE_KEY`, `BASE_USDC_ADDRESS`, `BASE_HTLC_ADDRESS`, `RAIL_SATS_PER_USDC`, `MAKER_CORS_ORIGIN` | [apps/maker/README.md](../../apps/maker/README.md#configuration) |
| Relay | `SUPABASE_URL`, `SUPABASE_SECRET_KEY` (secret: bypasses row-level security) | [apps/relay/README.md](../../apps/relay/README.md) |
| `infra/run.mjs` | `OVERLAY_PORT`, `COOP_PORT`, `COOP2_PORT`, `FULL_STACK`, `GUARD_PORT`, `PROVIDER_PORT`, `AGENTS_PORT` | [infra/README.md](../../infra/README.md) |
| `infra/backup.mjs` | `BACKUP_DIR`, `BACKUP_KEEP_DAYS` | [infra/README.md](../../infra/README.md#public-deployment) |

`COOP2_PORT` (a second coordinator) and the maker both default to 8094 in the examples; set one of them to another port if you run both on one machine.

## Web app (build time)

`VITE_*` values are compiled into the bundle and visible to every visitor: public URLs and the Supabase anon key only, never a secret.

| Variable | Meaning |
|---|---|
| `VITE_COOP_API_URL`, `VITE_OVERLAY_URL`, `VITE_PROVIDER_API_URL`, `VITE_GUARD_URL`, `VITE_AGENTS_URL`, `VITE_MAKER_URL`, `VITE_ARCADE_URL` | service URLs in a production build (the dev server proxies `/api/*` instead) |
| `VITE_NETWORK` | `main` or `test` |
| `VITE_DATA_MODE` | `live`, `mock` or `replay` when the URL does not say (`?mode=`, `?replay=`) |
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | the relay's mirror; both set = Supabase transport in live mode |
| `VITE_TRANSPORT` | `supabase` or `direct`; `?transport=direct` overrides |
| `VITE_USE_PROXY` | `false` disables the dev proxy |

Details: [apps/web/README.md](../../apps/web/README.md).
