-- Runs are read through the API only, so answer keys can live beside the
-- beats without reaching the browser.
alter table public.runs add column secrets jsonb not null default '{}'
  check (octet_length(secrets::text) < 400000);
revoke select on public.runs from authenticated;
drop policy if exists own_read on public.runs;

-- Beats are patched individually: the next beat can be generating while the
-- learner answers the current one, and a whole-document write would lose one.
create function public.patch_run_beat(p_run uuid, p_user uuid, p_beat text, p_patch jsonb)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare idx int;
begin
  select (pos - 1)::int into idx
  from public.runs r, jsonb_array_elements(r.beats) with ordinality as b(value, pos)
  where r.id = p_run and r.user_id = p_user and b.value->>'id' = p_beat
  for update of r;
  if idx is null then return false; end if;
  update public.runs
     set beats = jsonb_set(beats, array[idx::text], (beats->idx) || p_patch),
         updated_at = now()
   where id = p_run and user_id = p_user;
  return true;
end $$;

create function public.append_beat_item(p_run uuid, p_user uuid, p_beat text, p_key text, p_item jsonb)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare idx int;
begin
  if p_key not in ('asks') then raise exception 'Unknown beat list'; end if;
  select (pos - 1)::int into idx
  from public.runs r, jsonb_array_elements(r.beats) with ordinality as b(value, pos)
  where r.id = p_run and r.user_id = p_user and b.value->>'id' = p_beat
  for update of r;
  if idx is null then return false; end if;
  update public.runs
     set beats = jsonb_set(beats, array[idx::text, p_key],
                   coalesce(beats->idx->p_key, '[]'::jsonb) || jsonb_build_array(p_item)),
         updated_at = now()
   where id = p_run and user_id = p_user;
  return true;
end $$;

create function public.merge_run(p_run uuid, p_user uuid, p_context jsonb default null,
                                 p_secrets jsonb default null, p_fields jsonb default null)
returns boolean language plpgsql security invoker set search_path = '' as $$
begin
  update public.runs set
    context = case when p_context is null then context else context || p_context end,
    secrets = case when p_secrets is null then secrets else secrets || p_secrets end,
    cursor = coalesce((p_fields->>'cursor')::int, cursor),
    status = coalesce(p_fields->>'status', status),
    summary = coalesce(p_fields->>'summary', summary),
    ended_at = case when p_fields ? 'ended_at' then (p_fields->>'ended_at')::timestamptz else ended_at end,
    beats = case when p_fields ? 'beats' then p_fields->'beats' else beats end,
    updated_at = now()
  where id = p_run and user_id = p_user;
  return found;
end $$;

do $$ declare f text; begin
  foreach f in array array[
    'public.patch_run_beat(uuid,uuid,text,jsonb)',
    'public.append_beat_item(uuid,uuid,text,text,jsonb)',
    'public.merge_run(uuid,uuid,jsonb,jsonb,jsonb)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;
