-- Live mirror for the web (plan/phases/SUPABASE-MVP.md, Task 1).
-- Written only by apps/relay with the secret key; everyone may read (RLS select only).
-- The chain and the overlay stay the source of truth: every row here can be rebuilt from them.

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
