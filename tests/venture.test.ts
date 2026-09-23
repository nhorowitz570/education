import { describe, it, expect } from 'vitest';
import { KINDS, choose, clampEffects, create, demandAt, sanitize, simulate, value, type Venture } from '@/lib/venture/engine';

const now = new Date('2026-09-22T12:00:00Z');
const start = (kind: Venture['kind'], loan = false) => create({ kind, name: 'Ember', founder: 'Sam', loan, now });
const run = (v: Venture, months: number) => {
  const out = [];
  for (let i = 0; i < months; i++) {
    const r = simulate(v, '2026-09-22');
    v = r.venture;
    out.push(r.result);
  }
  return { v, results: out };
};

describe('venture engine', () => {
  it('is deterministic for the same company and month', () => {
    expect(simulate(start('roastery'), 'd').result).toEqual(simulate(start('roastery'), 'd').result);
  });
  it('books revenue when earned but collects it on the client’s terms', () => {
    const { results } = run(start('studio'), 1);
    const r = results[0];
    expect(r.revenue).toBeGreaterThan(0);
    // A studio collects only 30% in the month it does the work.
    expect(r.collected).toBeLessThan(r.revenue * 0.35);
    expect(r.receivables).toBeGreaterThan(r.revenue * 0.6);
  });
  it('shows profit and cash moving apart when stock is bought ahead', () => {
    const v = start('roastery');
    v.levers.restock = 3000;
    const r = simulate(v, 'd').result;
    expect(r.spent.stock).toBe(Math.round(3000 * KINDS.roastery.unitCost));
    expect(r.cashEnd - r.cashStart).toBeLessThan(r.profit);
  });
  it('can’t sell more than capacity, and unserved demand hurts reputation', () => {
    const v = start('truck');
    v.levers.price = 7; // far too cheap: demand swamps one person
    v.levers.restock = 9000;
    const r = simulate(v, 'd').result;
    expect(r.units).toBeLessThanOrEqual(r.capacity);
    expect(r.turnedAway).toBeGreaterThan(0);
    expect(r.reputation).toBeLessThan(50);
  });
  it('raising the price lowers demand', () => {
    const v = start('roastery');
    expect(demandAt(v, 24, 500)).toBeLessThan(demandAt(v, 16, 500));
  });
  it('keeps levers and story effects within sensible bounds', () => {
    const v = start('roastery');
    const l = sanitize(v, { price: 9999, marketing: -5, staff: 40, borrow: 1e9 });
    expect(l.price).toBe(36);
    expect(l.marketing).toBe(0);
    expect(l.staff).toBe(8);
    expect(l.borrow).toBeLessThanOrEqual(KINDS.roastery.startCash * 3);
    const e = clampEffects(v, { cash: 1e9, demand_pct: 500, reputation: -90 });
    expect(e.cash).toBeLessThan(KINDS.roastery.price * KINDS.roastery.demand);
    expect(e.demand_pct).toBe(45);
    expect(e.reputation).toBe(-15);
  });
  it('carries a decision into later months', () => {
    let v = start('studio');
    v.event = {
      headline: 'A big client',
      story: '…',
      concept: 'receivables',
      choices: [{ label: 'Take it on 60-day terms', detail: '', effects: { cash_later: { amount: 9000, months: 2 }, demand_pct: 20, demand_months: 3 } }],
    };
    v = choose(v, 0);
    expect(v.receivables.some((r) => r.amount === 9000)).toBe(true);
    expect(v.modifiers[0].until).toBe(3);
    const { results } = run(v, 3);
    expect(results[0].collected).toBeLessThan(results[1].collected + 9000);
  });
  it('covers a cash shortfall with an expensive overdraft, then goes bankrupt past the limit', () => {
    const v = start('truck');
    v.cash = -1000;
    v.levers.restock = 0;
    const r = simulate(v, 'd');
    expect(r.result.notes.some((n) => n.startsWith('Cash ran out'))).toBe(true);
    const broke = { ...start('truck'), cash: -1e6 };
    expect(simulate(broke, 'd').venture.status).toBe('bankrupt');
  });
  it('keeps a sensible business alive for a year at default settings', () => {
    for (const kind of ['roastery', 'studio', 'truck'] as const) {
      const { v, results } = run(start(kind), 12);
      expect(v.status).toBe('running');
      expect(results.some((r) => r.profit > 0)).toBe(true);
      expect(value(v)).toBeGreaterThan(0);
    }
  });
});
