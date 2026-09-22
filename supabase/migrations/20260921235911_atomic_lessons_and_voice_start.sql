create function public.save_lesson(p_user_id uuid,p_id uuid,p_cache_key text,p_content jsonb,p_source_hash text,p_key jsonb) returns uuid
language plpgsql security invoker set search_path='' as $$
declare saved_id uuid;
begin
 insert into public.lesson_versions(id,user_id,cache_key,content,source_hash) values(p_id,p_user_id,p_cache_key,p_content,p_source_hash)
 on conflict(user_id,cache_key) do nothing returning id into saved_id;
 if saved_id is null then select id into saved_id from public.lesson_versions where user_id=p_user_id and cache_key=p_cache_key;return saved_id;end if;
 insert into private.lesson_keys(user_id,lesson_id,assessment) values(p_user_id,saved_id,p_key);
 return saved_id;
end $$;
revoke all on function public.save_lesson(uuid,uuid,text,jsonb,text,jsonb) from public,anon,authenticated;
grant execute on function public.save_lesson(uuid,uuid,text,jsonb,text,jsonb) to service_role;
alter table private.voice_sessions add column provider_id text unique;
drop index private.one_active_voice_per_user;
create unique index one_unresolved_voice_per_user on private.voice_sessions(user_id) where status in ('active','closing','unconfirmed');
