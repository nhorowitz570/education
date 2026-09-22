create function public.private_put(p_table text,p_row jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare cols text; values_cols text; updates text; pk text; result jsonb;
begin
 if p_table not in ('jobs','usage_events','connections','voice_sessions','push_subscriptions','notification_events','lesson_keys','worker_health') then raise exception 'Unknown private resource'; end if;
 pk:=case p_table when 'connections' then 'user_id,provider' when 'push_subscriptions' then 'user_id,endpoint' when 'notification_events' then 'user_id,event_key' when 'lesson_keys' then 'user_id,lesson_id' else 'id' end;
 select string_agg(format('%I',a.attname),','), string_agg(format('v.%I',a.attname),','), string_agg(format('%I=excluded.%I',a.attname,a.attname),',')
 into cols,values_cols,updates from pg_attribute a where a.attrelid=format('private.%I',p_table)::regclass and a.attnum>0 and not a.attisdropped and p_row ? a.attname;
 if cols is null then raise exception 'No valid fields'; end if;
 execute format('insert into private.%I as target (%s) select %s from jsonb_populate_record(null::private.%I,$1) v on conflict (%s) do update set %s returning to_jsonb(target)',p_table,cols,values_cols,p_table,pk,updates) into result using p_row;
 return result;
end $$;
revoke all on function public.private_put(text,jsonb) from public,anon,authenticated;
grant execute on function public.private_put(text,jsonb) to service_role;

create function public.private_delete(p_table text,p_user_id uuid,p_key text default null) returns void
language plpgsql security invoker set search_path='' as $$
declare key_column text;
begin
 key_column:=case p_table when 'connections' then 'provider' when 'push_subscriptions' then 'endpoint' when 'voice_sessions' then 'id' when 'lesson_keys' then 'lesson_id' when 'jobs' then 'id' else null end;
 if key_column is null then raise exception 'Unknown private resource'; end if;
 execute format('delete from private.%I where user_id=$1 and ($2 is null or %I::text=$2)',p_table,key_column) using p_user_id,p_key;
end $$;
revoke all on function public.private_delete(text,uuid,text) from public,anon,authenticated;
grant execute on function public.private_delete(text,uuid,text) to service_role;

create function public.settle_ai_budget(p_id uuid,p_amount numeric,p_release boolean default false) returns void
language sql security invoker set search_path='' as $$
 update private.usage_events set actual_usd=greatest(0,p_amount),state=case when p_release then 'released' else 'settled' end where id=p_id and state='reserved';
$$;
revoke all on function public.settle_ai_budget(uuid,numeric,boolean) from public,anon,authenticated;
grant execute on function public.settle_ai_budget(uuid,numeric,boolean) to service_role;

create function public.claim_fieldwork_jobs(p_limit integer default 5) returns setof private.jobs
language sql security invoker set search_path='' as $$
 update private.jobs j set status='running',attempts=attempts+1,lease_until=now()+interval '2 minutes'
 where j.id in(select id from private.jobs where attempts<3 and run_after<=now() and (status='pending' or (status='running' and lease_until<now())) order by run_after for update skip locked limit least(p_limit,10))
 returning j.*;
$$;
revoke all on function public.claim_fieldwork_jobs(integer) from public,anon,authenticated;
grant execute on function public.claim_fieldwork_jobs(integer) to service_role;

create function private.reject_evidence_update() returns trigger language plpgsql set search_path='' as $$
begin raise exception 'Completed evidence and plan versions are immutable'; end $$;
create trigger immutable_attempt before update on public.attempts for each row execute function private.reject_evidence_update();
create trigger immutable_plan_version before update on public.plan_versions for each row execute function private.reject_evidence_update();
revoke all on function private.reject_evidence_update() from public,anon,authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('fieldwork-private','fieldwork-private',false,2097152,array['application/json','text/plain','text/markdown','image/jpeg','image/png','image/webp'])
on conflict(id) do nothing;
create policy fieldwork_read on storage.objects for select to authenticated using (bucket_id='fieldwork-private' and (storage.foldername(name))[1]=(select auth.uid())::text);
create policy fieldwork_insert on storage.objects for insert to authenticated with check (bucket_id='fieldwork-private' and (storage.foldername(name))[1]=(select auth.uid())::text);
create policy fieldwork_update on storage.objects for update to authenticated using (bucket_id='fieldwork-private' and (storage.foldername(name))[1]=(select auth.uid())::text) with check (bucket_id='fieldwork-private' and (storage.foldername(name))[1]=(select auth.uid())::text);
create policy fieldwork_delete on storage.objects for delete to authenticated using (bucket_id='fieldwork-private' and (storage.foldername(name))[1]=(select auth.uid())::text);
