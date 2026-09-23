import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import {
  claimLocal,
  localSet,
  localGet,
  clearLocal,
  updateQueue,
  savedQueue,
} from '@/lib/client/storage';
import { emptyState } from '@/lib/types';
import { DEMO_PLAN } from '@/lib/seed';
import { practicePoints } from '@/lib/progress';
import { validRecord } from '@/lib/records';
import { openSlot, overlap, allBusy } from '@/lib/availability';
import { route } from '@/lib/ai/tasks';
import type { Command } from '@/lib/commands';
beforeEach(() => clearLocal());
describe('offline ownership and queue', () => {
  it('atomically keeps concurrent writes and acknowledgments', async () => {
    await claimLocal('account-a');
    const commands: Command[] = [1, 2, 3].map((n) => ({
      type: 'record',
      eventId: crypto.randomUUID(),
      record: {
        id: 'memory:' + n,
        kind: 'memory',
        data: { text: 'Own note' },
        updated_at: new Date().toISOString(),
      },
    }));
    await Promise.all(commands.map((c) => updateQueue('account-a', c)));
    expect(await savedQueue('account-a')).toHaveLength(3);
    await Promise.all([
      updateQueue('account-a', commands[0].eventId),
      updateQueue('account-a', commands[1]),
    ]);
    expect(await savedQueue('account-a')).toHaveLength(2);
  });
  it('clears saved lessons and writes on account switch and logout', async () => {
    await claimLocal('account-a');
    await localSet('account-a', 'lesson:one', { title: 'Private lesson' });
    await claimLocal('account-b');
    expect(await localGet('account-b', 'lesson:one')).toBeUndefined();
    await expect(updateQueue('account-a', 'old-event')).rejects.toThrow(
      'account changed',
    );
    await localSet('account-b', 'state', { plan: 'private' });
    await clearLocal();
    expect(await localGet('account-b', 'state')).toBeUndefined();
  });
});
describe('growth and scheduling', () => {
  it('counts edited activities once and no empty workouts', () => {
    const state = structuredClone(emptyState);
    state.records = [1, 2].map((n) => ({
      id: 'social:' + n,
      kind: 'social',
      updated_at: new Date().toISOString(),
      data: { date: '2026-09-28', attempted: true },
    }));
    expect(practicePoints(state)).toBe(10);
    state.records.push({
      id: 'workout:empty',
      kind: 'workout',
      updated_at: new Date().toISOString(),
      data: { date: '2026-09-28', complete: true, exercises: [{ sets: [] }] },
    });
    expect(practicePoints(state)).toBe(10);
  });
  it('rejects invalid growth fields and nonfinite extension values', () => {
    expect(validRecord('food', { protein: 9 })).toBe(false);
    expect(validRecord('settings', { morning: '25:30' })).toBe(false);
    expect(validRecord('body', { kg: Infinity })).toBe(false);
  });
  it('avoids manual blocks, existing lessons, and Friday', () => {
    const state = {
      ...structuredClone(emptyState),
      plan: structuredClone(DEMO_PLAN),
    };
    state.records.push({
      id: 'busy',
      kind: 'busy',
      updated_at: new Date().toISOString(),
      data: { date: '2026-09-28', start: '10:00', end: '12:00' },
    });
    expect(allBusy(state)[0].start).toBe('2026-09-28T17:00:00Z');
    const slot = openSlot(state, state.plan.sessions[0], '2026-09-28');
    expect(slot?.date).not.toBe('2026-09-28');
    expect(slot?.date).not.toBe('2026-10-02');
    expect(
      overlap(
        { start: '2026-01-01T10:00Z', end: '2026-01-01T11:00Z' },
        { start: '2026-01-01T11:00Z', end: '2026-01-01T12:00Z' },
      ),
    ).toBe(false);
  });
});
describe('model routing', () => {
  it('keeps fast work on Luna and escalates only hard, high-stakes work', () => {
    expect(route('grade.quick').tier).toBe('fast');
    expect(route('tutor.beat').tier).toBe('primary');
    expect(route('tutor.beat', { hard: true }).tier).toBe('reasoning');
    expect(route('memory.extract', { hard: true }).tier).toBe('fast');
  });
  it('never sends effort none to the reasoning tier', () => {
    expect(route('curriculum.map').effort).not.toBe('none');
    expect(route('tutor.reply', { stakes: 'high' }).effort).toBe('medium');
  });
});
