import { describe, it, expect } from 'vitest';
import {
  fresh,
  update,
  level,
  retrievability,
  reviewPriority,
  strength,
  demonstrated,
} from '@/lib/learning/model';

const at = (day: number) => new Date(Date.UTC(2026, 9, 1) + day * 86400000).toISOString();
const days = (from: string, to: string | null) =>
  (new Date(to!).getTime() - new Date(from).getTime()) / 86400000;

describe('learner model', () => {
  it('spaces successful recalls out roughly 2 → 7 → 20+ days', () => {
    let s = update(fresh('cash-timing'), { kind: 'exposure', at: at(0) });
    s = update(s, { kind: 'check', score: 1, options: 3, at: at(0) });
    const first = days(at(0), s.due_at);
    expect(first).toBeGreaterThan(1.5);
    expect(first).toBeLessThan(4);
    let t = first;
    s = update(s, { kind: 'recall', score: 1, at: at(t) });
    const second = days(at(t), s.due_at);
    expect(second).toBeGreaterThan(5);
    expect(second).toBeLessThan(10);
    t += second;
    s = update(s, { kind: 'transfer', score: 0.9, at: at(t) });
    expect(days(at(t), s.due_at)).toBeGreaterThan(15);
    expect(s.p_known).toBeGreaterThan(0.85);
  });

  it('treats a lapse as forgetting, not as failure to learn', () => {
    let s = update(fresh('x'), { kind: 'explain', score: 0.9, at: at(0) });
    s = update(s, { kind: 'recall', score: 0.9, at: at(3) });
    const before = s.stability;
    s = update(s, { kind: 'recall', score: 0.1, at: at(30) });
    expect(s.lapses).toBe(1);
    expect(s.stability).toBeLessThan(before);
    expect(days(at(30), s.due_at)).toBeLessThanOrEqual(1);
  });

  it('weights assisted and guessable evidence less', () => {
    const base = update(fresh('x'), { kind: 'exposure', at: at(0) });
    const free = update(base, { kind: 'explain', score: 1, at: at(0) });
    const assisted = update(base, { kind: 'explain', score: 1, assisted: true, at: at(0) });
    const guessable = update(base, { kind: 'check', score: 1, options: 2, at: at(0) });
    expect(free.p_known).toBeGreaterThan(assisted.p_known);
    expect(free.p_known).toBeGreaterThan(guessable.p_known);
  });

  it('records misconceptions and retires them after clean transfer', () => {
    let s = update(fresh('x'), {
      kind: 'explain',
      score: 0.2,
      misconception: 'treats revenue as cash received',
      at: at(0),
    });
    expect(s.misconceptions).toHaveLength(1);
    s = update(s, { kind: 'transfer', score: 0.95, at: at(2) });
    expect(s.misconceptions[0].resolved).toBe(true);
  });

  it('decays retrievability and raises review priority over time', () => {
    let s = update(fresh('x'), { kind: 'explain', score: 1, at: at(0) });
    expect(retrievability(s, at(0))).toBeCloseTo(1);
    expect(retrievability(s, at(s.stability))).toBeCloseTo(0.9, 1);
    expect(strength(s, at(40))).toBeLessThan(strength(s, at(1)));
    expect(reviewPriority(s, at(10))).toBeGreaterThan(reviewPriority(s, at(3)));
    expect(level(fresh('y'), at(0))).toBe('new');
  });

  it('applies the plan’s demonstrated rule', () => {
    const e = (kind: string, score: number, day: number, assisted = false) => ({
      kind,
      score,
      assisted,
      created_at: at(day),
    });
    expect(demonstrated([e('check', 1, 0)])).toBe(false);
    expect(demonstrated([e('check', 1, 0), e('transfer', 0.8, 3, true)])).toBe(false);
    expect(demonstrated([e('check', 1, 0), e('transfer', 0.8, 3)])).toBe(true);
  });
});
