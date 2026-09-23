// The learner model for one concept: knowledge tracing (is the idea learned?)
// combined with a forgetting curve (how likely is it to be recalled today?).
// Pure functions so they run identically on the server and in tests.

export type ConceptState = {
  concept_key: string;
  p_known: number; // probability the idea has been learned, 0..1
  stability: number; // days until recall probability falls to ~90%
  difficulty: number; // 0 easy .. 1 hard, as experienced by this learner
  exposures: number;
  successes: number;
  lapses: number;
  last_seen_at: string | null;
  last_recall_at: string | null;
  due_at: string | null;
  misconceptions: { text: string; at: string; resolved?: boolean }[];
};

export type Evidence = {
  kind:
    | 'recall'
    | 'check'
    | 'explain'
    | 'transfer'
    | 'attempt'
    | 'roleplay'
    | 'exposure'
    | 'project'
    | 'self_report';
  score?: number; // 0..1, absent for exposure
  assisted?: boolean;
  options?: number; // multiple choice: number of options (sets guess rate)
  misconception?: string | null;
  at: string;
};

const DAY = 86400000;
const clamp = (x: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, x));

export function fresh(concept_key: string): ConceptState {
  return {
    concept_key,
    p_known: 0.15,
    stability: 0,
    difficulty: 0.5,
    exposures: 0,
    successes: 0,
    lapses: 0,
    last_seen_at: null,
    last_recall_at: null,
    due_at: null,
    misconceptions: [],
  };
}

// Power-law forgetting curve: R(stability) = 0.9.
export function retrievability(s: ConceptState, now: string | number | Date) {
  if (!s.last_seen_at || s.stability <= 0) return s.exposures ? 0.6 : 0;
  const days = Math.max(0, (new Date(now).getTime() - new Date(s.last_seen_at).getTime()) / DAY);
  return Math.pow(1 + days / (9 * s.stability), -1);
}

// What the learner can likely do right now.
export function strength(s: ConceptState, now: string | number | Date) {
  if (!s.exposures) return 0;
  return clamp(s.p_known * (0.35 + 0.65 * retrievability(s, now)));
}

export type Level = 'new' | 'learning' | 'practiced' | 'solid' | 'mastered';
export function level(s: ConceptState, now: string | number | Date): Level {
  if (!s.exposures) return 'new';
  const r = retrievability(s, now);
  if (s.p_known >= 0.9 && s.stability >= 21 && r >= 0.8) return 'mastered';
  if (s.p_known >= 0.8 && s.stability >= 6 && r >= 0.7) return 'solid';
  if (s.p_known >= 0.55) return 'practiced';
  return 'learning';
}

// Knowledge-tracing parameters. Tests and transfer are stronger evidence than
// a multiple-choice check that could be guessed.
const SLIP = 0.1,
  LEARN = 0.12;
const guessRate = (e: Evidence) =>
  e.kind === 'check' ? 1 / Math.max(2, e.options || 3) : e.kind === 'self_report' ? 0.5 : 0.08;

export function update(prev: ConceptState, e: Evidence): ConceptState {
  const s: ConceptState = {
    ...prev,
    misconceptions: [...prev.misconceptions],
  };
  const now = e.at;
  s.exposures += 1;

  if (e.kind === 'exposure' || e.score === undefined) {
    // Being taught moves knowledge a little; it is not evidence of recall.
    s.p_known = clamp(s.p_known + (1 - s.p_known) * LEARN);
    if (s.stability === 0) s.stability = 0.6;
    s.last_seen_at = now;
    s.due_at = scheduleDue(s, now);
    return s;
  }

  const score = clamp(e.score);
  const R = retrievability(prev, now);
  // Prior probability of a correct response given learned-ness and decay.
  const pKnowNow = prev.exposures ? clamp(prev.p_known * (0.3 + 0.7 * Math.max(R, 0.5))) : prev.p_known;
  const g = guessRate(e);
  const postCorrect = (pKnowNow * (1 - SLIP)) / (pKnowNow * (1 - SLIP) + (1 - pKnowNow) * g);
  const postWrong = (pKnowNow * SLIP) / (pKnowNow * SLIP + (1 - pKnowNow) * (1 - g));
  // Graded scores are soft evidence.
  let posterior = score * postCorrect + (1 - score) * postWrong;
  // Help received halves the weight of the evidence.
  if (e.assisted) posterior = pKnowNow + (posterior - pKnowNow) * 0.5;
  // Feedback after the attempt is itself a learning opportunity.
  s.p_known = clamp(posterior + (1 - posterior) * LEARN * (score < 0.6 ? 1 : 0.5));

  const retrieval = !!prev.last_seen_at && new Date(now).getTime() - new Date(prev.last_seen_at).getTime() > 0.4 * DAY;
  s.difficulty = clamp(s.difficulty + (0.55 - score) * 0.12, 0.05, 0.95);
  if (score >= 0.6) {
    s.successes += 1;
    if (!retrieval || prev.stability < 1) {
      s.stability = Math.max(prev.stability, 1.2 + 1.3 * score);
    } else {
      // Desirable difficulty: success after more forgetting grows memory more.
      const growth = 1 + (2.2 - 1.2 * s.difficulty) * score * (0.6 + (1 - R) * 3);
      s.stability = Math.min(365, prev.stability * growth);
    }
    if (e.kind === 'transfer' || e.kind === 'project') s.stability *= 1.15;
  } else if (score < 0.4) {
    if (retrieval) s.lapses += 1;
    s.stability = Math.max(0.5, prev.stability * 0.35);
  } else {
    s.stability = Math.max(0.8, prev.stability * 1.1);
  }
  if (e.misconception) {
    s.misconceptions = [
      ...s.misconceptions.filter((m) => m.text !== e.misconception),
      { text: e.misconception, at: now },
    ].slice(-5);
  } else if (score >= 0.8) {
    // A clean success in a changed situation retires old misconceptions.
    s.misconceptions = s.misconceptions.map((m) =>
      e.kind === 'transfer' || e.kind === 'recall' ? { ...m, resolved: true } : m,
    );
  }
  if (retrieval || e.kind === 'recall') s.last_recall_at = now;
  s.last_seen_at = now;
  s.due_at = scheduleDue(s, now);
  return s;
}

// Next review when recall probability is expected to reach ~90%, sooner while
// the idea is still shaky. Never less than a few hours.
export function scheduleDue(s: ConceptState, now: string) {
  const days = s.p_known < 0.5 ? Math.min(1, s.stability) : s.stability;
  return new Date(new Date(now).getTime() + Math.max(0.25, days) * DAY).toISOString();
}

// Review priority: overdue, fragile, important-to-upcoming-work concepts first.
export function reviewPriority(
  s: ConceptState,
  now: string,
  upcomingDependents = 0,
) {
  if (!s.exposures || !s.due_at) return 0;
  const overdueDays = (new Date(now).getTime() - new Date(s.due_at).getTime()) / DAY;
  if (overdueDays < -0.5) return 0;
  const R = retrievability(s, now);
  const open = s.misconceptions.filter((m) => !m.resolved).length;
  return (1 - R) * 2 + Math.min(overdueDays, 14) * 0.08 + upcomingDependents * 0.3 + open * 0.4 + s.lapses * 0.15;
}

// The plan's rule: demonstrated = an independent success, then a later success
// in a changed situation.
export function demonstrated(events: { kind: string; score: number | null; assisted: boolean; created_at: string }[]) {
  const wins = events
    .filter((e) => !e.assisted && (e.score ?? 0) >= 0.7)
    .sort((a, b) => a.created_at.localeCompare(b.created_at));
  if (wins.length < 2) return false;
  return wins.slice(1).some((w) => w.kind === 'transfer' || w.kind === 'project' || w.kind === 'recall');
}
