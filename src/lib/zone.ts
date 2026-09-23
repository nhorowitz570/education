import type { AppState } from './types';

// Where the learner is right now. The device reports its timezone and it is
// kept as a synced setting, so the server's greetings, reminders, streaks and
// "today" follow the learner when they travel. The plan's timezone is only a
// fallback for accounts that haven't opened the app since this existed.
export const DEVICE_RECORD = 'settings:device';
export const FALLBACK_ZONE = 'America/Los_Angeles';

export function validZone(zone: unknown): zone is string {
  if (typeof zone !== 'string' || !zone || zone.length > 64) return false;
  try {
    new Intl.DateTimeFormat('en', { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

type Located = { records?: AppState['records']; plan?: { schedule: { timezone: string } } | null };
export function zoneOf(state: Located): string {
  const device = state.records?.find((r) => r.id === DEVICE_RECORD)?.data.timezone;
  if (validZone(device)) return device;
  const planned = state.plan?.schedule.timezone;
  return validZone(planned) ? planned : FALLBACK_ZONE;
}

export function deviceZone(): string | null {
  try {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return validZone(zone) ? zone : null;
  } catch {
    return null;
  }
}

export const hourIn = (zone: string, now = new Date()) =>
  Number(new Intl.DateTimeFormat('en-US', { timeZone: zone, hour: 'numeric', hourCycle: 'h23' }).format(now));

export type DayPart = 'night' | 'morning' | 'afternoon' | 'evening';
export const dayPart = (hour: number): DayPart => (hour < 5 ? 'night' : hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening');
