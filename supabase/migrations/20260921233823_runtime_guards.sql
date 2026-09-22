alter table private.voice_sessions add column client_seen_at timestamptz not null default now();
alter table private.voice_sessions add column monitor_seen_at timestamptz;
create index voice_reservation on private.voice_sessions(reservation_id);
create index workspaces_plan_owner on public.workspaces(user_id,active_plan_version);
create index jobs_owner on private.jobs(user_id);
create index voice_owner on private.voice_sessions(user_id);
-- One process at a time may run a durable job. Notification claims use a unique event key.
create function public.claim_notification(p_user_id uuid,p_event_key text) returns boolean
language plpgsql security invoker set search_path='' as $$
begin
 insert into private.notification_events(user_id,event_key) values(p_user_id,p_event_key) on conflict do nothing;
 return found;
end $$;
revoke all on function public.claim_notification(uuid,text) from public,anon,authenticated;
grant execute on function public.claim_notification(uuid,text) to service_role;
