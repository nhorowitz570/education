import 'server-only';
import webpush from 'web-push';
import { adminClient } from '@/lib/supabase/server';
import { privateRows, privatePut, privateDelete, readState } from './state';
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
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
    key = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !key) return 0;
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:admin@example.com', pub, key);
  const db = adminClient();
  const subs = await privateRows<{ user_id: string; endpoint: string; subscription: webpush.PushSubscription }>('push_subscriptions');
  let sent = 0;
  for (const uid of new Set(subs.map((s) => s.user_id))) {
    const candidate = reminderCandidate(await readState(uid));
    if (!candidate) continue;
    // One notification per user per slot, even if ticks overlap.
    const { data: claimed, error } = await db.rpc('claim_notification', { p_user_id: uid, p_event_key: candidate.key });
    if (error || !claimed) continue;
    const body =
      candidate.kind === 'morning'
        ? `${candidate.title} is ready. About ${candidate.minutes} minutes.`
        : `Still time for ${candidate.title}. Even ten minutes counts.`;
    for (const sub of subs.filter((s) => s.user_id === uid)) {
      try {
        await webpush.sendNotification(sub.subscription, JSON.stringify({ body, tag: 'fieldwork:' + candidate.key, url: '/' }), { TTL: 900 });
        sent++;
      } catch (e) {
        if ([404, 410].includes((e as { statusCode: number }).statusCode)) await privateDelete('push_subscriptions', uid, sub.endpoint);
      }
    }
  }
  return sent;
}

export async function tick() {
  const [jobs, reminders, voices] = await Promise.allSettled([runJobs(), sendReminders(), resolveStale()]);
  const out = (r: PromiseSettledResult<unknown>) => (r.status === 'fulfilled' ? r.value ?? 'ok' : 'failed');
  return { jobs: out(jobs), reminders: out(reminders), voices: out(voices) };
}
