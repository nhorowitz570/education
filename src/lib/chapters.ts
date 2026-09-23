import type { Plan } from './plan';

// The plan's weeks, grouped into chapters a few weeks long. A milestone always
// closes a chapter, and runs of travel or return weeks become their own
// short interlude. Each chapter is named for what the learner will be able
// to do by its end; until the fast model has named them, the last week's
// evidence stands in, since it is already written as an outcome.

export type Chapter = {
  id: string;
  weeks: string[]; // week ids, in order
  start: string;
  end: string; // the day before the next chapter starts
  milestone: string | null;
  interlude: boolean;
  // Named later by the model; these are the deterministic fallbacks.
  title: string;
  outcome: string;
};
export type ChapterName = { id: string; title: string; outcome: string };

const SIZE = 4;

export function chapters(plan: Plan): Chapter[] {
  const weeks = [...plan.weeks].sort((a, b) => a.start_date.localeCompare(b.start_date));
  const endOf = (i: number) => {
    const next = weeks[i + 1]?.start_date;
    if (!next) return plan.end_date;
    const d = new Date(next + 'T12:00:00Z');
    d.setUTCDate(d.getUTCDate() - 1);
    return d.toISOString().slice(0, 10);
  };
  const milestoneIn = (i: number) => plan.milestones.find((m) => m.date >= weeks[i].start_date && m.date <= endOf(i)) || null;
  // Time away and the return from it; a light week stays with its neighbours.
  const special = (i: number) => /travel|return|break|holiday|vacation/i.test(weeks[i].mode) && !milestoneIn(i);

  // First cut at milestones and at changes between regular and special weeks.
  const spans: number[][] = [];
  let cur: number[] = [];
  weeks.forEach((_, i) => {
    if (cur.length && special(i) !== special(cur[cur.length - 1])) {
      spans.push(cur);
      cur = [];
    }
    cur.push(i);
    if (milestoneIn(i)) {
      spans.push(cur);
      cur = [];
    }
  });
  if (cur.length) spans.push(cur);

  // Then split long regular spans into roughly equal chapters of about SIZE.
  const groups: number[][] = [];
  for (const span of spans) {
    if (special(span[0]) || span.length <= SIZE + 1) {
      groups.push(span);
      continue;
    }
    const n = Math.round(span.length / SIZE);
    const size = Math.ceil(span.length / n);
    for (let j = 0; j < span.length; j += size) groups.push(span.slice(j, j + size));
  }

  return groups.map((g) => {
    const first = weeks[g[0]],
      lastIndex = g[g.length - 1],
      last = weeks[lastIndex];
    const milestone = milestoneIn(lastIndex);
    const interlude = special(g[0]);
    const outcomes = g.map((i) => weeks[i].evidence).filter((e) => e && !/^maintenance|^keep one skill/i.test(e));
    const title = clean(milestone?.title || outcomes.at(-1) || Object.values(first.topics)[0] || `Weeks ${g[0] + 1}–${lastIndex + 1}`);
    return {
      id: 'ch-' + first.id,
      weeks: g.map((i) => weeks[i].id),
      start: first.start_date,
      end: endOf(lastIndex),
      milestone: milestone?.title || null,
      interlude,
      title,
      outcome: outcomes.length ? `By the end: ${outcomes.map((o) => lower(clean(o))).join('; ')}.` : '',
    };
  });
}

const clean = (s: string) => s.replace(/^milestone \d+:\s*/i, '').replace(/\.$/, '').trim();
const lower = (s: string) => (/^[A-Z][a-z]/.test(s) ? s[0].toLowerCase() + s.slice(1) : s);

// A signature of the grouping, so cached names are dropped if the plan changes.
export const chapterKey = (list: Chapter[]) => list.map((c) => c.weeks.join('+')).join('|');
