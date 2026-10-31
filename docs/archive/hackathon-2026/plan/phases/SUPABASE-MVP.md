# Supabase live layer (demo MVP) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Several browsers see the same live Town through Supabase (full on opening, history kept on page reload) and see each other in avatar mode; the protocol and the services do not change.

**Architecture:** A new `apps/relay` process (on the VPS under `infra/run.mjs`) reads the overlay SSE, the guard/agents/maker SSE, the coordinator WS (as a watcher) and REST snapshots; it writes to the `live_*` tables and `coop_events` in Postgres, and adds changes as at most one `live_ticks` row per second. With `VITE_TRANSPORT=supabase` the web reads the tables on opening, listens to `live_ticks` INSERTs with Postgres Changes and applies them with today's `derive.ts` + store setters; the coordinator WS and the wallet flows stay direct. The Town's multiplayer mode runs on the public `town:main` channel with Presence + Broadcast, sending destinations, not positions.

**Tech Stack:** Supabase (Postgres + RLS, Realtime Postgres Changes / Presence / Broadcast, Supabase CLI 2.122 local stack), `@supabase/supabase-js` 2.118.0, Node ≥ 22 + tsx, `ws` 8.22.0, vitest 4, React/Zustand/Phaser (the existing web).

**Spec:** `plan/SUPABASE-FLOW.md` (this plan is the demo slice of its F1 + F2; the "MVP decisions" below list the deviations from the report).

## MVP decisions (deviations from the report)

- The live stream is a **`live_ticks` table + Postgres Changes** instead of Broadcast: clients cannot write because of RLS, so a fake tick cannot be published; no channel authorisation needs to be set up. The cost is the same (one message per subscriber).
- **No authentication** (Edge Function, anonymous session, `user_records`, `inbox`, signed records later). The web reads with the publishable key; the Town channel is public and cosmetic.
- **The coordinator WS stays direct in the web** (for the signing round and `settled` → `afterSettlement`). The relay writes coordinator events only to `coop_events` for history, not into the tick (so there are no duplicate events).
- **Derived events** (`pool_opened`, `pledge_added`…) are produced in every browser by `derive.ts`, not written to a table. In history, the pool state comes from the tables and the agent/guard/coordinator events from `coop_events`.

## Global Constraints

- Node ≥ 22. Dependencies pinned to exact versions: `@supabase/supabase-js` `2.118.0`, `ws` `8.22.0`.
- `SUPABASE_SECRET_KEY` (secret / service_role) only in the root `.env` and in the relay process; never committed, never logged, never put in `VITE_*`. The browser sees only `VITE_SUPABASE_PUBLISHABLE_KEY`.
- RLS on for every table; the only policy is `select` (`anon`, `authenticated`). Writes only with the secret key.
- The overlay, coordinator, guard, provider-api, agents and core **do not change**. The mock and replay modes **do not change**.
- If `VITE_SUPABASE_URL` or `VITE_SUPABASE_PUBLISHABLE_KEY` is empty or `?transport=direct` is given, the web behaves as today (transport `direct`).
- The relay writes at most one tick per second; does not write if nothing changed; writes a `heartbeat` tick every 15 s; deletes ticks older than 10 min.
- Town: at most `8` players, a move message at most every `1500` ms, moves under `4` px are not sent.
- Commit protocol (`CLAUDE.md`): `git pull --rebase --autostash` before every commit; on a conflict stop and ask the user; if incoming commits changed files you touched, `npm test` + `npm run typecheck`; add files by name (no `git add -A`); never `.env`, `data/`, keys; then push, and start over if rejected.

## Review Focus

1. **If the relay restarts**, the first tick resends every pool; when browsers receive the same data they must produce no derived event (Town animation) → Task 5 "an identical tick publishes nothing".
2. **If Supabase cannot be reached** (wrong URL, a paused free project) the web must fall back to the `direct` transport within 5 s → Task 6 "a failing snapshot rejects ready" + the boot fallback.
3. **A tick arriving while the snapshot loads** must not be lost and must not be overwritten by the snapshot → Task 6 "buffers ticks until the snapshot is applied".
4. **A temporary Supabase write error** must not lose changes; it must be retried on the next flush → Task 2 "a failed sink write keeps the changes for the next flush".
5. **The same identity in two tabs** must be two separate players in the Town; closing one must not remove the other → Task 7 presence key `${identity}:${tabId}`, "peersFromPresence keeps two tabs of one identity apart".

---

### Task 0: The missing file that unblocks the web build

`apps/web/src/consoles/explorer/MainnetProof.tsx:2` imports `../../data/mainnet`; the file is not in the repo and the root `.gitignore:16 data/` swallows it. The web must open for the demo.

**Files:**
- Create: `apps/web/src/proof/mainnet.ts`
- Modify: `apps/web/src/consoles/explorer/MainnetProof.tsx:2`

**Interfaces:**
- Produces: `export const MAINNET_TXS: ReadonlyArray<{ kind: string, what: string, via: string, txid: string }>`

- [ ] **Step 1:** `git pull --rebase --autostash`; if a teammate added the file another way, skip this task.
- [ ] **Step 2:** Fill `apps/web/src/proof/mainnet.ts` from the mainnet txids in the root `README.md` "Example transactions" table (`kind` = `T1`…`T11`, `via` = `'BSV Desktop'` or `'server wallet'`, `what` = a short form of the table's "What you see on chain"). Make the import path `../../proof/mainnet`.
- [ ] **Step 3:** Verify: `npm -w apps/web run typecheck` clean, `npm run web:build` succeeds.
- [ ] **Step 4:** Commit: `git add apps/web/src/proof/mainnet.ts apps/web/src/consoles/explorer/MainnetProof.tsx` → `fix(web): mainnet proof data out of the git-ignored data/ folder`.

---

### Task 1: Supabase skeleton, schema and RLS

**Files:**
- Create: `supabase/config.toml` (generated by `supabase init`; including `supabase/.gitignore`)
- Create: `supabase/migrations/20261031120000_live_mirror.sql`
- Create: `apps/relay/package.json` (in the layout of `apps/agents/package.json`, `"version": "0.1.0"`; no separate tsconfig, the root `tsconfig.json` already covers `apps/*/src` and `apps/*/test`)
- Test: `apps/relay/test/schema.local.test.ts`

**Interfaces:**
- Produces: tables `live_pools`, `live_pledges`, `live_listings`, `live_vaults`, `live_agents`, `live_health`, `coop_events`, `live_ticks`; package `@agentcoop/relay` (`"type": "module"`, `dependencies`: `@supabase/supabase-js` `2.118.0`, `ws` `8.22.0`; `exports`: `"./contract": "./src/contract.ts"`; script `start`: `tsx src/server.ts`).

- [ ] **Step 1: Write the migration** (`supabase/migrations/20261031120000_live_mirror.sql`):

```sql
create table live_pools    (pool_id text primary key, status text not null, data jsonb not null, updated_at timestamptz not null default now());
create table live_pledges  (outpoint text primary key, pool_id text not null, data jsonb not null, updated_at timestamptz not null default now());
create index on live_pledges (pool_id);
create table live_listings (outpoint text primary key, data jsonb not null, updated_at timestamptz not null default now());
create table live_vaults   (vault_id text primary key, data jsonb not null, credits jsonb, updated_at timestamptz not null default now());
create table live_agents   (identity text primary key, data jsonb not null, updated_at timestamptz not null default now());
create table live_health   (service text primary key, ok boolean not null, detail text, updated_at timestamptz not null default now());
create table coop_events   (uid text primary key, id text not null, ts timestamptz not null, src text not null, type text not null,
                            pool_id text, txid text, agent text, envelope jsonb not null);
create index on coop_events (ts desc);
create table live_ticks    (id bigint generated always as identity primary key, ts timestamptz not null default now(), tick jsonb not null);

do $$ declare t text; begin
  foreach t in array array['live_pools','live_pledges','live_listings','live_vaults','live_agents','live_health','coop_events','live_ticks'] loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy read_all on %I for select to anon, authenticated using (true)', t);
  end loop;
end $$;

alter publication supabase_realtime add table live_ticks;
```

- [ ] **Step 2: Bring up the local stack:** `supabase init` (if missing), `supabase start`, `supabase db reset`. Export the API URL, anon/publishable and service_role/secret values from `supabase status -o env` as `SUPABASE_LOCAL_URL`, `SUPABASE_LOCAL_ANON_KEY`, `SUPABASE_LOCAL_SECRET_KEY` (only in the terminal; do not write them to a file).
- [ ] **Step 3: Write the test** (`describe.skipIf(process.env.SUPABASE_LOCAL_URL === undefined)`; skipped in the root `npm test` without Docker):

```ts
it('anon reads every live table', async () => {
  for (const t of ['live_pools','live_pledges','live_listings','live_vaults','live_agents','live_health','coop_events','live_ticks'])
    expect((await anon.from(t).select('*').limit(1)).error).toBeNull()
})
it('anon cannot write; the secret key can', async () => {
  expect((await anon.from('live_pools').insert({ pool_id: 'x_0', status: 'open', data: {} })).error).not.toBeNull()
  expect((await secret.from('live_pools').upsert({ pool_id: 'x_0', status: 'open', data: {} })).error).toBeNull()
  await secret.from('live_pools').delete().eq('pool_id', 'x_0')
})
```

- [ ] **Step 4:** Run: `SUPABASE_LOCAL_URL=… npx vitest run apps/relay/test/schema.local.test.ts` → PASS. Without Docker, `npx vitest run apps/relay/test/schema.local.test.ts` → skipped.
- [ ] **Step 5:** At the root, `npx npm@11 install` (new workspace + dependency), `npm run typecheck` clean.
- [ ] **Step 6:** Commit: `supabase/config.toml supabase/.gitignore supabase/migrations/20261031120000_live_mirror.sql apps/relay/package.json apps/relay/test/schema.local.test.ts package-lock.json` → `feat(relay): supabase schema for the live mirror, read-only RLS`.

---

### Task 2: The relay core (Mirror: snapshot → rows + tick)

**Files:**
- Create: `apps/relay/src/contract.ts`, `apps/relay/src/sink.ts`, `apps/relay/src/mirror.ts`
- Test: `apps/relay/test/mirror.test.ts`

**Interfaces:**
- Produces (`contract.ts`, browser-safe, types and constants only):
  - `type Json = Record<string, unknown>`
  - `interface CoopEnvelope { id: string, ts: string, src: string, type: string, data: unknown, txid?: string, poolId?: string, agent?: string }`
  - `interface VaultOutput { tokenId: string, amt: string, sym?: string, spent?: boolean }`
  - `interface HealthRow { service: string, ok: boolean, detail?: string }`
  - `interface LiveTick { v: 1, ts: string, heartbeat?: true, pools?: Json[], pledges?: Record<string, Json[]>, listings?: Json[], vaults?: Json[], vaultCredits?: Record<string, VaultOutput[]>, agents?: Json[], health?: HealthRow[], events?: CoopEnvelope[] }`
  - `const TABLES = { pools: 'live_pools', pledges: 'live_pledges', listings: 'live_listings', vaults: 'live_vaults', agents: 'live_agents', health: 'live_health', events: 'coop_events', ticks: 'live_ticks' } as const`
- Produces (`sink.ts`): `interface Sink { upsert (table: string, rows: Json[]): Promise<void>; deleteListingsExcept (outpoints: string[]): Promise<void>; insertEvents (events: CoopEnvelope[]): Promise<void>; publishTick (tick: LiveTick): Promise<void>; pruneTicks (olderThanMs: number): Promise<void> }`
- Produces (`mirror.ts`): `class Mirror` — `constructor (sink: Sink, now?: () => Date)`; `setPools (pools: Array<Json & { poolId: string, status: string, pledges?: Json[] }>): void`; `setListings (listings: Array<Json & { outpoint: string }>): void`; `setVaults (vaults: Array<Json & { vaultId: string, scriptHex: string }>): void`; `setVaultCredits (vaultId: string, outputs: VaultOutput[]): void`; `setAgents (agents: Array<Json & { identity: string }>): void`; `setHealth (row: HealthRow): void`; `pushEvent (e: CoopEnvelope, opts?: { live?: boolean }): void`; `flush (): Promise<LiveTick | undefined>`; `heartbeat (): Promise<void>`.

Behaviour: each setter compares a `JSON.stringify` fingerprint per entity with the last one written and puts only the changed ones in the pending set. `flush` turns the pending ones into rows (`live_pools { pool_id, status, data }` — `data` is the pool without its `pledges` field; `live_pledges { outpoint, pool_id, data }`; …), upserts them, calls `deleteListingsExcept` if the listings changed, `insertEvents` for the events (`uid = ${src}|${id}|${ts}`), then a single `publishTick`. In the tick, `pools` holds only the changed pools, `pledges` only the full pledge list of the changed pools, `listings` the full list if it changed, `events` only those with `live !== false`. If a write throws, the pending set is kept and the fingerprints are not updated.

- [ ] **Step 1: Write the tests** (a fake `Sink` records the calls):

```ts
it('first setPools emits all pools and their pledges; an identical second snapshot emits nothing')
  // setPools([P('a_0','open',[pl('x_1')]), P('b_0','open',[])]); tick.pools.length === 2; tick.pledges['a_0'].length === 1
  // a second flush with the same input → undefined, sink.publishTick call count 1
it('a changed pool emits only that pool and its pledges')
  // b_0 pledgedCredits changes → tick.pools.map(p => p.poolId) eql ['b_0']; tick.pledges keys ['b_0']
it('listings: a missing listing is deleted from the table and the full list goes in the tick')
  // [L1,L2] then [L2] → deleteListingsExcept(['L2']); tick.listings.length === 1
it('events: live events go to the tick and the table; coordinator events only to the table')
  // pushEvent(g1); pushEvent(c1, { live: false }) → insertEvents two events; tick.events eql [g1]
it('flush with nothing changed publishes no tick; heartbeat publishes { heartbeat: true }')
it('a failed sink write keeps the changes for the next flush')
  // first upsert rejects → flush rejects; the second flush rewrites the same pool and puts it in the tick
```

- [ ] **Step 2:** `npx vitest run apps/relay/test/mirror.test.ts` → FAIL (no `Mirror`).
- [ ] **Step 3:** Write `contract.ts`, `sink.ts`, `mirror.ts` with the signatures above.
- [ ] **Step 4:** The same command → PASS; `npm run typecheck` clean.
- [ ] **Step 5:** Commit: `apps/relay/src/contract.ts apps/relay/src/sink.ts apps/relay/src/mirror.ts apps/relay/test/mirror.test.ts` → `feat(relay): mirror diffs service snapshots into rows and one tick`.

---

### Task 3: Relay sources and process

**Files:**
- Create: `apps/relay/src/config.ts`, `apps/relay/src/sse.ts`, `apps/relay/src/sources.ts`, `apps/relay/src/coordinator.ts`
- Test: `apps/relay/test/sse.test.ts`, `apps/relay/test/config.test.ts`

**Interfaces:**
- Consumes: `Mirror`, `HealthRow` (Task 2).
- Produces:
  - `interface RelayConfig { supabaseUrl: string, supabaseSecretKey: string, urls: { coop: string, overlay: string, guard: string, agents: string, maker: string, provider: string, arcade: string } }`; `loadConfig (env: NodeJS.ProcessEnv): RelayConfig` — if `SUPABASE_URL` and `SUPABASE_SECRET_KEY` are missing, an error naming the variable (never printing the value); URLs `COOP_API_URL`, `OVERLAY_URL`, `GUARD_URL`, `AGENTS_URL`, `MAKER_URL`, `PROVIDER_API_URL`, `ARCADE_URL`, defaults are the values in `.env.example`.
  - `followSse (url: string, onEvent: (data: string, id: string) => void, opts?: { fetchImpl?: typeof fetch, minBackoffMs?: number, maxBackoffMs?: number }): { close (): void }` — with `fetch` + `ReadableStream`, joins `id:`/`data:` frames across chunks, ignores lines starting with `:`, reconnects with a 1→30 s backoff when cut and sends the last id in the `Last-Event-ID` header.
  - `sources.ts`: `poolsWithPledges (coop)` → `GET {coop}/pools?pledges=1`; `listings (coop)` → `GET {coop}/listings`; `vaults (overlay)` → `POST {overlay}/lookup { service: 'ls_agentcoop', query: { op: 'vaults' } }`; `vaultCredits (overlay, scriptHex)` → `{ op: 'vaultCredits', vaultHash: sha256hex(script) }` (`node:crypto`); `agents (agentsUrl)` → `GET /agents`; `probe (name, url): Promise<HealthRow>` → the same endpoints as the web's `events/health.ts` (`/healthz`, overlay `/agentcoop/healthz`, arcade `/chaintracks/v2/height`), 4 s timeout; `name` is one of the web's `ServiceName` values (`coop`, `overlay`, `provider`, `guard`, `agents`, `arcade`, `maker`), so the web turns them straight into `service_health`. Decoding the lookup answer's `context` is the same as the web's `apps/web/src/api/overlay.ts`.
  - `watchCoordinator (wsUrl: string, onMessage: (msg: Json) => void): { close (): void }` — connects with `ws`, sends `{ type: 'hello', poolIds: [] }` when the `challenge` arrives (unsigned: a watcher), reconnects with 2→30 s when cut.
- `server.ts` (written in Task 4, it needs `createSupabaseSink`) wires these pieces as follows: overlay SSE → 300 ms debounce → `poolsWithPledges` + `listings` + `vaults` (+ `vaultCredits` for each vault) → the `Mirror` setters; the raw overlay event → `pushEvent({ id: 'overlay:<type>:<txid>', src: 'overlay', type, data: { txid }, txid, ts })`; guard/agents/maker SSE → the envelope as is to `pushEvent`; a coordinator message → `pushEvent({ id: 'coordinator:<type>:<poolId>:<round|txid>', src: 'coordinator', … }, { live: false })`; timers: reconciliation 30 s (the same refresh), `agents` 30 s, `probe` 15 s, `flush` 1 s, `heartbeat` 15 s, `pruneTicks(600_000)` 60 s; on `SIGTERM` close everything and do one last `flush`.

- [ ] **Step 1: Write the tests:**

```ts
// sse.test.ts (fake fetch, ReadableStream chunks)
it('joins id/data frames split across chunks and ignores keepalive comments')
  // chunks: 'id: g:1\nda', 'ta: {"a":1}\n\n: keepalive\n\n' → onEvent('{"a":1}', 'g:1') once
it('reconnects after the stream ends and sends Last-Event-ID')
  // the second fetch call's headers['Last-Event-ID'] === 'g:1'
// config.test.ts
it('requires SUPABASE_URL and SUPABASE_SECRET_KEY and names the missing one without printing values')
it('defaults the service URLs to the .env.example values')
  // urls.coop === 'http://localhost:8090', urls.overlay === 'http://localhost:8080'
```

- [ ] **Step 2:** `npx vitest run apps/relay/test/sse.test.ts apps/relay/test/config.test.ts` → FAIL.
- [ ] **Step 3:** Write the files with the signatures above.
- [ ] **Step 4:** The same command → PASS; `npm run typecheck` clean.
- [ ] **Step 5:** Commit: `apps/relay/src/config.ts apps/relay/src/sse.ts apps/relay/src/sources.ts apps/relay/src/coordinator.ts apps/relay/test/sse.test.ts apps/relay/test/config.test.ts` → `feat(relay): service sources (SSE, REST, coordinator watcher) and config`.

---

### Task 4: Supabase sink, infra and a local end-to-end test

**Files:**
- Create: `apps/relay/src/supabaseSink.ts`, `apps/relay/src/server.ts` (the wiring list in Task 3), `apps/relay/README.md`
- Modify: `infra/run.mjs` (the service list), `.env.example`
- Test: `apps/relay/test/sink.local.test.ts`

**Interfaces:**
- Consumes: `Sink`, `LiveTick`, `TABLES`, `Mirror` (Task 2); `loadConfig`, `followSse`, `sources`, `watchCoordinator` (Task 3).
- Produces: `createSupabaseSink (url: string, secretKey: string): Sink` — `createClient(url, secretKey, { auth: { persistSession: false } })`; `upsert` → `from(table).upsert(rows)`; `deleteListingsExcept` → `delete().not('outpoint', 'in', …)` (delete all on an empty list); `insertEvents` → `upsert(…, { onConflict: 'uid', ignoreDuplicates: true })`; `publishTick` → `from('live_ticks').insert({ tick })`; `pruneTicks` → `delete().lt('ts', …)`. Every `error` is thrown (the Mirror retries).

- [ ] **Step 1: Write the test** (`skipIf(SUPABASE_LOCAL_URL === undefined)`):

```ts
it('a tick published by the sink reaches an anon Postgres Changes subscriber', async () => {
  // anon client: channel('t').on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'live_ticks' }, p => got.push(p.new.tick)).subscribe()
  // wait for SUBSCRIBED → sink.publishTick({ v: 1, ts, heartbeat: true }) → got[0].heartbeat === true within 5 s
})
it('anon cannot insert a tick (RLS)')
it('deleteListingsExcept keeps only the given outpoints')
```

- [ ] **Step 2:** With the local stack → FAIL (no `createSupabaseSink`); write it; → PASS.
- [ ] **Step 3:** `infra/run.mjs`: if `SUPABASE_URL` and `SUPABASE_SECRET_KEY` are set, add `{ name: 'relay', cwd: join(root, 'apps/relay'), env: { COOP_API_URL: http://localhost:${coopPort}, OVERLAY_URL: http://localhost:${overlayPort} } }` to `services` (entry `src/server.ts`, the existing start command works as is); add `, relay` to the start line; if they are empty nothing changes.
- [ ] **Step 4:** Add to `.env.example` with their comments: `SUPABASE_URL=`, `SUPABASE_SECRET_KEY=` ("secret: only here and in the relay; never commit, never in VITE_*"), `VITE_SUPABASE_URL=`, `VITE_SUPABASE_PUBLISHABLE_KEY=` ("public; RLS protects the tables"), `VITE_TRANSPORT=` ("supabase | direct; empty = supabase when the two above are set").
- [ ] **Step 5:** Verify by hand: the local stack + `npm run infra` (not on the mock chain, the real services locally) → `[relay] started`; in Supabase Studio (`http://localhost:54323`) `live_pools` fills, `live_ticks` gets one row per change, a heartbeat every 15 s when quiet.
- [ ] **Step 6:** `apps/relay/README.md`: what it does, env variables, local stack commands, `supabase link --project-ref <ref>` + `supabase db push` for the real project, a security note (the secret key).
- [ ] **Step 7:** Commit: `apps/relay/src/supabaseSink.ts apps/relay/src/server.ts apps/relay/test/sink.local.test.ts apps/relay/README.md infra/run.mjs .env.example` → `feat(relay): supabase sink and process, started by infra when SUPABASE_* is set`.

---

### Task 5: Web — transport selection and applying ticks

**Files:**
- Modify: `apps/web/src/env.ts` (`RawEnv`, `AppEnv`, `resolveEnv`), `apps/web/package.json` (`@supabase/supabase-js` `2.118.0`, `@agentcoop/relay` `0.1.0`)
- Create: `apps/web/src/events/adapters/supabaseApply.ts`
- Test: `apps/web/test/supabaseApply.test.ts`, `apps/web/test/env.test.ts` (additions)

**Interfaces:**
- Consumes: `LiveTick`, `CoopEnvelope`, `VaultOutput`, `HealthRow` (`@agentcoop/relay/contract`, `import type` only); `derivePoolDiff`, `derivePledgeDiff`, `deriveListingDiff` (`events/derive.ts`); `summariseCredits` (`events/livePoll.ts`); the store setters.
- Produces:
  - `AppEnv` additions: `transport: 'supabase' | 'direct'`, `supabase?: { url: string, key: string }`. Rule: `?transport=direct` → direct; `VITE_TRANSPORT=direct` → direct; URL and key set → supabase; otherwise direct.
  - `interface LiveSnapshot { pools: ApiPool[], pledges: Record<string, PledgeView[]>, listings: Listing[], vaults: VaultView[], vaultCredits: Record<string, VaultOutput[]>, agents: AgentInfo[], health: HealthRow[] }`
  - `applyTick (bus: EventBus, store: AppStoreApi, tick: LiveTick): void` — in order: `pools` → publish the `derivePoolDiff` events + `hydratePools`; `pledges` → per pool `derivePledgeDiff` + `setPledges`; `listings` → `deriveListingDiff` + `hydrateListings`; `vaults` → `hydrateVaults`; `vaultCredits` → `summariseCredits`, and if it differs from the store's, `makeEvent('overlay', 'vault_credits', { vaultId, credits })`; `agents` → `hydrateAgents`; `health` → `service_health` for each changed service (a `relay` service name not in the store is ignored); `events` → each one to `bus.publish`.
  - `applySnapshot (bus: EventBus, store: AppStoreApi, snap: LiveSnapshot): void` — calls `applyTick` with `{ v: 1, ts: now, ...snap }` (the Town's current hydrate behaviour is enough for an opening without animation on an empty store).
  - `hydrateHistory (store: AppStoreApi, events: CoopEvent[]): void` — oldest to newest `store.getState().applyEvent(e)`; the bus listeners (Town fx, sound) do not run.

- [ ] **Step 1: Write the tests** (in the pattern of the existing `livePoll.test.ts`: `createAppStore('live', undefined, { ...DEFAULT_SETTINGS })`, `createBus`):

```ts
it('a tick with a new pool publishes pool_opened and pledge_added, then hydrates the store')
it('an identical tick publishes nothing')                       // Review Focus 1
it('listings in a tick replace the book and publish listing_added / listing_filled')
it('vaultCredits publish vault_credits only when the summary changed')
it('events in a tick go through the bus once (deduped by src|id)')
it('health rows become service_health events only on change')
it('hydrateHistory fills the feed without calling bus listeners')
// env.test.ts
it('picks supabase when VITE_SUPABASE_URL and the publishable key are set, direct otherwise or with ?transport=direct')
```

- [ ] **Step 2:** `npm -w apps/web test -- supabaseApply env` → FAIL.
- [ ] **Step 3:** Write it. At the root, `npx npm@11 install`.
- [ ] **Step 4:** → PASS; `npm -w apps/web run typecheck` clean.
- [ ] **Step 5:** Commit: `apps/web/src/env.ts apps/web/src/events/adapters/supabaseApply.ts apps/web/test/supabaseApply.test.ts apps/web/test/env.test.ts apps/web/package.json package-lock.json` → `feat(web): apply relay ticks with the existing derive and hydrate path`.

---

### Task 6: Web — the Supabase live adapter and boot

**Files:**
- Create: `apps/web/src/api/supabase.ts`, `apps/web/src/events/adapters/supabaseLive.ts`
- Modify: `apps/web/src/boot.ts:78-104` (the live branch)
- Test: `apps/web/test/supabaseLive.test.ts`

**Interfaces:**
- Consumes: `applyTick`, `applySnapshot`, `hydrateHistory`, `LiveSnapshot` (Task 5); `env.supabase`, `env.transport`.
- Produces:
  - `interface LiveClient { snapshot (): Promise<LiveSnapshot>; history (limit: number): Promise<CoopEvent[]>; subscribeTicks (onTick: (t: LiveTick) => void, onStatus: (ok: boolean, detail?: string) => void): () => void }`
  - `getSupabase (): Promise<SupabaseClient | undefined>` (a single instance; `undefined` if `env.transport !== 'supabase'`; supabase-js is lazy-loaded with a dynamic `import()`, so it does not go into the mock/replay bundle); `createLiveClient (sb: SupabaseClient): LiveClient` — `snapshot` reads the tables in parallel (`live_pools.data`, `live_pledges` → grouped by `pool_id`, `live_listings.data`, `live_vaults.data` + `credits`, `live_agents.data`, `live_health`); `history` → `coop_events.envelope` `order('ts', desc).limit(limit)` reversed; `subscribeTicks` → `channel('live-ticks').on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'live_ticks' }, p => onTick(p.new.tick))`.
  - `startSupabaseLive (opts: { client: LiveClient, bus: EventBus, store: AppStoreApi, onStatus?: (ok: boolean, detail?: string) => void, onStale: () => void, staleMs?: number, snapshotTimeoutMs?: number }): { close (): void, ready: Promise<void> }` — subscribes first and buffers incoming ticks; then `history(200)` → `hydrateHistory`, `snapshot()` → `applySnapshot`, then `applyTick` on the buffer in order; if `snapshot` does not finish within `snapshotTimeoutMs` (default 5000) or throws, `ready` is rejected; if no tick at all (heartbeats included) arrives for `staleMs` (default 45000), `onStale()` once.
- The live branch of `boot.ts`: move the existing overlay SSE + `startEnvelopeSse` ×3 + `startLivePolling` + `startHealthPolling` block into a local `startDirect(): void`. The coordinator WS and `createLiveFlows` stay as they are in both transports. If `env.transport === 'supabase'`, `startSupabaseLive(...)`; if `ready` is rejected or `onStale` comes, close it, call `startDirect()` and publish `service_health` with `detail: 'supabase unavailable, direct'`. In `direct`, today's behaviour exactly.

- [ ] **Step 1: Write the tests** (a fake `LiveClient`, `vi.useFakeTimers()`):

```ts
it('buffers ticks until the snapshot is applied, then applies them in order')   // Review Focus 3
  // a tick (pool b_0) arrives before the snapshot resolves → snapshot(pool a_0) → store.pools.order eql ['a_0','b_0']
it('a failing snapshot rejects ready')                                           // Review Focus 2
it('a snapshot slower than snapshotTimeoutMs rejects ready')
it('calls onStale once after staleMs without ticks; a heartbeat resets the timer')
it('hydrates the last 200 events from history before the snapshot')
```

- [ ] **Step 2:** `npm -w apps/web test -- supabaseLive` → FAIL. Write it. → PASS.
- [ ] **Step 3:** `npm -w apps/web test` (all) and `npm -w apps/web run typecheck` green; the Playwright mock e2e passes unchanged: `npm -w apps/web run test:e2e`.
- [ ] **Step 4: Verify by hand** (the Task 4 local stack + `npm run infra` + agents/services): `VITE_SUPABASE_URL=… VITE_SUPABASE_PUBLISHABLE_KEY=… PORT=5178 npm run web` → the Town is full of pools in the first frame; in Network there are no `/api/overlay/agentcoop/events`, `/api/guard/events`, `/api/agents/events` requests, there is `wss://…/realtime`; in a second browser the same pledge shows in < 1 s; on page reload the feed comes back full; when the relay is stopped the badge returns to `direct` in ≤ 45 s and the Town keeps updating.
- [ ] **Step 5:** Commit: `apps/web/src/api/supabase.ts apps/web/src/events/adapters/supabaseLive.ts apps/web/src/boot.ts apps/web/test/supabaseLive.test.ts` → `feat(web): live mode over Supabase with a direct fallback`.

---

### Task 7: Multiplayer Town (P7, destination-based)

**Files:**
- Create: `apps/web/src/town/peers.ts` (pure logic), `apps/web/src/town/multiplayer.ts` (channel + Phaser wiring)
- Modify: `apps/web/src/town/scenes/TownScene.ts` (`removeVillager`; `attachMultiplayer` next to `attachBridge` in `create()`)
- Test: `apps/web/test/peers.test.ts`

**Interfaces:**
- Consumes: `getSupabase` (Task 6); `TownScene.addVillager(identity, 'visitor', name)`, `Villager.walkTo(x, y)`, `TownScene.avatar?.villager`, `store.settings.avatar`, `store.me.identityKey`, `store.agents.byIdentity`.
- Produces:
  - `peers.ts`: `const TOWN_CHANNEL = 'town:main'`, `MAX_PLAYERS = 8`, `MOVE_EVERY_MS = 1500`, `MIN_MOVE_PX = 4`; `class MoveThrottle { next (now: number, pos: { x: number, y: number }, moving: boolean): { x: number, y: number, stop: boolean } | undefined }`; `interface PeerMeta { name: string, at?: [number, number] }`; `peersFromPresence (state: Record<string, PeerMeta[]>, selfKey: string): Array<{ key: string, name: string, at?: [number, number] }>` (drops self, the last meta per key, sorted by key); `canJoin (peerCount: number): boolean` (`peerCount < MAX_PLAYERS`).
  - `TownScene.removeVillager (identity: string): void` — destroys the villager, removes it from `villagers`, frees its house if it has one.
  - `attachMultiplayer (town: TownScene, store: AppStoreApi): () => void` — joins the channel only while `settings.avatar` is on and Supabase is present (leaves when the setting turns off). Presence key `${me.identityKey ?? 'guest'}:${tabId}` (`tabId` = 8 hex in sessionStorage). Name: the name in the agent list, otherwise `short(identity)`, for a guest `Visitor ${tabId.slice(0, 4)}`. On joining, if the `peersFromPresence` count is not `canJoin`, only watch (no track, no broadcast, one toast: "Town is full: watching"). On every `update` frame, if `MoveThrottle.next(now, avatar.villager, moving)` returns something, `send({ type: 'broadcast', event: 'move', payload: { key, to: [x, y], stop } })`; on `stop`, `track({ name, at })`. An incoming `move` → `town.addVillager('peer:' + key, 'visitor', name).walkTo(x, y)`; presence `sync` → add the missing ones (placed at `at` if present), `removeVillager('peer:' + key)` for those who left.

- [ ] **Step 1: Write the tests:**

```ts
it('emits at most once per 1500 ms while moving and once on stop')
  // t=0 (0,0)→ emit; t=500 (20,0) → undefined; t=1500 (40,0) → emit; t=1600 moving=false → { stop: true }; t=1700 → undefined
it('does not emit moves under 4 px')
it('peersFromPresence drops self and takes the latest meta per key')
it('peersFromPresence keeps two tabs of one identity apart')                     // Review Focus 5
  // keys '02ab:1111' and '02ab:2222' → two peers
it('canJoin refuses the ninth player')                                           // canJoin(8) === false, canJoin(7) === true
```

- [ ] **Step 2:** `npm -w apps/web test -- peers` → FAIL. Write `peers.ts` → PASS.
- [ ] **Step 3:** Write `removeVillager`, `multiplayer.ts` and the `TownScene.create()` wiring (the cleanup returned by `attachMultiplayer` is called in `teardown` when the scene closes).
- [ ] **Step 4:** `npm -w apps/web test`, `npm -w apps/web run typecheck`, `npm -w apps/web run test:e2e` (no Supabase in mock → multiplayer disabled, `avatar.spec.ts` passes unchanged).
- [ ] **Step 5: Verify by hand:** two browsers (one a private window) `?avatar=1` → each sees the other and follows its walk with ≤ 2 s delay; when a tab closes the villager disappears in ≤ 30 s; in the Supabase panel the Realtime message rate with two players is < 5 per second.
- [ ] **Step 6:** Commit: `apps/web/src/town/peers.ts apps/web/src/town/multiplayer.ts apps/web/src/town/scenes/TownScene.ts apps/web/test/peers.test.ts` → `feat(web): multiplayer town over Supabase presence, destinations not positions`.

---

### Task 8: The real project, a demo rehearsal, STATUS

**Files:**
- Modify: `plan/STATUS.md` (only the relevant sections), `plan/SUPABASE-FLOW.md` (a "MVP: plan/phases/SUPABASE-MVP.md" line at the top), `apps/web/README.md` (a "Live over Supabase" paragraph), `apps/relay/README.md` (demo steps)

- [ ] **Step 1: The real project (human):** a project on Supabase (Free, region Frankfurt) → `supabase link --project-ref <ref>` → `supabase db push`. From the panel, URL, publishable key, secret key → into the root `.env` as `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` (the secret key is pasted nowhere: no chat, no log, no screenshot).
- [ ] **Step 2: Demo rehearsal:** `npm run infra` (relay included), the services and agents (`npm run agents` etc.), `npm run web` → two machines/browsers: (a) an agent pledge on both screens at the same time, (b) reload the page → the Town and the feed are full, (c) `?avatar=1` two players, (d) stop the relay → the web falls back to `direct`, the protocol keeps working (the non-custodial point: Supabase is only a display layer).
- [ ] **Step 3: Full verification:** `npm test`, `npm run typecheck`, `npm run web:test`, `npm -w apps/web run typecheck`, `npm run web:build` green. If anything is red, report it with its output; do not hide it.
- [ ] **Step 4: STATUS:** one line in "Interface changes" (the new optional `apps/relay`, `SUPABASE_*` / `VITE_SUPABASE_*` / `VITE_TRANSPORT`, the Supabase transport in the web's live mode, no change in the other tracks); in "Plan changes", that P7 was done with Supabase.
- [ ] **Step 5:** Commit + push (the protocol in Global Constraints): `plan/STATUS.md plan/SUPABASE-FLOW.md plan/phases/SUPABASE-MVP.md apps/web/README.md apps/relay/README.md` → `docs: supabase live layer MVP, demo steps, STATUS`.

---

## Left for later (outside the MVP, report §12)

Login with a BSV identity (a `bsv-auth` Edge Function, `app_metadata.identity_key`), signed `identities` / `services`, encrypted `user_records` (web + CLI), `inbox` + notifications, `rounds` round progress, `handoffs`, `provider_stats` and other views, pg_cron cleanup, an intent ledger. Moving `derive.ts` + the `CoopEvent` types to `packages/events` so the derived events become persistent.
