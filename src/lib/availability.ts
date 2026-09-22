import { Temporal } from '@js-temporal/polyfill';
import { instantFor, type Session } from './plan';
import type { AppState } from './types';
export type BusyInterval = { start: string; end: string };
export function overlap(a: BusyInterval, b: BusyInterval) {
  return (
    Date.parse(a.start) < Date.parse(b.end) &&
    Date.parse(b.start) < Date.parse(a.end)
  );
}
export function allBusy(state: AppState, calendar: BusyInterval[] = []) {
  const zone = state.plan?.schedule.timezone || 'America/Los_Angeles';
  return [
    ...calendar,
    ...state.records
      .filter((r) => r.kind === 'busy')
      .map((r) => ({
        start: instantFor(String(r.data.date), String(r.data.start), zone),
        end: instantFor(String(r.data.date), String(r.data.end), zone),
      })),
  ];
}
export function sessionInterval(
  state: AppState,
  date: string,
  time: string,
  minutes: number,
) {
  const start = instantFor(date, time, state.plan!.schedule.timezone);
  return {
    start,
    end: Temporal.Instant.from(start)
      .add({ seconds: minutes * 60 })
      .toString(),
  };
}
export function openSlot(
  state: AppState,
  session: Session,
  from: string,
  calendar: BusyInterval[] = [],
) {
  const p = state.plan;
  if (!p) return null;
  const busy = allBusy(state, calendar);
  let date = Temporal.PlainDate.from(from < p.start_date ? p.start_date : from);
  for (
    let days = 0;
    days < 35 && date.toString() <= p.end_date;
    days++, date = date.add({ days: 1 })
  ) {
    if (!p.schedule.weekdays.includes(date.dayOfWeek - 1)) continue;
    const travel = p.schedule.travel_window;
    if (
      travel &&
      date.toString() >= travel.start &&
      date.toString() <= travel.end
    )
      continue;
    let time = Temporal.PlainTime.from(p.schedule.start_local);
    for (let step = 0; step < 16; step++, time = time.add({ minutes: 15 })) {
      const end = time.add({ minutes: session.duration_minutes });
      if (
        Temporal.PlainTime.compare(
          end,
          Temporal.PlainTime.from(p.schedule.end_local),
        ) > 0 ||
        Temporal.PlainTime.compare(end, time) < 0
      )
        break;
      const entry = sessionInterval(
        state,
        date.toString(),
        time.toString().slice(0, 5),
        session.duration_minutes,
      );
      const occupied = p.sessions
        .filter(
          (s) =>
            s.id !== session.id &&
            !state.attempts.some((a) => a.session_id === s.id),
        )
        .some((s) => {
          const override = state.overrides[s.id];
          if (override && ['skipped', 'travel'].includes(override.status))
            return false;
          return overlap(
            entry,
            sessionInterval(
              state,
              override?.date || s.date,
              override?.start_local || s.start_local,
              override?.duration_minutes || s.duration_minutes,
            ),
          );
        });
      if (!occupied && !busy.some((b) => overlap(entry, b)))
        return { date: date.toString(), time: time.toString().slice(0, 5) };
    }
  }
  return null;
}
