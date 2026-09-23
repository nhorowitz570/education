import 'server-only';
import { z } from 'zod';
import { adminClient } from '@/lib/supabase/server';
import type { Plan, Session } from '@/lib/plan';
import { curriculumSessions } from '@/lib/rolling';
import {
  fresh,
  update,
  level,
  strength,
  reviewPriority,
  type ConceptState,
  type Evidence,
} from '@/lib/learning/model';
import { generate } from '@/lib/ai/engine';

export type Concept = {
  key: string;
  title: string;
  track: string;
  summary: string;
  prerequisites: string[];
  session_ids: string[];
  position: number;
};

export const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80) || 'concept';

// Until the full concept graph exists, each session stands for its own idea.
export function sessionConcepts(plan: Plan): Concept[] {
  return curriculumSessions(plan).map((s, position) => ({
    key: slug(s.id),
    title: s.title,
    track: s.subject,
    summary: s.objective.slice(0, 600),
    prerequisites: s.prerequisite_ids.map(slug),
    session_ids: [s.id],
    position,
  }));
}

export async function concepts(userId: string, plan: Plan): Promise<{ list: Concept[]; mapped: boolean }> {
  const { data, error } = await adminClient()
    .from('concepts')
    .select('key,title,track,summary,prerequisites,session_ids,position')
    .eq('user_id', userId)
    .eq('plan_id', plan.plan_id)
    .order('position');
  if (error) throw new Error('Concepts could not be loaded.');
  return data?.length
    ? { list: data as Concept[], mapped: true }
    : { list: sessionConcepts(plan), mapped: false };
}

export function conceptsFor(session: Session, list: Concept[]) {
  const hit = list.filter((c) => c.session_ids.includes(session.id));
  return hit.length ? hit : [sessionConcepts({ sessions: [session] } as Plan)[0]];
}

type Row = ConceptState & { plan_id: string };
export async function states(userId: string, planId: string) {
  const { data, error } = await adminClient()
    .from('concept_states')
    .select('*')
    .eq('user_id', userId)
    .eq('plan_id', planId);
  if (error) throw new Error('Learning progress could not be loaded.');
  return new Map((data as Row[]).map((r) => [r.concept_key, r as ConceptState]));
}

// Evidence is appended to the event log, then projected into concept state.
export async function record(
  userId: string,
  planId: string | null,
  runId: string | null,
  conceptKey: string,
  e: Evidence & { detail?: Record<string, unknown> },
) {
  const db = adminClient();
  await db.from('learning_events').insert({
    user_id: userId,
    plan_id: planId,
    run_id: runId,
    concept_key: conceptKey,
    kind: e.kind,
    score: e.score ?? null,
    assisted: !!e.assisted,
    detail: e.detail || {},
  });
  if (!planId) return null;
  const { data: prev } = await db
    .from('concept_states')
    .select('*')
    .eq('user_id', userId)
    .eq('plan_id', planId)
    .eq('concept_key', conceptKey)
    .maybeSingle();
  const next = update((prev as ConceptState) || fresh(conceptKey), e);
  const { error } = await db.from('concept_states').upsert({
    user_id: userId,
    plan_id: planId,
    ...next,
    updated_at: new Date().toISOString(),
  });
  if (error) throw new Error('Progress did not save.');
  return next;
}

export function describeState(s: ConceptState | undefined, title: string, now: string) {
  if (!s || !s.exposures) return `${title}: new to the learner.`;
  const open = s.misconceptions.filter((m) => !m.resolved).map((m) => m.text);
  const ago = s.last_seen_at
    ? Math.round((Date.parse(now) - Date.parse(s.last_seen_at)) / 86400000)
    : null;
  return [
    `${title}: ${level(s, now)} (${Math.round(strength(s, now) * 100)}% recall strength`,
    ago !== null ? `, last practised ${ago === 0 ? 'today' : ago + 'd ago'}` : '',
    `, ${s.successes} successes, ${s.lapses} lapses)`,
    open.length ? `. Open misconceptions: ${open.join('; ')}` : '',
  ].join('');
}

export function dueConcepts(
  map: Map<string, ConceptState>,
  list: Concept[],
  now: string,
  upcoming: string[] = [],
) {
  const dependents = new Map<string, number>();
  for (const c of list)
    if (upcoming.includes(c.key))
      for (const p of c.prerequisites) dependents.set(p, (dependents.get(p) || 0) + 1);
  return [...map.values()]
    .map((s) => ({ key: s.concept_key, priority: reviewPriority(s, now, dependents.get(s.concept_key) || 0) }))
    .filter((x) => x.priority > 0.5)
    .sort((a, b) => b.priority - a.priority)
    .map((x) => x.key);
}

// Major curriculum planning is one of the few jobs worth the reasoning tier.
const mapSchema = z.object({
  concepts: z.array(
    z.object({
      key: z.string(),
      title: z.string(),
      track: z.string(),
      summary: z.string(),
      session_ids: z.array(z.string()),
      prerequisites: z.array(z.string()),
    }),
  ),
});
export async function mapCurriculum(userId: string, plan: Plan) {
  const all = curriculumSessions(plan);
  const input = all
    .filter((s) => !s.optional || !/optional|travel|maintenance/i.test(s.title))
    .map((s) => `${s.id} | ${s.date} | ${s.subject} | ${s.title} — ${s.objective.slice(0, 220)}`)
    .join('\n');
  const { data } = await generate({
    task: 'curriculum.map',
    userId,
    schema: mapSchema,
    input: `Plan: ${plan.title}\nGoals: ${plan.profile.goals.join('; ')}\n\nSessions (id | date | track | title — objective):\n${input}`,
  });
  const valid = new Set(all.map((s) => s.id));
  const keys = new Set<string>();
  const rows = data.concepts
    .map((c, position) => ({ ...c, key: slug(c.key), position }))
    .filter((c) => {
      if (keys.has(c.key)) return false;
      keys.add(c.key);
      return true;
    })
    .map((c) => ({
      user_id: userId,
      plan_id: plan.plan_id,
      key: c.key,
      title: c.title.slice(0, 160),
      track: c.track.slice(0, 60) || 'general',
      summary: c.summary.slice(0, 600),
      session_ids: c.session_ids.filter((s) => valid.has(s)),
      prerequisites: c.prerequisites.map(slug).filter((p) => keys.has(p) && p !== c.key),
      position: c.position,
    }))
    .filter((c) => c.session_ids.length);
  // Sessions the model left out still need a home in the graph.
  const covered = new Set(rows.flatMap((r) => r.session_ids));
  for (const c of sessionConcepts(plan))
    if (!covered.has(c.session_ids[0]) && !keys.has(c.key))
      rows.push({ user_id: userId, plan_id: plan.plan_id, ...c, position: rows.length });
  const db = adminClient();
  await db.from('concepts').delete().eq('user_id', userId).eq('plan_id', plan.plan_id);
  const { error } = await db.from('concepts').insert(rows);
  if (error) throw new Error('The concept map did not save: ' + error.message);
  await carryOver(userId, plan.plan_id, rows);
  return rows.length;
}

// Learning recorded before the graph existed was keyed by session. Each such
// state (and its evidence) moves to the concepts that session teaches, so no
// progress is lost when the map arrives.
export async function carryOver(userId: string, planId: string, rows: { key: string; session_ids: string[] }[]) {
  const db = adminClient();
  const keys = new Set(rows.map((r) => r.key));
  const { data: old } = await db.from('concept_states').select('*').eq('user_id', userId).eq('plan_id', planId);
  for (const state of (old || []) as (ConceptState & { plan_id: string })[]) {
    if (keys.has(state.concept_key)) continue;
    const targets = rows.filter((r) => r.session_ids.some((id) => slug(id) === state.concept_key)).map((r) => r.key);
    if (!targets.length) continue;
    for (const key of targets) {
      const { data: existing } = await db
        .from('concept_states')
        .select('exposures')
        .eq('user_id', userId)
        .eq('plan_id', planId)
        .eq('concept_key', key)
        .maybeSingle();
      if (existing && existing.exposures >= state.exposures) continue;
      await db.from('concept_states').upsert({ ...state, concept_key: key, updated_at: new Date().toISOString() });
    }
    await db.from('learning_events').update({ concept_key: targets[0] }).eq('user_id', userId).eq('concept_key', state.concept_key);
    await db.from('concept_states').delete().eq('user_id', userId).eq('plan_id', planId).eq('concept_key', state.concept_key);
  }
}
