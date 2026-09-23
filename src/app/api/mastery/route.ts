import { NextResponse } from 'next/server';
import { context, fail } from '@/lib/server/http';
import { readState } from '@/lib/server/state';
import { concepts, states } from '@/lib/server/learner';
import { adminClient } from '@/lib/supabase/server';
import { calibration, level, retrievability, strength, fresh, type ConceptState } from '@/lib/learning/model';
import { update } from '@/lib/learning/model';

// The learner model, shaped for display: every concept with its current
// strength and level, plus recent evidence and practice.
export async function GET(r: Request) {
  try {
    const { user } = await context(r);
    const url = new URL(r.url);
    const only = url.searchParams.get('concepts')?.split(',').filter(Boolean);
    const runId = url.searchParams.get('run');
    const state = await readState(user.id),
      plan = state.plan;
    if (!plan)
      return NextResponse.json({
        concepts: [],
        mapped: false,
        hasPlan: false,
        evidence: [],
        practice: [],
        history: [],
        weeks: [],
      });
    const [graph, learned] = await Promise.all([concepts(user.id, plan), states(user.id, plan.plan_id)]);
    const now = new Date().toISOString();
    // For a finished run, reconstruct each concept's strength before it by
    // replaying the model without that run's events.
    let before = new Map<string, number>();
    if (runId && only?.length) {
      const { data } = await adminClient()
        .from('learning_events')
        .select('concept_key,kind,score,assisted,detail,created_at,run_id')
        .eq('user_id', user.id)
        .in('concept_key', only)
        .order('created_at');
      for (const key of only) {
        let s: ConceptState = fresh(key);
        for (const e of (data || []).filter((e) => e.concept_key === key && e.run_id !== runId))
          s = update(s, {
            kind: e.kind,
            score: e.score ?? undefined,
            assisted: e.assisted,
            confidence: (e.detail as { confidence?: 'low' | 'medium' | 'high' } | null)?.confidence || undefined,
            at: e.created_at,
          });
        before.set(key, strength(s, now));
      }
    }
    const list = graph.list
      .filter((c) => !only || only.includes(c.key))
      .map((c) => {
        const s = learned.get(c.key);
        return {
          key: c.key,
          title: c.title,
          track: c.track,
          summary: c.summary,
          prerequisites: c.prerequisites,
          sessions: c.session_ids,
          position: c.position,
          strength: s ? strength(s, now) : 0,
          recall: s ? retrievability(s, now) : 0,
          level: s ? level(s, now) : 'new',
          due_at: s?.due_at || null,
          last_seen_at: s?.last_seen_at || null,
          successes: s?.successes || 0,
          lapses: s?.lapses || 0,
          misconceptions: (s?.misconceptions || []).filter((m) => !m.resolved).map((m) => m.text),
          // The model's own parameters, so the page can project forgetting.
          model: s ? { p_known: s.p_known, stability: s.stability, exposures: s.exposures, last_seen_at: s.last_seen_at } : null,
          ...(before.has(c.key) ? { before: before.get(c.key) } : {}),
        };
      });
    if (only) return NextResponse.json({ concepts: list });
    const db = adminClient();
    const [{ data: runs }, { data: events }] = await Promise.all([
      db
        .from('runs')
        .select('id,kind,title,beats,context,started_at,ended_at,status,summary')
        .eq('user_id', user.id)
        .eq('status', 'done')
        .order('started_at', { ascending: false })
        .limit(60),
      db
        .from('learning_events')
        .select('created_at,score,kind')
        .eq('user_id', user.id)
        .gte('created_at', new Date(Date.now() - 56 * 86400000).toISOString()),
    ]);
    // Confidence against accuracy, over the last 200 rated answers.
    const { data: rated } = await db
      .from('learning_events')
      .select('score,detail')
      .eq('user_id', user.id)
      .not('detail->>confidence', 'is', null)
      .order('created_at', { ascending: false })
      .limit(200);
    const calibrated = calibration(
      (rated || []).map((e) => ({ score: e.score, confidence: (e.detail as { confidence?: string } | null)?.confidence })),
    );
    const evidence = (runs || []).flatMap((r) =>
      (r.beats as { type: string; intent: string; response?: { text?: string }; feedback?: { verdict: string } }[])
        .filter((b) => b.type === 'produce' && b.response?.text)
        .map((b) => ({ run: r.id, title: r.title, date: r.ended_at || r.started_at, text: b.response!.text!, verdict: b.feedback?.verdict || null })),
    );
    const practice = (runs || [])
      .filter((r) => r.kind === 'practice')
      .map((r) => {
        const p = (r.context as { practice?: { mode: string; feedback?: { score: number; headline: string } } }).practice;
        return { id: r.id, title: r.title, date: r.started_at, mode: p?.mode, score: p?.feedback?.score ?? null, headline: p?.feedback?.headline ?? null };
      });
    const history = (runs || [])
      .filter((r) => r.kind !== 'practice')
      .map((r) => ({ id: r.id, kind: r.kind, title: r.title, date: r.ended_at || r.started_at, summary: r.summary }));
    // Eight weeks of activity for the momentum chart.
    const weeks = Array.from({ length: 8 }, (_, i) => {
      const end = Date.now() - (7 - i) * 7 * 86400000,
        start = end - 7 * 86400000;
      const inWeek = (events || []).filter((e) => {
        const t = Date.parse(e.created_at);
        return t > start && t <= end;
      });
      return {
        week: new Date(end).toISOString().slice(0, 10),
        count: inWeek.length,
        solid: inWeek.filter((e) => (e.score ?? 0) >= 0.75).length,
      };
    });
    return NextResponse.json({
      concepts: list,
      mapped: graph.mapped,
      hasPlan: true,
      evidence,
      practice,
      history,
      weeks,
      calibration: calibrated,
      milestones: plan.milestones,
    });
  } catch (e) {
    return fail(e);
  }
}
