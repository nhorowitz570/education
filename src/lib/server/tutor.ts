import 'server-only';
import { adminClient } from '@/lib/supabase/server';
import { generate } from '@/lib/ai/engine';
import { readState } from './state';
import { memoryLayer, recall, writeMemory } from './memory';
import { concepts, describeState, states } from './learner';
import { today } from '@/lib/learning/today';
import { styleLayer, NEUTRAL, type Style } from '@/lib/learning/style';
import { writingLayer } from '@/lib/learning/voice';
import { lessonCast } from '@/lib/learning/names';
import { prefsOf } from '@/lib/prefs';
import { dateInZone } from '@/lib/plan';
import { hourIn, zoneOf } from '@/lib/zone';
import { voiceReady } from '@/lib/ai/env';
import { briefSchema, replySchema, type TutorReply } from '@/lib/tutor';
import type { Layer } from '@/lib/ai/prompts';
import type { AppState } from '@/lib/types';
import type { z } from 'zod';

const db = () => adminClient();
type Send = (e: { t: string; [k: string]: unknown }) => void;

// The last week of finished work, in a few lines: what each session was,
// what it showed, and how the answers went.
async function recentWork(userId: string) {
  const since = new Date(Date.now() - 8 * 86400000).toISOString();
  const { data } = await db()
    .from('runs')
    .select('title,kind,ended_at,summary,beats')
    .eq('user_id', userId)
    .eq('status', 'done')
    .gte('ended_at', since)
    .order('ended_at', { ascending: false })
    .limit(5);
  return (data || [])
    .map((r) => {
      const verdicts = ((r.beats as { feedback?: { verdict: string } }[]) || []).map((b) => b.feedback?.verdict).filter(Boolean);
      const count = (v: string) => verdicts.filter((x) => x === v).length;
      const day = r.ended_at ? new Date(r.ended_at as string).toISOString().slice(0, 10) : '';
      return `${day} · ${r.kind} · ${r.title}${verdicts.length ? ` (answers: ${count('solid')} solid, ${count('partial')} partial, ${count('missed')} missed)` : ''}${r.summary ? `: ${r.summary}` : ''}`;
    })
    .join('\n');
}

// Ideas the learner is shakiest on: lapses and open misconceptions first.
async function weakIdeas(userId: string, state: AppState) {
  const plan = state.plan;
  if (!plan) return '';
  const [graph, learned] = await Promise.all([concepts(userId, plan), states(userId, plan.plan_id)]);
  const now = new Date().toISOString();
  return graph.list
    .map((c) => ({ c, s: learned.get(c.key) }))
    .filter((x) => x.s?.exposures && (x.s.lapses > 0 || x.s.misconceptions.some((m) => !m.resolved)))
    .sort((a, b) => (b.s!.lapses || 0) - (a.s!.lapses || 0))
    .slice(0, 4)
    .map((x) => describeState(x.s, x.c.title, now))
    .join('\n');
}

async function learnerLayer(userId: string, state: AppState) {
  const { data } = await db().from('learner_profiles').select('style').eq('user_id', userId).maybeSingle();
  const style: Style = { ...NEUTRAL, ...((data?.style as Partial<Style>) || {}) };
  const plan = state.plan;
  return [
    plan ? `Name: ${plan.profile.name}. Goals: ${plan.profile.goals.slice(0, 6).join('; ')}.` : '',
    styleLayer(style),
    writingLayer(prefsOf(state).writing),
    `Cast (names for any people you invent, in this order): ${lessonCast().join(', ')}.`,
  ]
    .filter(Boolean)
    .join('\n');
}

function todayLayer(state: AppState) {
  const zone = zoneOf(state),
    now = new Date();
  const date = dateInZone(zone, now),
    hour = hourIn(zone, now);
  const view = today({ state, date, hour, dueCount: 0, activeRun: null, voice: voiceReady() });
  const weekday = now.toLocaleDateString('en-US', { weekday: 'long', timeZone: zone });
  return [
    `Now: ${weekday} ${date}, ${String(hour).padStart(2, '0')}:00 local time.`,
    `Today: ${view.headline}. ${view.why}`,
    view.primary ? `Main action available: ${view.primary.label}${view.primary.minutes ? ` (${view.primary.minutes} min)` : ''}.` : '',
    view.focus ? `Current focus session: ${view.focus.title} (${view.focus.subject}), objective: ${view.focus.objective}` : '',
    view.week ? `This week: ${view.week.done} of ${view.week.planned} sessions done. ${view.week.days.map((d) => `${d.weekday} ${d.status}${d.title ? ` (${d.title})` : ''}`).join('; ')}` : '',
    view.milestone ? `Next milestone: ${view.milestone.title} in ${view.milestone.days} days.` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

// ---------- Chat ----------

export async function tutorChat(
  userId: string,
  input: { turns: { role: 'user' | 'tutor'; text: string }[]; page: string },
  send: Send,
) {
  const state = await readState(userId);
  const last = [...input.turns].reverse().find((t) => t.role === 'user')?.text || '';
  const [learner, memories, recent, weak] = await Promise.all([
    learnerLayer(userId, state),
    recall(userId, last.slice(0, 500), [], 8).then(memoryLayer),
    recentWork(userId),
    weakIdeas(userId, state),
  ]);
  const layers: Layer[] = [
    { name: 'learner', content: learner },
    { name: 'memories', content: memories || null },
    { name: 'today', content: todayLayer(state) },
    { name: 'recent_sessions', content: recent || null },
    { name: 'weak_ideas', content: weak || null },
    { name: 'page', content: `The learner is on ${input.page}.` },
  ];
  const conversation = input.turns
    .slice(-16)
    .map((t) => `${t.role === 'user' ? 'Learner' : 'Tutor'}: ${t.text.slice(0, 2000)}`)
    .join('\n\n');
  const out = await generate({
    task: 'tutor.chat',
    userId,
    schema: replySchema,
    context: layers,
    signals: { hard: /\b(deeper|explain again|still don.t get|confus)/i.test(last) },
    input: `Conversation so far (reply to the learner's last message):\n\n${conversation}`,
    onPartial: (p) => send({ t: 'snap', data: { blocks: (p as Partial<TutorReply>).blocks || [] } }),
  });
  const reply = out.data;
  // The only action carried out on the server: saving what the learner asked
  // to be remembered.
  const done: TutorReply['actions'] = [];
  for (const a of reply.actions.slice(0, 3)) {
    if (a.type === 'remember') {
      if (a.content && /remember|note that|keep in mind|don.t forget/i.test(last)) {
        await writeMemory(userId, { kind: 'preference', content: a.content.slice(0, 300) }).catch(() => {});
        done.push(a);
      }
    } else done.push(a);
  }
  send({ t: 'done', data: { blocks: reply.blocks, suggestions: reply.suggestions.slice(0, 3), actions: done } });
}

// ---------- Morning brief ----------

export async function morningBrief(
  userId: string,
  input: { date: string; agenda: { label: string; kind: string; minutes: number | null; track: string | null }[] },
): Promise<z.infer<typeof briefSchema>> {
  const state = await readState(userId);
  const [learner, recent, weak, memories] = await Promise.all([
    learnerLayer(userId, state),
    recentWork(userId),
    weakIdeas(userId, state),
    recall(userId, input.agenda.map((a) => a.label).join('. ') || 'today', [], 5).then(memoryLayer),
  ]);
  const { data } = await generate({
    task: 'today.brief',
    userId,
    schema: briefSchema,
    context: [
      { name: 'learner', content: learner },
      { name: 'memories', content: memories || null },
      { name: 'today', content: todayLayer(state) },
      { name: 'recent_sessions', content: recent || 'No finished sessions yet.' },
      { name: 'weak_ideas', content: weak || null },
    ],
    input: `Agenda for ${input.date}, in order:\n${input.agenda.map((a, i) => `${i + 1}. ${a.label} (${a.kind}${a.minutes ? `, ${Math.round(a.minutes)} min` : ''}${a.track ? `, ${a.track}` : ''})`).join('\n') || '(nothing scheduled: a free day)'}`,
  });
  return {
    title: data.title.trim().replace(/[.!]+$/, '').slice(0, 90),
    note: data.note.trim().slice(0, 600),
    item_notes: input.agenda.map((_, i) => {
      const n = data.item_notes[i];
      return n && n.trim().split(/\s+/).length <= 8 ? n.trim().replace(/^["“]|["”]$/g, '') : null;
    }),
  };
}
