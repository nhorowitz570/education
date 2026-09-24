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
import { practicePoints } from '@/lib/progress';
import { validRecord } from '@/lib/records';
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
describe('activity records', () => {
  it('counts edited activities once', () => {
    const state = structuredClone(emptyState);
    state.records = [1, 2].map((n) => ({
      id: 'voice:' + n,
      kind: 'external',
      updated_at: new Date().toISOString(),
      data: { date: '2026-09-28', kind: 'voice', completed: true },
    }));
    expect(practicePoints(state)).toBe(10);
  });
  it('rejects invalid settings and nonfinite extension values', () => {
    expect(validRecord('settings', { morning: '25:30' })).toBe(false);
    expect(validRecord('external', { minutes: Infinity })).toBe(false);
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
