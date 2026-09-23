import 'server-only';
import { adminClient } from '@/lib/supabase/server';
import { readState } from './state';
import { startRun, streamBeat } from './runs';
import { today } from '@/lib/learning/today';
import { scheduled } from '@/lib/schedule';
import { dateInZone, instantFor } from '@/lib/plan';
import { voiceReady } from '@/lib/ai/env';
import { hourIn, zoneOf } from '@/lib/zone';

// Up to an hour before the learning window, the day's session is created and
// its first step written, so Begin opens straight onto content. If the
// learner never starts, it waits unopened and costs one generated step.
const LEAD = 75 * 60000,
  LATE = 60 * 60000;

export async function prepareSessions(now = new Date()) {
  const { data } = await adminClient().from('workspaces').select('user_id');
  let prepared = 0;
  for (const { user_id: uid } of data || []) {
    try {
      if (await prepareFor(uid, now)) prepared++;
    } catch (e) {
      console.error('prepare session', uid, e instanceof Error ? e.message : e);
    }
  }
  return prepared;
}

export async function prepareFor(userId: string, now: Date) {
  const state = await readState(userId),
    plan = state.plan;
  if (!plan) return false;
  const zone = zoneOf(state),
    date = dateInZone(zone, now),
    hour = hourIn(zone, now);
  // Prepare exactly what Today would offer as Begin.
  const view = today({ state, date, hour, dueCount: 0, activeRun: null, voice: voiceReady() });
  const action = view.primary;
  if (!action?.sessionId || (action.kind !== 'session' && action.kind !== 'return')) return false;
  const session = plan.sessions.find((s) => s.id === action.sessionId);
  if (!session) return false;
  const s = scheduled(session, state);
  if (s.date !== date) return false;
  const start = Date.parse(instantFor(date, s.start_local, zone));
  if (now.getTime() < start - LEAD || now.getTime() > start + LATE) return false;
  // Once per session: never re-prepare one the learner started or set aside.
  const { data: existing } = await adminClient()
    .from('runs')
    .select('id')
    .eq('user_id', userId)
    .eq('session_id', session.id)
    .limit(1);
  if (existing?.length) return false;
  const run = await startRun(userId, { kind: action.kind, sessionId: session.id, minutes: action.minutes, prepare: true });
  // The familiarity question needs no model; write the first step with content.
  for (const b of run.beats.filter((b) => b.type !== 'break').slice(0, 2)) {
    if (!b.blocks) await streamBeat(userId, run.id, b.id, () => {});
    if (b.type !== 'gauge') break;
  }
  return true;
}
