// XP, levels, streaks, daily quests and badges. Everything here is derived
// from what the learner actually did (answers, finished sessions, practice),
// so it can be recomputed at any time and never double-counts. Pure: the same functions run on the server and in tests.

import type { Beat, Confidence, Verdict } from './learning/run';

// Effort counts: a miss still earns XP, because showing up and trying is the
// habit worth building. Honest confidence earns a bonus either way.
export const XP = {
  answer: { solid: 15, partial: 10, missed: 5 } as Record<Verdict, number>,
  unknown: 5,
  calibrated: 5,
  finish: { session: 40, return: 40, review: 20, rehearsal: 40, explore: 15, practice: 30 } as Record<string, number>,
  quest: 20,
  allQuests: 30,
  badge: 50,
};

// Calibrated: certain and right, or guessing and wrong. Knowing when you know.
export const calibrated = (score: number, confidence?: Confidence | null) =>
  (confidence === 'high' && score >= 0.75) || (confidence === 'low' && score < 0.4);

export function answerXp(verdict: Verdict, confidence?: Confidence | null, unknown?: boolean, score?: number) {
  if (unknown) return XP.unknown;
  const s = score ?? (verdict === 'solid' ? 1 : verdict === 'partial' ? 0.5 : 0);
  return XP.answer[verdict] + (calibrated(s, confidence) ? XP.calibrated : 0);
}

// XP earned in one session so far, from the answers graded.
export function sessionXp(beats: Beat[]) {
  return beats.reduce(
    (n, b) => n + (b.feedback ? answerXp(b.feedback.verdict, b.response?.confidence, b.response?.unknown, b.feedback.score) : 0),
    0,
  );
}

// Level n needs 50·n·(n+1) XP in total: 100, 300, 600, 1000…
export const levelFloor = (level: number) => 50 * (level - 1) * level;
export function levelOf(xp: number) {
  let level = 1;
  while (levelFloor(level + 1) <= xp) level++;
  const floor = levelFloor(level),
    next = levelFloor(level + 1);
  return { level, floor, next, into: xp - floor, span: next - floor, rank: rankOf(level) };
}
const RANKS = ['Novice', 'Apprentice', 'Practitioner', 'Analyst', 'Strategist', 'Operator', 'Principal'];
export const rankOf = (level: number) => RANKS[Math.min(RANKS.length - 1, Math.floor(level / 5))];

// ---------- Activity, as the server gathers it ----------

export type AnswerEvent = { date: string; score: number | null; kind: string; confidence?: Confidence | null; unknown?: boolean };
export type FinishedRun = { date: string; kind: string };
export type Activity = {
  today: string; // local date
  answers: AnswerEvent[];
  runs: FinishedRun[];
  requiredDays: string[]; // dates with a planned, non-optional session
  learningDay: boolean; // today has a planned session
  weekly?: boolean; // a rolling plan: the streak counts weeks, not days
};

// ---------- Streak ----------

// Consecutive planned learning days with some learning on them. Days without
// a planned session (Fridays, weekends, travel) never break a streak; learning
// on them still counts. Today only counts once something is done.
export function streak(a: Activity) {
  const active = new Set([...a.answers.map((e) => e.date), ...a.runs.map((r) => r.date)]);
  const required = new Set(a.requiredDays);
  const first = [...active].sort()[0];
  if (!first) return { current: 0, best: 0, todayDone: false };
  const days: string[] = [];
  for (let d = first; d <= a.today; d = addDays(d, 1)) days.push(d);
  let run = 0,
    best = 0;
  for (const d of days) {
    if (active.has(d)) run++;
    else if (required.has(d) && d !== a.today) run = 0;
    best = Math.max(best, run);
  }
  return { current: run, best, todayDone: active.has(a.today) };
}

// A rolling plan's streak counts weeks: a week keeps it going once you've
// learned on two days of it. A week with nothing planned (away) neither adds
// nor breaks, and the current week never breaks it while it's still going.
export function weeklyStreak(a: Activity) {
  const active = new Set([...a.answers.map((e) => e.date), ...a.runs.map((r) => r.date)]);
  const required = new Set(a.requiredDays);
  const first = [...active].sort()[0];
  if (!first) return { current: 0, best: 0, todayDone: false };
  const now = mondayOf(a.today);
  let run = 0,
    best = 0;
  for (let w = mondayOf(first); w <= now; w = addDays(w, 7)) {
    const days = Array.from({ length: 7 }, (_, i) => addDays(w, i));
    const learned = days.filter((d) => active.has(d)).length;
    const planned = days.some((d) => required.has(d));
    if (learned >= 2 || (learned >= 1 && !planned)) run++;
    else if (w !== now && planned) run = 0;
    best = Math.max(best, run);
  }
  return { current: run, best, todayDone: active.has(a.today) };
}
const mondayOf = (date: string) => addDays(date, -((new Date(date + 'T12:00:00Z').getUTCDay() + 6) % 7));

export function addDays(date: string, n: number) {
  const t = new Date(date + 'T12:00:00Z');
  t.setUTCDate(t.getUTCDate() + n);
  return t.toISOString().slice(0, 10);
}

// ---------- Daily quests ----------

export type Quest = { id: string; label: string; target: number; progress: number; done: boolean; xp: number };
type QuestDef = { id: string; label: string; target: number; count: (day: DayActivity) => number };
type DayActivity = { answers: AnswerEvent[]; runs: FinishedRun[] };

const POOL: QuestDef[] = [
  { id: 'solid3', label: 'Get 3 solid answers', target: 3, count: (d) => d.answers.filter((e) => (e.score ?? 0) >= 0.75).length },
  {
    id: 'calibrated2',
    label: 'Call it right twice: certain and correct',
    target: 2,
    count: (d) => d.answers.filter((e) => e.confidence === 'high' && (e.score ?? 0) >= 0.75).length,
  },
  { id: 'review2', label: 'Bring back 2 fading ideas', target: 2, count: (d) => d.answers.filter((e) => e.kind === 'recall').length },
  { id: 'transfer', label: 'Use an idea in a new situation', target: 1, count: (d) => d.answers.filter((e) => e.kind === 'transfer' && (e.score ?? 0) >= 0.6).length },
  { id: 'practice', label: 'Practise a conversation out loud', target: 1, count: (d) => d.runs.filter((r) => r.kind === 'practice').length },
  { id: 'answers6', label: 'Answer 6 questions', target: 6, count: (d) => d.answers.length },
];
const SESSION: QuestDef = {
  id: 'session',
  label: 'Finish today’s session',
  target: 1,
  count: (d) => d.runs.filter((r) => r.kind === 'session' || r.kind === 'return').length,
};
const ANY: QuestDef = { id: 'show-up', label: 'Learn something today', target: 1, count: (d) => d.answers.length + d.runs.length };

// Small, stable pseudo-random choice per day.
function seeded(date: string) {
  let h = 2166136261;
  for (const c of date) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return () => ((h = Math.imul(h ^ (h >>> 15), 2246822507)) >>> 0) / 4294967296;
}
export function questsFor(date: string, learningDay: boolean, day: DayActivity): Quest[] {
  const rand = seeded(date);
  const pool = [...POOL].sort(() => rand() - 0.5);
  const defs = [learningDay ? SESSION : ANY, ...pool.slice(0, 2)];
  return defs.map((q) => {
    const progress = Math.min(q.target, q.count(day));
    return { id: q.id, label: q.label, target: q.target, progress, done: progress >= q.target, xp: XP.quest };
  });
}

// ---------- Badges ----------

export type Badge = { id: string; label: string; detail: string; earned: boolean };
function badges(a: Activity, s: { best: number }, level: number): Badge[] {
  const solid = a.answers.filter((e) => (e.score ?? 0) >= 0.75).length;
  const certainRight = a.answers.filter((e) => e.confidence === 'high' && (e.score ?? 0) >= 0.75).length;
  const sessions = a.runs.filter((r) => r.kind === 'session' || r.kind === 'return').length;
  const b = (id: string, label: string, detail: string, earned: boolean): Badge => ({ id, label, detail, earned });
  // Streak badges stay earned however the streak is counted: a day streak
  // earned before a plan went weekly still counts, so no XP is ever lost.
  const days = streak(a).best,
    weeks = a.weekly ? weeklyStreak(a).best : 0;
  return [
    b('first-session', 'First light', 'Finish your first session', sessions >= 1),
    b('ten-sessions', 'Regular', 'Finish 10 sessions', sessions >= 10),
    b('streak-5', 'On a roll', a.weekly ? '3 weeks in a row' : 'A 5-day learning streak', s.best >= 5 || days >= 5 || weeks >= 3),
    b('streak-20', 'Unbroken', a.weekly ? '8 weeks in a row' : 'A 20-day learning streak', s.best >= 20 || days >= 20 || weeks >= 8),
    b('solid-25', 'Sharp', '25 solid answers', solid >= 25),
    b('calibrated-10', 'Knows what they know', '10 answers that were certain and correct', certainRight >= 10),
    b('honest', 'Honest start', 'Say “I don’t know yet” and learn it', a.answers.some((e) => e.unknown)),
    b('practice', 'Said it out loud', 'Finish a practice conversation', a.runs.some((r) => r.kind === 'practice')),
    b('level-5', 'Apprentice', 'Reach level 5', level >= 5),
    b('level-10', 'Practitioner', 'Reach level 10', level >= 10),
  ];
}

// ---------- Everything together ----------

export function progress(a: Activity) {
  const byDay = new Map<string, DayActivity>();
  const day = (d: string) => {
    let v = byDay.get(d);
    if (!v) byDay.set(d, (v = { answers: [], runs: [] }));
    return v;
  };
  a.answers.forEach((e) => day(e.date).answers.push(e));
  a.runs.forEach((r) => day(r.date).runs.push(r));
  const required = new Set(a.requiredDays);

  let xp = 0,
    todayXp = 0;
  const add = (date: string, n: number) => {
    xp += n;
    if (date === a.today) todayXp += n;
  };
  for (const e of a.answers) {
    const score = e.score ?? 0;
    const verdict: Verdict = score >= 0.75 ? 'solid' : score >= 0.4 ? 'partial' : 'missed';
    add(e.date, answerXp(verdict, e.confidence, e.unknown, score));
  }
  for (const r of a.runs) add(r.date, XP.finish[r.kind] || 0);
  for (const [d, v] of byDay) {
    const qs = questsFor(d, required.has(d), v);
    const done = qs.filter((q) => q.done).length;
    add(d, done * XP.quest + (done === qs.length ? XP.allQuests : 0));
  }
  // Badges are worth XP too; their XP can lift the level, which can earn a
  // level badge, so settle in two passes.
  const s = a.weekly ? weeklyStreak(a) : streak(a);
  let earned = badges(a, s, levelOf(xp).level).filter((b) => b.earned).length;
  earned = badges(a, s, levelOf(xp + earned * XP.badge).level).filter((b) => b.earned).length;
  xp += earned * XP.badge;
  const lv = levelOf(xp);
  return {
    xp,
    todayXp,
    ...lv,
    streak: { ...s, unit: a.weekly ? ('week' as const) : ('day' as const) },
    quests: questsFor(a.today, a.learningDay, day(a.today)),
    badges: badges(a, s, lv.level),
  };
}
export type Progress = ReturnType<typeof progress>;
