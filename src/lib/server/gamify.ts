import 'server-only';
import { adminClient } from '@/lib/supabase/server';
import { readState } from './state';
import { scheduled } from '@/lib/schedule';
import { dateInZone } from '@/lib/plan';
import { progress, type Activity } from '@/lib/gamify';
import { isRolling, weekOf } from '@/lib/rolling';
import type { Confidence } from '@/lib/learning/run';
import { zoneOf } from '@/lib/zone';

// Gathers everything XP is derived from: graded answers, finished runs and
// Venture months, each dated in the learner's own time zone.
export async function progressFor(userId: string, now = new Date()) {
  const state = await readState(userId);
  const zone = zoneOf(state);
  const local = (iso: string) => dateInZone(zone, new Date(iso));
  const today = dateInZone(zone, now);
  const db = adminClient();
  const [{ data: events }, { data: runs }, { data: venture }] = await Promise.all([
    db
      .from('learning_events')
      .select('created_at,kind,score,detail')
      .eq('user_id', userId)
      .order('created_at')
      .limit(20000),
    db.from('runs').select('kind,started_at,ended_at').eq('user_id', userId).eq('status', 'done').limit(5000),
    // Venture may not exist yet for this learner (or this database).
    db.from('ventures').select('state').eq('user_id', userId).maybeSingle(),
  ]);
  const answers: Activity['answers'] = [];
  for (const e of events || []) {
    const detail = (e.detail || {}) as { confidence?: Confidence | null; unknown?: boolean };
    if (e.score === null && !detail.unknown) continue;
    answers.push({ date: local(e.created_at), score: e.score, kind: e.kind, confidence: detail.confidence || null, unknown: !!detail.unknown });
  }
  const history = ((venture?.state as { history?: { date: string; profit: number }[] } | null)?.history || []).filter(
    (m) => typeof m?.date === 'string',
  );
  const plan = state.plan;
  const requiredDays = plan
    ? [
        ...new Set(
          plan.sessions
            .map((s) => scheduled(s, state))
            .filter((s) => !s.optional && s.status !== 'skipped' && s.status !== 'travel' && s.date <= today)
            .map((s) => s.date),
        ),
      ]
    : [];
  const done = new Set(state.attempts.map((a) => a.session_id));
  const rolling = isRolling(plan);
  // A closed week's unfinished sessions go back to their tracks, but the week
  // still had them planned: it counts as a week that could break a streak.
  if (rolling)
    for (const w of plan.horizon.weeks) if ((w.planned || 0) > 0 && w.start <= today && !requiredDays.includes(w.start)) requiredDays.push(w.start);
  // In a rolling week, a session still open from earlier in the week makes
  // today a learning day too.
  const learningDay = !!plan?.sessions.some((s) => {
    const x = scheduled(s, state);
    if (x.optional || x.status === 'skipped' || x.status === 'travel') return false;
    return x.date === today || (rolling && !done.has(x.id) && x.date < today && weekOf(x.date) === weekOf(today));
  });
  return progress({
    today,
    answers,
    runs: (runs || []).map((r) => ({ date: local(r.ended_at || r.started_at), kind: r.kind })),
    ventureMonths: history.map((m) => ({ date: m.date, profit: Number(m.profit) || 0 })),
    requiredDays,
    learningDay,
    venture: !!venture?.state,
    weekly: rolling,
  });
}
