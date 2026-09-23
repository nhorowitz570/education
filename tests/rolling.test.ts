import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { parsePlan, planSchema, type Plan } from '@/lib/plan';
import { applyEdit, isRolling, planWeek, rollover, toRolling, weekMeta, weekSessions, type Rolling } from '@/lib/rolling';
import { applyCommand } from '@/lib/commands';
import { emptyState, type AppState, type Attempt } from '@/lib/types';

const nathan = parsePlan(readFileSync('Nathan_Plan_Import.json', 'utf8'));
const core = nathan.sessions.filter((s) => !s.optional && s.subject !== 'review');
const W1 = '2026-09-28',
  W2 = '2026-10-05';
const attempt = (session_id: string, date: string) => ({ id: session_id, session_id, date }) as unknown as Attempt;
const stateOf = (plan: Plan, attempts: Attempt[] = []): AppState => ({ ...structuredClone(emptyState), plan, attempts });
const valid = (p: Plan | undefined) => {
  const r = planSchema.safeParse(p);
  if (!r.success) throw new Error(r.error.issues.map((i) => i.path.join('.') + ': ' + i.message).join('\n'));
  return true;
};
const topics = (p: Rolling) => p.horizon.tracks.flatMap((t) => t.backlog);

describe('converting a dated plan', () => {
  const p = toRolling(nathan, { today: '2026-09-23' });
  it('keeps the first week exactly as written, as an editable draft', () => {
    expect(weekSessions(p, W1).map((s) => s.id)).toEqual(['w01-monday', 'w01-tuesday', 'w01-wednesday', 'w01-thursday']);
    expect(weekSessions(p, W1)[0].duration_minutes).toBe(60);
    expect(weekMeta(p, W1)).toMatchObject({ status: 'draft', origin: 'import' });
    expect(valid(p)).toBe(true);
  });
  it('gives each weekday its track and keeps the rest as ordered topics', () => {
    expect(p.horizon.rhythm).toMatchObject({ days: { 0: 'finance', 1: 'communication', 2: 'finance', 3: 'judgment' }, minutes: 120 });
    expect(p.horizon.tracks.map((t) => t.id)).toEqual(['finance', 'communication', 'judgment']);
    expect(p.sessions.length + topics(p).length).toBe(core.length);
    const finance = p.horizon.tracks[0].backlog.map((t) => t.id);
    expect(finance.slice(0, 2)).toEqual(['w02-monday', 'w02-wednesday']);
    expect(p.horizon.tracks.every((t) => t.goals.length > 0)).toBe(true);
  });
  it('keeps anything already started where it happened', () => {
    const q = toRolling(nathan, { today: '2026-10-14', keep: new Set(['w01-monday']) });
    expect(q.sessions.map((s) => s.id)).toContain('w01-monday');
    expect(weekMeta(q, W1)?.status).toBe('done');
    expect(topics(q).map((t) => t.id)).toContain('w01-tuesday');
    expect(valid(q)).toBe(true);
  });
});

describe('the weekly cycle', () => {
  const p = toRolling(nathan, { today: '2026-09-23' });
  it('draws the next week from the front of each track, on its own day', () => {
    const picks = planWeek(p, W2);
    expect(picks.map((x) => [x.date, x.track, x.topic.id])).toEqual([
      ['2026-10-05', 'finance', 'w02-monday'],
      ['2026-10-06', 'communication', 'w02-tuesday'],
      ['2026-10-07', 'finance', 'w02-wednesday'],
      ['2026-10-08', 'judgment', 'w02-thursday'],
    ]);
  });
  it('activates the draft on its Monday', () => {
    const next = rollover(stateOf(p), W1)!;
    expect(weekMeta(next.plan as Rolling, W1)?.status).toBe('active');
    expect(rollover(next, W1)).toBeNull();
  });
  it('closes a week: unfinished sessions go back to the front of their track', () => {
    const s = rollover(stateOf(p), W1)!;
    const done = [attempt('w01-monday', W1), attempt('w01-tuesday', '2026-09-29')];
    const next = rollover({ ...s, attempts: done }, W2)! as AppState & { plan: Rolling };
    expect(weekMeta(next.plan, W1)).toMatchObject({ status: 'done', planned: 4, done: 2 });
    expect(weekSessions(next.plan, W1).map((x) => x.id)).toEqual(['w01-monday', 'w01-tuesday']);
    // The new week starts with what was left: nothing piles up, nothing is lost.
    expect(weekSessions(next.plan, W2).map((x) => x.id)).toEqual(['w01-wednesday', 'w02-tuesday', 'w02-monday', 'w01-thursday']);
    expect(next.plan.sessions.length + topics(next.plan).length).toBe(core.length);
    expect(valid(next.plan)).toBe(true);
  });
  it('skips away days and never generates past weeks after a long gap', () => {
    const s = rollover(stateOf(p), '2026-12-22')! as AppState & { plan: Rolling };
    expect(weekSessions(s.plan, '2026-12-21')).toHaveLength(0);
    expect(s.plan.horizon.weeks.map((w) => w.start)).toEqual([W1, '2026-12-21']);
    expect(valid(s.plan)).toBe(true);
  });
});

describe('steering a week', () => {
  const base = stateOf(toRolling(nathan, { today: '2026-09-23' }));
  const edit = (s: AppState, e: Parameters<typeof applyEdit>[1], today = '2026-09-26') =>
    applyCommand(s, { type: 'plan-edit', eventId: crypto.randomUUID(), today, edit: e });
  it('swaps a session for another waiting topic, returning the old one', () => {
    const s = edit(base, { op: 'swap', sessionId: 'w01-monday', topicId: 'w05-monday' });
    const p = s.plan as Rolling;
    expect(weekSessions(p, W1).map((x) => x.id)).toContain('w05-monday');
    expect(p.horizon.tracks[0].backlog[0].id).toBe('w01-monday');
    expect(p.sessions.find((x) => x.id === 'w05-monday')?.date).toBe(W1);
  });
  it('removes a session back to its track, but discards an AI-added one', () => {
    const s = edit(base, { op: 'remove', sessionId: 'w01-tuesday' });
    expect((s.plan as Rolling).horizon.tracks[1].backlog[0].id).toBe('w01-tuesday');
    const added = { ...base, plan: { ...base.plan!, sessions: base.plan!.sessions.map((x) => (x.id === 'w01-tuesday' ? { ...x, added: true } : x)) } };
    const gone = edit(added, { op: 'remove', sessionId: 'w01-tuesday' });
    expect(topics(gone.plan as Rolling).some((t) => t.id === 'w01-tuesday')).toBe(false);
  });
  it('adds a session and uses up one of the AI’s suggested extras', () => {
    const withSuggestion = {
      ...base,
      plan: { ...base.plan!, horizon: { ...(base.plan as Rolling).horizon, weeks: [{ ...weekMeta(base.plan as Rolling, W1)!, suggestion: { extra: 1, track: 'judgment', why: 'x' } }] } },
    };
    const s = edit(withSuggestion, { op: 'add', week: W1, track: 'judgment', day: 4 });
    const p = s.plan as Rolling;
    expect(weekSessions(p, W1)).toHaveLength(5);
    expect(weekSessions(p, W1).at(-1)).toMatchObject({ id: 'w02-thursday', date: '2026-10-02' });
    expect(weekMeta(p, W1)?.suggestion).toBeNull();
  });
  it('locks a week once its Monday has passed', () => {
    const active = rollover(base, W1)!;
    expect(edit(active, { op: 'remove', sessionId: 'w01-tuesday' }, '2026-09-29')).toBe(active);
    expect(edit(active, { op: 'remove', sessionId: 'w01-tuesday' }, W1).plan).not.toBe(active.plan);
  });
  it('lends a paused track’s day to another, and never pauses the last track', () => {
    let s = edit(base, { op: 'track', track: 'judgment', status: 'paused' });
    expect(planWeek(s.plan as Rolling, W2).map((x) => x.track)).not.toContain('judgment');
    expect(planWeek(s.plan as Rolling, W2)).toHaveLength(4);
    s = edit(s, { op: 'track', track: 'finance', status: 'paused' });
    const last = edit(s, { op: 'track', track: 'communication', status: 'paused' });
    expect(last).toBe(s);
  });
  it('changes the rhythm for weeks still to come', () => {
    const s = edit(base, { op: 'rhythm', days: { 0: 'finance', 2: 'communication' }, minutes: 45 });
    const picks = planWeek(s.plan as Rolling, W2);
    expect(picks.map((x) => x.track)).toEqual(['finance', 'communication']);
    expect(weekSessions(s.plan as Rolling, W1)).toHaveLength(4);
  });
});

describe('plans without a horizon', () => {
  it('are untouched', () => {
    expect(isRolling(nathan)).toBe(false);
    expect(rollover(stateOf(nathan), W2)).toBeNull();
  });
});

describe('Today on a rolling week', () => {
  const base = rollover(stateOf(toRolling(nathan, { today: '2026-09-23' })), W1)!;
  it('offers a session still open from earlier in the week, never as missed', async () => {
    const { today } = await import('@/lib/learning/today');
    const s = { ...base, attempts: [attempt('w01-monday', W1)] };
    const v = today({ state: s, date: '2026-10-03', hour: 9, dueCount: 0, voice: false });
    expect(v.phase).toBe('learning-day');
    expect(v.primary).toMatchObject({ kind: 'session', sessionId: 'w01-tuesday' });
    expect(v.why).toMatch(/^Still open from Tuesday/);
    expect(v.week?.days.filter((d) => d.status === 'missed')).toHaveLength(0);
    expect(v.week?.total).toBe(0);
    expect(v.next).toMatchObject({ start: W2, ready: false });
  });
});
