import 'server-only';
import { z } from 'zod';
import { Temporal } from '@js-temporal/polyfill';
import { adminClient } from '@/lib/supabase/server';
import { HttpError } from './http';
import { readState, mutate } from './state';
import { generate } from '@/lib/ai/engine';
import type { Layer } from '@/lib/ai/prompts';
import type { Plan, Session } from '@/lib/plan';
import { outline } from '@/lib/learning/outline';
import { extend, GAUGE_FAMILIARITY, type Familiarity, type Gauge, type PlanInput } from '@/lib/learning/planner';
import {
  blockSchema,
  isQuestionBeat,
  type Beat,
  type Block,
  type Confidence,
  type Feedback,
  type Response,
  type RunView,
  type AskIntent,
  canRetry,
} from '@/lib/learning/run';
import { strength, type ConceptState } from '@/lib/learning/model';
import { NEUTRAL, observe, styleLayer, type Signal, type Style } from '@/lib/learning/style';
import { concepts, conceptsFor, describeState, dueConcepts, record, states } from './learner';
import { consolidate, memoryLayer, recall } from './memory';
import { ventureLayer } from './venture';
import type { Attempt } from '@/lib/types';
import { sessionById } from '@/lib/rolling';
import { zoneOf } from '@/lib/zone';
import { activeMs, type Clock } from '@/lib/learning/duration';
import { prefsOf } from '@/lib/prefs';

type RunContext = {
  session_concepts?: string[];
  memories?: string;
  scenario_facts?: string[];
  topic?: string;
  exposed?: string[];
  deeper?: number;
  diagnosis?: Record<string, string>;
  // Written ahead of the learning window; "opened" once the learner begins.
  prepared?: boolean;
  opened?: boolean;
  break_until?: string | null;
  milestone?: { title: string; date: string };
  // Adaptive sessions: what the planner needs to decide each next step.
  adaptive?: boolean;
  familiarity?: Record<string, Familiarity>;
  due?: string[];
  ahead?: string[];
  evidence?: string;
  track?: string;
  voice?: boolean;
  wrap?: boolean;
  // The learner's session settings when the run began (You → Sessions).
  ask_familiarity?: boolean;
  break_minutes?: number;
  // Active time: gaps longer than IDLE are not counted, so a session resumed
  // the next day doesn't think it ran out of time.
  clock?: Clock;
};
type Key = {
  answer_index: number | null;
  model_answer: string;
  rubric: string;
  watch_for: string[];
};
type RunRow = {
  id: string;
  user_id: string;
  plan_id: string | null;
  session_id: string | null;
  kind: RunView['kind'];
  title: string;
  status: RunView['status'];
  beats: Beat[];
  context: RunContext;
  secrets: Record<string, Key>;
  cursor: number;
  summary: string | null;
  minutes_planned: number | null;
  started_at: string;
  ended_at?: string | null;
};
export type Send = (event: { t: string; [k: string]: unknown }) => void;

const db = () => adminClient();
const nowIso = () => new Date().toISOString();

export async function loadRun(userId: string, id: string) {
  const { data, error } = await db().from('runs').select('*').eq('id', id).eq('user_id', userId).maybeSingle();
  if (error) throw new Error('The session could not be loaded.');
  if (!data) throw new HttpError('Session not found.', 404);
  return data as RunRow;
}

// Every interaction moves the session clock forward by the time since the
// last one, capped so that stepping away doesn't count.
async function tick(userId: string, row: RunRow) {
  const now = Date.now();
  const clock = { last: new Date(now).toISOString(), active_ms: Math.round(activeMs(row, now)) };
  row.context.clock = clock;
  await db().rpc('merge_run', { p_run: row.id, p_user: userId, p_context: { clock } });
}

export function view(row: RunRow, plan?: Plan): RunView {
  const s = sessionById(plan, row.session_id);
  return {
    id: row.id,
    kind: row.kind,
    title: row.title,
    status: row.status,
    cursor: row.cursor,
    beats: row.beats,
    summary: row.summary,
    started_at: row.started_at,
    minutes_planned: row.minutes_planned,
    session: s ? { id: s.id, title: s.title, subject: s.subject, date: s.date, objective: s.objective } : null,
    break_until: row.context.break_until || null,
    elapsed: Math.round((activeMs(row) / 60000) * 10) / 10,
    ...(row.context.adaptive ? { adaptive: true, wrapping: !!row.context.wrap } : {}),
  };
}

export async function activeRuns(userId: string) {
  const { data } = await db()
    .from('runs')
    .select('id,kind,title,session_id,cursor,beats,updated_at,status,minutes_planned,context')
    .eq('user_id', userId)
    .eq('status', 'active')
    .neq('kind', 'practice') // practice conversations resume from Practice
    .order('updated_at', { ascending: false })
    .limit(5);
  // A session written ahead of time is not something to "pick up": it waits
  // behind Begin until the learner opens it.
  return ((data || []) as (Pick<RunRow, 'id' | 'kind' | 'title' | 'session_id' | 'cursor' | 'beats' | 'status' | 'minutes_planned' | 'context'> & {
    updated_at: string;
  })[]).filter((r) => !(r.context?.prepared && !r.context.opened));
}

// ---------- Starting a run: instant, no model call ----------

export async function startRun(
  userId: string,
  input: {
    kind: 'session' | 'review' | 'explore' | 'return' | 'rehearsal';
    sessionId?: string;
    minutes?: number;
    topic?: string;
    concepts?: string[];
    milestone?: string; // rehearsal: the milestone's date
    prepare?: boolean; // written ahead by the scheduler, not opened yet
  },
): Promise<RunView> {
  const state = await readState(userId),
    plan = state.plan;
  const now = nowIso();
  let session: Session | undefined;
  if (input.sessionId) {
    session = plan?.sessions.find((s) => s.id === input.sessionId);
    if (!session || !plan) throw new HttpError('That session isn’t in your plan.', 404);
    // Resume rather than duplicate an open run for the same session.
    const { data: open } = await db()
      .from('runs')
      .select('*')
      .eq('user_id', userId)
      .eq('session_id', session.id)
      .eq('status', 'active')
      .maybeSingle();
    if (open) {
      const row = open as RunRow;
      if (input.prepare) return view(row, plan);
      if (row.context.prepared && !row.context.opened) {
        // A session written ahead of time for a different length or kind
        // (say, "Only 20 minutes") is replaced rather than reused.
        const wanted = input.minutes || state.overrides[session.id]?.duration_minutes || session.duration_minutes;
        if (row.kind !== input.kind || (row.minutes_planned && row.minutes_planned !== wanted)) {
          await db().from('runs').update({ status: 'abandoned' }).eq('id', row.id).eq('user_id', userId);
        } else {
          // Its clock starts when the learner does.
          const started_at = nowIso();
          const clock = { last: started_at, active_ms: 0 };
          await db().from('runs').update({ started_at }).eq('id', row.id).eq('user_id', userId);
          await db().rpc('merge_run', { p_run: row.id, p_user: userId, p_context: { opened: true, clock } });
          return view({ ...row, started_at, context: { ...row.context, opened: true, clock } }, plan);
        }
      } else return view(row, plan);
    }
  }
  const milestone =
    input.kind === 'rehearsal' ? plan?.milestones.find((m) => m.date === input.milestone) : undefined;
  if (input.kind === 'rehearsal' && !milestone) throw new HttpError('That milestone isn’t in your plan.', 404);
  const graph = plan ? await concepts(userId, plan) : { list: [], mapped: false };
  const learned = plan ? await states(userId, plan.plan_id) : new Map();
  const upcoming = session
    ? conceptsFor(session, graph.list).map((c) => c.key)
    : milestone && plan
      ? rehearsalConcepts(plan, graph.list, learned, milestone.date, now)
      : [];
  // Explorations are off-plan: they pull in no reviews of plan ideas.
  const offPlan = input.kind === 'explore' || (input.kind === 'session' && !session);
  const due =
    input.kind === 'rehearsal' || offPlan
      ? []
      : input.kind === 'review' && input.concepts?.length
      ? input.concepts.filter((k) => graph.list.some((c) => c.key === k))
      : dueConcepts(learned, graph.list, now, upcoming).filter((k) => !upcoming.includes(k));
  const prefs = prefsOf(state);
  const override = session ? state.overrides[session.id] : undefined;
  const minutes =
    input.minutes || override?.duration_minutes || session?.duration_minutes || (input.kind === 'review' ? 10 : input.kind === 'rehearsal' ? 30 : 20);
  const producesEvidence =
    !!session && Temporal.PlainDate.from(session.date).dayOfWeek === 3 && minutes >= 60 && !session.optional;

  const kind = input.kind === 'session' && !session ? 'explore' : input.kind;
  if (kind === 'review' && !due.length)
    throw new HttpError('Nothing is due for review right now. Everything you’ve practised is holding.', 409);
  // Plan sessions are planned a step at a time; the rest have a fixed shape.
  const adaptive = !!session && !!plan && (kind === 'session' || kind === 'return');
  const planning: RunContext = adaptive
    ? {
        adaptive: true,
        familiarity: familiarityOf(upcoming, learned, now),
        due: due.slice(0, 3),
        ahead: aheadOf(plan!, session!, graph.list, learned, upcoming),
        evidence: producesEvidence ? session!.evidence : undefined,
        track: session!.subject,
        voice: !!process.env.OPENAI_API_KEY,
        clock: { last: now, active_ms: 0 },
        ask_familiarity: prefs.session.familiarity,
        break_minutes: prefs.session.breaks,
      }
    : { clock: { last: now, active_ms: 0 } };
  const beats: Beat[] = (
    adaptive
      ? extend({
          kind: kind === 'return' ? 'return' : 'session',
          minutes,
          elapsed: 0,
          track: planning.track,
          concepts: upcoming,
          familiarity: planning.familiarity!,
          dueReviews: planning.due!,
          ahead: planning.ahead!,
          steps: [],
          evidence: planning.evidence,
          voice: planning.voice,
          askFamiliarity: planning.ask_familiarity,
          breakMinutes: planning.break_minutes,
        })
      : outline({
          kind: kind === 'review' || kind === 'rehearsal' ? kind : 'explore',
          minutes,
          concepts: upcoming.length ? upcoming : [input.topic ? 'explore' : 'general'],
          dueReviews: due,
          evidence: milestone?.title,
        })
  ).map((b) => ({ ...b, status: 'pending' as const }));

  const title =
    kind === 'review'
      ? 'Review'
      : kind === 'rehearsal'
        ? `Rehearsal: ${milestone!.title}`.slice(0, 200)
        : kind === 'explore'
        ? (input.topic || 'Exploration').slice(0, 120)
        : session!.title;
  const { data, error } = await db()
    .from('runs')
    .insert({
      user_id: userId,
      // An exploration belongs to no plan, so what it covers never lands in
      // the plan's progress or reviews. Memory still learns from it.
      plan_id: kind === 'explore' ? null : plan?.plan_id || null,
      session_id: session?.id || null,
      kind,
      title,
      beats,
      outline: beats.map(({ id, type, minutes, concept, optional }) => ({ id, type, minutes, concept, optional })),
      context: {
        session_concepts: upcoming,
        topic: input.topic,
        ...(input.prepare ? { prepared: true } : {}),
        ...(milestone ? { milestone: { title: milestone.title, date: milestone.date } } : {}),
        ...planning,
      } satisfies RunContext,
      minutes_planned: minutes,
    })
    .select('*')
    .single();
  if (error) {
    // Two devices racing to start the same session: return the winner.
    if (session && /one_active_run/.test(error.message)) return startRun(userId, input);
    throw new Error('The session could not start.');
  }
  return view(data as RunRow, plan);
}

// What the learner model already says about each idea. Ideas never seen are
// left open: the session asks rather than assumes.
function familiarityOf(keys: string[], learned: Map<string, ConceptState>, now: string) {
  const out: Record<string, Familiarity> = {};
  for (const k of keys) {
    const s = learned.get(k);
    if (s?.exposures) out[k] = strength(s, now) >= 0.75 ? 'fluent' : 'familiar';
  }
  return out;
}

// The next planned ideas not yet started, which a fast session can pull forward.
function aheadOf(plan: Plan, session: Session, list: { key: string; session_ids: string[] }[], learned: Map<string, ConceptState>, today: string[]) {
  const later = plan.sessions
    .filter((s) => !s.optional && (s.date > session.date || (s.date === session.date && s.id > session.id)))
    .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id))
    .slice(0, 3);
  const keys: string[] = [];
  for (const s of later)
    for (const c of conceptsFor(s, list as Parameters<typeof conceptsFor>[1]))
      if (!today.includes(c.key) && !learned.get(c.key)?.exposures && !keys.includes(c.key)) keys.push(c.key);
  return keys.slice(0, 3);
}

// The planner's view of a run: every step so far, and the time used.
function planInput(row: RunRow): PlanInput {
  const c = row.context;
  return {
    kind: row.kind === 'return' ? 'return' : 'session',
    minutes: row.minutes_planned || 60,
    elapsed: activeMs(row) / 60000,
    track: c.track,
    concepts: c.session_concepts || [],
    familiarity: c.familiarity || {},
    dueReviews: c.due || [],
    ahead: c.ahead || [],
    evidence: c.evidence,
    voice: c.voice,
    wrap: c.wrap,
    askFamiliarity: c.ask_familiarity,
    breakMinutes: c.break_minutes,
    steps: row.beats.map((b) => ({
      type: b.type,
      concept: b.concept,
      status: b.status,
      verdict: b.feedback?.verdict,
      unknown: b.response?.unknown,
      minutes: b.minutes,
    })),
  };
}

// Decide what comes next and add it to the run. Normally this only appends;
// when wrapping up, untouched steps after the current one are replaced.
async function grow(userId: string, row: RunRow, current: number): Promise<Beat[] | null> {
  if (!row.context.adaptive || row.status !== 'active') return null;
  const input = planInput(row);
  const wrap = !!row.context.wrap;
  const untouched = (b: Beat, j: number) => j > current && ['pending', 'generating', 'ready'].includes(b.status);
  if (wrap) {
    // The recap is already on its way; planning another would replace it.
    if (row.beats.some((b, j) => b.type === 'recap' && j > current)) return null;
    input.steps = input.steps.filter((_, j) => !untouched(row.beats[j], j));
  }
  const next = extend(input);
  if (!next.length) return null;
  const { data, error } = await db().rpc('extend_run_beats', {
    p_run: row.id,
    p_user: userId,
    p_after: wrap ? current : row.beats.length - 1,
    p_beats: next.map((b) => ({ ...b, status: 'pending' })),
  });
  if (error || !data) throw new Error('The session could not plan its next step.');
  row.beats = data as Beat[];
  return row.beats;
}

// A rehearsal draws on what the milestone depends on: ideas taught before it,
// weakest first, so the mock finds the gaps while there is time to close them.
function rehearsalConcepts(
  plan: Plan,
  list: { key: string; session_ids: string[] }[],
  learned: Map<string, import('@/lib/learning/model').ConceptState>,
  date: string,
  now: string,
) {
  const before = new Set(plan.sessions.filter((s) => s.date <= date).map((s) => s.id));
  return list
    .filter((c) => c.session_ids.some((id) => before.has(id)))
    .map((c) => ({ key: c.key, s: learned.get(c.key) }))
    .sort((a, b) => (a.s ? strength(a.s, now) : 0.5) - (b.s ? strength(b.s, now) : 0.5))
    .slice(0, 3)
    .map((c) => c.key);
}

// ---------- Context assembly ----------

function plainText(blocks: Block[] | undefined, max = 600) {
  return (blocks || [])
    .map((b) =>
      b.type === 'visual'
        ? `(visual: ${'title' in b.visual ? b.visual.title : b.visual.type} — ${b.visual.takeaway})`
        : b.md,
    )
    .join(' ')
    .replace(/\s+/g, ' ')
    .slice(0, max);
}

function transcript(row: RunRow, upto: number, full = false) {
  const lines: string[] = [];
  row.beats.slice(0, upto).forEach((b, i) => {
    if (!b.blocks && !b.response) return;
    const recent = full || i >= upto - 6;
    lines.push(`[${b.type}] Tutor: ${plainText(b.blocks, recent ? 700 : 160)}`);
    if (b.question?.options) lines.push(`Options: ${b.question.options.map((o, j) => `${j + 1}. ${o}`).join(' | ')}`);
    for (const a of b.attempts || [])
      lines.push(`Learner (first try): ${a.response.text || ''}`.slice(0, recent ? 800 : 150), `Assessment: ${a.feedback.verdict}.`);
    if (b.response)
      lines.push(
        `Learner${b.attempts?.length ? ' (retry)' : ''}: ${b.response.choice !== undefined ? `chose ${b.response.choice + 1}. ` : ''}${b.response.text || ''}${b.response.confidence ? ` [said: ${CONFIDENCE_WORD[b.response.confidence]}]` : ''}`.slice(0, recent ? 1200 : 200),
      );
    if (b.feedback) lines.push(`Assessment: ${b.feedback.verdict} (${b.feedback.score.toFixed(2)}). ${plainText(b.feedback.blocks, recent ? 400 : 100)}`);
    for (const a of b.asks || []) lines.push(`Learner asked: ${a.prompt}\nTutor: ${plainText(a.blocks, recent ? 500 : 120)}`);
  });
  return lines.join('\n');
}

const CONFIDENCE_WORD: Record<Confidence, string> = { low: 'guessing', medium: 'fairly sure', high: 'certain' };

async function style(userId: string): Promise<Style> {
  const { data } = await db().from('learner_profiles').select('style').eq('user_id', userId).maybeSingle();
  return { ...NEUTRAL, ...((data?.style as Partial<Style>) || {}) };
}
export async function signal(userId: string, s: Signal) {
  const next = observe(await style(userId), s);
  await db().from('learner_profiles').upsert({ user_id: userId, style: next, updated_at: nowIso() });
}

async function layers(userId: string, row: RunRow, beat: Beat, at: number): Promise<{ layers: Layer[]; plan?: Plan; session?: Session }> {
  const state = await readState(userId),
    plan = state.plan,
    session = sessionById(plan, row.session_id);
  const now = nowIso();
  // Memories are retrieved once per run; the topic does not change mid-session.
  let memories = row.context.memories;
  if (memories === undefined) {
    const query = [session?.title, session?.objective, row.context.topic, row.title].filter(Boolean).join('. ');
    memories = memoryLayer(await recall(userId, query, row.context.session_concepts || [])) || '';
    await db().rpc('merge_run', { p_run: row.id, p_user: userId, p_context: { memories } });
    row.context.memories = memories;
  }
  let conceptLines = '';
  if (plan) {
    const [graph, learned] = await Promise.all([concepts(userId, plan), states(userId, plan.plan_id)]);
    const inPlay = new Set([...(row.context.session_concepts || []), beat.concept || ''].filter(Boolean));
    for (const c of graph.list.filter((c) => inPlay.has(c.key))) c.prerequisites.forEach((p) => inPlay.add(p));
    conceptLines = graph.list
      .filter((c) => inPlay.has(c.key))
      .slice(0, 10)
      .map((c) => describeState(learned.get(c.key), c.title, now) + (c.summary ? ` — ${c.summary}` : ''))
      .join('\n');
  }
  const week = plan?.weeks.filter((w) => session && w.start_date <= session.date).at(-1);
  const sources = session && plan ? plan.sources.filter((s) => session.source_ids.includes(s.id)) : [];
  const focus = beat.concept && plan ? (await concepts(userId, plan)).list.find((c) => c.key === beat.concept) : undefined;
  const result: Layer[] = [
    {
      name: 'learner',
      content: [
        plan ? `Name: ${plan.profile.name}. Goals: ${plan.profile.goals.slice(0, 6).join('; ')}.` : '',
        styleLayer(await style(userId)),
      ].join('\n'),
    },
    { name: 'memories', content: memories || null },
    // Lessons may use the learner's own Venture company as their scenario.
    { name: 'venture', content: row.kind !== 'practice' ? await ventureLayer(userId) : null },
    { name: 'concept_states', content: conceptLines || null },
    {
      name: 'curriculum',
      content: session
        ? [
            `Session: ${session.title} (${session.subject}, ${session.date}).`,
            `Objective: ${session.objective}`,
            `Week topics: ${week ? Object.values(week.topics).join(' · ') : ''}`,
            `Plan guidance: ${session.generation_instructions.slice(0, 600)}`,
            sources.length ? `Reference sources the learner can open: ${sources.map((s) => `${s.title} (${s.url})`).join('; ')}` : '',
          ].join('\n')
        : row.context.milestone
          ? [
              `Milestone rehearsal. The learner is preparing for: ${row.context.milestone.title} (due ${row.context.milestone.date}).`,
              'Make the produce step a realistic mock of that deliverable, judged as the milestone would be. Warm-ups and checks probe the weakest prerequisite ideas.',
            ].join('\n')
          : row.context.topic
            ? `Exploration requested by the learner: ${row.context.topic}`
            : null,
    },
    {
      name: 'session_state',
      content: [
        row.context.adaptive
          ? `Steps so far (planned one at a time from how the learner is doing; more may follow): ${row.beats
              .slice(0, at + 1)
              .map((b, i) => `${i === at ? '→' : ''}${b.type}`)
              .join(' ')}. About ${Math.round(activeMs(row) / 60000)} of ${row.minutes_planned || 60} minutes used.`
          : `Outline: ${row.beats.map((b, i) => `${i === at ? '→' : ''}${b.type}${b.optional ? '(optional)' : ''}`).join(' ')}`,
        focus ? `Focus concept for this step: ${focus.title} — ${focus.summary}` : '',
        beat.concept && row.context.adaptive
          ? `The learner's familiarity with this idea: ${FAMILIARITY_TEXT[row.context.familiarity?.[beat.concept] || 'unknown']}`
          : '',
        row.context.scenario_facts?.length ? `Scenario facts established so far (stay consistent): ${row.context.scenario_facts.join('; ')}` : '',
        beat.concept && row.context.diagnosis?.[beat.concept] ? `Diagnosis of a recurring difficulty: ${row.context.diagnosis[beat.concept]}` : '',
        `This step's purpose: ${beat.intent}`,
        transcript(row, at) ? `Session so far:\n${transcript(row, at)}` : 'This is the first step of the session.',
      ]
        .filter(Boolean)
        .join('\n'),
    },
  ];
  return { layers: result, plan, session };
}

const FAMILIARITY_TEXT: Record<Familiarity | 'unknown', string> = {
  new: 'brand new to it. Assume no vocabulary; define every term the first time it appears.',
  familiar: 'has met it before but is not yet fluent.',
  fluent: 'says they have used it, or has shown it before. Skip basics and go for nuance.',
  unknown: 'not known yet. Do not assume any vocabulary.',
};

async function hard(userId: string, row: RunRow, conceptKey?: string) {
  if ((row.context.deeper || 0) >= 2) return true;
  if (!conceptKey || !row.plan_id) return false;
  const { data } = await db()
    .from('concept_states')
    .select('lapses,misconceptions')
    .eq('user_id', userId)
    .eq('plan_id', row.plan_id)
    .eq('concept_key', conceptKey)
    .maybeSingle();
  return !!data && (data.lapses >= 2 || (data.misconceptions as { resolved?: boolean }[]).filter((m) => !m.resolved).length >= 2);
}

// ---------- Beat content ----------

const teachSchema = z.object({
  blocks: z.array(blockSchema),
  follow_ups: z.array(z.string()).describe('Two short questions the learner might naturally ask next (≤ 8 words each).'),
  scenario_facts: z.array(z.string()).describe('New facts this step established (names, numbers), else empty.'),
});
const questionSchema = z.object({
  blocks: z.array(blockSchema).describe('Any setup, then the question itself as the last text block.'),
  response: z.object({
    kind: z.enum(['choice', 'text']),
    options: z.array(z.string()).nullable(),
    placeholder: z.string().nullable(),
  }),
  scenario_facts: z.array(z.string()),
  key: z.object({
    answer_index: z.number().int().nullable(),
    model_answer: z.string(),
    rubric: z.string(),
    watch_for: z.array(z.string()).describe('Likely misconceptions.'),
  }),
});
const RESPONSE_HINT: Record<string, string> = {
  recall: 'Response: text, one or two sentences.',
  check: 'Response: choice with 3 options (only one best answer).',
  attempt: 'Response: text — the learner explains their reasoning or produces a small output in a few sentences.',
  transfer: 'Response: text — they apply the idea to the new situation and justify it briefly.',
  produce: 'Response: text — a compact but complete piece of work (100–250 words). Give a clear brief with what a good answer includes.',
};

// Generates (or returns) the content of one beat, streaming snapshots.
export async function streamBeat(userId: string, runId: string, beatId: string, send: Send) {
  let row = await loadRun(userId, runId);
  const at = row.beats.findIndex((b) => b.id === beatId);
  const beat = row.beats[at];
  if (!beat) throw new HttpError('Step not found.', 404);
  if (beat.blocks) {
    send({ t: 'meta', tier: beat.tier || 'cached', cached: true });
    return send({ t: 'done', data: beat });
  }
  if (beat.type === 'break') {
    await patch(userId, runId, beatId, { status: 'ready', blocks: [] });
    return send({ t: 'done', data: { ...beat, status: 'ready', blocks: [] } });
  }
  if (beat.type === 'gauge') {
    const state = await readState(userId);
    const c = state.plan && beat.concept ? (await concepts(userId, state.plan)).list.find((x) => x.key === beat.concept) : undefined;
    // Before the concept map exists, a summary is only the session objective,
    // which repeats the title; leave it out then.
    const summary = c?.summary && !c.summary.toLowerCase().includes(c.title.toLowerCase()) ? ` ${c.summary}` : '';
    const blocks: Block[] = [{ type: 'text', md: c ? `Next up: **${c.title}**.${summary}` : 'Next up: a new idea.' }];
    await patch(userId, runId, beatId, { status: 'ready', blocks });
    return send({ t: 'done', data: { ...beat, status: 'ready', blocks } });
  }
  if (beat.type === 'roleplay') return roleplayBeat(userId, row, beat, send);
  // A concurrent request (e.g. a prefetch on another device) is already on it.
  if (beat.status === 'generating' && beat.generating_at && Date.now() - Date.parse(beat.generating_at) < 60000)
    throw new HttpError('Still preparing this step.', 425);
  await patch(userId, runId, beatId, { status: 'generating', generating_at: nowIso() });
  row = await loadRun(userId, runId);

  try {
    const { layers: ctx } = await layers(userId, row, beat, at);
    const signals = { hard: await hard(userId, row, beat.concept) };
    if (isQuestionBeat(beat.type)) {
      const out = await generate({
        task: beat.type === 'recall' || beat.type === 'check' ? 'tutor.question' : 'tutor.beat',
        beat: beat.type === 'transfer' ? 'transfer' : undefined,
        userId,
        schema: questionSchema,
        context: ctx,
        signals,
        input: `Write the ${beat.type} step now. ${RESPONSE_HINT[beat.type]}${beat.type === 'recall' ? ' This is a warm-up on an earlier idea, not today’s topic.' : ''}`,
        onPartial: (p) => {
          const v = p as Partial<z.infer<typeof questionSchema>>;
          send({ t: 'snap', data: { blocks: v.blocks || [] } });
        },
      });
      const d = out.data;
      const question = {
        kind: d.response.kind,
        options: d.response.kind === 'choice' ? (d.response.options || []).slice(0, 5) : null,
        placeholder: d.response.placeholder,
        long: beat.type === 'produce' || beat.type === 'attempt',
      };
      const content = { status: 'ready' as const, blocks: d.blocks, question, tier: out.tier };
      await db().rpc('merge_run', {
        p_run: runId,
        p_user: userId,
        p_context: d.scenario_facts.length ? { scenario_facts: [...(row.context.scenario_facts || []), ...d.scenario_facts].slice(-24) } : null,
        p_secrets: { [beatId]: d.key },
      });
      await patch(userId, runId, beatId, content);
      send({ t: 'meta', tier: out.tier });
      send({ t: 'done', data: { ...beat, ...content } });
    } else {
      const out = await generate({
        task: 'tutor.beat',
        beat: beat.type,
        userId,
        schema: teachSchema,
        context: ctx,
        signals,
        input: `Write the ${beat.type} step now.`,
        onPartial: (p) => {
          const v = p as Partial<z.infer<typeof teachSchema>>;
          send({ t: 'snap', data: { blocks: v.blocks || [] } });
        },
      });
      const content = {
        status: 'ready' as const,
        blocks: out.data.blocks,
        follow_ups: out.data.follow_ups.slice(0, 3),
        tier: out.tier,
      };
      if (out.data.scenario_facts.length)
        await db().rpc('merge_run', {
          p_run: runId,
          p_user: userId,
          p_context: { scenario_facts: [...(row.context.scenario_facts || []), ...out.data.scenario_facts].slice(-24) },
        });
      await patch(userId, runId, beatId, content);
      send({ t: 'meta', tier: out.tier });
      send({ t: 'done', data: { ...beat, ...content } });
    }
  } catch (e) {
    await patch(userId, runId, beatId, { status: 'pending', generating_at: null });
    throw e;
  }
}

async function patch(userId: string, runId: string, beatId: string, p: Record<string, unknown>) {
  const { error } = await db().rpc('patch_run_beat', { p_run: runId, p_user: userId, p_beat: beatId, p_patch: p });
  if (error) throw new Error('The session did not save.');
}

// ---------- Answers ----------

const gradeSchema = z.object({
  verdict: z.enum(['solid', 'partial', 'missed']),
  score: z.number().describe('0–1'),
  blocks: z.array(blockSchema).describe('Feedback: at most three sentences, optionally one visual.'),
  misconception: z.string().nullable(),
});
const EVIDENCE_KIND = { recall: 'recall', check: 'check', attempt: 'explain', transfer: 'transfer', produce: 'project' } as const;

export async function answerBeat(
  userId: string,
  runId: string,
  beatId: string,
  response: { choice?: number; text?: string; confidence?: Confidence; unknown?: boolean },
  send: Send,
  retry = false,
) {
  const row = await loadRun(userId, runId);
  const at = row.beats.findIndex((b) => b.id === beatId),
    beat = row.beats[at],
    key = row.secrets[beatId];
  if (!beat || !beat.question || !key) throw new HttpError('This step isn’t ready for an answer yet.', 409);
  // One retry of a text answer that missed, with the feedback in view.
  const retrying = retry && canRetry(beat);
  if (beat.feedback && !retrying) return send({ t: 'done', data: beat });
  const first = retrying ? { response: beat.response!, feedback: beat.feedback! } : null;
  const attempts = first ? [...(beat.attempts || []), first] : beat.attempts;
  const unknown = !!response.unknown && !retrying;
  const answered: Response = unknown ? { unknown: true, at: nowIso() } : { ...response, unknown: undefined, at: nowIso() };
  await patch(userId, runId, beatId, {
    response: answered,
    status: 'answered',
    ...(first ? { attempts, feedback: null } : {}),
  });
  row.beats[at] = { ...beat, response: answered, attempts, feedback: undefined };

  const choiceCorrect =
    !unknown && beat.question.kind === 'choice' && key.answer_index !== null ? response.choice === key.answer_index : null;
  const { layers: ctx } = await layers(userId, row, beat, at + 1);
  const stakes = beat.type === 'produce' && /milestone|capstone|final/i.test(row.title + ' ' + beat.intent) ? 'high' : 'normal';
  const out = await generate({
    task: beat.type === 'recall' || beat.type === 'check' ? 'grade.quick' : 'grade.deep',
    userId,
    schema: gradeSchema,
    signals: { hard: await hard(userId, row, beat.concept), stakes },
    context: [
      ...ctx,
      {
        name: 'answer_key',
        content: [
          key.answer_index !== null ? `Correct option: ${key.answer_index + 1}` : '',
          `Model answer: ${key.model_answer}`,
          `Rubric: ${key.rubric}`,
          key.watch_for.length ? `Watch for: ${key.watch_for.join('; ')}` : '',
          choiceCorrect === null ? '' : `The learner's choice is ${choiceCorrect ? 'correct' : 'incorrect'}.`,
        ]
          .filter(Boolean)
          .join('\n'),
      },
    ],
    input: unknown
      ? `The learner said "I don't know yet" to this ${beat.type} step. That is a request to be taught, not a failed attempt: without any judgement, teach the answer. In 3–5 sentences, give the right answer and the reasoning that gets there, anchored in the scenario, so they could answer a similar question next time. Verdict: missed, score 0, no misconception.`
      : [
      `Assess this response to the ${beat.type} step.`,
      first
        ? `This is a second attempt after feedback. First attempt: ${first.response.text || ''}\nFeedback it received: ${plainText(first.feedback.blocks, 500)}\nJudge the new answer on its own merits and say plainly whether it closed the gap.`
        : '',
      response.choice !== undefined ? `Chosen option: ${response.choice + 1}. ${beat.question.options?.[response.choice] || ''}` : '',
      response.text ? `Written response: ${response.text}` : '',
      response.confidence ? `Before seeing feedback, the learner said they were ${CONFIDENCE_WORD[response.confidence]}.` : '',
      response.confidence === 'high'
        ? 'If this is wrong, the learner believes something false: name that belief plainly and show exactly why it fails, so the correction sticks.'
        : response.confidence === 'low'
          ? 'If this is right, briefly confirm why it is right, so a guess becomes knowledge.'
          : '',
    ]
      .filter(Boolean)
      .join('\n'),
    onPartial: (p) => {
      const v = p as Partial<z.infer<typeof gradeSchema>>;
      send({ t: 'snap', data: { feedback: { verdict: unknown ? 'missed' : v.verdict, blocks: v.blocks || [] } } });
    },
  });
  // A multiple-choice score is anchored on the objective answer.
  const score = unknown
    ? 0
    : choiceCorrect === null
      ? Math.max(0, Math.min(1, out.data.score))
      : choiceCorrect
        ? Math.max(0.75, out.data.score)
        : Math.min(0.3, out.data.score);
  const verdict = score >= 0.75 ? 'solid' : score >= 0.4 ? 'partial' : 'missed';
  const feedback: Feedback = { verdict, score, blocks: out.data.blocks };
  const reveal =
    beat.question.kind === 'choice' && key.answer_index !== null ? { correct_index: key.answer_index } : {};
  await patch(userId, runId, beatId, { feedback, status: 'done', ...reveal });
  send({ t: 'meta', tier: out.tier });
  // The verdict decides what comes next; plan it now so it can be prepared
  // while the learner reads the feedback.
  row.beats[at] = { ...beat, response: answered, attempts, feedback, status: 'done' };
  await tick(userId, row);
  const planned = await grow(userId, row, at).catch((e) => {
    console.error('plan after answer', e instanceof Error ? e.message : e);
    return null;
  });
  if (planned) send({ t: 'plan', data: planned });
  send({ t: 'done', data: { ...beat, response: answered, attempts, feedback, status: 'done', ...reveal } });

  // Learner model and style updates do not hold up the response.
  const concept = beat.concept;
  // Asking for help, or retrying after feedback, halves the evidence.
  const assisted = (beat.asks?.length || 0) > 0 || !!first;
  const effects: Promise<unknown>[] = [];
  // "I don't know yet" followed by being taught is exposure, not a failed recall.
  if (unknown) {
    if (concept && row.plan_id) effects.push(record(userId, row.plan_id, runId, concept, { kind: 'exposure', at: nowIso(), detail: { beat: beat.type, unknown: true } }));
    return Promise.allSettled(effects);
  }
  if (concept && row.plan_id)
    effects.push(
      record(userId, row.plan_id, runId, concept, {
        kind: EVIDENCE_KIND[beat.type as keyof typeof EVIDENCE_KIND] || 'explain',
        score,
        assisted,
        options: beat.question.options?.length,
        misconception: out.data.misconception,
        confidence: response.confidence,
        at: nowIso(),
        detail: { beat: beat.type, verdict, confidence: response.confidence || null, retry: !!first },
      }),
    );
  if (verdict === 'solid' && !assisted) effects.push(signal(userId, 'fast_correct'));
  if (verdict === 'missed') effects.push(signal(userId, 'struggled'));
  // Repeated trouble with one idea earns a deeper diagnosis for the next step.
  if (verdict === 'missed' && concept && (await hard(userId, row, concept)))
    effects.push(diagnose(userId, row, concept));
  return Promise.allSettled(effects);
}

async function diagnose(userId: string, row: RunRow, concept: string) {
  const { data } = await generate({
    task: 'learner.diagnose',
    userId,
    schema: z.object({ diagnosis: z.string(), next_move: z.string() }),
    input: `Concept: ${concept}\nSession transcript:\n${transcript(row, row.beats.length, true).slice(-8000)}`,
  });
  await db().rpc('merge_run', {
    p_run: row.id,
    p_user: userId,
    p_context: { diagnosis: { ...(row.context.diagnosis || {}), [concept]: `${data.diagnosis} Next: ${data.next_move}` } },
  });
}

// ---------- Asking the tutor ----------

const replySchema = z.object({
  blocks: z.array(blockSchema),
  follow_ups: z.array(z.string()).describe('Up to two short natural follow-up questions (≤ 8 words).'),
});
const INTENT_PROMPT: Record<AskIntent, string> = {
  why: 'Why? Explain the mechanism.',
  example: 'Give me one concrete example.',
  deeper: 'Go one level deeper.',
  simpler: 'Say it more simply.',
  visual: 'Show me this visually.',
  free: '',
};
const INTENT_SIGNAL: Partial<Record<AskIntent, Signal>> = {
  why: 'asked_why',
  example: 'asked_example',
  deeper: 'asked_deeper',
  simpler: 'asked_simpler',
  visual: 'asked_visual',
};

export async function askBeat(
  userId: string,
  runId: string,
  beatId: string,
  prompt: string,
  intent: AskIntent,
  send: Send,
  quote?: string,
) {
  const row = await loadRun(userId, runId);
  const at = row.beats.findIndex((b) => b.id === beatId),
    beat = row.beats[at];
  if (!beat) throw new HttpError('Step not found.', 404);
  if (intent === 'deeper') row.context.deeper = (row.context.deeper || 0) + 1;
  const { layers: ctx } = await layers(userId, row, beat, at + 1);
  const asked = intent === 'free' ? prompt : INTENT_PROMPT[intent] + (prompt ? ` (${prompt})` : '');
  // A highlighted passage narrows the question to exactly that part.
  const question = quote ? `About this passage — "${quote}": ${asked || 'Explain this part.'}` : asked;
  // Never leak the key while a question is still open.
  const open = beat.question && !beat.feedback;
  const out = await generate({
    task: 'tutor.reply',
    userId,
    schema: replySchema,
    context: ctx,
    signals: { hard: intent === 'deeper' && (row.context.deeper || 0) >= 2 },
    input: `${open ? 'The learner has not answered the current question yet: help them think, but do not give the answer away.\n' : ''}Learner: ${question}`,
    onPartial: (p) => {
      const v = p as Partial<z.infer<typeof replySchema>>;
      send({ t: 'snap', data: { blocks: v.blocks || [] } });
    },
  });
  const ask = {
    id: crypto.randomUUID(),
    prompt: intent === 'free' ? prompt : INTENT_PROMPT[intent],
    ...(quote ? { quote } : {}),
    intent,
    blocks: out.data.blocks,
    follow_ups: out.data.follow_ups.slice(0, 2),
    at: nowIso(),
  };
  await db().rpc('append_beat_item', { p_run: runId, p_user: userId, p_beat: beatId, p_key: 'asks', p_item: ask });
  await tick(userId, row);
  if (intent === 'deeper') await db().rpc('merge_run', { p_run: runId, p_user: userId, p_context: { deeper: row.context.deeper } });
  send({ t: 'meta', tier: out.tier });
  send({ t: 'done', data: ask });
  const s = INTENT_SIGNAL[intent];
  if (s) await signal(userId, s).catch(() => {});
}

// ---------- Moving through the session ----------

export async function advance(userId: string, runId: string, beatId: string, skip = false) {
  const row = await loadRun(userId, runId);
  const at = row.beats.findIndex((b) => b.id === beatId),
    beat = row.beats[at];
  if (!beat) throw new HttpError('Step not found.', 404);
  if (beat.status !== 'done') await patch(userId, runId, beatId, { status: skip ? 'skipped' : 'done' });
  if (skip && beat.question) await signal(userId, 'skipped_question').catch(() => {});
  // Being taught an idea is an exposure, recorded once per run.
  const exposed = new Set(row.context.exposed || []);
  if (!skip && ['explain', 'situation', 'orient', 'worked'].includes(beat.type) && beat.concept && row.plan_id && !exposed.has(beat.concept)) {
    exposed.add(beat.concept);
    await record(userId, row.plan_id, runId, beat.concept, { kind: 'exposure', at: nowIso() });
  }
  const cursor = Math.max(row.cursor, at + 1);
  await db().rpc('merge_run', {
    p_run: runId,
    p_user: userId,
    p_context: { exposed: [...exposed], ...(row.context.break_until ? { break_until: null } : {}) },
    p_fields: { cursor },
  });
  row.beats[at] = { ...beat, status: beat.status === 'done' ? 'done' : skip ? 'skipped' : 'done' };
  await tick(userId, row);
  const beats = await grow(userId, row, at).catch((e) => {
    console.error('plan on advance', e instanceof Error ? e.message : e);
    return null;
  });
  return { cursor, ...(beats ? { beats } : {}) };
}

// "How familiar is this?" sets how the idea is taught.
export async function gaugeBeat(userId: string, runId: string, beatId: string, value: Gauge) {
  const row = await loadRun(userId, runId);
  const at = row.beats.findIndex((b) => b.id === beatId),
    beat = row.beats[at];
  if (!beat || beat.type !== 'gauge' || !beat.concept) throw new HttpError('That step isn’t a question about familiarity.', 409);
  const familiarity = { ...(row.context.familiarity || {}), [beat.concept]: GAUGE_FAMILIARITY[value] };
  const response: Response = { gauge: value, at: nowIso() };
  await patch(userId, runId, beatId, { status: 'done', response });
  const cursor = Math.max(row.cursor, at + 1);
  await db().rpc('merge_run', { p_run: runId, p_user: userId, p_context: { familiarity }, p_fields: { cursor } });
  row.context.familiarity = familiarity;
  row.beats[at] = { ...beat, status: 'done', response };
  await tick(userId, row);
  const beats = (await grow(userId, row, at)) || row.beats;
  return { cursor, beats };
}

// "Wrap up": skip what's left and close with a recap now.
export async function wrapUp(userId: string, runId: string, beatId: string) {
  const row = await loadRun(userId, runId);
  if (!row.context.adaptive) throw new HttpError('This session can’t wrap up early.', 409);
  const at = row.beats.findIndex((b) => b.id === beatId);
  if (at < 0) throw new HttpError('Step not found.', 404);
  await db().rpc('merge_run', { p_run: runId, p_user: userId, p_context: { wrap: true } });
  row.context.wrap = true;
  await tick(userId, row);
  const beats = (await grow(userId, row, at)) || row.beats;
  return { beats };
}

// ---------- Breaks ----------

// Starting a break records when it ends. The route waits that long in the
// background and sends a push, unless the learner has already come back.
export async function startBreak(userId: string, runId: string, beatId: string) {
  const row = await loadRun(userId, runId);
  const beat = row.beats.find((b) => b.id === beatId);
  if (!beat || beat.type !== 'break') throw new HttpError('That step isn’t a break.', 409);
  if (row.context.break_until && Date.parse(row.context.break_until) > Date.now())
    return { until: row.context.break_until, fresh: false };
  const until = new Date(Date.now() + beat.minutes * 60000).toISOString();
  await db().rpc('merge_run', { p_run: runId, p_user: userId, p_context: { break_until: until } });
  return { until, fresh: true };
}
export async function breakStillRunning(userId: string, runId: string, until: string) {
  const row = await loadRun(userId, runId).catch(() => null);
  return !!row && row.status === 'active' && row.context.break_until === until;
}

// Finishing records completion against the plan and consolidates memory.
export async function finishRun(userId: string, runId: string) {
  const row = await loadRun(userId, runId);
  if (row.status === 'done') return { alreadyDone: true, row };
  // Stop the clock at the last moment of real work.
  await tick(userId, row);
  const graded = row.beats.filter((b) => b.feedback);
  const avg = graded.length ? graded.reduce((s, b) => s + b.feedback!.score, 0) / graded.length : 0;
  await db().rpc('merge_run', {
    p_run: runId,
    p_user: userId,
    p_fields: { status: 'done', ended_at: nowIso(), cursor: row.beats.length },
  });
  if (row.session_id && row.plan_id) {
    const state = await readState(userId),
      session = state.plan?.sessions.find((s) => s.id === row.session_id);
    if (session && !state.attempts.some((a) => a.session_id === session.id)) {
      const best = [...graded].sort((a, b) => b.feedback!.score - a.feedback!.score)[0],
        worst = [...graded].sort((a, b) => a.feedback!.score - b.feedback!.score)[0];
      const date = new Intl.DateTimeFormat('en-CA', {
        timeZone: zoneOf(state),
      }).format(new Date());
      const attempt: Attempt = {
        id: crypto.randomUUID(),
        plan_id: row.plan_id,
        session_id: session.id,
        objective_id: session.objective,
        lesson_id: runId,
        completed_at: nowIso(),
        date,
        reduced: (row.minutes_planned || 0) < session.duration_minutes,
        assisted: row.beats.some((b) => b.asks?.length && b.question),
        reasoning: graded.map((b) => b.response?.text || '').filter(Boolean).join('\n\n').slice(0, 3900) || 'Completed a guided session.',
        transfer: row.beats.find((b) => b.type === 'transfer')?.response?.text?.slice(0, 3900) || 'Completed a guided session.',
        feedback: {
          strength: best ? plainText(best.feedback!.blocks, 280) : '',
          gap: worst && worst.feedback!.verdict !== 'solid' ? plainText(worst.feedback!.blocks, 280) : '',
          next: '',
          independent: avg >= 0.7,
          correct: avg >= 0.6,
          rubric: { issue: '', evidence: '', reasoning: '', uncertainty: '' },
        },
        points: 10,
      };
      await mutate(userId, crypto.randomUUID(), (s) => s, attempt);
    }
  }
  return { alreadyDone: false, row };
}

// Runs after the response: summary for history, then memory consolidation.
export async function afterFinish(userId: string, row: RunRow) {
  const text = transcript(row, row.beats.length, true);
  if (!text) return;
  const [summary] = await Promise.allSettled([
    generate({
      task: 'run.summary',
      userId,
      schema: z.object({ summary: z.string() }),
      input: text.slice(-12000),
    }),
    consolidate(userId, row.id, text, row.context.session_concepts || []),
  ]);
  if (summary.status === 'fulfilled')
    await db().rpc('merge_run', { p_run: row.id, p_user: userId, p_fields: { summary: summary.value.data.summary.slice(0, 600) } });
}

// ---------- Role-play inside a session ----------

async function roleplayBeat(userId: string, row: RunRow, beat: Beat, send: Send) {
  const content = {
    status: 'ready' as const,
    blocks: [
      {
        type: 'text' as const,
        md: 'Time to say it out loud. You’ll talk it through with a realistic counterpart, then get specific feedback.',
      },
    ],
  };
  await patch(userId, row.id, beat.id, content);
  send({ t: 'done', data: { ...beat, ...content } });
}
