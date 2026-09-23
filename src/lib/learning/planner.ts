// Adaptive session planning. Instead of fixing the whole session at Begin, the
// planner decides the next step from what has happened so far: how each
// answer went, how familiar each idea is, and how much real time is left. It
// is pure and deterministic, so the session stays predictable and testable;
// the tutor still writes every step's content.
//
// Questions are the decision points. After a question is graded the planner
// looks at the verdict and picks what comes next; teaching steps are planned
// ahead so the next one can be prepared while the learner reads.

import type { BeatType, OutlineBeat } from './outline';

export type Familiarity = 'new' | 'familiar' | 'fluent';
export type Gauge = 'new' | 'heard' | 'used';
export const GAUGE_FAMILIARITY: Record<Gauge, Familiarity> = { new: 'new', heard: 'familiar', used: 'fluent' };

export type Step = {
  type: BeatType;
  concept?: string;
  status: 'pending' | 'generating' | 'ready' | 'answered' | 'done' | 'skipped';
  verdict?: 'solid' | 'partial' | 'missed';
  // "I don't know yet" — a miss that is really a request to be taught.
  unknown?: boolean;
  minutes: number;
};

export type PlanInput = {
  kind: 'session' | 'return';
  minutes: number; // the time budget
  elapsed: number; // active minutes spent so far
  track?: string;
  concepts: string[]; // today's concepts, main first
  familiarity: Record<string, Familiarity | undefined>;
  dueReviews: string[]; // ideas due for retrieval, highest priority first
  ahead: string[]; // the next planned ideas, which can be pulled forward
  steps: Step[]; // everything planned so far, in order
  evidence?: string;
  voice?: boolean;
  wrap?: boolean; // the learner asked to wrap up
};

// What each kind of step realistically takes, in minutes. These are
// deliberately honest (reading 120 words is not six minutes); the planner
// corrects them further by the learner's measured pace.
export const EST: Record<BeatType, number> = {
  gauge: 0.5,
  recall: 2,
  situation: 2,
  orient: 4,
  explain: 3,
  worked: 5,
  check: 2,
  attempt: 5,
  transfer: 4,
  roleplay: 12,
  produce: 15,
  break: 5,
  recap: 2,
};
const RECAP = EST.recap;
const MAX_STEPS = 48;
const QUESTIONS = new Set<BeatType>(['recall', 'check', 'attempt', 'transfer', 'produce']);
const TEACH = new Set<BeatType>(['orient', 'explain', 'worked']);

let seq = 0;
const beat = (type: BeatType, intent: string, concept?: string): OutlineBeat => ({
  id: `${type}-${Date.now().toString(36)}${(++seq).toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
  type,
  minutes: EST[type],
  intent,
  ...(concept ? { concept } : {}),
});

const open = (s: Step) => s.status === 'pending' || s.status === 'generating' || s.status === 'ready';
const finished = (s: Step) => s.status === 'done' || s.status === 'skipped' || s.status === 'answered';

// How fast this learner moves relative to the estimates, from finished steps.
export function pace(i: PlanInput) {
  const done = i.steps.filter((s) => finished(s) && s.type !== 'break');
  const expected = done.reduce((n, s) => n + EST[s.type], 0);
  if (expected < 6) return 1;
  return Math.min(2, Math.max(0.5, i.elapsed / expected));
}

// Minutes left once everything already planned (but not yet done) is paid for.
export function remaining(i: PlanInput) {
  const p = pace(i);
  const committed = i.steps.filter(open).reduce((n, s) => n + EST[s.type] * (s.type === 'break' ? 1 : p), 0);
  return i.minutes - i.elapsed - committed;
}

type ConceptView = {
  key: string;
  f: Familiarity | undefined;
  steps: Step[];
  has: (t: BeatType) => boolean;
  graded: Step[];
  solids: number;
  lastMissed: boolean;
  retaught: number;
};

function view(key: string, i: PlanInput): ConceptView {
  const steps = i.steps.filter((s) => s.concept === key);
  const graded = steps.filter((s) => QUESTIONS.has(s.type) && (s.verdict || s.unknown));
  const solids = graded.filter((s) => s.verdict === 'solid').length;
  const last = graded.at(-1);
  const lastMissed = !!last && (last.unknown || last.verdict === 'missed');
  // Teaching steps after the first question are re-teaching.
  const firstQ = steps.findIndex((s) => QUESTIONS.has(s.type));
  const retaught = firstQ < 0 ? 0 : steps.slice(firstQ).filter((s) => TEACH.has(s.type)).length;
  const has = (t: BeatType) => steps.some((s) => s.type === t && s.status !== 'skipped');
  return { key, f: i.familiarity[key], steps, has, graded, solids, lastMissed, retaught };
}

// Everything after the latest question that has not been graded is still
// open; the planner only looks past a question once it has an answer.
function waitingOnQuestion(i: PlanInput) {
  return i.steps.some((s) => QUESTIONS.has(s.type) && !s.verdict && !s.unknown && s.status !== 'skipped');
}

// The next step for one concept, or null when it has had its turn.
function conceptStep(c: ConceptView, i: PlanInput, main: boolean, left: number): OutlineBeat | null {
  const k = c.key;
  if (c.f === undefined && !c.has('gauge')) return beat('gauge', 'Ask how familiar this idea is before teaching it.', k);
  if (!c.has('situation'))
    return beat(
      'situation',
      main
        ? c.f === 'new'
          ? 'Open on a short, concrete situation that shows why this idea matters. The learner is new to it: ask nothing of them yet, use no unexplained terms, and end by saying what they will be able to handle by the end.'
          : 'Open on a realistic situation that makes the objective matter.'
        : 'Bridge into the next idea with a short situation that shows why it matters.',
      k,
    );
  const f = c.f || 'familiar';
  if (f === 'new') {
    if (!c.has('orient'))
      return beat('orient', 'Orient a newcomer: what this idea is, why it exists, where it fits, and the few terms they will meet. No questions.', k);
    if (!c.has('worked'))
      return beat('worked', 'A worked example: solve the situation step by step, thinking aloud, so the learner sees the method before using it.', k);
  } else if (f === 'familiar' && !c.has('explain') && !c.graded.length) {
    return beat('explain', 'Explain the one idea needed to resolve the situation.', k);
  }
  if (!c.graded.length && !c.has('check'))
    return beat(
      'check',
      f === 'new'
        ? 'An easy first decision: a faded version of the worked example where the learner completes the final step.'
        : f === 'fluent'
          ? 'A harder decision that exposes nuance; if they get it, there is no need to teach the basics.'
          : 'A decision that tests the idea just explained.',
      k,
    );
  // Struggling: teach again from a different angle, then check again.
  if (c.lastMissed && c.retaught < 2) {
    const worked = f === 'new' || c.graded.at(-1)?.unknown || c.retaught === 1;
    if (!c.steps.slice(-1).some((s) => TEACH.has(s.type)))
      return worked
        ? beat('worked', 'Another worked example from a different angle, aimed squarely at the gap the last answer showed.', k)
        : beat('explain', 'Re-explain from a different angle, aimed at the gap the last answer showed. Shorter than before.', k);
    return beat('check', 'Check the same idea again in a fresh, simpler situation after the re-teaching.', k);
  }
  if (c.lastMissed) return null; // taught three ways; review will bring it back
  if (!c.has('attempt') && left >= EST.attempt)
    return beat('attempt', 'The learner explains their reasoning or produces a small output; guided if needed.', k);
  if (!c.has('transfer') && left >= EST.transfer)
    return beat('transfer', 'The same idea in a changed situation, so they must transfer it.', k);
  const communication = /communicat|leader|convers|negotiat|delegat|speak|present/i.test(i.track || '');
  if (main && communication && i.voice && !c.has('roleplay') && left >= EST.roleplay)
    return beat('roleplay', 'Spoken role-play applying the skill with a realistic counterpart.', k);
  return null;
}

// The planner's single decision: what should the learner do next?
export function nextStep(i: PlanInput): OutlineBeat | null {
  const last = i.steps.at(-1);
  if (last?.type === 'recap') return null;
  if (i.wrap || i.steps.length >= MAX_STEPS) return beat('recap', 'Close the session.');
  if (waitingOnQuestion(i)) return null;
  const left = remaining(i) - RECAP;
  const p = pace(i);
  const fits = (t: BeatType) => left >= EST[t] * (t === 'break' ? 1 : p);
  const main = i.concepts[0];

  // Warm up on something fading, before today's idea.
  if (!i.steps.length && i.dueReviews.length && i.minutes >= 30)
    return beat('recall', 'Warm-up retrieval of an earlier idea that is starting to fade.', i.dueReviews[0]);

  // A short break in long sessions, between steps rather than mid-idea.
  const sinceBreak = (() => {
    let t = 0;
    for (let j = i.steps.length - 1; j >= 0 && i.steps[j].type !== 'break'; j--) t += EST[i.steps[j].type] * p;
    return t;
  })();
  const midIdea = !!last && (TEACH.has(last.type) || last.type === 'situation' || last.type === 'gauge');
  if (i.minutes >= 60 && sinceBreak >= 50 && !midIdea && left >= 20) return beat('break', 'Short break.');

  const tryConcept = (k: string, isMain: boolean) => {
    const next = conceptStep(view(k, i), i, isMain, left);
    return next && (fits(next.type) || next.type === 'gauge') ? next : null;
  };

  // Today's ideas, in order.
  for (const [n, k] of i.concepts.entries()) {
    const next = tryConcept(k, n === 0);
    if (next) return next;
    // A later idea waits until the first one has at least been practised.
    if (!view(k, i).graded.length) break;
  }
  // The week's evidence, once the main idea has been practised.
  if (i.evidence && main && !i.steps.some((s) => s.type === 'produce') && view(main, i).solids && fits('produce'))
    return beat('produce', `Produce this week’s evidence: ${i.evidence}`, main);
  // Ahead of time: interleave a review of something fading…
  const reviewed = new Set(i.steps.filter((s) => s.type === 'recall').map((s) => s.concept));
  const review = i.dueReviews.find((k) => !reviewed.has(k) && !i.concepts.includes(k));
  if (review && fits('recall') && reviewed.size < 3)
    return beat('recall', 'Spaced retrieval of an earlier idea, in a fresh mini-situation.', review);
  // …then pull the next planned idea forward, so being fast means getting ahead.
  for (const k of i.ahead.slice(0, 2)) {
    if (i.concepts.includes(k)) continue;
    const c = view(k, i);
    const next = conceptStep(c, i, false, left);
    if (next && (fits(next.type) || next.type === 'gauge') && (c.steps.length || left >= 12)) return next;
    if (c.steps.length && !c.graded.length) break;
  }
  // Still time: a harder, more open application of today's main idea.
  const challenges = i.steps.filter((s) => s.type === 'transfer' && s.concept === main).length;
  if (main && challenges < 3 && fits('transfer'))
    return beat('transfer', 'A harder, more open application that stretches the idea into a new domain.', main);
  return beat('recap', 'Close the session.');
}

// Plan ahead up to (and including) the next question, the next decision point.
export function extend(i: PlanInput, max = 4): OutlineBeat[] {
  const out: OutlineBeat[] = [];
  const steps = [...i.steps];
  for (let n = 0; n < max; n++) {
    const next = nextStep({ ...i, steps });
    if (!next) break;
    out.push(next);
    steps.push({ type: next.type, concept: next.concept, status: 'pending', minutes: next.minutes });
    if (QUESTIONS.has(next.type) || next.type === 'recap' || next.type === 'gauge' || next.type === 'roleplay') break;
  }
  return out;
}

// A likely shape for Today's preview: the session as it would go if every
// answer were solid, at the estimated pace.
export function preview(i: Omit<PlanInput, 'steps' | 'elapsed'>) {
  const steps: Step[] = [];
  let elapsed = 0;
  const familiarity = { ...i.familiarity };
  for (let n = 0; n < 30; n++) {
    const next = nextStep({ ...i, familiarity, steps, elapsed });
    if (!next) break;
    if (next.type === 'gauge') {
      if (next.concept) familiarity[next.concept] = 'new';
      steps.push({ type: 'gauge', concept: next.concept, status: 'done', minutes: next.minutes });
      continue;
    }
    steps.push({
      type: next.type,
      concept: next.concept,
      status: 'done',
      minutes: next.minutes,
      ...(QUESTIONS.has(next.type) ? { verdict: 'solid' as const } : {}),
    });
    elapsed += next.minutes;
    if (next.type === 'recap') break;
  }
  return steps;
}
