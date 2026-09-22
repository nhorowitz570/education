import 'server-only';
import { adminClient } from '@/lib/supabase/server';
import { privateRows, privatePut, privateDelete, readState } from './state';
import { getLesson } from './lessons';
import { settle } from './budget';
import { liveCost } from '@/lib/voice';
import { reminderCandidate } from '@/lib/reminders';
import WebSocket from 'ws';
import webpush from 'web-push';
type Job = {
  id: string;
  user_id: string;
  kind: string;
  status: string;
  attempts: number;
  payload: Record<string, string>;
  [k: string]: unknown;
};
type Voice = {
  id: string;
  provider_id?: string;
  user_id: string;
  status: string;
  expires_at: string;
  client_seen_at: string;
  usage_seconds: number;
  reservation_id: string;
  retain_transcript: boolean;
  transcript: unknown[];
  [k: string]: unknown;
};
const monitors = new Map<
  string,
  {
    ws: WebSocket;
    row: Voice;
    final: boolean;
    retry: number;
    closingSince?: number;
  }
>();
export async function monitorVoices() {
  await privatePut('worker_health', {
    id: 'fieldwork-worker',
    heartbeat: new Date().toISOString(),
  });
  const voices = await privateRows<Voice>('voice_sessions');
  for (const row of voices.filter((v) =>
    ['active', 'closing', 'unconfirmed'].includes(v.status),
  )) {
    let monitor = monitors.get(row.id);
    if (!monitor) {
      if (!process.env.OPENAI_API_KEY || !row.provider_id) continue;
      const ws = new WebSocket(
        `wss://api.openai.com/v1/live/sessions/${encodeURIComponent(row.provider_id!)}/attach?graceful_close=true`,
        {
          headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
          handshakeTimeout: 8000,
        },
      );
      monitor = { ws, row, final: false, retry: 0 };
      monitors.set(row.id, monitor);
      const m = monitor;
      ws.on('open', () => {
        if (!m.row.monitor_seen_at) {
          ws.send(
            JSON.stringify({
              type: 'session.instructions.append',
              delegation_id: null,
              content:
                'Begin the conversation with a brief natural opening in English, following the role-play instructions, then listen.',
            }),
          );
          ws.send(
            JSON.stringify({
              type: 'session.commentary.append',
              delegation_id: null,
              content:
                'The learner is ready for the practice conversation. Begin now.',
            }),
          );
        }
        m.row.monitor_seen_at = new Date().toISOString();
        void privatePut('voice_sessions', m.row).catch(() => {});
      });
      ws.on('message', (raw) => {
        void (async () => {
          const e = JSON.parse(raw.toString());
          if (e.type === 'session.usage.updated')
            m.row.usage_seconds = Math.max(
              Number(m.row.usage_seconds),
              Number(e.usage.seconds),
            );
          if (
            m.row.retain_transcript &&
            (e.type === 'session.input_transcript.delta' ||
              e.type === 'session.output_transcript.delta')
          ) {
            m.row.transcript = [
              ...m.row.transcript,
              {
                role: e.type.includes('input') ? 'user' : 'assistant',
                text: String(e.delta).slice(0, 5000),
                start_ms: e.start_ms,
                end_ms: e.end_ms,
              },
            ].slice(-800);
          }
          if (
            e.type === 'session.delegation.created' &&
            e.delegation.target === 'client'
          )
            ws.send(
              JSON.stringify({
                type: 'session.commentary.append',
                delegation_id: e.delegation.id,
                content:
                  'Stay in the current colleague role-play. No tools or research are available. Ask the learner one clarifying question about the outcome, owner, deadline, or decision boundary. Feedback comes after the conversation ends.',
              }),
            );
          if (e.type === 'session.closed') {
            m.final = true;
            m.row = {
              ...m.row,
              status: 'closed',
              usage_seconds: Number(e.usage.seconds),
              final_usage_confirmed: true,
            };
            await privatePut('voice_sessions', m.row);
            await settle(
              m.row.reservation_id,
              liveCost(Number(e.usage.seconds)),
            );
            ws.close();
            monitors.delete(row.id);
          }
        })().catch(() => {
          ws.readyState === WebSocket.OPEN &&
            ws.send(JSON.stringify({ type: 'session.close' }));
        });
      });
      ws.on('error', () => {
        /* Close is retried by the durable monitor loop; reserved budget remains held. */
      });
      ws.on('close', () => {
        if (!m.final) {
          m.row.status = 'unconfirmed';
          void privatePut('voice_sessions', m.row).catch(() => {});
          setTimeout(() => monitors.delete(row.id), 10000);
        }
      });
    } else {
      monitor.row = {
        ...row,
        usage_seconds: Math.max(
          Number(row.usage_seconds),
          Number(monitor.row.usage_seconds),
        ),
        transcript: monitor.row.transcript,
      };
    }
    const expires = Date.now() >= new Date(row.expires_at).getTime(),
      disconnected =
        Date.now() - new Date(row.client_seen_at).getTime() > 25000;
    if (row.status !== 'active' || expires || disconnected) {
      if (monitor.ws.readyState === WebSocket.OPEN) {
        monitor.ws.send(JSON.stringify({ type: 'session.close' }));
        monitor.closingSince ??= Date.now();
      }
      if (
        !monitor.final &&
        monitor.closingSince &&
        Date.now() - monitor.closingSince > 20000
      ) {
        monitor.row.status = 'unconfirmed';
        await privatePut('voice_sessions', monitor.row);
        monitor.ws.close();
      }
    } else if (monitor.ws.readyState === WebSocket.OPEN) {
      monitor.row.monitor_seen_at = new Date().toISOString();
      await privatePut('voice_sessions', monitor.row);
    }
  }
}
export async function runJobs() {
  const db = adminClient();
  const { data, error } = await db.rpc('claim_fieldwork_jobs', { p_limit: 2 });
  if (error) throw new Error('Job queue unavailable.');
  await Promise.all(
    ((data as Job[]) || []).map(async (j) => {
      try {
        if (j.kind === 'lesson')
          await getLesson(
            j.user_id,
            j.payload.sessionId,
            j.payload.reviewOf,
            true,
          );
        else if (j.kind === 'delete-photo') {
          if (!j.payload.path.startsWith(j.user_id + '/food/'))
            throw new Error('Private path mismatch.');
          const { error: e } = await db.storage
            .from('fieldwork-private')
            .remove([j.payload.path]);
          if (e) throw e;
        } else throw new Error('Unsupported job.');
        await privatePut('jobs', {
          ...j,
          status: 'succeeded',
          lease_until: null,
        });
      } catch (e) {
        await privatePut('jobs', {
          ...j,
          status: j.attempts >= 3 ? 'failed' : 'pending',
          run_after: new Date(Date.now() + j.attempts * 30000).toISOString(),
          lease_until: null,
          last_error:
            e instanceof Error &&
            /source|budget|allowance|configured/i.test(e.message)
              ? e.message
              : 'The task could not finish. Retry after checking the connection.',
        });
      }
    }),
  );
}
export async function sendReminders() {
  if (
    !process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ||
    !process.env.VAPID_PRIVATE_KEY
  )
    return;
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || 'mailto:admin@example.com',
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY,
  );
  const db = adminClient(),
    subs = await privateRows<{
      user_id: string;
      endpoint: string;
      subscription: webpush.PushSubscription;
    }>('push_subscriptions');
  for (const uid of new Set(subs.map((s) => s.user_id))) {
    const state = await readState(uid),
      candidate = reminderCandidate(state);
    if (!candidate) continue;
    const fresh = await readState(uid);
    if (!reminderCandidate(fresh)) continue;
    const { data: claimed, error } = await db.rpc('claim_notification', {
      p_user_id: uid,
      p_event_key: candidate.key,
    });
    if (error || !claimed) continue;
    for (const sub of subs.filter((s) => s.user_id === uid)) {
      try {
        await webpush.sendNotification(
          sub.subscription,
          JSON.stringify({
            body:
              candidate.kind === 'morning'
                ? 'A useful next step is ready when you are.'
                : 'There is still room for a small start.',
            tag: 'fieldwork:' + candidate.key,
          }),
          { TTL: 600 },
        );
      } catch (e) {
        if ([404, 410].includes((e as { statusCode: number }).statusCode))
          await privateDelete('push_subscriptions', uid, sub.endpoint);
      }
    }
  }
}
export async function shutdownVoices() {
  for (const { ws } of monitors.values())
    if (ws.readyState === WebSocket.OPEN)
      ws.send(JSON.stringify({ type: 'session.close' }));
}
