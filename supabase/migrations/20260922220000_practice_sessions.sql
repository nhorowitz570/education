-- Live practice: link each voice session to its practice run and record the
-- planned length so the conductor and the client agree on timing.
alter table private.voice_sessions add column if not exists run_id uuid;
alter table private.voice_sessions add column if not exists planned_seconds int;
alter table private.voice_sessions add column if not exists ended_reason text;
