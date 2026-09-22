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
import { VOICE_PROFILES, voiceInstructions } from '@/lib/voice';
import { reportedCost, providerPreferences, model } from '@/lib/server/ai';
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
describe('provider contracts', () => {
  it('keeps unavailable cost distinct from zero and rejects malformed usage', () => {
    expect(reportedCost({ cost: 0 })).toBe(0);
    for (const cost of [undefined, -1, Infinity, '0.1'])
      expect(reportedCost({ cost })).toBeNull();
  });
  it('routes default text to OpenRouter with parameter and price enforcement', () => {
    expect(model()).toBe('openai/gpt-5.6-luna');
    expect(providerPreferences()).toMatchObject({
      require_parameters: true,
      data_collection: 'deny',
      max_price: { prompt: 0.2, completion: 1.2 },
    });
  });
  it('uses distinct requested voices while preserving listening and assessment boundaries', () => {
    expect(VOICE_PROFILES.cedar.name).toBe('Alex');
    expect(VOICE_PROFILES.willow.name).toBe('Maya');
    for (const voice of ['cedar', 'willow'] as const) {
      const prompt = voiceInstructions(6, voice);
      expect(prompt).toContain('Interruption policy');
      expect(prompt).toContain('Backchannel policy');
      expect(prompt).toContain('about 6 seconds');
      expect(prompt).toContain('Feedback is provided by the app');
      expect(prompt.length).toBeLessThan(4000);
    }
    expect(voiceInstructions(6, 'cedar')).not.toEqual(
      voiceInstructions(6, 'willow'),
    );
  });
});
