-- Adaptive sessions, plan chapters and Venture (the business simulation).

-- Sessions are planned one step at a time. New steps are appended, and
-- untouched future steps can be replaced (for example by "Wrap up"), without
-- rewriting steps that are being generated or answered at the same moment.
create or replace function public.extend_run_beats(p_run uuid, p_user uuid, p_after int, p_beats jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare current jsonb; kept jsonb;
begin
  if jsonb_typeof(p_beats) <> 'array' then raise exception 'Beats must be an array'; end if;
  -- Lock the run first; the steps are then filtered from the locked copy.
  select r.beats into current from public.runs r where r.id = p_run and r.user_id = p_user for update;
  if current is null then return null; end if;
  select coalesce(jsonb_agg(b.value order by b.pos), '[]'::jsonb) into kept
  from jsonb_array_elements(current) with ordinality as b(value, pos)
  -- Everything up to p_after stays; later steps stay only once started.
  where b.pos - 1 <= p_after or coalesce(b.value->>'status', 'pending') not in ('pending', 'generating', 'ready');
  update public.runs
     set beats = kept || p_beats,
         updated_at = now()
   where id = p_run and user_id = p_user;
  return kept || p_beats;
end $$;
revoke all on function public.extend_run_beats(uuid, uuid, int, jsonb) from public, anon, authenticated;
grant execute on function public.extend_run_beats(uuid, uuid, int, jsonb) to service_role;

-- Outcome-named chapters for a plan, written once by the fast model.
create table public.plan_chapters (
  user_id uuid not null references auth.users(id) on delete cascade,
  plan_id text not null,
  chapters jsonb not null default '[]' check (jsonb_typeof(chapters) = 'array' and octet_length(chapters::text) < 32000),
  created_at timestamptz not null default now(),
  primary key (user_id, plan_id)
);

-- One running company per learner. The simulation state is a single document,
-- saved after every decision; revision guards against two tabs racing.
create table public.ventures (
  user_id uuid primary key references auth.users(id) on delete cascade,
  state jsonb not null check (octet_length(state::text) < 400000),
  revision int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$ declare t text; begin
  foreach t in array array['plan_chapters', 'ventures'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy own_read on public.%I for select to authenticated using ((select auth.uid()) = user_id)', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
    execute format('grant all on public.%I to service_role', t);
  end loop;
end $$;
