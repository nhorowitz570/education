import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  parsePlan,
  planSchema,
  canonical,
  instantFor,
  planDiff,
} from '@/lib/plan';
import { DEMO_PLAN, EMPTY_TEMPLATE } from '@/lib/seed';
import { emptyState, type AppState, type Attempt } from '@/lib/types';
import { applyCommand, commandSchema } from '@/lib/commands';
import {
  selectNext,
  shortRevision,
  applyRevision,
  undoRevision,
  recoveryRevision,
  demonstrated,
  weeklyConsistency,
} from '@/lib/schedule';
import { publicIPv4 } from '@/lib/server/sources';
import { reminderCandidate } from '@/lib/reminders';
import { liveCost } from '@/lib/voice';
const fixture = structuredClone(DEMO_PLAN),
  state = (): AppState => ({
    ...structuredClone(emptyState),
    plan: structuredClone(fixture),
  });
const attempt = (id = crypto.randomUUID(), date = '2026-09-28'): Attempt => ({
  id,
  session_id: 'w01-monday',
  objective_id: 'cash',
  lesson_id: 'example',
  date,
  completed_at: date + 'T18:00:00Z',
  reasoning: 'Opening balance and dates determine cash.',
  transfer: 'A deposit is not earned profit; costs and obligations matter.',
  feedback: {
    strength: 'Evidence',
    gap: 'None',
    next: 'Transfer',
    correct: true,
    independent: true,
    rubric: {
      issue: 'independent',
      evidence: 'independent',
      reasoning: 'independent',
      uncertainty: 'independent',
    },
  },
  points: 25,
  assisted: false,
  reduced: false,
});
describe('plan imports', () => {
  it('validates and round-trips the reference and empty template', () => {
    const full = parsePlan(readFileSync('examples/learning-plan.json', 'utf8'));
    expect(full.sessions).toHaveLength(144);
    expect(parsePlan(JSON.stringify(full))).toEqual(full);
    expect(planSchema.parse(EMPTY_TEMPLATE).schema_version).toBe('1.0');
  });
  it('rejects invalid real dates, timezones, duplicate IDs and broken references', () => {
    for (const mutate of [
      (p: typeof fixture) => (p.sessions[0].date = '2026-02-30'),
      (p: typeof fixture) => (p.schedule.timezone = 'Mars/Now'),
      (p: typeof fixture) => (p.sessions[1].id = p.sessions[0].id),
      (p: typeof fixture) => (p.sessions[0].source_ids = ['missing']),
    ]) {
      const p = structuredClone(fixture);
      mutate(p);
      expect(() => planSchema.parse(p)).toThrow();
    }
  });
  it('rejects cycles, secret URLs, unsupported versions and oversize files', () => {
    const p = structuredClone(fixture);
    p.sessions[0].prerequisite_ids = [p.sessions[1].id];
    p.sessions[1].prerequisite_ids = [p.sessions[0].id];
    expect(() => planSchema.parse(p)).toThrow();
    expect(() =>
      parsePlan(JSON.stringify({ ...fixture, schema_version: '2.0' })),
    ).toThrow();
    expect(() => parsePlan('x'.repeat(2097153))).toThrow();
    p.sessions[1].prerequisite_ids = [];
    p.sources[0].url = 'https://example.com/?api_key=secret';
    expect(() => planSchema.parse(p)).toThrow();
  });
  it('uses stable canonical hashes and keeps completion IDs across reordering', () => {
    const p = structuredClone(fixture);
    p.sessions.reverse();
    expect(planDiff(fixture, p)).toEqual({ added: 0, removed: 0, changed: 0 });
    expect(canonical({ b: 2, a: 1 })).toBe(canonical({ a: 1, b: 2 }));
  });
  it('resolves local wall time across DST and Tokyo travel', () => {
    expect(instantFor('2026-10-26', '10:00', 'America/Los_Angeles')).toBe(
      '2026-10-26T17:00:00Z',
    );
    expect(instantFor('2026-11-02', '10:00', 'America/Los_Angeles')).toBe(
      '2026-11-02T18:00:00Z',
    );
    expect(instantFor('2026-12-25', '10:00', 'Asia/Tokyo')).toBe(
      '2026-12-25T01:00:00Z',
    );
  });
});
describe('scheduling and evidence', () => {
  it('prioritizes an interrupted lesson', () => {
    const s = state();
    s.records.push({
      id: 'draft:a',
      kind: 'draft',
      updated_at: new Date().toISOString(),
      data: { sessionId: 'w01-tuesday', stage: 1 },
    });
    expect(selectNext(s, '2026-09-28')?.session.id).toBe('w01-tuesday');
  });
  it('shortens and undoes future work without touching completed attempts', () => {
    const s = state(),
      r = shortRevision(s, 'w01-tuesday', 20, '2026-09-29');
    let changed = applyRevision(s, r);
    changed.attempts = [attempt()];
    const undone = undoRevision(changed, r.id, '2026-09-29');
    expect(undone.overrides['w01-tuesday'].duration_minutes).toBe(60);
    expect(undone.attempts).toEqual(changed.attempts);
  });
  it('does not overwrite a newer schedule edit on undo', () => {
    const s = state(),
      r = shortRevision(s, 'w01-monday', 20, '2026-09-28'),
      changed = applyRevision(s, r);
    changed.overrides['w01-monday'].start_local = '11:00';
    expect(() => undoRevision(changed, r.id, '2026-09-28')).toThrow(
      'edited again',
    );
  });
  it('never doubles recovery days and explicitly drops excess breadth', () => {
    const s = state(),
      r = recoveryRevision(s, '2026-09-30'),
      active = Object.values(r.after).filter((x) => x.status !== 'skipped');
    expect(new Set(active.map((x) => x.date)).size).toBe(active.length);
    expect(active[0].duration_minutes).toBe(20);
    expect(
      Object.values(r.after).filter((x) => x.status === 'skipped'),
    ).toHaveLength(2);
  });
  it('cannot farm points by resubmitting completion', () => {
    const s = state(),
      a = attempt(),
      command = commandSchema.parse({
        type: 'complete',
        eventId: a.id,
        lessonId: 'example',
        sessionId: a.session_id,
        choice: 0,
        reasoning: a.reasoning,
        transfer: a.transfer,
        assisted: false,
        reduced: false,
        date: a.date,
      });
    const once = applyCommand(s, command, a),
      twice = applyCommand(once, command, a);
    expect(twice.attempts).toHaveLength(1);
    expect(twice.attempts[0].points).toBe(25);
  });
  it('requires later independent transfer for demonstrated skills', () => {
    const s = state();
    s.attempts = [attempt()];
    expect(demonstrated(s, 'cash')).toBe(false);
    s.attempts.push({
      ...attempt(crypto.randomUUID(), '2026-10-01'),
      assisted: true,
    });
    expect(demonstrated(s, 'cash')).toBe(false);
    s.attempts[1].assisted = false;
    expect(demonstrated(s, 'cash')).toBe(true);
  });
  it('keeps reduced attendance in consistency, and excludes travel', () => {
    const s = state();
    s.attempts = [{ ...attempt(), reduced: true }];
    s.overrides['w01-tuesday'] = {
      date: '2026-09-29',
      start_local: '10:00',
      duration_minutes: 15,
      status: 'travel',
    };
    expect(weeklyConsistency(s, '2026-09-28')).toMatchObject({
      done: 1,
      total: 3,
    });
  });
});
describe('network and reminders', () => {
  it('rejects loopback, metadata, private and mapped IPv6 source addresses', () => {
    for (const ip of [
      '127.0.0.1',
      '10.0.0.3',
      '169.254.169.254',
      '172.20.0.2',
      '192.168.1.2',
      '100.64.0.1',
      '::ffff:127.0.0.1',
    ])
      expect(publicIPv4(ip)).toBe(false);
    expect(publicIPv4('8.8.8.8')).toBe(true);
  });
  it('only reminds within the configured window and never after activity elsewhere', () => {
    const s = state();
    s.records.push({
      id: 'settings:reminders',
      kind: 'settings',
      data: { enabled: true },
      updated_at: new Date().toISOString(),
    });
    expect(reminderCandidate(s, new Date('2026-09-28T16:46:00Z'))?.kind).toBe(
      'morning',
    );
    expect(reminderCandidate(s, new Date('2026-09-28T18:00:00Z'))).toBeNull();
    s.attempts.push(attempt());
    expect(reminderCandidate(s, new Date('2026-09-28T17:31:00Z'))).toBeNull();
  });
  it('uses cumulative seconds and the 15-second Live minimum', () => {
    expect(liveCost(0)).toBe(0.0125);
    expect(liveCost(60)).toBe(0.05);
  });
});
