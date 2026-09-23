import { describe, expect, it } from 'vitest';
import { activeMinutes } from '@/lib/learning/duration';
import { zoneOf, validZone, dayPart } from '@/lib/zone';

const at = (h: number, m = 0) => `2026-09-23T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00.000Z`;

describe('active time', () => {
  it('stops the clock when a run ends, however long ago that was', () => {
    const run = { started_at: at(8), ended_at: at(8, 40), context: { clock: { last: at(8, 38), active_ms: 30 * 60000 } } };
    expect(activeMinutes(run, Date.parse(at(22)))).toBe(32);
  });
  it('does not count a morning start and a night finish as a whole day', () => {
    // Opened at 8, answered at 8:20, left, came back and finished at 21:00.
    const run = { started_at: at(8), ended_at: at(21), context: { clock: { last: at(8, 20), active_ms: 20 * 60000 } } };
    expect(activeMinutes(run, Date.parse(at(21)))).toBe(32);
  });
  it('caps runs from before clocks existed', () => {
    const run = { started_at: at(8), ended_at: at(21), minutes_planned: 30 };
    expect(activeMinutes(run)).toBe(48);
  });
  it('keeps counting an active run up to the idle cap', () => {
    const run = { started_at: at(8), context: { clock: { last: at(8, 10), active_ms: 10 * 60000 } } };
    expect(activeMinutes(run, Date.parse(at(8, 15)))).toBe(15);
    expect(activeMinutes(run, Date.parse(at(12)))).toBe(22);
  });
});

describe('time zones', () => {
  const plan = { schedule: { timezone: 'America/Los_Angeles' } };
  it('prefers the device over the plan', () => {
    const records = [{ id: 'settings:device', kind: 'settings' as const, data: { timezone: 'Europe/Lisbon' }, updated_at: at(8) }];
    expect(zoneOf({ records, plan })).toBe('Europe/Lisbon');
  });
  it('falls back to the plan, then a default, when the device zone is missing or invalid', () => {
    const records = [{ id: 'settings:device', kind: 'settings' as const, data: { timezone: 'Mars/Olympus' }, updated_at: at(8) }];
    expect(zoneOf({ records, plan })).toBe('America/Los_Angeles');
    expect(zoneOf({})).toBe('America/Los_Angeles');
    expect(validZone('Asia/Tokyo')).toBe(true);
  });
  it('names the part of the day', () => {
    expect([3, 9, 14, 20].map(dayPart)).toEqual(['night', 'morning', 'afternoon', 'evening']);
  });
});
