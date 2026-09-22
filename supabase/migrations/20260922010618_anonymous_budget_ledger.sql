-- Deleting an account must not reset the shared project's monthly AI allowance.
-- Keep cost-only records without their former account owner.
alter table private.usage_events alter column user_id drop not null;
alter table private.usage_events drop constraint usage_events_user_id_fkey;
alter table private.usage_events add constraint usage_events_user_id_fkey
  foreign key (user_id) references auth.users(id) on delete set null;
