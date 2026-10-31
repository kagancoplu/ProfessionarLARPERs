-- updated_at changed only on insert: the relay upserts rows, so an updated row kept its first timestamp
-- (Supabase review, plan/HANDOFF.md §4.4 #13, BL-34). A trigger stamps every update.

create or replace function touch_updated_at() returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

do $$ declare t text; begin
  foreach t in array array['live_pools','live_pledges','live_listings','live_vaults','live_agents','live_health'] loop
    execute format('drop trigger if exists touch_updated_at on %I', t);
    execute format('create trigger touch_updated_at before update on %I for each row execute function touch_updated_at()', t);
  end loop;
end $$;
