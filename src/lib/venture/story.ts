// Events used when the model is unavailable, so Venture always has a decision
// to make. Each is grounded in one idea from the curriculum.

import { KINDS, type Venture, type VentureEvent } from './engine';

type Template = (v: Venture) => VentureEvent;

const scale = (v: Venture) => KINDS[v.kind].price * KINDS[v.kind].demand;
const money = (n: number) => '$' + Math.round(n / 50) * 50;

const GENERIC: Template[] = [
  (v) => ({
    headline: 'A big customer wants terms',
    story: `A larger business wants to become a regular customer of ${v.name}: steady volume every month, but they pay 60 days after delivery. Your bank balance would feel it long before your profit does.`,
    concept: 'Profit versus cash: payment terms',
    choices: [
      { label: 'Accept 60-day terms', detail: 'More demand for three months; the money arrives later.', effects: { demand_pct: 25, demand_months: 3, cash_later: { amount: scale(v) * 0.2, months: 2 } } },
      { label: 'Ask for 50% up front', detail: 'They might walk; if not, cash comes sooner.', effects: { demand_pct: 10, demand_months: 3, cash: scale(v) * 0.08 } },
      { label: 'Decline politely', detail: 'Stay small and liquid.', effects: { reputation: -2 } },
    ],
  }),
  (v) => ({
    headline: 'Your main supplier raises prices',
    story: `Your main supplier is raising prices by 15% for the next few months, citing shipping costs. Every ${KINDS[v.kind].unit} you sell will earn less unless something changes.`,
    concept: 'Contribution margin and pricing',
    choices: [
      { label: 'Absorb it', detail: 'Keep prices; margins shrink for a while.', effects: { unit_cost_pct: 15, demand_months: 3 } },
      { label: 'Switch to a cheaper supplier', detail: 'Lower cost, some quality risk.', effects: { unit_cost_pct: 3, demand_months: 3, reputation: -4 } },
      { label: 'Lock in a 6-month contract', detail: `Pay ${money(scale(v) * 0.1)} now to hold the old price.`, effects: { cash: -scale(v) * 0.1, unit_cost_pct: 0, demand_months: 6 } },
    ],
  }),
  (v) => ({
    headline: 'Your best person is burning out',
    story: `The pace at ${v.name} is catching up with everyone. Mistakes are creeping in, and a few customers have noticed.`,
    concept: 'Capacity and delegation',
    choices: [
      { label: 'Give everyone a long weekend', detail: 'Lose some capacity this month; morale recovers.', effects: { capacity_pct: -15, demand_months: 1, morale: 12 } },
      { label: 'Hire a part-time helper', detail: `About ${money(KINDS[v.kind].wage * 0.5)} a month for three months.`, effects: { capacity_pct: 20, demand_months: 3, cash_later: { amount: -KINDS[v.kind].wage * 1.5, months: 3 }, morale: 6 } },
      { label: 'Push through', detail: 'Keep the pace and hope it passes.', effects: { morale: -10, reputation: -3 } },
    ],
  }),
  (v) => ({
    headline: 'A local paper wants a feature',
    story: `A local reporter is writing about new businesses and would like to feature ${v.name}. They also offer a paid advertorial alongside it.`,
    concept: 'Marketing return on spend',
    choices: [
      { label: 'Do the free feature only', detail: 'A modest bump in interest.', effects: { demand_pct: 8, demand_months: 2, reputation: 3 } },
      { label: 'Pay for the advertorial too', detail: `${money(scale(v) * 0.06)} for a bigger push.`, effects: { cash: -scale(v) * 0.06, demand_pct: 20, demand_months: 2, reputation: 3 } },
      { label: 'Decline', detail: 'Stay heads-down.', effects: {} },
    ],
  }),
];

export function fallbackEvent(v: Venture): VentureEvent {
  return GENERIC[v.month % GENERIC.length](v);
}

export function fallbackDebrief(v: Venture) {
  const last = v.history.at(-1);
  if (!last) return null;
  const cashMove = last.cashEnd - last.cashStart;
  if (last.profit > 0 && cashMove < 0)
    return `You made a profit of $${last.profit.toLocaleString()}, yet cash fell by $${(-cashMove).toLocaleString()}. That gap is timing: money spent on stock or owed by customers shows up in profit and cash at different moments.`;
  if (last.turnedAway > 0)
    return `Customers wanted ${last.demand.toLocaleString()} but you could serve ${last.units.toLocaleString()}. Unmet demand is lost revenue and, over time, lost reputation: capacity or stock was the constraint.`;
  return `Revenue was $${last.revenue.toLocaleString()} and profit $${last.profit.toLocaleString()}. Watch what each extra ${KINDS[v.kind].unit} earns after its variable cost; that margin pays for everything fixed.`;
}
