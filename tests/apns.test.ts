import { describe, expect, it } from 'vitest';
import { deadToken } from '@/lib/server/apns';

describe('APNs responses', () => {
  it('forgets tokens Apple says are gone', () => {
    expect(deadToken({ status: 410, reason: 'Unregistered' })).toBe(true);
    expect(deadToken({ status: 400, reason: 'BadDeviceToken' })).toBe(true);
  });
  it('keeps tokens after transient failures', () => {
    expect(deadToken({ status: 0, reason: 'Timeout' })).toBe(false);
    expect(deadToken({ status: 429, reason: 'TooManyRequests' })).toBe(false);
    expect(deadToken({ status: 400, reason: 'PayloadTooLarge' })).toBe(false);
  });
});
