import { describe, it, expect } from 'vitest';
import { outline, total } from '@/lib/learning/outline';

const base = { concepts: ['profit-vs-cash', 'cash-timing'], dueReviews: [] as string[] };

describe('session outline', () => {
  it('builds a full morning with breaks, fitting the window', () => {
    const b = outline({ ...base, kind: 'session', minutes: 120, track: 'finance', evidence: 'Explain why a profitable company could run out of cash' });
    const types = b.map((x) => x.type);
    expect(types[0]).toBe('situation');
    expect(types).toContain('explain');
    expect(types).toContain('break');
    expect(types).toContain('produce');
    expect(types.at(-1)).toBe('recap');
    expect(total(b)).toBeLessThanOrEqual(125);
  });
  it('opens with retrieval when reviews are due', () => {
    const b = outline({ ...base, kind: 'session', minutes: 120, dueReviews: ['a', 'b', 'c'] });
    expect(b.slice(0, 2).map((x) => x.type)).toEqual(['recall', 'recall']);
  });
  it('skips re-teaching when the learner is already fluent', () => {
    const b = outline({ ...base, kind: 'session', minutes: 60, known: 0.9 });
    expect(b.some((x) => x.type === 'explain')).toBe(false);
  });
  it('compresses to a short return session', () => {
    const b = outline({ ...base, kind: 'session', minutes: 20, dueReviews: ['a'] });
    expect(total(b)).toBeLessThanOrEqual(22);
    expect(b.at(-1)!.type).toBe('recap');
  });
  it('marks work beyond the commitment point as optional', () => {
    const b = outline({ ...base, kind: 'session', minutes: 120, commitmentMinutes: 60 });
    expect(b.some((x) => x.optional)).toBe(true);
    expect(b.filter((x) => !x.optional && x.type !== 'recap').reduce((s, x) => s + x.minutes, 0)).toBeLessThanOrEqual(63);
  });
  it('uses spoken role-play for communication sessions when voice is available', () => {
    const b = outline({ ...base, kind: 'session', minutes: 120, track: 'communication', voice: true });
    expect(b.some((x) => x.type === 'roleplay')).toBe(true);
  });
  it('builds review runs from due concepts only', () => {
    const b = outline({ ...base, kind: 'review', minutes: 10, dueReviews: ['a', 'b', 'c', 'd'] });
    expect(b.filter((x) => x.type === 'recall').map((x) => x.concept)).toEqual(['a', 'b', 'c']);
  });
});
