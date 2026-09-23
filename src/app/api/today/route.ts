import { NextResponse, after } from 'next/server';
import { context, fail } from '@/lib/server/http';
import { readState } from '@/lib/server/state';
import { activeRuns } from '@/lib/server/runs';
import { carryOver, concepts, dueConcepts, mapCurriculum, states } from '@/lib/server/learner';
import { today } from '@/lib/learning/today';
import { outline } from '@/lib/learning/outline';
import { strength } from '@/lib/learning/model';
import { conceptsFor } from '@/lib/server/learner';
import { dateInZone } from '@/lib/plan';
import { voiceReady } from '@/lib/ai/env';
import { adminClient } from '@/lib/supabase/server';

const mapping = new Set<string>();

export async function GET(r: Request) {
  try {
    const { user } = await context(r);
    const state = await readState(user.id),
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
    const run = runs.find((x) => Date.now() - Date.parse(x.updated_at) < 18 * 3600 * 1000);
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
            progress: run.beats.length ? run.cursor / run.beats.length : 0,
          }
        : null,
    });
    // The shape of the next session, so Today can show what the morning holds.
    let preview: { type: string; minutes: number; optional?: boolean }[] = [];
    const p = view.primary;
    if (plan && p?.sessionId && (p.kind === 'session' || p.kind === 'return')) {
      const session = plan.sessions.find((s) => s.id === p.sessionId);
      if (session) {
        const keys = conceptsFor(session, graph.list).map((c) => c.key);
        const known = keys.length
          ? keys.reduce((s, k) => s + (learned.get(k) ? strength(learned.get(k)!, now.toISOString()) : 0), 0) / keys.length
          : 0;
        preview = outline({
          kind: p.kind === 'return' ? 'return' : 'session',
          minutes: p.minutes || session.duration_minutes,
          track: session.subject,
          concepts: keys,
          known,
          dueReviews: due.filter((k) => !keys.includes(k)),
          voice: voiceReady(),
        }).map(({ type, minutes, optional }) => ({ type, minutes, optional }));
      }
    }
    const headline = (insight?.report as { headline?: string } | null)?.headline;
    return NextResponse.json({
      today: view,
      date,
      mapped: graph.mapped,
      preview,
      insight: insight && headline ? { id: insight.id, headline } : null,
    });
  } catch (e) {
    return fail(e);
  }
}
