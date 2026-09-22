import { Temporal } from '@js-temporal/polyfill';
import type { AppState } from './types';
export function reminderCandidate(state: AppState, now = new Date()) {
  const p = state.plan,
    prefs = state.records.find((r) => r.id === 'settings:reminders')?.data;
  if (!p || !prefs?.enabled || prefs.travel) return null;
  const local = Temporal.Instant.fromEpochMilliseconds(
      now.getTime(),
    ).toZonedDateTimeISO(p.schedule.timezone),
    date = local.toPlainDate().toString(),
    time = local.toPlainTime().toString().slice(0, 5);
  if (date < p.start_date || date > p.end_date) return null;
  const travel = p.schedule.travel_window;
  if (travel && date >= travel.start && date <= travel.end) return null;
  const planned = p.sessions.filter(
    (s) =>
      (state.overrides[s.id]?.date || s.date) === date &&
      !s.optional &&
      !['skipped', 'travel'].includes(state.overrides[s.id]?.status),
  );
  if (!planned.length) return null;
  const start = String(prefs.quietStart || '21:00'),
    end = String(prefs.quietEnd || '08:00');
  if (start > end ? time >= start || time < end : time >= start && time < end)
    return null;
  const hasStarted =
    state.attempts.some((a) => a.date === date) ||
    state.records.some(
      (r) =>
        r.kind === 'draft' &&
        r.updated_at.slice(0, 10) >= date &&
        planned.some((s) => s.id === r.data.sessionId),
    );
  if (hasStarted) return null;
  const due = (target: string) => {
    const m = Temporal.PlainTime.from(target).until(local.toPlainTime(), {
      largestUnit: 'minutes',
    }).minutes;
    return m >= 0 && m < 15;
  };
  const kind = due(String(prefs.morning || '09:45'))
    ? 'morning'
    : due(String(prefs.followup || '10:30'))
      ? 'followup'
      : null;
  return kind ? { key: `${date}:${kind}`, date, kind } : null;
}
