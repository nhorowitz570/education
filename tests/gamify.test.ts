import { describe, it, expect } from 'vitest';
import { answerXp, levelOf, progress, questsFor, streak, type Activity } from '@/lib/gamify';

const base: Activity = { today: '2026-10-08', answers: [], runs: [], ventureMonths: [], requiredDays: [], learningDay: true, venture: false };

describe('gamification', () => {
  it('rewards effort and honest confidence', () => {
    expect(answerXp('missed')).toBeGreaterThan(0);
    expect(answerXp('solid', 'high')).toBeGreaterThan(answerXp('solid', 'medium'));
    // Saying "guessing" and being wrong is honest, and earns the bonus too.
    expect(answerXp('missed', 'low')).toBeGreaterThan(answerXp('missed', 'high'));
  });
  it('levels up on a growing curve', () => {
    expect(levelOf(0).level).toBe(1);
    expect(levelOf(100).level).toBe(2);
    expect(levelOf(299).level).toBe(2);
    expect(levelOf(300).level).toBe(3);
  });
  it('never breaks a streak on days without a planned session', () => {
    const s = streak({
      ...base,
      today: '2026-10-12',
      // Mon–Thu planned; learning on all four, nothing Fri–Sun, then Monday.
      requiredDays: ['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-12'],
      runs: ['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-12'].map((date) => ({ date, kind: 'session' })),
    });
    expect(s.current).toBe(5);
    expect(s.todayDone).toBe(true);
  });
  it('breaks a streak on a missed planned day, but not before today is over', () => {
    const s = streak({
      ...base,
      today: '2026-10-08',
      requiredDays: ['2026-10-06', '2026-10-07', '2026-10-08'],
      runs: [{ date: '2026-10-06', kind: 'session' }],
    });
    expect(s.current).toBe(0);
    const pending = streak({ ...base, today: '2026-10-07', requiredDays: ['2026-10-06', '2026-10-07'], runs: [{ date: '2026-10-06', kind: 'session' }] });
    expect(pending.current).toBe(1);
    expect(pending.todayDone).toBe(false);
  });
  it('offers the same three quests all day, with today’s session first on learning days', () => {
    const day = { answers: [], runs: [], ventureMonths: 0 };
    const a = questsFor('2026-10-08', true, day);
    expect(a).toEqual(questsFor('2026-10-08', true, day));
    expect(a[0].id).toBe('session');
    expect(a).toHaveLength(3);
    expect(questsFor('2026-10-09', false, day, false).some((q) => q.id === 'venture')).toBe(false);
  });
  it('adds it all up, including quests', () => {
    const p = progress({
      ...base,
      answers: [
        { date: '2026-10-08', score: 1, kind: 'check', confidence: 'high' },
        { date: '2026-10-08', score: 1, kind: 'attempt', confidence: 'medium' },
        { date: '2026-10-08', score: 0.9, kind: 'transfer', confidence: 'high' },
      ],
      runs: [{ date: '2026-10-08', kind: 'session' }],
      requiredDays: ['2026-10-08'],
    });
    expect(p.xp).toBeGreaterThan(80);
    expect(p.quests.find((q) => q.id === 'session')?.done).toBe(true);
    expect(p.badges.find((b) => b.id === 'first-session')?.earned).toBe(true);
    expect(p.todayXp).toBeGreaterThan(0);
  });
});
