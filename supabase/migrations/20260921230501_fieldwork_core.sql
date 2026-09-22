create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to service_role;

create table public.profiles (
 user_id uuid primary key references auth.users(id) on delete cascade,
 display_name text not null default '' check(length(display_name)<=80),
 preferences jsonb not null default '{}' check(octet_length(preferences::text)<32768),
 created_at timestamptz not null default now()
);
create table public.plan_versions (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 plan_id text not null, version integer not null check(version>0), content_hash text not null,
 document jsonb not null check(octet_length(document::text)<=2097152), original_path text,
 created_at timestamptz not null default now(),
 unique(user_id,id), unique(user_id,content_hash), unique(user_id,plan_id,version)
);
create table public.workspaces (
 user_id uuid primary key references auth.users(id) on delete cascade,
 active_plan_version uuid, data jsonb not null default '{}', revision bigint not null default 0,
 updated_at timestamptz not null default now(),
 foreign key(user_id,active_plan_version) references public.plan_versions(user_id,id),
 check(octet_length(data::text)<=4194304)
);
create table public.attempts (
 id uuid not null, user_id uuid not null references auth.users(id) on delete cascade,
 session_id text not null, objective_id text not null, plan_id text not null,
 data jsonb not null check(octet_length(data::text)<65536), completed_at timestamptz not null default now(),
 primary key(user_id,id), unique(user_id,plan_id,session_id)
);
create index attempts_user_completed on public.attempts(user_id,completed_at desc);
create table public.lesson_versions (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 cache_key text not null, content jsonb not null, source_hash text not null,
 created_at timestamptz not null default now(), unique(user_id,id), unique(user_id,cache_key)
);
create table private.lesson_keys (
 user_id uuid not null, lesson_id uuid not null, assessment jsonb not null,
 primary key(user_id,lesson_id), foreign key(user_id,lesson_id) references public.lesson_versions(user_id,id) on delete cascade
);
create table private.command_events (
 user_id uuid not null references auth.users(id) on delete cascade, event_id uuid not null,
 created_at timestamptz not null default now(), primary key(user_id,event_id)
);
create table private.jobs (
 id uuid primary key default gen_random_uuid(), user_id uuid references auth.users(id) on delete cascade,
 job_key text not null unique, kind text not null, payload jsonb not null default '{}',
 status text not null default 'pending' check(status in ('pending','running','succeeded','failed')),
 attempts integer not null default 0, run_after timestamptz not null default now(),
 lease_until timestamptz, result jsonb, last_error text, created_at timestamptz not null default now()
);
create index jobs_due on private.jobs(run_after) where status in ('pending','running');
create table private.usage_events (
 id uuid primary key, user_id uuid not null references auth.users(id) on delete cascade,
 operation_key text not null, month date not null, reserved_usd numeric(10,5) not null check(reserved_usd>=0),
 actual_usd numeric(10,5), state text not null default 'reserved' check(state in ('reserved','settled','released')),
 model text, created_at timestamptz not null default now(), unique(user_id,operation_key),
 check(actual_usd is null or actual_usd>=0)
);
create index usage_month on private.usage_events(month,user_id);
create table private.connections (
 user_id uuid not null references auth.users(id) on delete cascade, provider text not null,
 secret text not null, metadata jsonb not null default '{}', updated_at timestamptz not null default now(),
 primary key(user_id,provider)
);
create table private.voice_sessions (
 id text primary key, user_id uuid not null references auth.users(id) on delete cascade,
 reservation_id uuid not null references private.usage_events(id), expires_at timestamptz not null,
 status text not null default 'active' check(status in ('active','closing','closed','unconfirmed')),
 usage_seconds numeric not null default 0, transcript jsonb not null default '[]',
 retain_transcript boolean not null default false, final_usage_confirmed boolean not null default false,
 created_at timestamptz not null default now()
);
create unique index one_active_voice_per_user on private.voice_sessions(user_id) where status in ('active','closing');
create table private.push_subscriptions (
 user_id uuid not null references auth.users(id) on delete cascade, endpoint text not null,
 subscription jsonb not null, created_at timestamptz not null default now(), primary key(user_id,endpoint)
);
create table private.worker_health (id text primary key, heartbeat timestamptz not null);
create table private.notification_events (
 user_id uuid not null references auth.users(id) on delete cascade, event_key text not null, sent_at timestamptz not null default now(),
 primary key(user_id,event_key)
);

do $$ declare t text; begin
 foreach t in array array['profiles','plan_versions','workspaces','attempts','lesson_versions'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('create policy own_read on public.%I for select to authenticated using ((select auth.uid()) = user_id)',t);
  execute format('create policy own_insert on public.%I for insert to authenticated with check ((select auth.uid()) = user_id)',t);
  execute format('create policy own_update on public.%I for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id)',t);
  execute format('create policy own_delete on public.%I for delete to authenticated using ((select auth.uid()) = user_id)',t);
  execute format('revoke all on public.%I from anon, authenticated',t);
  execute format('grant select on public.%I to authenticated',t);
  execute format('grant all on public.%I to service_role',t);
 end loop;
 foreach t in array array['lesson_keys','command_events','jobs','usage_events','connections','voice_sessions','push_subscriptions','worker_health','notification_events'] loop
  execute format('alter table private.%I enable row level security',t);
  execute format('revoke all on private.%I from anon, authenticated',t);
  execute format('grant all on private.%I to service_role',t);
 end loop;
end $$;

-- Server-only transaction boundary: no user-provided owner ever reaches this RPC.
create function public.commit_workspace(p_user_id uuid,p_expected bigint,p_next jsonb,p_event_id uuid,p_attempt jsonb default null,p_plan_version uuid default null)
returns boolean language plpgsql security invoker set search_path='' as $$
declare current_revision bigint;
begin
 insert into public.workspaces(user_id) values(p_user_id) on conflict do nothing;
 select revision into current_revision from public.workspaces where user_id=p_user_id for update;
 if exists(select 1 from private.command_events where user_id=p_user_id and event_id=p_event_id) then return true; end if;
 if current_revision<>p_expected then return false; end if;
 if p_plan_version is not null and not exists(select 1 from public.plan_versions where user_id=p_user_id and id=p_plan_version) then raise exception 'Plan ownership mismatch'; end if;
 if p_attempt is not null then
  insert into public.attempts(id,user_id,session_id,objective_id,plan_id,data,completed_at)
  values((p_attempt->>'id')::uuid,p_user_id,p_attempt->>'session_id',p_attempt->>'objective_id',p_next->'plan'->>'plan_id',p_attempt,(p_attempt->>'completed_at')::timestamptz)
  on conflict(user_id,plan_id,session_id) do nothing;
 end if;
 update public.workspaces set data=p_next-'attempts',revision=revision+1,active_plan_version=coalesce(p_plan_version,active_plan_version),updated_at=now() where user_id=p_user_id;
 insert into private.command_events(user_id,event_id) values(p_user_id,p_event_id);
 return true;
end $$;
revoke all on function public.commit_workspace(uuid,bigint,jsonb,uuid,jsonb,uuid) from public,anon,authenticated;
grant execute on function public.commit_workspace(uuid,bigint,jsonb,uuid,jsonb,uuid) to service_role;

create function public.reserve_ai_budget(p_id uuid,p_user_id uuid,p_key text,p_amount numeric,p_user_limit numeric,p_project_limit numeric,p_model text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare m date:=date_trunc('month',now() at time zone 'UTC')::date; total numeric; own_total numeric; existing private.usage_events;
begin
 if p_amount<=0 or p_amount>10 then raise exception 'Invalid reservation'; end if;
 perform pg_advisory_xact_lock(740261);
 select * into existing from private.usage_events where user_id=p_user_id and operation_key=p_key;
 if found then return jsonb_build_object('id',existing.id,'state',existing.state,'existing',true); end if;
 select coalesce(sum(case when state='reserved' then reserved_usd when state='settled' then actual_usd else 0 end),0) into total from private.usage_events where month=m;
 select coalesce(sum(case when state='reserved' then reserved_usd when state='settled' then actual_usd else 0 end),0) into own_total from private.usage_events where month=m and user_id=p_user_id;
 if own_total+p_amount>p_user_limit or total+p_amount>p_project_limit then raise exception 'Monthly AI allowance reached'; end if;
 insert into private.usage_events(id,user_id,operation_key,month,reserved_usd,model) values(p_id,p_user_id,p_key,m,p_amount,p_model);
 return jsonb_build_object('id',p_id,'state','reserved','existing',false);
end $$;
revoke all on function public.reserve_ai_budget(uuid,uuid,text,numeric,numeric,numeric,text) from public,anon,authenticated;
grant execute on function public.reserve_ai_budget(uuid,uuid,text,numeric,numeric,numeric,text) to service_role;

-- These narrowly scoped server RPCs keep private tables out of the Data API schema.
create function public.private_read(p_table text,p_user_id uuid default null)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare out_json jsonb;
begin
 if p_table not in ('jobs','usage_events','connections','voice_sessions','push_subscriptions','notification_events','lesson_keys','worker_health') then raise exception 'Unknown private resource'; end if;
 if p_table='worker_health' then select coalesce(jsonb_agg(t),'[]') into out_json from private.worker_health t;
 else execute format('select coalesce(jsonb_agg(t),''[]''::jsonb) from private.%I t where ($1 is null or user_id=$1)',p_table) into out_json using p_user_id; end if;
 return out_json;
end $$;
revoke all on function public.private_read(text,uuid) from public,anon,authenticated;
grant execute on function public.private_read(text,uuid) to service_role;

create function public.activate_plan(p_user_id uuid,p_hash text,p_document jsonb,p_path text)
returns uuid language plpgsql security invoker set search_path='' as $$
declare new_id uuid; next_version int;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_user_id::text,0));
 select id into new_id from public.plan_versions where user_id=p_user_id and content_hash=p_hash;
 if new_id is not null then return new_id; end if;
 select coalesce(max(version),0)+1 into next_version from public.plan_versions where user_id=p_user_id and plan_id=p_document->>'plan_id';
 insert into public.plan_versions(user_id,plan_id,version,content_hash,document,original_path) values(p_user_id,p_document->>'plan_id',next_version,p_hash,p_document,p_path) returning id into new_id;
 return new_id;
end $$;
revoke all on function public.activate_plan(uuid,text,jsonb,text) from public,anon,authenticated;
grant execute on function public.activate_plan(uuid,text,jsonb,text) to service_role;
