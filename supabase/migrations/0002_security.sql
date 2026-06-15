-- Server-authority hardening (see docs/adr/ADR-0003-server-authority-and-auth.md).
--
-- Threat model fixed here: the v0.1 schema shipped
--   create policy rooms_rw  on rooms          for all using (true) with check (true);
--   create policy tokens_rw on reclaim_tokens for all using (true) with check (true);
-- which let any holder of the public anon key (i.e. anyone) UPDATE arbitrary
-- room state, DELETE rooms, and read every reclaim token (seat hijack).
--
-- New model:
--   * Reads: any client may SELECT room state (players + spectators watch).
--   * Writes: NONE for clients. Every mutation goes through the `command` Edge
--     Function with the service-role key, which bypasses RLS. With RLS enabled
--     and no write policy, all anon/authenticated writes are denied by default.
--   * Identity: the Supabase Auth uid is the playerId, so the reclaim-token
--     table (world-readable, now obsolete) is dropped.

-- 1. Remove the permissive v0.1 friendly-room policy on rooms if it exists.
drop policy if exists rooms_rw on public.rooms;

-- 2. Clients are read-only against rooms; writes happen only via the function.
drop policy if exists rooms_read on public.rooms;
create policy rooms_read on public.rooms for select using (true);

-- 3. Drop the obsolete, previously world-readable reclaim-token table. CASCADE
--    removes its policies too. We do NOT `drop policy ... on reclaim_tokens`
--    separately: `IF EXISTS` guards the policy, not the table, so it would error
--    on a fresh project where the table was never created.
drop table if exists public.reclaim_tokens cascade;

-- 4. Ensure room row changes are published to realtime subscribers.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'rooms'
  ) then
    alter publication supabase_realtime add table public.rooms;
  end if;
end
$$;
