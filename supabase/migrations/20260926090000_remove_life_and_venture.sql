-- Life and Venture are gone. This deletes what they stored:
--
-- Life (lived inside shared rows, so only its own keys and rows go):
--   * workspace records of kind checkin, food (including meal-photo
--     estimates), workout, body, social and reflection, plus the
--     settings:gym and settings:food records;
--   * the plan's `growth` section (gym, food, social and check-in plans) in
--     each workspace's working copy. plan_versions are immutable evidence
--     (an update trigger rejects changes) and keep their original document;
--   * memories of kind 'life', and 'life' as a memory kind;
--   * the check-in, reflection and workout figures in weekly insight metrics;
--   * stored meal photos. Storage objects can only be removed through the
--     Storage API, so their pending deletion jobs are made due now and the
--     next cron tick deletes the files.
--
-- Venture: the ventures table, with its policy and grants.
--
-- Kept on purpose: ai_calls and usage_events rows for these features (the
-- cost ledger and monthly allowance), and plan_chapters (shared with plans).

-- Workspaces change under their writers, so each touched row gets a new
-- revision: a device holding the old state has to reload before it can save.
update public.workspaces w
   set data = jsonb_set(w.data, '{records}', coalesce((
         select jsonb_agg(x.r order by x.i)
         from jsonb_array_elements(w.data->'records') with ordinality as x(r, i)
         where coalesce(x.r->>'kind', '') not in ('checkin', 'food', 'workout', 'body', 'social', 'reflection')
           and coalesce(x.r->>'id', '') not in ('settings:gym', 'settings:food')
       ), '[]'::jsonb)),
       revision = w.revision + 1,
       updated_at = now()
 where jsonb_typeof(w.data->'records') = 'array'
   and exists (
     select 1 from jsonb_array_elements(w.data->'records') as x(r)
     where x.r->>'kind' in ('checkin', 'food', 'workout', 'body', 'social', 'reflection')
        or x.r->>'id' in ('settings:gym', 'settings:food')
   );

update public.workspaces
   set data = data #- '{plan,growth}',
       revision = revision + 1,
       updated_at = now()
 where jsonb_typeof(data->'plan') = 'object' and data->'plan' ? 'growth';

delete from public.memories where kind = 'life';
alter table public.memories drop constraint if exists memories_kind_check;
alter table public.memories add constraint memories_kind_check check (kind in (
  'goal', 'interest', 'preference', 'background', 'knowledge', 'episode', 'style'
));

update public.insights
   set metrics = metrics - 'checkins' - 'reflections' - 'workouts',
       updated_at = now()
 where metrics ?| array['checkins', 'reflections', 'workouts'];

-- Due now, with fresh attempts, including any that had given up.
update private.jobs
   set status = 'pending', attempts = 0, run_after = now(), lease_until = null, last_error = null
 where kind = 'delete-photo' and status <> 'succeeded';

drop table if exists public.ventures;
