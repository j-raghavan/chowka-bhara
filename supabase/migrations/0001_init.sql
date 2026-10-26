-- Chowka Bhara Online — base schema.
--
-- A room is a single jsonb document plus an integer revision used for optimistic
-- concurrency (the `command` Edge Function updates guarded on the previous
-- revision so exactly one writer wins per revision).

create table if not exists public.rooms (
  game_id    text primary key,
  revision   integer     not null default 0,
  state      jsonb       not null,
  updated_at timestamptz not null default now()
);

alter table public.rooms enable row level security;
