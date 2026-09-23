import 'server-only';
import { adminClient } from '@/lib/supabase/server';
import { readState } from './state';
import { concepts, states } from './learner';
import { level, strength } from '@/lib/learning/model';
import { vizSchema, type Viz } from '@/lib/viz/schema';
import type { Beat, Block } from '@/lib/learning/run';
import { phrasesOf, type Entry, type Note, type NotebookView, type Term } from '@/lib/notebook';

// The Notebook is read from what already exists: every session step that met
// an idea, the learner's answers and questions, the learner model's strength,
// and their own notes. Nothing is generated, so it costs no model calls and
// is always current.

type RunRow = {
  id: string;
  kind: string;
  title: string;
  status: string;
  beats: Beat[];
  started_at: string;
  ended_at: string | null;
};
type NoteRow = { id: string; run_id: string; beat_id: string; concept_key: string | null; quote: string | null; text: string; created_at: string };

const TEACH = new Set(['explain', 'orient', 'worked']);
const WORDS = new Set(['attempt', 'produce', 'transfer', 'check', 'recall']);
const ORDER = { solid: 0, partial: 1, missed: 2 } as const;
const INTENT: Record<string, string> = {
  why: 'Why?',
  example: 'An example, please',
  deeper: 'Go deeper',
  simpler: 'Say it more simply',
  visual: 'Show me',
};

const text = (blocks: Block[] | undefined) =>
  (blocks || [])
    .filter((b): b is Extract<Block, { md: string }> => b.type !== 'visual')
    .map((b) => b.md)
    .join('\n\n')
    .trim();
const visualOf = (blocks: Block[] | undefined): Viz | null => {
  for (const b of blocks || []) {
    if (b.type !== 'visual') continue;
    const v = vizSchema.safeParse(b.visual);
    if (v.success) return v.data;
  }
  return null;
};
const title = (s: string) => s.replace(/(^|[\s-])\w/g, (m) => m.toUpperCase());

// Notes and shares need their tables; until the migration is applied the
// Notebook still works without them.
async function optional<T>(q: PromiseLike<{ data: T[] | null; error: unknown }>): Promise<T[]> {
  try {
    const { data, error } = await q;
    return error ? [] : data || [];
  } catch {
    return [];
  }
}

export async function notebook(userId: string, now = new Date().toISOString()): Promise<NotebookView> {
  const db = adminClient();
  const state = await readState(userId),
    plan = state.plan;
  const [graph, learned, runs, notes, shares] = await Promise.all([
    plan ? concepts(userId, plan) : Promise.resolve({ list: [], mapped: false }),
    plan ? states(userId, plan.plan_id) : Promise.resolve(new Map()),
    db
      .from('runs')
      .select('id,kind,title,status,beats,started_at,ended_at')
      .eq('user_id', userId)
      .neq('kind', 'practice')
      .in('status', ['active', 'done'])
      .order('started_at', { ascending: false })
      .limit(300)
      .then(({ data }) => (data || []) as RunRow[]),
    optional<NoteRow>(db.from('notes').select('id,run_id,beat_id,concept_key,quote,text,created_at').eq('user_id', userId).order('created_at')),
    optional<{ token: string; concept_key: string }>(db.from('shares').select('token,concept_key').eq('user_id', userId).is('revoked_at', null)),
  ]);
  const byKey = new Map(graph.list.map((c) => [c.key, c]));
  const trackTitles = new Map<string, string>(
    plan?.horizon?.tracks.map((t) => [t.id, t.title]) || [...new Set(graph.list.map((c) => c.track))].map((t) => [t, title(t)]),
  );
  trackTitles.set('explore', 'Side trips');

  const entries = new Map<string, Entry>();
  const entryFor = (key: string, run: RunRow): Entry => {
    let e = entries.get(key);
    if (e) return e;
    const c = byKey.get(key);
    const trip = key.startsWith('trip:');
    const track = trip ? 'explore' : c?.track || 'general';
    const s = learned.get(key);
    e = {
      key,
      title: trip ? run.title : c?.title || title(key.replace(/[-_.]+/g, ' ')),
      track,
      trackTitle: trackTitles.get(track) || title(track),
      summary: trip ? '' : c?.summary || '',
      offPlan: trip,
      strength: s ? strength(s, now) : 0,
      level: s ? level(s, now) : 'new',
      due_at: s?.due_at || null,
      first_seen: run.started_at,
      last_seen: run.started_at,
      explanation: null,
      visual: null,
      words: [],
      asks: [],
      notes: [],
      sources: [],
      misconceptions: (s?.misconceptions || []).filter((m: { resolved?: boolean }) => !m.resolved).map((m: { text: string }) => m.text),
      shared: null,
    };
    entries.set(key, e);
    return e;
  };

  // Newest runs first, so the first explanation and picture found are the latest.
  const beatConcept = new Map<string, string>();
  for (const run of runs) {
    const trip = run.kind === 'explore';
    for (const b of run.beats || []) {
      if (!b.concept || b.status === 'pending' || b.status === 'skipped' || !b.blocks?.length) continue;
      if (b.type === 'gauge' || b.type === 'break' || b.type === 'recap') continue;
      const key = trip ? 'trip:' + run.id : b.concept;
      beatConcept.set(run.id + ':' + b.id, key);
      const e = entryFor(key, run);
      const at = b.response?.at || run.ended_at || run.started_at;
      if (at < e.first_seen) e.first_seen = at;
      if (at > e.last_seen) e.last_seen = at;
      if (!e.sources.some((s) => s.run === run.id)) e.sources.push({ run: run.id, title: run.title, kind: run.kind, at: run.started_at });
      if (TEACH.has(b.type)) {
        if (!e.explanation && b.type !== 'worked') e.explanation = text(b.blocks).slice(0, 1600) || null;
        if (!e.visual) e.visual = visualOf(b.blocks);
      }
      if (WORDS.has(b.type) && b.response?.text && b.response.text.trim().split(/\s+/).length >= 4)
        e.words.push({ text: b.response.text.trim().slice(0, 1600), verdict: b.feedback?.verdict || null, step: b.type, run: run.id, at });
      for (const a of b.asks || []) {
        const answer = text(a.blocks);
        if (!e.visual) e.visual = visualOf(a.blocks);
        if (answer) e.asks.push({ question: a.prompt || INTENT[a.intent] || 'Explain this part', quote: a.quote, answer: answer.slice(0, 1200), run: run.id, at: a.at });
      }
    }
  }
  for (const n of notes) {
    const key = n.concept_key || beatConcept.get(n.run_id + ':' + n.beat_id);
    const e = key && entries.get(key);
    const note: Note = { id: n.id, text: n.text, quote: n.quote, run: n.run_id, beat: n.beat_id, concept: key || null, at: n.created_at };
    if (e) e.notes.push(note);
  }
  for (const s of shares) {
    const e = entries.get(s.concept_key);
    if (e) e.shared = s.token;
  }
  for (const e of entries.values()) {
    // The learner's best words first: marked solid, then the fuller answer.
    e.words.sort((a, b) => (ORDER[a.verdict || 'missed'] ?? 3) - (ORDER[b.verdict || 'missed'] ?? 3) || b.text.length - a.text.length);
    e.words = e.words.slice(0, 6);
    e.asks = e.asks.sort((a, b) => b.at.localeCompare(a.at)).slice(0, 8);
  }
  const list = [...entries.values()].sort((a, b) => b.last_seen.localeCompare(a.last_seen));
  const used = new Set(list.map((e) => e.track));
  return {
    entries: list,
    tracks: [...trackTitles.entries()].filter(([id]) => used.has(id)).map(([id, t]) => ({ id, title: t })),
  };
}

// What a lesson needs to recognise ideas taught before: everything met in an
// earlier session, with the learner's best words about it.
export async function terms(userId: string, exceptRun?: string): Promise<Term[]> {
  const { entries } = await notebook(userId);
  return entries
    .filter((e) => !e.offPlan && e.sources.some((s) => s.run !== exceptRun))
    .map((e) => ({
      key: e.key,
      title: e.title,
      track: e.track,
      strength: e.strength,
      level: e.level,
      words: e.words[0]?.text.slice(0, 280) || null,
      phrases: phrasesOf(e.title),
    }))
    .filter((t) => t.phrases.length);
}

// A share is a frozen copy of one entry's card, chosen by the learner.
export type Card = {
  title: string;
  track: string;
  trackTitle: string;
  summary: string;
  explanation: string | null;
  visual: Viz | null;
  words: string | null;
  level: string;
  name: string | null;
};
export function cardOf(e: Entry, o: { words: boolean; name: string | null }): Card {
  return {
    title: e.title,
    track: e.track,
    trackTitle: e.trackTitle,
    summary: e.summary,
    explanation: e.explanation ? e.explanation.split(/\n{2,}/).slice(0, 2).join('\n\n') : null,
    visual: e.visual,
    words: o.words ? e.words[0]?.text || null : null,
    level: e.level,
    name: o.name,
  };
}
