-- The tutor thread moves from each browser to the account, so a conversation
-- started on the web carries on in the iPhone app and back. The server writes
-- both sides of the conversation; the learner can read and clear their own.
create table public.tutor_messages (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('user', 'tutor')),
  text text check (text is null or length(text) <= 4000),
  blocks jsonb check (blocks is null or (jsonb_typeof(blocks) = 'array' and octet_length(blocks::text) < 120000)),
  actions jsonb check (actions is null or jsonb_typeof(actions) = 'array'),
  suggestions jsonb check (suggestions is null or jsonb_typeof(suggestions) = 'array'),
  page text check (page is null or length(page) <= 120),
  created_at timestamptz not null default now()
);
create index tutor_messages_user_time on public.tutor_messages (user_id, created_at desc);

alter table public.tutor_messages enable row level security;
create policy own_read on public.tutor_messages for select to authenticated using ((select auth.uid()) = user_id);
revoke all on public.tutor_messages from anon, authenticated;
grant select on public.tutor_messages to authenticated;
grant all on public.tutor_messages to service_role;
