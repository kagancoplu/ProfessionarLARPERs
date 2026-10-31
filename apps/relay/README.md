# @agentcoop/relay: Supabase live mirror

Mirrors the services' state into Supabase so the web app can show the live Town from one Realtime connection: the board is full on the first frame, the feed survives a reload, and every visitor's browser holds one connection instead of a stream per service. Why it exists and what it may never do: [ADR 0004](../../docs/decisions/0004-supabase-display-only-mirror.md).

**Supabase is a view, not a source of truth.** The chain and the overlay stay authoritative; every row can be rebuilt from the services. Nothing that signs or pays reads from Supabase, and the protocol runs the same without it: the web falls back to its direct streams, and the CLIs and agents never use it (T-22).

## What it reads and writes

It reads what the web reads in live mode: the overlay's SSE and lookups, the coordinator's `GET /pools?pledges=1` and `/listings`, the guard's, agents' and maker's SSE, the coordinator's WebSocket as a watcher, and health probes. It writes:

| Table | What |
|---|---|
| `live_pools`, `live_pledges`, `live_listings`, `live_vaults`, `live_agents`, `live_health` | the latest snapshot, one row per pool, pledge, listing, vault, agent or service |
| `coop_events` | every event envelope (guard, agents, maker, overlay, coordinator), for history after a reload |
| `live_ticks` | at most one row a second with what changed, plus a heartbeat every 15 s; kept 10 minutes. The web listens to its INSERTs (Postgres Changes) |

`live_health` carries only a class of failure (`timeout`, `HTTP 503`, `bad answer`, `unreachable`); the full error stays in the relay's log (F-8). Schema and row-level security: `supabase/migrations/`. The contract the web reads back: `apps/relay/src/contract.ts`.

The same Supabase project also has `demo_payments` and `demo_receipts` (`supabase/migrations/20261031140000_demo_payments.sql`), prepared for a pitch-demo payment hand-off that the web app does not use yet. Unlike the mirror tables, they accept anonymous inserts; a row cannot move money, because a receiver would verify the payment by SPV and `internalizeAction`.

## Run

```bash
# root .env: SUPABASE_URL and SUPABASE_SECRET_KEY (see .env.example)
npm run infra                     # overlay + coordinator + relay (the relay starts only when both variables are set)
npm start -w @agentcoop/relay     # the relay alone, against services already running
```

The relay reads the service URLs from the shared variables (`COOP_API_URL`, `OVERLAY_URL`, `GUARD_URL`, `PROVIDER_API_URL`, `AGENTS_URL`, `MAKER_URL`, `ARCADE_URL`; [docs/reference/configuration.md](../../docs/reference/configuration.md)).

## Supabase project

```bash
supabase link --project-ref <ref>      # once
supabase db push                       # applies supabase/migrations/*.sql
```

- **Keys.** The relay needs the secret key (`sb_secret_…`, or the legacy `service_role` key). `supabase projects api-keys --project-ref <ref> --reveal` prints it; without `--reveal` the value is masked and the relay fails with "Invalid API key". The web needs the **legacy JWT anon key** (`VITE_SUPABASE_ANON_KEY`): with a `sb_publishable_…` key, a local stack delivered no Postgres Changes to subscribers. The publishable key has not been tried on a hosted project.
- **Free-plan limits** that shaped the design: Realtime 200 concurrent connections, 100 messages/s and 2 M messages a month per organisation, **each recipient counted**; PostgREST returns at most 1,000 rows per request (the snapshot is read in pages). Hence at most one tick a second, and destinations (not positions) in multiplayer.
- **`.env` hygiene.** Lines that are not `KEY=VALUE` (for example npm's `> …` banners from a redirected `npm run`) break the Supabase CLI's reading of `.env`; comment them out.

## Tests

`npm test` runs the unit tests (mirror, SSE, sources, wiring). The schema, RLS and sink tests (`apps/relay/test/*.local.test.ts`) run against a local stack and are skipped otherwise; CI's `supabase-rls` job runs them with `SUPABASE_LOCAL_REQUIRED=1` so they fail instead of skipping.

```bash
supabase start
eval "$(supabase status -o env | sed -E 's/^([A-Z_]+)=/export SB_\1=/')"
SUPABASE_LOCAL_URL=$SB_API_URL SUPABASE_LOCAL_ANON_KEY=$SB_ANON_KEY SUPABASE_LOCAL_SECRET_KEY=$SB_SECRET_KEY npx vitest run apps/relay
```

End-to-end rehearsal against the **local** stack only (it deletes the tables' rows and refuses a remote URL): `npx tsx --import @agentcoop/core/register-sdk scripts/rehearsal-supabase.ts` (mock chain, two browsers).

## Security

- `SUPABASE_SECRET_KEY` bypasses RLS: keep it in the root `.env` (git-ignored) and the relay's environment only. Never log it, never paste it, never put it in a `VITE_*` variable.
- The web uses the anon key, which is public: it can read the mirror and nothing else.
- A tampered mirror can mislead what a viewer sees but cannot redirect a payment: the browser reads pool terms from the coordinator before it pays (I-16, `test/web.live-flows.mockchain.test.ts`).

## Demo: two screens, one Town

1. Root `.env`: `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (Supabase dashboard → Project Settings → API keys).
2. `npm run infra` (overlay + coordinator + relay), then the provider, guard and agents ([docs/OPS.md §7](../../docs/OPS.md#7-a-full-mainnet-run-in-order)).
3. `npm run web` on two machines (or a normal and a private window), both pointing at the same services.
4. Show: an agent's pledge lands on both screens at once; a reload keeps the Town and the feed; with `?avatar=1` on both, each sees the other walk; stop the relay and the web says "reading the services directly" and keeps working.
