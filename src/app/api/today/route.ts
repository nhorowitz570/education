import { NextResponse, after } from 'next/server';
import { context, fail } from '@/lib/server/http';
import { ensureHorizon } from '@/lib/server/horizon';
import { activeRuns } from '@/lib/server/runs';
import { carryOver, concepts, dueConcepts, mapCurriculum, states } from '@/lib/server/learner';
import { today } from '@/lib/learning/today';
import { preview as planPreview, type Familiarity } from '@/lib/learning/planner';
import { strength } from '@/lib/learning/model';
import { conceptsFor } from '@/lib/server/learner';
import { dateInZone } from '@/lib/plan';
import { voiceReady } from '@/lib/ai/env';
import { adminClient } from '@/lib/supabase/server';

const mapping = new Set<string>();

// How far through a session is: by time for adaptive sessions, whose steps
// are planned as they go, and by steps otherwise.
function progressOf(run: { cursor: number; beats: unknown[]; minutes_planned: number | null; context: { adaptive?: boolean; clock?: { active_ms: number } } }) {
  if (run.context?.adaptive && run.context.clock)
    return Math.min(0.95, run.context.clock.active_ms / 60000 / (run.minutes_planned || 60));
  return run.beats.length ? run.cursor / run.beats.length : 0;
}

export async function GET(r: Request) {
  try {
    const { user } = await context(r);
    // Closes finished weeks and makes sure this one exists before reading it.
    const state = await ensureHorizon(user.id),
      plan = state.plan,
      zone = plan?.schedule.timezone || 'America/Los_Angeles',
      now = new Date(),
      date = dateInZone(zone, now),
      hour = Number(new Intl.DateTimeFormat('en-US', { timeZone: zone, hour: 'numeric', hourCycle: 'h23' }).format(now));
    const db = adminClient();
    const [runs, graph, learned, { data: rehearsals }, { data: insight }] = await Promise.all([
      activeRuns(user.id),
      plan ? concepts(user.id, plan) : Promise.resolve({ list: [], mapped: false }),
      plan ? states(user.id, plan.plan_id) : Promise.resolve(new Map()),
      db.from('runs').select('context').eq('user_id', user.id).eq('kind', 'rehearsal').eq('status', 'done').limit(40),
      // A fresh weekly read the learner hasn't opened yet.
      db
        .from('insights')
        .select('id,report,week_start')
        .eq('user_id', user.id)
        .eq('status', 'ready')
        .is('seen_at', null)
        .order('week_start', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);
    // The concept graph is built once per plan, in the background.
    if (plan && !graph.mapped && !mapping.has(user.id + plan.plan_id)) {
      mapping.add(user.id + plan.plan_id);
      after(() =>
        mapCurriculum(user.id, plan)
          .catch((e) => console.error('curriculum map failed', e instanceof Error ? e.message : e))
          .finally(() => mapping.delete(user.id + plan.plan_id)),
      );
    }
    // Progress recorded under per-session keys (before the map existed, or by
    // a session that started before it) is folded into the mapped concepts.
    if (plan && graph.mapped && [...learned.keys()].some((k) => !graph.list.some((c) => c.key === k)))
      after(() => carryOver(user.id, plan.plan_id, graph.list).catch(() => {}));
    const due = dueConcepts(learned, graph.list, now.toISOString());
    // An exploration is a side trip: it never takes the place of the day's
    // session. An unfinished one waits in its own row.
    const run = runs.find((x) => x.kind !== 'explore' && Date.now() - Date.parse(x.updated_at) < 18 * 3600 * 1000);
    const exploring = runs.find((x) => x.kind === 'explore' && Date.now() - Date.parse(x.updated_at) < 3 * 86400 * 1000);
    const view = today({
      state,
      date,
      hour,
      dueCount: due.length,
      voice: voiceReady(),
      rehearsed: (rehearsals || []).map((r) => (r.context as { milestone?: { date: string } }).milestone?.date || ''),
      activeRun: run
        ? {
            id: run.id,
            title: run.title,
            session_id: run.session_id,
            updated_at: run.updated_at,
            progress: progressOf(run),
          }
        : null,
    });
    // The likely shape of the next session, so Today can show what the
    // morning holds. The real session adapts as it goes.
    let preview: { type: string; minutes: number; optional?: boolean }[] = [];
    const p = view.primary;
    if (plan && p?.sessionId && (p.kind === 'session' || p.kind === 'return')) {
      const session = plan.sessions.find((s) => s.id === p.sessionId);
      if (session) {
        const keys = conceptsFor(session, graph.list).map((c) => c.key);
        const familiarity: Record<string, Familiarity> = {};
        for (const k of keys) {
          const s = learned.get(k);
          if (s?.exposures) familiarity[k] = strength(s, now.toISOString()) >= 0.75 ? 'fluent' : 'familiar';
        }
        preview = planPreview({
          kind: p.kind === 'return' ? 'return' : 'session',
          minutes: p.minutes || session.duration_minutes,
          track: session.subject,
          concepts: keys,
          familiarity,
          dueReviews: due.filter((k) => !keys.includes(k)).slice(0, 3),
          ahead: [],
          voice: voiceReady(),
        })
          .filter((s) => s.type !== 'gauge')
          .map(({ type, minutes }) => ({ type, minutes }));
        // The session fills its time, so show the shape at the planned length.
        const budget = p.minutes || session.duration_minutes,
          sum = preview.reduce((n, s) => n + s.minutes, 0);
        if (sum > 0) preview = preview.map((s) => ({ ...s, minutes: (s.minutes * budget) / sum }));
      }
    }
    const headline = (insight?.report as { headline?: string } | null)?.headline;
    const [recap, freshMemories] = await Promise.all([
      recapOf(user.id, date, zone, graph.list),
      newMemories(user.id, state.records.find((r) => r.id === 'settings:memory')?.data.seen_at),
    ]);
    return NextResponse.json({
      today: view,
      date,
      mapped: graph.mapped,
      preview,
      insight: insight && headline ? { id: insight.id, headline } : null,
      exploring: exploring ? { id: exploring.id, title: exploring.title } : null,
      recap,
      memories: { fresh: freshMemories },
    });
  } catch (e) {
    return fail(e);
  }
}

// What today's finished work added up to, for the end-of-day card.
async function recapOf(userId: string, date: string, zone: string, list: { key: string; title: string }[]) {
  const since = new Date(Date.now() - 36 * 3600 * 1000).toISOString();
  const db = adminClient();
  const [{ data: runs }, { data: events }] = await Promise.all([
    db
      .from('runs')
      .select('id,kind,started_at,ended_at,minutes_planned,context')
      .eq('user_id', userId)
      .eq('status', 'done')
      .neq('kind', 'practice')
      .gte('ended_at', since),
    db.from('learning_events').select('concept_key,kind,created_at').eq('user_id', userId).gte('created_at', since),
  ]);
  const today = (runs || []).filter((r) => r.ended_at && dateInZone(zone, new Date(r.ended_at)) === date);
  if (!today.length) return null;
  const minutes = today.reduce((n, r) => {
    const clock = (r.context as { clock?: { active_ms: number } } | null)?.clock;
    const raw = clock ? clock.active_ms / 60000 : (Date.parse(r.ended_at!) - Date.parse(r.started_at)) / 60000;
    return n + Math.min(Math.max(0, raw), (r.minutes_planned || 30) * 1.6);
  }, 0);
  const todays = (events || []).filter((e) => dateInZone(zone, new Date(e.created_at)) === date);
  const titles = new Map(list.map((c) => [c.key, c.title]));
  const ideas = [...new Set(todays.map((e) => e.concept_key).filter((k): k is string => !!k && titles.has(k)))].map((k) => titles.get(k)!);
  return {
    minutes: Math.round(minutes),
    sessions: today.length,
    answers: todays.filter((e) => e.kind !== 'exposure').length,
    ideas: ideas.slice(0, 4),
    more: Math.max(0, ideas.length - 4),
  };
}

// Memories inferred since the learner last looked. A first look counts only
// the last day.
async function newMemories(userId: string, seenAt: unknown) {
  const since = typeof seenAt === 'string' ? seenAt : new Date(Date.now() - 86400000).toISOString();
  const { count } = await adminClient()
    .from('memories')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('source', 'inferred')
    .neq('status', 'archived')
    .gt('created_at', since);
  return count || 0;
}
