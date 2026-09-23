import type { Viz } from './viz/schema';
import type { Verdict } from './learning/run';

// The Notebook: one entry per idea the learner has met, written by their own
// sessions. Shared by the server (which builds it) and the pages (which show it).

export type Words = { text: string; verdict: Verdict | null; step: string; run: string; at: string };
export type AskNote = { question: string; quote?: string; answer: string; run: string; at: string };
export type Note = { id: string; text: string; quote?: string | null; run: string; beat: string; concept?: string | null; at: string };
export type Source = { run: string; title: string; kind: string; at: string };

export type Entry = {
  key: string;
  title: string;
  track: string;
  trackTitle: string;
  summary: string;
  offPlan: boolean;
  strength: number;
  level: string;
  due_at: string | null;
  first_seen: string;
  last_seen: string;
  // The tutor's clearest explanation, and the best picture from any session.
  explanation: string | null;
  visual: Viz | null;
  words: Words[];
  asks: AskNote[];
  notes: Note[];
  sources: Source[];
  misconceptions: string[];
  shared?: string | null;
};

export type NotebookView = { entries: Entry[]; tracks: { id: string; title: string }[] };

// The shortest useful form for a lesson to recognise terms it has taught
// before: phrases from each title, strongest first.
export type Term = { key: string; title: string; track: string; strength: number; level: string; words: string | null; phrases: string[] };

// Phrases worth recognising in a lesson, from an idea's title: the whole
// title, and its halves when it's a comparison ("Profit vs cash").
export function phrasesOf(title: string) {
  const clean = title.replace(/[“”"()]/g, '').trim();
  const parts = clean
    .split(/\s+(?:vs\.?|versus|and|or|&)\s+|:\s+|,\s+|\s+[–—-]\s+/i)
    .map((p) => p.trim())
    .filter((p) => p.length >= 5 && !/^(the|a|an|why|how|what)$/i.test(p));
  const out = new Set<string>();
  if (clean.length >= 4 && clean.split(/\s+/).length <= 5) out.add(clean);
  for (const p of parts) if (p.split(/\s+/).length <= 4) out.add(p);
  return [...out].map((p) => p.toLowerCase()).sort((a, b) => b.length - a.length);
}

// Finds the first mention of each known term in a piece of text. Longer
// phrases win, matches don't overlap, and each idea is marked once.
export function findTerms(text: string, terms: Term[], skip: Set<string> = new Set()) {
  const lower = text.toLowerCase();
  const hits: { start: number; end: number; term: Term }[] = [];
  const seen = new Set<string>();
  const candidates = terms.flatMap((t) => t.phrases.map((p) => ({ p, t }))).sort((a, b) => b.p.length - a.p.length);
  for (const { p, t } of candidates) {
    if (seen.has(t.key) || skip.has(t.key)) continue;
    let from = 0;
    while (from < lower.length) {
      const i = lower.indexOf(p, from);
      if (i < 0) break;
      // Whole words only, allowing a plural "s".
      let end = i + p.length;
      if (lower[end] === 's' && !/[a-z0-9]/.test(lower[end + 1] || '')) end++;
      const bounded = !/[a-z0-9]/.test(lower[i - 1] || '') && !/[a-z0-9]/.test(lower[end] || '');
      if (bounded && !hits.some((h) => i < h.end && end > h.start)) {
        hits.push({ start: i, end, term: t });
        seen.add(t.key);
        break;
      }
      from = i + 1;
    }
  }
  return hits.sort((a, b) => a.start - b.start);
}

export const LEVEL_LABEL: Record<string, string> = {
  new: 'New',
  learning: 'Learning',
  practiced: 'Practised',
  solid: 'Solid',
  mastered: 'Mastered',
};
