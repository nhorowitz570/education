-- Learning engine: learner model, session runs, memory and AI call log.
-- Reads are allowed to the owning account through RLS; every write goes
-- through server routes using the service role.
create extension if not exists vector with schema extensions;

-- A plan's concepts and their prerequisite graph. Generated once per plan.
create table public.concepts (
  user_id uuid not null references auth.users(id) on delete cascade,
  plan_id text not null,
  key text not null check (key ~ '^[a-z0-9][a-z0-9_.-]{0,79}$'),
  title text not null check (length(title) between 1 and 160),
  track text not null check (length(track) between 1 and 60),
  summary text not null default '' check (length(summary) <= 600),
  prerequisites text[] not null default '{}',
  session_ids text[] not null default '{}',
  position int not null default 0,
  created_at timestamptz not null default now(),
  primary key (user_id, plan_id, key)
);

-- Knowledge tracing plus a forgetting curve per concept:
-- p_known is the probability the idea has been learned; stability is the
-- number of days until recall probability decays to ~90%.
create table public.concept_states (
  user_id uuid not null references auth.users(id) on delete cascade,
  plan_id text not null,
  concept_key text not null,
  p_known real not null default 0.15 check (p_known between 0 and 1),
  stability real not null default 0 check (stability >= 0),
  difficulty real not null default 0.5 check (difficulty between 0 and 1),
  exposures int not null default 0,
  successes int not null default 0,
  lapses int not null default 0,
  last_seen_at timestamptz,
  last_recall_at timestamptz,
  due_at timestamptz,
  misconceptions jsonb not null default '[]'
    check (jsonb_typeof(misconceptions) = 'array' and octet_length(misconceptions::text) < 8000),
  updated_at timestamptz not null default now(),
  primary key (user_id, plan_id, concept_key)
);
create index concept_states_due on public.concept_states (user_id, plan_id, due_at);

-- Append-only evidence. The learner model is a projection of these events.
create table public.learning_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  plan_id text,
  run_id uuid,
  concept_key text,
  kind text not null check (kind in (
    'recall', 'check', 'explain', 'transfer', 'attempt', 'roleplay',
    'exposure', 'project', 'self_report'
  )),
  score real check (score between 0 and 1),
  assisted boolean not null default false,
  detail jsonb not null default '{}' check (octet_length(detail::text) < 16000),
  created_at timestamptz not null default now()
);
create index learning_events_user on public.learning_events (user_id, created_at desc);
create index learning_events_concept on public.learning_events (user_id, concept_key, created_at desc);

-- A guided session, review, exploration or practice conversation.
create table public.runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  plan_id text,
  session_id text,
  kind text not null check (kind in ('session', 'review', 'explore', 'practice', 'return')),
  title text not null check (length(title) between 1 and 200),
  status text not null default 'active' check (status in ('active', 'done', 'abandoned')),
  outline jsonb not null default '[]',
  beats jsonb not null default '[]',
  context jsonb not null default '{}',
  cursor int not null default 0,
  summary text,
  minutes_planned int,
  started_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  ended_at timestamptz,
  check (octet_length(beats::text) < 1500000),
  check (octet_length(context::text) < 200000)
);
create index runs_user on public.runs (user_id, updated_at desc);
create unique index one_active_run_per_session on public.runs (user_id, session_id)
  where status = 'active' and session_id is not null;

-- Long-term memory about the learner. Candidates become active once
-- reinforced so a single interaction cannot rewrite the profile.
create table public.memories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in (
    'goal', 'interest', 'preference', 'background', 'knowledge', 'episode', 'style', 'life'
  )),
  content text not null check (length(content) between 3 and 600),
  concept_keys text[] not null default '{}',
  confidence real not null default 0.6 check (confidence between 0 and 1),
  evidence int not null default 1 check (evidence >= 0),
  status text not null default 'active' check (status in ('candidate', 'active', 'archived')),
  pinned boolean not null default false,
  source text not null default 'inferred' check (source in ('inferred', 'user', 'import')),
  source_run uuid,
  embedding extensions.vector(1536),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_used_at timestamptz
);
create index memories_user on public.memories (user_id, status, kind);
create index memories_embedding on public.memories
  using hnsw (embedding extensions.vector_cosine_ops);

-- Slowly-updated teaching preferences inferred from behaviour.
create table public.learner_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  style jsonb not null default '{}' check (octet_length(style::text) < 16000),
  updated_at timestamptz not null default now()
);

-- One row per model call: task, tier, tokens, cost and latency.
create table public.ai_calls (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  task text not null,
  tier text not null,
  model text not null,
  input_tokens int not null default 0,
  cached_tokens int not null default 0,
  output_tokens int not null default 0,
  reasoning_tokens int not null default 0,
  cost_usd numeric(10, 6) not null default 0,
  latency_ms int,
  ok boolean not null default true,
  error text,
  created_at timestamptz not null default now()
);
create index ai_calls_user on public.ai_calls (user_id, created_at desc);

do $$ declare t text; begin
  foreach t in array array['concepts', 'concept_states', 'learning_events', 'runs', 'memories', 'learner_profiles', 'ai_calls'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy own_read on public.%I for select to authenticated using ((select auth.uid()) = user_id)', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
    execute format('grant all on public.%I to service_role', t);
  end loop;
end $$;
-- Embeddings are server-side only; the browser reads memories through the API.
revoke select on public.memories from authenticated;

create function public.match_memories(
  p_user_id uuid,
  p_embedding extensions.vector(1536),
  p_count int default 8,
  p_min_similarity real default 0.25
)
returns table (
  id uuid, kind text, content text, concept_keys text[], confidence real,
  evidence int, pinned boolean, updated_at timestamptz, last_used_at timestamptz,
  similarity real
)
language sql stable security invoker set search_path = '' as $$
  select m.id, m.kind, m.content, m.concept_keys, m.confidence, m.evidence,
         m.pinned, m.updated_at, m.last_used_at,
         (1 - (m.embedding operator(extensions.<=>) p_embedding))::real as similarity
  from public.memories m
  where m.user_id = p_user_id
    and m.status = 'active'
    and m.embedding is not null
    and 1 - (m.embedding operator(extensions.<=>) p_embedding) >= p_min_similarity
  order by m.embedding operator(extensions.<=>) p_embedding
  limit least(greatest(p_count, 1), 40)
$$;
revoke all on function public.match_memories(uuid, extensions.vector, int, real) from public, anon, authenticated;
grant execute on function public.match_memories(uuid, extensions.vector, int, real) to service_role;
