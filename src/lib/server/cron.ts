import 'server-only';
import { adminClient } from '@/lib/supabase/server';
import { privatePut, readState } from './state';
import { pushReady, pushTo, subscriptions } from './push';
import { reminderCandidate } from '@/lib/reminders';
import { resolveStale } from './practice';

// Scheduled work, run by Vercel Cron every 15 minutes. Each task is
// idempotent, so a missed or repeated tick is harmless.

type Job = { id: string; user_id: string; kind: string; attempts: number; payload: Record<string, string>; [k: string]: unknown };

// Photos kept for 7 or 30 days are deleted by queued jobs.
export async function runJobs() {
  const db = adminClient();
  const { data, error } = await db.rpc('claim_fieldwork_jobs', { p_limit: 20 });
  if (error) throw new Error('Job queue unavailable.');
  let done = 0;
  for (const j of (data as Job[]) || []) {
    try {
      if (j.kind === 'delete-photo') {
        if (!j.payload.path?.startsWith(j.user_id + '/food/')) throw new Error('Private path mismatch.');
        const { error: e } = await db.storage.from('fieldwork-private').remove([j.payload.path]);
        if (e) throw e;
      }
      // Anything else is from the retired lesson worker and is simply retired.
      await privatePut('jobs', { ...j, status: 'succeeded', lease_until: null });
      done++;
    } catch {
      await privatePut('jobs', {
        ...j,
        status: j.attempts >= 3 ? 'failed' : 'pending',
        run_after: new Date(Date.now() + j.attempts * 30 * 60000).toISOString(),
        lease_until: null,
        last_error: 'The scheduled task could not finish.',
      });
    }
  }
  return done;
}

export async function sendReminders() {
  if (!pushReady()) return 0;
  const subs = await subscriptions();
  let sent = 0;
  for (const uid of new Set(subs.map((s) => s.user_id))) {
    const candidate = reminderCandidate(await readState(uid));
    if (!candidate) continue;
    const body =
      candidate.kind === 'morning'
        ? `${candidate.title} is ready. About ${candidate.minutes} minutes.`
        : `Still time for ${candidate.title}. Even ten minutes counts.`;
    sent += await pushTo(uid, candidate.key, { body, url: '/' }, subs);
  }
  return sent;
}

export async function tick() {
  const [jobs, reminders, voices] = await Promise.allSettled([runJobs(), sendReminders(), resolveStale()]);
  const out = (r: PromiseSettledResult<unknown>) => (r.status === 'fulfilled' ? r.value ?? 'ok' : 'failed');
  return { jobs: out(jobs), reminders: out(reminders), voices: out(voices) };
}
