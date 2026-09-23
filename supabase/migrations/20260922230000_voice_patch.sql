-- Voice sessions are touched concurrently (client heartbeats, the server
-- conductor, stale-session cleanup). Whole-row upserts let one writer undo
-- another; this updates only the fields a caller owns and never reopens a
-- closed call.
create function public.voice_patch(p_id text, p_user uuid, p_patch jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare result jsonb;
begin
  update private.voice_sessions v set
    client_seen_at = case when p_patch ? 'touch' then now() else v.client_seen_at end,
    monitor_seen_at = case when p_patch ? 'monitor' then now() else v.monitor_seen_at end,
    usage_seconds = greatest(v.usage_seconds, coalesce((p_patch->>'usage_seconds')::numeric, 0)),
    status = case
      when not (p_patch ? 'status') or v.status = 'closed' then v.status
      when p_patch->>'status' = 'closing' and v.status <> 'active' then v.status
      else p_patch->>'status' end,
    final_usage_confirmed = v.final_usage_confirmed or coalesce((p_patch->>'final_usage_confirmed')::boolean, false),
    ended_reason = coalesce(v.ended_reason, p_patch->>'ended_reason')
  where v.id = p_id and v.user_id = p_user
  returning to_jsonb(v) into result;
  return result;
end $$;
revoke all on function public.voice_patch(text, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.voice_patch(text, uuid, jsonb) to service_role;
