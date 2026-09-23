-- Weekly insights and milestone rehearsals.

-- A rehearsal is a mock of an upcoming milestone's deliverable, run like a
-- session.
alter table public.runs drop constraint if exists runs_kind_check;
alter table public.runs add constraint runs_kind_check
  check (kind in ('session', 'review', 'explore', 'practice', 'return', 'rehearsal'));

-- One honest read of the learner's week, written by the reasoning tier from
-- measured activity. Generated once per week; earlier weeks stay for trends.
create table public.insights (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  week_start date not null,
  week_end date not null,
  status text not null default 'generating' check (status in ('generating', 'ready', 'failed')),
  metrics jsonb not null default '{}' check (octet_length(metrics::text) < 200000),
  report jsonb check (report is null or octet_length(report::text) < 100000),
  model text,
  error text,
  seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, week_start)
);
create index insights_user on public.insights (user_id, week_start desc);

alter table public.insights enable row level security;
create policy own_read on public.insights for select to authenticated using ((select auth.uid()) = user_id);
revoke all on public.insights from anon, authenticated;
grant select on public.insights to authenticated;
grant all on public.insights to service_role;
