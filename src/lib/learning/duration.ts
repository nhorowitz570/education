// How long a run really took. Every interaction moves the run's clock forward
// by the time since the last one, capped, so stepping away (or opening a
// session in the morning and finishing it at night) doesn't count as study.
export const IDLE_MS = 12 * 60000;

export type Clock = { last: string; active_ms: number };
type Timed = {
  started_at: string;
  ended_at?: string | null;
  updated_at?: string | null;
  minutes_planned?: number | null;
  context?: { clock?: Clock } | null;
};

export function activeMs(r: Timed, at = Date.now()) {
  const c = r.context?.clock;
  // A finished run stops its clock at the moment it ended.
  const end = r.ended_at ? Math.min(at, Date.parse(r.ended_at)) : at;
  if (c) return c.active_ms + Math.max(0, Math.min(end - Date.parse(c.last), IDLE_MS));
  // Runs from before every run kept a clock: wall time, capped so a tab left
  // open overnight isn't counted.
  const wall = Math.max(0, (r.ended_at ? Date.parse(r.ended_at) : Date.parse(r.updated_at || r.started_at)) - Date.parse(r.started_at));
  return Math.min(wall, Math.max(20, (r.minutes_planned || 30) * 1.6) * 60000);
}

export const activeMinutes = (r: Timed, at = Date.now()) => activeMs(r, at) / 60000;

// What is actually left, not what the budget says. The steps still to come
// are sized by the planner's estimates, corrected by this learner's measured
// pace. Until the plan reaches its wrap-up, more steps will be planned to fill
// the time, so the budget is the floor; once the recap is planned (or the
// learner wrapped up), only the remaining steps count.
type Step = { type: string; minutes: number; status: string; optional?: boolean };
export function minutesLeft(beats: Step[], index: number, elapsed: number, budget: number, wrapping: boolean) {
  const doneSteps = beats.slice(0, index).filter((b) => b.type !== 'break' && b.status !== 'skipped');
  const expected = doneSteps.reduce((n, b) => n + b.minutes, 0);
  const pace = expected >= 6 ? Math.min(2, Math.max(0.5, elapsed / expected)) : 1;
  const ahead = beats.slice(index).filter((b) => !(b.optional && b.status === 'pending') && b.status !== 'skipped');
  // The step on screen is partly done already; count half of it.
  const committed = ahead.reduce((n, b, i) => n + b.minutes * (b.type === 'break' ? 1 : pace) * (i === 0 ? 0.5 : 1), 0);
  const planned = wrapping || beats.some((b) => b.type === 'recap');
  return planned ? committed : Math.max(committed, budget - elapsed);
}
