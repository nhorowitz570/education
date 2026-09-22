import type { AppState } from './types';
import { dateSchema, monday } from './plan';
// Canonical activity/day keys keep repeated taps and edited logs from earning twice.
export function practicePoints(state: AppState) {
  const earned = new Map<string, number>();
  for (const a of state.attempts)
    earned.set('lesson:' + a.plan_id + ':' + a.session_id, a.points);
  for (const r of state.records) {
    const d = r.data;
    if (!dateSchema.safeParse(d.date).success) continue;
    const date = String(d.date);
    if (
      r.kind === 'workout' &&
      d.complete === true &&
      Array.isArray(d.exercises) &&
      d.exercises.some(
        (e) =>
          Array.isArray(e.sets) &&
          e.sets.some((s: { done?: boolean }) => s.done),
      )
    )
      earned.set('workout:' + date, 20);
    if (r.kind === 'social' && d.attempted === true)
      earned.set('social:' + date, 10);
    if (r.kind === 'reflection' && String(d.useful || '').trim())
      earned.set('reflection:' + monday(date), 10);
    if (
      r.kind === 'external' &&
      d.kind === 'resource' &&
      String(d.reflection || '').trim().length >= 10
    )
      earned.set('resource:' + date + ':' + d.sourceId, 10);
    if (r.kind === 'external' && d.kind === 'voice' && d.completed === true)
      earned.set('voice:' + date, 10);
  }
  return [...earned.values()].reduce((n, p) => n + p, 0);
}
