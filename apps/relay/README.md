# relay

Mirrors the services into Supabase so the web can show the live town from one connection
(plan: [`plan/phases/SUPABASE-MVP.md`](../../plan/phases/SUPABASE-MVP.md), design: [`plan/SUPABASE-FLOW.md`](../../plan/SUPABASE-FLOW.md)).

It reads what the web reads in live mode (overlay SSE + lookup, coordinator `GET /pools?pledges=1` and `/listings`,
guard/agents/maker SSE, the coordinator's WS as a watcher, health probes) and writes:

| Table | What |
|---|---|
| `live_pools`, `live_pledges`, `live_listings`, `live_vaults`, `live_agents`, `live_health` | the latest snapshot, one row per pool / pledge / listing / vault / agent / service |
| `coop_events` | every event envelope (guard, agents, maker, overlay, coordinator), for history after a reload |
| `live_ticks` | at most one row a second with what changed, plus a heartbeat every 15 s; kept 10 minutes. The web listens to its INSERTs (Postgres Changes) |

**Supabase is a view, not a source of truth.** The chain and the overlay stay authoritative; every row can be rebuilt
from them. Nothing that signs or pays reads from Supabase, and the protocol runs the same without it (the web falls
back to its direct streams). RLS allows `select` only; writes need the secret key, which lives only in the relay.

## Run

```bash
# root .env: SUPABASE_URL and SUPABASE_SECRET_KEY (see .env.example)
npm run infra            # overlay + coordinator + relay (the relay starts only when both variables are set)
npm start -w @agentcoop/relay   # the relay alone, against services already running
```

## Supabase project

```bash
supabase link --project-ref <ref>      # once
supabase db push                       # applies supabase/migrations/*.sql
```

## Tests

`npm test` runs the unit tests (mirror, SSE, sources, wiring). The schema, RLS and sink tests run against the local
stack and are skipped otherwise:

```bash
supabase start
eval "$(supabase status -o env | sed -E 's/^([A-Z_]+)=/export SB_\1=/')"
SUPABASE_LOCAL_URL=$SB_API_URL SUPABASE_LOCAL_ANON_KEY=$SB_ANON_KEY SUPABASE_LOCAL_SECRET_KEY=$SB_SECRET_KEY npx vitest run apps/relay
```

## Security

- `SUPABASE_SECRET_KEY` bypasses RLS: keep it in the root `.env` (git-ignored) and the relay's environment only.
  Never log it, never paste it, never put it in a `VITE_*` variable.
- The web uses the anon key (public). It can read the mirror, nothing else.
