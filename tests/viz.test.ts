import { describe, it, expect } from 'vitest';
import { compile, FormulaError } from '@/lib/viz/formula';
import { vizSchema } from '@/lib/viz/schema';

describe('sim formula evaluator', () => {
  it('evaluates arithmetic with precedence and functions', () => {
    const f = compile('(price - unit_cost) * units - fixed');
    expect(f({ price: 50, unit_cost: 20, units: 100, fixed: 1000 })).toBe(2000);
    expect(compile('2 ^ 3 ^ 2')({})).toBe(512);
    expect(compile('-x + max(1, 3, 2) * round(2.345, 2)')({ x: 1 })).toBeCloseTo(6.05);
    expect(compile('fixed / (price - cost)')({ fixed: 900, price: 40, cost: 10 })).toBe(30);
  });
  it('rejects anything but arithmetic', () => {
    for (const bad of ['alert(1)', 'x.constructor', 'a; b', '1 +', 'x[0]', 'constructor', '__proto__'])
      expect(() => compile(bad)({ x: 1, a: 1, b: 1 })).toThrow(FormulaError);
  });
});

describe('visual schema', () => {
  it('accepts a bar chart with a pending segment', () => {
    expect(
      vizSchema.safeParse({
        type: 'bar',
        title: 'This month',
        unit: '$',
        bars: [
          { label: 'Sold', value: 8000, tone: 'accent', pending: 6000, note: null },
        ],
        takeaway: 'Most of the sale has not arrived yet.',
      }).success,
    ).toBe(true);
  });
  it('rejects unknown primitives', () => {
    expect(vizSchema.safeParse({ type: 'html', html: '<b>x</b>' }).success).toBe(false);
  });
});
