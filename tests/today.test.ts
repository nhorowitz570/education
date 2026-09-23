import { describe, expect, it } from 'vitest';
import { today } from '@/lib/learning/today';
import { DEMO_PLAN } from '@/lib/seed';
import { emptyState, type AppState } from '@/lib/types';

const state = (): AppState => ({ ...structuredClone(emptyState), plan: structuredClone(DEMO_PLAN) });
const first = DEMO_PLAN.sessions.find((s) => !s.optional)!;
const run = (updated_at: string, session_id: string | null = 'elsewhere') => ({
  id: 'r1',
  title: 'Earlier idea',
  session_id,
  progress: 0,
  updated_at,
});

describe('today', () => {
  it('resumes a fresh unfinished session first', () => {
    const v = today({ state: state(), date: first.date, hour: 9, dueCount: 0, voice: true, activeRun: run(`${first.date}T08:00:00Z`) });
    expect(v.primary?.kind).toBe('resume');
    expect(v.why).toBe('Earlier idea is ready, right where you stopped.');
  });
  it('lets today’s session lead once an unfinished one goes stale', () => {
    const v = today({ state: state(), date: first.date, hour: 9, dueCount: 0, voice: true, activeRun: run('2026-09-01T08:00:00Z') });
    expect(v.primary?.kind).toBe('session');
    expect(v.secondary[0]).toMatchObject({ kind: 'resume', label: 'Finish the earlier session' });
  });
  it('asks for a plan before anything else', () => {
    const v = today({ state: structuredClone(emptyState), date: '2026-10-01', hour: 9, dueCount: 0, voice: false });
    expect(v.phase).toBe('no-plan');
  });
});
