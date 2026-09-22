import { Temporal } from '@js-temporal/polyfill';
import { monday, type Plan, type Session } from './plan';
import type { AppState, Revision, ScheduleEntry } from './types';
export function scheduled(
  s: Session,
  state: AppState,
): Session & { status: string } {
  const override = state.overrides[s.id];
  return override ? { ...s, ...override } : { ...s, status: 'planned' };
}
export function selectNext(state: AppState, today: string) {
  const plan = state.plan;
  if (!plan) return null;
  const completed = new Set(state.attempts.map((a) => a.session_id));
  const sessions = plan.sessions
    .map((s) => scheduled(s, state))
    .filter((s) => !completed.has(s.id) && s.status !== 'skipped')
    .sort(
      (a, b) =>
        a.date.localeCompare(b.date) ||
        a.start_local.localeCompare(b.start_local),
    );
  const draft = state.records
    .filter((r) => r.kind === 'draft' && r.data.stage !== 4)
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
    .find((r) => sessions.some((s) => s.id === r.data.sessionId));
  if (draft) {
    const s = sessions.find((s) => s.id === draft.data.sessionId)!;
    return {
      kind: 'resume' as const,
      session: s,
      reason: 'Pick up where you left off.',
      returning: false,
    };
  }
  const current =
    sessions.find((s) => s.date >= today) || sessions.find((s) => !s.optional);
  if (!current) return null;
  const missed = sessions.filter(
    (s) => s.date < today && !s.optional && s.status !== 'travel',
  );
  const prerequisite = current.prerequisite_ids
    .map((x) => sessions.find((s) => s.id === x))
    .find(Boolean);
  const candidate = prerequisite || current;
  return {
    kind: prerequisite ? ('prerequisite' as const) : ('lesson' as const),
    session: candidate,
    reason: prerequisite
      ? 'A useful foundation for the next lesson.'
      : missed.length >= 2
        ? 'Two learning days did not happen. Start with a short return.'
        : candidate.date > today
          ? 'Your next planned morning.'
          : 'One situation. Your decision.',
    returning: missed.length >= 2,
  };
}
export function weeklyConsistency(state: AppState, today: string) {
  const start = monday(today),
    end = Temporal.PlainDate.from(start).add({ days: 6 }).toString();
  const planned = new Set(
    state.plan?.sessions
      .map((s) => scheduled(s, state))
      .filter(
        (s) =>
          s.date >= start &&
          s.date <= end &&
          !s.optional &&
          s.status !== 'skipped' &&
          s.status !== 'travel',
      )
      .map((s) => s.date),
  );
  const done = new Set(
    state.attempts.filter((a) => planned.has(a.date)).map((a) => a.date),
  );
  return {
    done: done.size,
    total: planned.size,
    dates: [...planned].sort(),
    completed: [...done],
  };
}
export function shortRevision(
  state: AppState,
  sessionId: string,
  minutes: number,
  today: string,
): Revision {
  const s = state.plan?.sessions.find((s) => s.id === sessionId);
  if (!s) throw new Error('Session not found.');
  if (state.attempts.some((a) => a.session_id === sessionId))
    throw new Error('Finished work cannot be rescheduled.');
  if (today > state.plan!.end_date)
    throw new Error('Choose a date inside your plan.');
  const before = state.overrides[sessionId] || {
    date: s.date,
    start_local: s.start_local,
    duration_minutes: s.duration_minutes,
    status: 'planned' as const,
  };
  return {
    id: crypto.randomUUID(),
    reason:
      minutes < s.duration_minutes
        ? 'Less time today. Keep the objective, move the longer application, and drop the optional extension.'
        : 'You changed the learning window.',
    created_at: new Date().toISOString(),
    before: { [s.id]: before },
    after: {
      [s.id]: {
        ...before,
        date: today < state.plan!.start_date ? s.date : today,
        duration_minutes: minutes,
        status: minutes < s.duration_minutes ? 'reduced' : 'planned',
      },
    },
  };
}
export function moveRevision(
  state: AppState,
  sessionId: string,
  date: string,
  start_local: string,
): Revision {
  const s = state.plan?.sessions.find((s) => s.id === sessionId);
  if (!s) throw new Error('Session not found.');
  if (date < state.plan!.start_date || date > state.plan!.end_date)
    throw new Error('Choose a date inside your plan.');
  if (state.attempts.some((a) => a.session_id === sessionId))
    throw new Error('Finished work cannot be rescheduled.');
  const before = state.overrides[sessionId] || {
    date: s.date,
    start_local: s.start_local,
    duration_minutes: s.duration_minutes,
    status: 'planned' as const,
  };
  return {
    id: crypto.randomUUID(),
    reason:
      'You changed your availability. Friday stays open unless you choose it.',
    created_at: new Date().toISOString(),
    before: { [s.id]: before },
    after: { [s.id]: { ...before, date, start_local } },
  };
}
export function applyRevision(state: AppState, revision: Revision): AppState {
  if (state.revisions.some((r) => r.id === revision.id)) return state;
  return {
    ...state,
    overrides: { ...state.overrides, ...structuredClone(revision.after) },
    revisions: [...state.revisions, structuredClone(revision)],
  };
}
export function undoRevision(
  state: AppState,
  id: string,
  today: string,
): AppState {
  const r = state.revisions.find((x) => x.id === id);
  if (!r || r.undone_at) return state;
  const overrides = { ...state.overrides };
  for (const [sid, after] of Object.entries(r.after)) {
    if (after.date < today || state.attempts.some((a) => a.session_id === sid))
      continue;
    if (JSON.stringify(overrides[sid]) !== JSON.stringify(after))
      throw new Error(
        'This session was edited again. Review the newer change before undoing.',
      );
    overrides[sid] = r.before[sid];
  }
  return {
    ...state,
    overrides,
    revisions: state.revisions.map((x) =>
      x.id === id ? { ...x, undone_at: new Date().toISOString() } : x,
    ),
  };
}
export function recoveryRevision(state: AppState, today: string): Revision {
  if (!state.plan) throw new Error('Import a plan first.');
  const completed = new Set(state.attempts.map((a) => a.session_id));
  const future = state.plan.sessions
    .map((s) => scheduled(s, state))
    .filter((s) => !completed.has(s.id) && s.status !== 'skipped')
    .sort((a, b) => a.date.localeCompare(b.date));
  const missed = future.filter((s) => s.date < today && !s.optional);
  const before: Record<string, ScheduleEntry> = {},
    after: Record<string, ScheduleEntry> = {};
  const slots = future.filter((s) => s.date >= today && !s.optional);
  const essentials = [
    ...missed,
    ...future.filter((s) => s.date >= today && !s.optional),
  ];
  essentials.forEach((s, i) => {
    before[s.id] = {
      date: s.date,
      start_local: s.start_local,
      duration_minutes: s.duration_minutes,
      status: s.status as ScheduleEntry['status'],
    };
    const slot = slots[i];
    if (slot)
      after[s.id] = {
        date: slot.date,
        start_local: slot.start_local,
        duration_minutes: i === 0 ? 20 : slot.duration_minutes,
        status: i === 0 ? 'reduced' : 'planned',
      };
    else after[s.id] = { ...before[s.id], status: 'skipped' };
  });
  future
    .filter((s) => s.date < today && s.optional)
    .forEach((s) => {
      before[s.id] = {
        date: s.date,
        start_local: s.start_local,
        duration_minutes: s.duration_minutes,
        status: 'planned',
      };
      after[s.id] = { ...before[s.id], status: 'skipped' };
    });
  return {
    id: crypto.randomUUID(),
    reason:
      'Return with 20 minutes. Essential work moves into future learning slots. Optional work is dropped; later breadth may be reduced to preserve your finish date. No extra days or doubled mornings.',
    created_at: new Date().toISOString(),
    before,
    after,
  };
}
export function dueReview(state: AppState, today: string) {
  if (state.attempts.some((a) => a.review_of && a.date === today))
    return undefined;
  const intervals = Array.isArray(state.plan?.adaptation.review_day_offsets)
    ? (state.plan!.adaptation.review_day_offsets as number[])
    : [2, 7, 21];
  return state.attempts
    .filter((a) => !a.review_of && a.feedback.correct)
    .map((a) => {
      const reviews = state.attempts.filter((r) => r.review_of === a.id);
      const last = reviews.at(-1) || a;
      const offset = intervals[Math.min(reviews.length, intervals.length - 1)];
      return {
        attempt: a,
        due: Temporal.PlainDate.from(last.date)
          .add({ days: offset })
          .toString(),
        minutes: Math.min(
          10,
          Number(state.plan?.adaptation.review_cap_minutes) || 10,
        ),
      };
    })
    .filter((x) => x.due <= today)
    .sort((a, b) => a.due.localeCompare(b.due))[0];
}
export function demonstrated(state: AppState, objectiveId: string) {
  const evidence = state.attempts.filter(
    (a) =>
      a.objective_id === objectiveId &&
      a.feedback.correct &&
      a.feedback.independent &&
      !a.assisted,
  );
  return evidence.some((a) =>
    evidence.some(
      (b) => b.id !== a.id && b.date > a.date && b.transfer.trim().length > 15,
    ),
  );
}
