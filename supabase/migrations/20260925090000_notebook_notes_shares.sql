-- Notebook: the learner's own notes on session steps, and share links for a
-- single concept card. Calendar sync is gone, so its stored tokens go too.

-- A note pinned to one step of a session (or practice), in the learner's
-- words. Shown under that step and in the Notebook entry for its idea.
create table public.notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  run_id uuid not null references public.runs(id) on delete cascade,
  beat_id text not null check (length(beat_id) between 1 and 120),
  concept_key text check (concept_key is null or length(concept_key) <= 80),
  quote text check (quote is null or length(quote) <= 600),
  text text not null check (length(text) between 1 and 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index notes_user_run on public.notes (user_id, run_id);
create index notes_user_concept on public.notes (user_id, concept_key);

-- A frozen snapshot of one Notebook entry, readable by anyone with its link
-- until the learner turns it off. The token is the only way in; the page
-- reads it on the server, so the table is never exposed to anon.
create table public.shares (
  token text primary key check (token ~ '^[A-Za-z0-9_-]{20,64}$'),
  user_id uuid not null references auth.users(id) on delete cascade,
  concept_key text not null check (length(concept_key) between 1 and 120),
  card jsonb not null check (jsonb_typeof(card) = 'object' and octet_length(card::text) < 60000),
  views int not null default 0,
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);
create index shares_user on public.shares (user_id, concept_key);

do $$ declare t text; begin
  foreach t in array array['notes', 'shares'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy own_read on public.%I for select to authenticated using ((select auth.uid()) = user_id)', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
    execute format('grant all on public.%I to service_role', t);
  end loop;
end $$;

-- Counts a view of a live share without a read-modify-write race.
create or replace function public.view_share(p_token text)
returns jsonb language sql security invoker set search_path = '' as $$
  update public.shares set views = views + 1
   where token = p_token and revoked_at is null
  returning jsonb_build_object('card', card, 'created_at', created_at);
$$;
revoke all on function public.view_share(text) from public, anon, authenticated;
grant execute on function public.view_share(text) to service_role;

-- Google Calendar was removed; nothing should keep its OAuth tokens.
delete from private.connections where provider = 'google';
