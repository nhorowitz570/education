import { describe, expect, it } from 'vitest';
import { expand, type Skeleton } from '@/lib/import/skeleton';

const base: Skeleton = {
  title: 'Year of learning',
  learner_name: 'Patrick',
  timezone: 'Europe/London',
  start_date: '2026-10-05',
  end_date: '2026-10-18',
  weekdays: [0, 2],
  start_local: '09:00',
  end_local: '09:45',
  goals: ['Understand money'],
  weeks: [
    {
      start_date: '2026-10-07', // a Wednesday: anchored back to Monday
      mode: 'standard',
      sessions: [
        { weekday: 0, subject: 'finance', title: 'Compound interest', objective: 'Explain growth.', evidence: 'Worked example', optional: false },
        { weekday: 2, subject: 'finance', title: 'Inflation', objective: '', evidence: '', optional: false },
      ],
    },
    {
      start_date: '2026-10-12',
      mode: 'light',
      sessions: [{ weekday: 0, subject: '', title: 'Budgets', objective: 'Build one.', evidence: '', optional: true }],
    },
  ],
  milestones: [{ date: '2026-10-16', title: 'First review' }, { date: '2027-01-01', title: 'Outside' }],
  sources: [{ title: 'Bank', url: 'https://example.org/a', use: 'reading' }, { title: 'Bad', url: 'http://x', use: '' }],
  uncertain: [],
};

describe('markdown skeleton expansion', () => {
  it('builds a valid plan with derived ids, dates and durations', () => {
    const { plan, uncertain } = expand(base);
    expect(plan.sessions.map((s) => [s.id, s.date])).toEqual([
      ['w01-monday', '2026-10-05'],
      ['w01-wednesday', '2026-10-07'],
      ['w02-monday', '2026-10-12'],
    ]);
    expect(plan.sessions[0].duration_minutes).toBe(45);
    expect(plan.sessions[1].objective).toBe('Inflation');
    expect(plan.sessions[2].subject).toBe('general');
    expect(plan.weeks[0].topics).toEqual({ monday: 'Compound interest', wednesday: 'Inflation' });
    expect(plan.milestones).toHaveLength(1);
    expect(plan.sources.map((s) => s.id)).toEqual(['s1']);
    expect(uncertain).toEqual([]);
  });
  it('falls back safely and says so when the plan is vague', () => {
    const { plan, uncertain } = expand({ ...base, timezone: 'Mars/Base', start_local: '9am', end_date: '' });
    expect(plan.profile.timezone).toBe('America/Los_Angeles');
    expect(plan.end_date).toBe('2026-10-18');
    expect(uncertain.map((u) => u.split(' ')[0])).toEqual(['Time', 'Start', 'The', 'End']);
  });
  it('drops sessions outside the plan window', () => {
    const { plan } = expand({ ...base, end_date: '2026-10-06' });
    expect(plan.sessions.map((s) => s.id)).toEqual(['w01-monday']);
  });
});
