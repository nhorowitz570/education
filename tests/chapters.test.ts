import { describe, it, expect } from 'vitest';
import plan from '../examples/learning-plan.json';
import { chapters } from '@/lib/chapters';
import type { Plan } from '@/lib/plan';

describe('plan chapters', () => {
  const list = chapters(plan as unknown as Plan);
  it('covers every week once, in order', () => {
    const weeks = list.flatMap((c) => c.weeks);
    expect(weeks).toEqual((plan as unknown as Plan).weeks.map((w) => w.id));
  });
  it('ends a chapter at each milestone', () => {
    expect(list.filter((c) => c.milestone).map((c) => c.milestone)).toEqual((plan as unknown as Plan).milestones.map((m) => m.title));
  });
  it('keeps chapters short and time away separate', () => {
    expect(Math.max(...list.map((c) => c.weeks.length))).toBeLessThanOrEqual(6);
    expect(list.some((c) => c.interlude)).toBe(true);
  });
});
