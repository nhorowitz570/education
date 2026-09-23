import 'server-only';
import { z } from 'zod';
import { Temporal } from '@js-temporal/polyfill';
import { adminClient } from '@/lib/supabase/server';
import { HttpError } from './http';
import { readState } from './state';
import { concepts, states } from './learner';
import { pushTo } from './push';
import { deleteMemory, writeMemory } from './memory';
import { generate } from '@/lib/ai/engine';
import { calibration, level } from '@/lib/learning/model';
import { scheduled } from '@/lib/schedule';
import { dateInZone, instantFor } from '@/lib/plan';
import type { Beat } from '@/lib/learning/run';
import type { PracticeState } from './practice';
import {
  GRADE_KEYS,
  digest,
  type InsightMetrics,
  type InsightReport,
  type InsightRow,
  type InsightSummary,
} from '@/lib/insights';

// Once a week, an honest read of how the learner is actually learning. The
// numbers are measured here, in code; the reasoning tier interprets them and
// grades against fixed anchors. Nothing is graded that the data can't support.

const db = () => adminClient();

// ---------- The week ----------

export function zoneFor(state: { plan?: { schedule: { timezone: string } } }) {
  return state.plan?.schedule.timezone || 'America/Los_Angeles';
}
// The last complete Monday–Sunday week.
export function lastWeek(zone: string, now = new Date()) {
  const today = Temporal.PlainDate.from(dateInZone(zone, now));
  const monday = today.subtract({ days: today.dayOfWeek - 1 }).subtract({ days: 7 });
  return { start: monday.toString(), end: monday.add({ days: 6 }).toString() };
}
// The seven days up to today, for a first read before a full week exists.
export function trailingWeek(zone: string, now = new Date()) {
  const today = Temporal.PlainDate.from(dateInZone(zone, now));
  return { start: today.subtract({ days: 6 }).toString(), end: today.toString() };
}

// ---------- Measuring ----------

const words = (t?: string) => (t ? t.trim().split(/\s+/).filter(Boolean).length : 0);
const localDate = (iso: string, zone: string) => dateInZone(zone, new Date(iso));
const localHour = (iso: string, zone: string) =>
  Number(new Intl.DateTimeFormat('en-US', { timeZone: zone, hour: 'numeric', hourCycle: 'h23' }).format(new Date(iso)));

type RunRow = {
  id: string;
  kind: string;
  title: string;
  status: string;
  session_id: string | null;
  beats: Beat[];
  context: { practice?: PracticeState };
  started_at: string;
  ended_at: string | null;
  updated_at: string;
  minutes_planned: number | null;
};

export async function measure(userId: string, week: { start: string; end: string }): Promise<InsightMetrics> {
  const state = await readState(userId),
    plan = state.plan,
    zone = zoneFor(state);
  const from = instantFor(week.start, '00:00', zone),
    to = instantFor(Temporal.PlainDate.from(week.end).add({ days: 1 }).toString(), '00:00', zone);
  const [{ data: runRows }, { data: eventRows }] = await Promise.all([
    db()
      .from('runs')
      .select('id,kind,title,status,session_id,beats,context,started_at,ended_at,updated_at,minutes_planned')
      .eq('user_id', userId)
      .gte('started_at', from)
      .lt('started_at', to)
      .order('started_at'),
    db()
      .from('learning_events')
      .select('kind,score,assisted,detail,created_at,concept_key')
      .eq('user_id', userId)
      .gte('created_at', from)
      .lt('created_at', to),
  ]);
  // Sessions written ahead but never opened are not the learner's activity.
  const runs = ((runRows || []) as RunRow[]).filter(
    (r) => !((r.context as { prepared?: boolean; opened?: boolean }).prepared && !(r.context as { opened?: boolean }).opened),
  );
  const events = (eventRows || []) as {
    kind: string;
    score: number | null;
    assisted: boolean;
    detail: { confidence?: string | null; beat?: string; retry?: boolean };
    created_at: string;
    concept_key: string | null;
  }[];

  const days: string[] = [];
  for (let d = Temporal.PlainDate.from(week.start); Temporal.PlainDate.compare(d, Temporal.PlainDate.from(week.end)) <= 0; d = d.add({ days: 1 }))
    days.push(d.toString());
  const byDay = new Map(days.map((d) => [d, { date: d, minutes: 0, answers: 0, asks: 0 }]));
  const byHour = Array.from({ length: 24 }, () => 0);

  const lessons = runs.filter((r) => r.kind !== 'practice');
  const practices = runs.filter((r) => r.kind === 'practice');
  const minutesOf = (r: RunRow) => {
    const end = Date.parse(r.ended_at || r.updated_at),
      raw = Math.max(0, (end - Date.parse(r.started_at)) / 60000);
    // Tabs left open overnight are not study time.
    return Math.min(raw, Math.max(20, (r.minutes_planned || 30) * 1.6));
  };

  const answers: InsightMetrics['answers'] = {
    total: 0,
    solid: 0,
    partial: 0,
    missed: 0,
    skipped: 0,
    avg_score: null,
    retries: 0,
    retries_improved: 0,
    words_written: 0,
    avg_words: null,
    by_type: {},
    calibration: calibration([]),
  };
  const asks: InsightMetrics['asks'] = { total: 0, by_intent: {}, highlighted: 0, examples: [] };
  const samples: InsightMetrics['samples'] = [];
  let optionalTaken = 0,
    stepsDone = 0,
    stepsSkipped = 0,
    textAnswers = 0,
    scoreSum = 0;
  for (const r of lessons) {
    const m = minutesOf(r),
      d = byDay.get(localDate(r.started_at, zone));
    if (d) d.minutes += m;
    byHour[localHour(r.started_at, zone)] += 1;
    for (const b of r.beats) {
      if (b.status === 'done') stepsDone++;
      if (b.status === 'skipped') {
        stepsSkipped++;
        if (b.question) answers.skipped++;
      }
      if (b.optional && b.status === 'done') optionalTaken++;
      for (const a of b.asks || []) {
        asks.total++;
        asks.by_intent[a.intent] = (asks.by_intent[a.intent] || 0) + 1;
        if (a.quote) asks.highlighted++;
        if (a.intent === 'free' && asks.examples.length < 10) asks.examples.push(a.prompt.slice(0, 160));
        const ad = byDay.get(localDate(a.at, zone));
        if (ad) ad.asks++;
      }
      if (!b.feedback || !b.response) continue;
      answers.total++;
      answers[b.feedback.verdict]++;
      scoreSum += b.feedback.score;
      const t = (answers.by_type[b.type] ||= { n: 0, avg: 0 });
      t.avg = (t.avg * t.n + b.feedback.score) / (t.n + 1);
      t.n++;
      if (b.response.text) {
        textAnswers++;
        answers.words_written += words(b.response.text);
      }
      if (b.attempts?.length) {
        answers.retries++;
        if (b.feedback.score > b.attempts[0].feedback.score + 0.1) answers.retries_improved++;
      }
      const ad = byDay.get(localDate(b.response.at, zone));
      if (ad) ad.answers++;
      if (b.response.text && samples.length < 8)
        samples.push({
          step: b.type,
          text: b.response.text.slice(0, 360),
          verdict: b.feedback.verdict,
          confidence: b.response.confidence || null,
          retried: !!b.attempts?.length,
        });
    }
  }
  answers.avg_score = answers.total ? Math.round((scoreSum / answers.total) * 100) / 100 : null;
  answers.avg_words = textAnswers ? Math.round(answers.words_written / textAnswers) : null;
  answers.calibration = calibration(events.map((e) => ({ score: e.score, confidence: e.detail?.confidence })));
  for (const e of events) byHour[localHour(e.created_at, zone)] += 1;

  const practice = practices.map((r) => {
    const p = r.context.practice!;
    const d = byDay.get(localDate(r.started_at, zone));
    const m = p.seconds ? p.seconds / 60 : minutesOf(r);
    if (d) d.minutes += m;
    return {
      mode: p.mode,
      difficulty: p.difficulty,
      channel: p.channel,
      minutes: Math.round(m),
      words_spoken: p.transcript.filter((l) => l.role === 'user').reduce((n, l) => n + words(l.text), 0),
      score: p.feedback?.score ?? null,
      headline: p.feedback?.headline ?? null,
      criteria: (p.feedback?.criteria || []).map((c) => ({ name: c.name, rating: c.rating })),
      best: p.feedback?.best.quote ?? null,
      finished: !!p.feedback,
    };
  });

  // The plan's side of the week: what was scheduled, and what happened.
  const done = new Set(state.attempts.map((a) => a.session_id));
  const today = dateInZone(zone);
  const planned = plan
    ? plan.sessions.map((s) => scheduled(s, state)).filter((s) => s.date >= week.start && s.date <= week.end && !s.optional)
    : [];
  const schedule = {
    planned: planned.filter((s) => !['skipped', 'travel'].includes(s.status)).length,
    completed: planned.filter((s) => done.has(s.id)).length,
    missed: planned.filter((s) => s.date < today && !done.has(s.id) && !['skipped', 'travel'].includes(s.status)).length,
    skipped_by_choice: planned.filter((s) => s.status === 'skipped').length,
    reduced: state.attempts.filter((a) => a.date >= week.start && a.date <= week.end && a.reduced).length,
    optional_steps_taken: optionalTaken,
  };

  let conceptSummary: InsightMetrics['concepts'] = { total: 0, touched: 0, levels: {}, due: 0, new_misconceptions: [] };
  if (plan) {
    const [graph, learned] = await Promise.all([concepts(userId, plan), states(userId, plan.plan_id)]);
    const now = new Date().toISOString();
    const levels: Record<string, number> = {};
    for (const c of graph.list) {
      const s = learned.get(c.key);
      const l = s ? level(s, now) : 'new';
      levels[l] = (levels[l] || 0) + 1;
    }
    conceptSummary = {
      total: graph.list.length,
      touched: new Set(events.map((e) => e.concept_key).filter(Boolean)).size,
      levels,
      due: [...learned.values()].filter((s) => s.due_at && Date.parse(s.due_at) <= Date.now()).length,
      new_misconceptions: [...learned.values()]
        .flatMap((s) => s.misconceptions.filter((m) => !m.resolved && m.at >= from && m.at < to).map((m) => m.text))
        .slice(0, 6),
    };
  }

  const inWeek = (d?: unknown) => typeof d === 'string' && d >= week.start && d <= week.end;
  const checkins = state.records
    .filter((r) => r.kind === 'checkin' && inWeek(r.data.date))
    .map((r) => ({ date: String(r.data.date), energy: Number(r.data.energy), mood: String(r.data.mood || '') }));
  const reflections = state.records
    .filter((r) => r.kind === 'reflection' && r.updated_at >= from && r.updated_at < to)
    .map((r) => JSON.stringify(r.data).slice(0, 600));
  const workouts = state.records.filter((r) => r.kind === 'workout' && inWeek(r.data.date) && r.data.complete).length;

  const daysActive = [...byDay.values()].filter((d) => d.minutes > 0 || d.answers > 0 || d.asks > 0).length;
  const minutes = Math.round([...byDay.values()].reduce((s, d) => s + d.minutes, 0));
  return {
    week: { ...week, zone },
    totals: {
      minutes,
      days_active: daysActive,
      sessions_started: lessons.filter((r) => r.kind !== 'review').length,
      sessions_finished: lessons.filter((r) => r.kind !== 'review' && r.status === 'done').length,
      reviews: lessons.filter((r) => r.kind === 'review').length,
      explorations: lessons.filter((r) => r.kind === 'explore').length,
      rehearsals: lessons.filter((r) => r.kind === 'rehearsal').length,
      practices: practices.length,
      steps_done: stepsDone,
      steps_skipped: stepsSkipped,
      answers: answers.total,
      questions_asked: asks.total,
      words_written: answers.words_written,
      words_spoken: practice.reduce((s, p) => s + p.words_spoken, 0),
    },
    by_day: [...byDay.values()].map((d) => ({ ...d, minutes: Math.round(d.minutes) })),
    by_hour: byHour,
    schedule,
    answers,
    asks,
    practice,
    concepts: conceptSummary,
    checkins,
    reflections,
    workouts,
    samples,
    empty: !runs.length && !events.length,
  };
}

// ---------- Interpreting ----------

// Every field is short on purpose: the page shows the read at a glance and
// folds the rest away, so the words have to earn their place.
const reportSchema = z.object({
  headline: z.string().describe('One honest sentence about the week, specific to it, at most 16 words. No hype.'),
  summary: z.string().describe('Two sentences: what happened and what it means.'),
  data_note: z
    .string()
    .nullable()
    .describe('If the data is thin or skewed, say so plainly in one short sentence; otherwise null.'),
  grades: z.array(
    z.object({
      key: z.enum(GRADE_KEYS),
      score: z.number().nullable().describe('0–100 against the anchors, or null when the data cannot support a grade.'),
      confidence: z.enum(['low', 'medium', 'high']),
      label: z.string().describe('Two or three words, e.g. "Showing up", "Coasting", "Sharp".'),
      evidence: z.string().describe('One sentence, at most 25 words, citing the specific number or moment behind the grade.'),
    }),
  ),
  patterns: z
    .array(
      z.object({
        kind: z.enum(['strength', 'watch', 'observation']),
        title: z.string().describe('At most six words.'),
        body: z.string().describe('One or two sentences grounded in the data.'),
      }),
    )
    .describe('Exactly three learning habits the data shows.'),
  mind: z
    .array(z.object({ title: z.string().describe('At most six words.'), body: z.string().describe('One or two sentences.') }))
    .describe('Two observations about motivation, how they meet difficulty, and energy. Behavioural, never clinical.'),
  moment: z
    .object({
      quote: z.string().describe('The learner’s own words, quoted exactly from the samples.'),
      why: z.string().describe('One sentence.'),
    })
    .nullable(),
  focus: z.object({
    title: z.string().describe('At most eight words.'),
    why: z.string().describe('One sentence.'),
    try: z.string().describe('One concrete thing to do next week, in one sentence, small enough to actually do.'),
  }),
  focus_check: z
    .object({
      verdict: z.enum(['yes', 'partly', 'no', 'unclear']),
      note: z.string().describe('One sentence citing what this week’s data shows about it.'),
    })
    .nullable()
    .describe('Did the learner act on last week’s focus? Judge only from this week’s data. Null on a first read.'),
});

const GUIDE = `Each grade is 0–100 on fixed anchors, the same every week:
 90–100 exceptional; rare, and only with strong evidence.
 75–89 strong: clearly above what the plan asks.
 60–74 solid: doing what the plan asks, well.
 45–59 mixed: real effort with clear gaps, or uneven.
 30–44 below what the plan asks.
 0–29 largely absent.
Grades:
 effort — time invested against what was planned, finishing what was started, thoughtfulness and length of written answers, retries after feedback, optional steps taken. Not correctness.
 engagement — active curiosity: questions asked of the tutor (and how deep: why/deeper vs simpler), highlighting passages, explorations, voluntary practice; skipping lowers it.
 consistency — showing up on planned days, spacing across the week, reviewing what was due.
 understanding — quality of answers on new material (checks, explanations).
 retention — warm-up recalls and reviews of earlier ideas.
 transfer — applying ideas in changed situations and producing work.
 calibration — whether confidence matched accuracy (certain answers right far more often than guesses). Null if fewer than 5 rated answers.
 communication — spoken or text practice performance. Null if there was no practice.
Return every grade key once.`;

export async function interpret(userId: string, metrics: InsightMetrics, previous: InsightRow | null) {
  const state = await readState(userId);
  const prior = previous?.report
    ? `Last week's grades (for trend only; do not anchor to them): ${previous.report.grades
        .map((g) => `${g.key} ${g.score ?? 'n/a'}`)
        .join(', ')}. Last week's focus: ${previous.report.focus.title} — ${previous.report.focus.try} ${
        previous.report.focus.adopted
          ? '(The learner adopted it as their focus, so the tutor reinforced it in sessions.)'
          : '(The learner did not explicitly adopt it.)'
      }`
    : 'This is the first weekly read.';
  const { data, model } = await generate({
    task: 'insights.weekly',
    userId,
    schema: reportSchema,
    timeoutMs: 300000,
    context: [
      {
        name: 'learner',
        content: state.plan
          ? `Name: ${state.plan.profile.name}. Goals: ${state.plan.profile.goals.slice(0, 6).join('; ')}. Plan: ${state.plan.title}.`
          : null,
      },
      { name: 'grading_guide', content: GUIDE },
      { name: 'previous_week', content: prior },
    ],
    input: `The week's measured activity (JSON; minutes are active time, capped so idle tabs don't count; free text is excerpted and capped):\n${digest(metrics)}`,
  });
  // The model grades; code keeps the shape honest.
  const grades = GRADE_KEYS.map((key) => {
    const g = data.grades.find((x) => x.key === key);
    return {
      key,
      score: g && g.score !== null ? Math.round(Math.max(0, Math.min(100, g.score))) : null,
      confidence: g?.confidence || 'low',
      label: g?.label || 'Not enough data',
      evidence: g?.evidence || 'There wasn’t enough activity this week to grade this fairly.',
    };
  });
  // No practice means nothing to grade on communication, whatever the model says.
  const comm = grades.find((g) => g.key === 'communication')!;
  if (!metrics.practice.length) Object.assign(comm, { score: null, label: 'No practice', evidence: 'No practice conversations this week.' });
  const rated = Object.values(metrics.answers.calibration).reduce((n, c) => n + c.n, 0);
  const cal = grades.find((g) => g.key === 'calibration')!;
  if (rated < 5) Object.assign(cal, { score: null, label: 'Too few ratings', evidence: `Only ${rated} answers carried a confidence rating.` });
  const report: InsightReport = {
    ...data,
    grades,
    patterns: data.patterns.slice(0, 3),
    mind: data.mind.slice(0, 2),
    focus: { ...data.focus, adopted: null },
    focus_check: previous?.report ? data.focus_check : null,
  };
  return { report, model };
}

// ---------- Storing ----------

const COLUMNS = 'id,week_start,week_end,status,metrics,report,model,error,seen_at,created_at,updated_at';

export async function listInsights(userId: string): Promise<InsightSummary[]> {
  const { data, error } = await db()
    .from('insights')
    .select('id,week_start,week_end,status,report,seen_at,created_at')
    .eq('user_id', userId)
    .order('week_start', { ascending: false })
    .limit(26);
  if (error) throw new Error('Insights could not be loaded.');
  return (data || []).map((r) => ({
    id: r.id,
    week_start: r.week_start,
    week_end: r.week_end,
    status: r.status,
    seen_at: r.seen_at,
    created_at: r.created_at,
    headline: (r.report as InsightReport | null)?.headline || null,
    focus: (r.report as InsightReport | null)?.focus?.title || null,
    grades: ((r.report as InsightReport | null)?.grades || []).map((g) => ({ key: g.key, score: g.score })),
  }));
}

export async function getInsight(userId: string, id: string) {
  const { data } = await db().from('insights').select(COLUMNS).eq('user_id', userId).eq('id', id).maybeSingle();
  if (!data) throw new HttpError('That week isn’t available.', 404);
  return data as InsightRow;
}

async function previousReady(userId: string, before: string) {
  const { data } = await db()
    .from('insights')
    .select(COLUMNS)
    .eq('user_id', userId)
    .eq('status', 'ready')
    .lt('week_start', before)
    .order('week_start', { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as InsightRow | null) || null;
}

// Claims the week (so two callers can't both pay for it), then measures and
// interprets it. A generation stuck for over ten minutes can be reclaimed.
export async function claimWeek(userId: string, week: { start: string; end: string }) {
  const { data: existing } = await db()
    .from('insights')
    .select('id,status,updated_at')
    .eq('user_id', userId)
    .eq('week_start', week.start)
    .maybeSingle();
  if (existing) {
    const stuck = existing.status === 'generating' && Date.now() - Date.parse(existing.updated_at) > 10 * 60000;
    if (existing.status !== 'failed' && !stuck) return null;
    const { data } = await db()
      .from('insights')
      .update({ status: 'generating', error: null, week_end: week.end, updated_at: new Date().toISOString() })
      .eq('id', existing.id)
      .eq('updated_at', existing.updated_at)
      .select('id')
      .maybeSingle();
    return data?.id || null;
  }
  const { data, error } = await db()
    .from('insights')
    .insert({ user_id: userId, week_start: week.start, week_end: week.end, status: 'generating' })
    .select('id')
    .single();
  if (error) return null; // another caller won the race
  return data.id as string;
}

export async function buildInsight(userId: string, id: string, week: { start: string; end: string }, notify = false) {
  try {
    const metrics = await measure(userId, week);
    // A week with nothing in it needs no model to say so.
    const out = metrics.empty ? { report: null, model: null } : await interpret(userId, metrics, await previousReady(userId, week.start));
    await db()
      .from('insights')
      .update({ status: 'ready', metrics, report: out.report, model: out.model, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('user_id', userId);
    // Last week's focus has had its week; a new read brings a new one.
    if (out.report) await retireFocus(userId, id);
    if (notify && out.report)
      await pushTo(userId, `insights:${week.start}`, {
        title: 'Your week, read honestly',
        body: out.report.headline,
        url: '/insights',
      }).catch(() => {});
  } catch (e) {
    console.error('insight failed', userId, e instanceof Error ? e.message : e);
    await db()
      .from('insights')
      .update({ status: 'failed', error: e instanceof Error ? e.message.slice(0, 300) : 'failed', updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('user_id', userId);
  }
}

// ---------- Acting on it ----------

// Earlier weeks' adopted focus stops steering the tutor. Their record of
// having been adopted stays, for history.
async function retireFocus(userId: string, keep: string) {
  const { data } = await db().from('insights').select('id,report').eq('user_id', userId).neq('id', keep).not('report', 'is', null);
  for (const row of data || []) {
    const id = (row.report as InsightReport).focus?.adopted?.memory_id;
    if (id) await deleteMemory(userId, id).catch(() => {});
  }
}

// Making the week's focus yours pins it as a goal, so every session reads it.
export async function adoptFocus(userId: string, id: string, on: boolean) {
  const row = await getInsight(userId, id);
  if (row.status !== 'ready' || !row.report) throw new HttpError('This week has no focus yet.', 409);
  const { data: newest } = await db()
    .from('insights')
    .select('id')
    .eq('user_id', userId)
    .eq('status', 'ready')
    .order('week_start', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (newest?.id !== id) throw new HttpError('Only the latest week’s focus can be adopted.', 409);
  const report = row.report;
  if (report.focus.adopted) await deleteMemory(userId, report.focus.adopted.memory_id).catch(() => {});
  let adopted: InsightReport['focus']['adopted'] = null;
  if (on) {
    await retireFocus(userId, id);
    const memory = await writeMemory(userId, { kind: 'goal', pinned: true, content: `Focus for this week: ${report.focus.try}`.slice(0, 600) });
    adopted = { memory_id: memory.id, at: new Date().toISOString() };
  }
  const focus = { ...report.focus, adopted };
  const { error } = await db()
    .from('insights')
    .update({ report: { ...report, focus } })
    .eq('id', id)
    .eq('user_id', userId);
  if (error) throw new Error('The focus did not save.');
  return focus;
}

// A question about the read, answered from the same measured week and
// nothing else.
const askSchema = z.object({
  answer: z.string().describe('Two to four sentences, at most 90 words, citing the numbers that answer the question.'),
});
export async function askInsight(userId: string, id: string, question: string) {
  const row = await getInsight(userId, id);
  if (row.status !== 'ready' || !row.report || !('totals' in row.metrics))
    throw new HttpError('This week hasn’t been read yet.', 409);
  const r = row.report;
  const { data } = await generate({
    task: 'insights.ask',
    userId,
    schema: askSchema,
    context: [
      { name: 'grading_guide', content: GUIDE },
      {
        name: 'report',
        content: JSON.stringify({ headline: r.headline, summary: r.summary, grades: r.grades, patterns: r.patterns, focus: r.focus }),
      },
      { name: 'week', content: digest(row.metrics as InsightMetrics) },
    ],
    input: `The learner asks about this week: ${question}`,
  });
  return data.answer.trim();
}

export async function markSeen(userId: string, id: string) {
  await db().from('insights').update({ seen_at: new Date().toISOString() }).eq('id', id).eq('user_id', userId).is('seen_at', null);
}

// The weekly job: from Monday 6am local, each learner gets last week's read.
// One per tick keeps the scheduler inside its time limit; the rest follow on
// later ticks.
export async function dueWeeklyInsight(now = new Date()) {
  const { data } = await db().from('workspaces').select('user_id');
  for (const { user_id: uid } of data || []) {
    const state = await readState(uid).catch(() => null);
    if (!state?.plan) continue;
    const zone = zoneFor(state);
    const local = Temporal.Instant.fromEpochMilliseconds(now.getTime()).toZonedDateTimeISO(zone);
    if (local.dayOfWeek === 1 && local.hour < 6) continue;
    const week = lastWeek(zone, now);
    if (week.end < state.plan.start_date) continue;
    const id = await claimWeek(uid, week);
    if (id) return { userId: uid, id, week };
  }
  return null;
}

