// Venture: an ongoing business simulation. The learner runs a small company
// one month at a time. The numbers are simulated here, deterministically and
// with real accounting: demand responds to price, marketing and reputation;
// capacity limits sales; revenue is booked when earned but collected on the
// customer's terms; inventory is paid for before it sells. So profit and cash
// drift apart exactly as they do in real businesses, and every decision
// carries forward. The AI only writes the story around the numbers (events
// and debriefs); it never decides an outcome.

export type KindId = 'roastery' | 'studio' | 'truck';

export type Kind = {
  id: KindId;
  label: string;
  pitch: string;
  unit: string; // singular, for sentences ("bag")
  units: string;
  price: number; // starting and reference price
  unitCost: number; // variable cost per unit
  elasticity: number; // how strongly demand falls as price rises
  demand: number; // baseline monthly demand at the reference price
  founderCap: number; // units the founder can produce alone
  staffCap: number; // units each hire adds
  wage: number; // monthly, fully loaded
  founderPay: number; // what the founder pays themself: a real cost
  rent: number;
  terms: number[]; // share of revenue collected this month, next, the one after
  inventory: boolean; // must be bought before it can be sold
  spoil: number; // share of unsold inventory lost each month
  season: number[]; // demand multiplier by calendar month, Jan..Dec
  equipment: { name: string; mult: number; cost: number }[];
  startCash: number;
};

export const KINDS: Record<KindId, Kind> = {
  roastery: {
    id: 'roastery',
    label: 'Coffee roastery',
    pitch: 'Roast and sell bags of coffee to regulars and a few cafés. Inventory, margins and wholesale terms.',
    unit: 'bag',
    units: 'bags',
    price: 18,
    unitCost: 6.5,
    elasticity: 1.5,
    demand: 800,
    founderCap: 900,
    staffCap: 700,
    wage: 3400,
    founderPay: 3500,
    rent: 2600,
    terms: [0.75, 0.25, 0],
    inventory: true,
    spoil: 0.05,
    season: [1.1, 1, 0.95, 0.9, 0.85, 0.8, 0.8, 0.85, 0.95, 1.05, 1.2, 1.4],
    equipment: [
      { name: 'Used 5 kg roaster', mult: 1, cost: 0 },
      { name: '15 kg roaster', mult: 1.8, cost: 22000 },
      { name: 'Production line', mult: 3, cost: 60000 },
    ],
    startCash: 24000,
  },
  studio: {
    id: 'studio',
    label: 'Design studio',
    pitch: 'Take on branding projects for local businesses. People, capacity and clients who pay late.',
    unit: 'project',
    units: 'projects',
    price: 3200,
    unitCost: 350,
    elasticity: 1.1,
    demand: 3.2,
    founderCap: 3,
    staffCap: 2.5,
    wage: 5800,
    founderPay: 4000,
    rent: 1600,
    terms: [0.3, 0.4, 0.3],
    inventory: false,
    spoil: 0,
    season: [0.8, 0.95, 1.05, 1.1, 1.05, 0.95, 0.8, 0.8, 1.1, 1.15, 1.05, 0.7],
    equipment: [
      { name: 'Laptops and a shared desk', mult: 1, cost: 0 },
      { name: 'Proper studio and licences', mult: 1.25, cost: 12000 },
      { name: 'Production suite', mult: 1.5, cost: 30000 },
    ],
    startCash: 22000,
  },
  truck: {
    id: 'truck',
    label: 'Food truck',
    pitch: 'Serve lunch from a truck around town. Perishable stock, weather, locations and thin margins.',
    unit: 'meal',
    units: 'meals',
    price: 13,
    unitCost: 5.5,
    elasticity: 1.8,
    demand: 1500,
    founderCap: 1800,
    staffCap: 1400,
    wage: 3000,
    founderPay: 3200,
    rent: 2400,
    terms: [1, 0, 0],
    inventory: true,
    spoil: 0.6,
    season: [0.65, 0.7, 0.85, 1, 1.15, 1.3, 1.35, 1.3, 1.1, 0.95, 0.75, 0.7],
    equipment: [
      { name: 'Second-hand truck', mult: 1, cost: 0 },
      { name: 'Second grill and a card reader', mult: 1.5, cost: 14000 },
      { name: 'A second truck', mult: 2.4, cost: 48000 },
    ],
    startCash: 18000,
  },
};

// ---------- State ----------

export type Effects = {
  cash?: number; // now (+ in, − out)
  cash_later?: { amount: number; months: number } | null; // a promise of money later (or a bill)
  demand_pct?: number; // for demand_months
  demand_months?: number;
  reputation?: number;
  morale?: number;
  unit_cost_pct?: number; // for demand_months
  capacity_pct?: number; // for demand_months
  staff?: number; // hire (+1) or lose (−1) one person
};
export type Choice = { label: string; detail: string; effects: Effects };
export type VentureEvent = {
  headline: string;
  story: string;
  concept: string; // the idea this decision exercises, in plain words
  choices: Choice[];
  chosen?: number;
};
export type Levers = {
  price: number;
  marketing: number; // monthly spend
  staff: number; // employees, not counting the founder
  restock: number; // units to buy this month (inventory businesses)
  borrow: number; // new loan this month
  repay: number; // extra repayment this month
  upgrade: boolean; // buy the next equipment level this month
};
export type Modifier = { until: number; demand?: number; unitCost?: number; capacity?: number; note: string };
export type Receivable = { month: number; amount: number; note?: string };
export type MonthResult = {
  month: number; // 1-based month number played
  date: string; // local date the month was played (for streaks and quests)
  calendar: number; // 0..11, the in-game calendar month
  demand: number;
  capacity: number;
  units: number;
  turnedAway: number;
  price: number;
  revenue: number;
  cogs: number;
  waste: number;
  opex: { rent: number; wages: number; marketing: number; interest: number; depreciation: number };
  profit: number;
  cashStart: number;
  collected: number;
  spent: { stock: number; costs: number; opex: number; loan: number; equipment: number };
  borrowed: number;
  cashEnd: number;
  receivables: number;
  inventory: number;
  reputation: number;
  morale: number;
  debt: number;
  notes: string[];
  choice?: string;
};
export type Venture = {
  version: 1;
  kind: KindId;
  name: string;
  founder: string;
  created_at: string;
  start_calendar: number; // in-game month the company opens, 0..11
  month: number; // months played
  cash: number;
  receivables: Receivable[];
  inventory: number;
  debt: number;
  equipment: number; // index into kind.equipment
  equipment_cost: number; // for depreciation, spread over 36 months
  reputation: number; // 0..100
  morale: number; // 0..100
  levers: Levers;
  modifiers: Modifier[];
  event: VentureEvent | null;
  debrief: string | null;
  history: MonthResult[];
  achievements: string[];
  status: 'running' | 'bankrupt';
  carried?: number; // months played in earlier companies
};

const APR = 0.09,
  EMERGENCY_APR = 0.22,
  TERM = 24;
export const DEPRECIATION_MONTHS = 36;
export const debtLimit = (k: Kind) => k.startCash * 3;
const round = (n: number) => Math.round(n);
const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

export function create(input: { kind: KindId; name: string; founder: string; loan: boolean; now: Date }): Venture {
  const k = KINDS[input.kind];
  const loan = input.loan ? round(k.startCash * 0.6) : 0;
  return {
    version: 1,
    kind: k.id,
    name: input.name.trim().slice(0, 40) || 'Untitled Co.',
    founder: input.founder.trim().slice(0, 40) || 'Founder',
    created_at: input.now.toISOString(),
    start_calendar: input.now.getMonth(),
    month: 0,
    cash: k.startCash + loan,
    receivables: [],
    inventory: 0,
    debt: loan,
    equipment: 0,
    equipment_cost: 0,
    reputation: 50,
    morale: 70,
    levers: {
      price: k.price,
      marketing: round((k.price * k.demand * 0.04) / 50) * 50,
      staff: 0,
      restock: k.inventory ? round(k.demand * 0.9) : 0,
      borrow: 0,
      repay: 0,
      upgrade: false,
    },
    modifiers: [],
    event: null,
    debrief: null,
    history: [],
    achievements: [],
    status: 'running',
  };
}

// Small deterministic noise, so a month's luck is fixed by the company and month.
function rng(seed: string) {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

export const monthlyPayment = (debt: number) => (debt <= 0 ? 0 : (debt * (APR / 12)) / (1 - Math.pow(1 + APR / 12, -TERM)));
export const calendarOf = (v: Venture, month = v.month) => (v.start_calendar + month) % 12;
export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// What the levers allow, so the interface and the server agree.
export function bounds(v: Venture) {
  const k = KINDS[v.kind];
  return {
    price: { min: round(k.price * 0.5 * 100) / 100, max: round(k.price * 2 * 100) / 100 },
    marketing: { min: 0, max: round(k.price * k.demand * 0.25) },
    staff: { min: 0, max: 8 },
    restock: { min: 0, max: round(k.demand * 4) },
    borrow: { min: 0, max: Math.max(0, debtLimit(k) - round(v.debt)) },
    repay: { min: 0, max: Math.max(0, round(Math.min(v.debt, v.cash))) },
  };
}
export function sanitize(v: Venture, l: Partial<Levers>): Levers {
  const b = bounds(v);
  const n = (x: unknown, fallback: number) => (typeof x === 'number' && Number.isFinite(x) ? x : fallback);
  const k = KINDS[v.kind];
  return {
    price: clamp(round(n(l.price, v.levers.price) * 100) / 100, b.price.min, b.price.max),
    marketing: clamp(round(n(l.marketing, v.levers.marketing)), b.marketing.min, b.marketing.max),
    staff: clamp(round(n(l.staff, v.levers.staff)), b.staff.min, b.staff.max),
    restock: k.inventory ? clamp(round(n(l.restock, v.levers.restock)), b.restock.min, b.restock.max) : 0,
    borrow: clamp(round(n(l.borrow, 0)), b.borrow.min, b.borrow.max),
    repay: clamp(round(n(l.repay, 0)), b.repay.min, b.repay.max),
    upgrade: !!l.upgrade && v.equipment < k.equipment.length - 1,
  };
}

// Model outputs are clamped to the size of the business, so a story can
// never hand out an absurd windfall or an unfair catastrophe.
export function clampEffects(v: Venture, e: Effects): Effects {
  const k = KINDS[v.kind];
  const scale = k.price * k.demand; // a typical month's revenue
  const r = (x: number | undefined, lo: number, hi: number) => (typeof x === 'number' && Number.isFinite(x) ? clamp(round(x), lo, hi) : undefined);
  return {
    cash: r(e.cash, -scale * 0.6, scale * 0.6),
    cash_later: e.cash_later && Number.isFinite(e.cash_later.amount)
      ? { amount: clamp(round(e.cash_later.amount), -scale * 0.6, scale * 1.2), months: clamp(round(e.cash_later.months || 1), 1, 3) }
      : null,
    demand_pct: r(e.demand_pct, -35, 45),
    demand_months: r(e.demand_months, 1, 6) ?? 1,
    reputation: r(e.reputation, -15, 15),
    morale: r(e.morale, -15, 15),
    unit_cost_pct: r(e.unit_cost_pct, -25, 30),
    capacity_pct: r(e.capacity_pct, -35, 35),
    staff: r(e.staff, -1, 1),
  };
}

// Choosing a response to the month's event: immediate effects land now,
// the rest become modifiers and promises that play out over later months.
export function choose(v: Venture, index: number): Venture {
  if (!v.event || v.event.chosen !== undefined) return v;
  const c = v.event.choices[index];
  if (!c) return v;
  const e = clampEffects(v, c.effects);
  const next: Venture = structuredClone(v);
  next.event = { ...v.event, chosen: index };
  if (e.cash) next.cash += e.cash;
  if (e.cash_later?.amount) next.receivables.push({ month: v.month + 1 + (e.cash_later.months - 1), amount: e.cash_later.amount, note: c.label });
  if (e.reputation) next.reputation = clamp(next.reputation + e.reputation, 0, 100);
  if (e.morale) next.morale = clamp(next.morale + e.morale, 0, 100);
  if (e.staff) next.levers.staff = clamp(next.levers.staff + e.staff, 0, 8);
  if (e.demand_pct || e.unit_cost_pct || e.capacity_pct)
    next.modifiers.push({
      until: v.month + (e.demand_months || 1),
      demand: e.demand_pct ? 1 + e.demand_pct / 100 : undefined,
      unitCost: e.unit_cost_pct ? 1 + e.unit_cost_pct / 100 : undefined,
      capacity: e.capacity_pct ? 1 + e.capacity_pct / 100 : undefined,
      note: c.label,
    });
  return next;
}

// Demand this month at a given price, before capacity: used by the result
// and by the interface's "if you charge this" preview.
export function demandAt(v: Venture, price: number, marketing: number, month = v.month) {
  const k = KINDS[v.kind];
  const season = k.season[calendarOf(v, month)];
  const priceFactor = Math.pow(price / k.price, -k.elasticity);
  // Marketing has diminishing returns.
  const reach = 0.45 * (1 - Math.exp(-marketing / (k.price * k.demand * 0.06)));
  const reputation = 0.55 + 0.9 * (v.reputation / 100);
  // Word of mouth grows the base slowly while the business keeps going.
  const growth = 1 + Math.min(0.5, month * 0.025);
  const mods = v.modifiers.filter((m) => m.until > month).reduce((x, m) => x * (m.demand || 1), 1);
  return k.demand * season * priceFactor * (1 + reach) * reputation * growth * mods;
}
export function capacityOf(v: Venture, staff: number, equipment = v.equipment, month = v.month) {
  const k = KINDS[v.kind];
  const morale = 0.8 + 0.4 * (v.morale / 100);
  const mods = v.modifiers.filter((m) => m.until > month).reduce((x, m) => x * (m.capacity || 1), 1);
  return (k.founderCap + staff * k.staffCap) * k.equipment[equipment].mult * morale * mods;
}

// Run one month. Pure: returns the next state and the month's result.
// `expected` removes the month's luck, for forecasts.
export function simulate(v0: Venture, playedOn: string, expected = false): { venture: Venture; result: MonthResult } {
  const v: Venture = structuredClone(v0);
  const k = KINDS[v.kind];
  const L = sanitize(v, v.levers);
  const month = v.month;
  const rand = rng(`${v.name}:${v.created_at}:${month}`);
  const notes: string[] = [];
  const cashStart = v.cash;

  // Financing and investment happen first.
  let borrowed = 0;
  if (L.borrow > 0) {
    v.debt += L.borrow;
    v.cash += L.borrow;
    borrowed += L.borrow;
    notes.push(`Borrowed $${L.borrow.toLocaleString()} at ${Math.round(APR * 100)}%.`);
  }
  let equipmentSpend = 0;
  if (L.upgrade) {
    const next = k.equipment[v.equipment + 1];
    equipmentSpend = next.cost;
    v.cash -= next.cost;
    v.equipment += 1;
    v.equipment_cost += next.cost;
    notes.push(`Bought ${next.name.toLowerCase()} for $${next.cost.toLocaleString()} (spread over ${DEPRECIATION_MONTHS} months as depreciation).`);
  }
  // Demand, capacity and stock.
  const noise = expected ? 1 : 0.9 + rand() * 0.2;
  const demand = round(demandAt(v, L.price, L.marketing) * noise);
  const capacity = round(capacityOf(v, L.staff));
  const costMult = v.modifiers.filter((m) => m.until > month).reduce((x, m) => x * (m.unitCost || 1), 1);
  const unitCost = k.unitCost * costMult;
  let stockSpend = 0,
    available = Infinity;
  if (k.inventory) {
    stockSpend = round(L.restock * unitCost);
    v.cash -= stockSpend;
    available = v.inventory + L.restock;
  }
  const units = Math.max(0, Math.min(demand, capacity, available));
  const turnedAway = Math.max(0, demand - units);
  let waste = 0;
  if (k.inventory) {
    const left = available - units;
    const spoiled = round(left * k.spoil);
    v.inventory = left - spoiled;
    waste = round(spoiled * unitCost);
    if (spoiled > 0) notes.push(`${spoiled.toLocaleString()} ${k.units} spoiled or went stale.`);
  }

  // The income statement: revenue when earned, costs when incurred.
  const revenue = round(units * L.price);
  const cogs = round(units * unitCost);
  const interest = round(v.debt * (APR / 12));
  const depreciation = round(v.equipment_cost / DEPRECIATION_MONTHS);
  const opex = { rent: k.rent, wages: k.founderPay + L.staff * k.wage, marketing: L.marketing, interest, depreciation };
  const profit = revenue - cogs - waste - opex.rent - opex.wages - opex.marketing - opex.interest - opex.depreciation;

  // Cash: collected on the customer's terms; costs paid now.
  k.terms.forEach((share, j) => {
    const amount = round(revenue * share);
    if (amount) v.receivables.push({ month: month + j, amount });
  });
  const due = v.receivables.filter((r) => r.month <= month);
  const collected = due.reduce((n, r) => n + r.amount, 0);
  v.receivables = v.receivables.filter((r) => r.month > month);
  v.cash += collected;
  const costs = k.inventory ? 0 : cogs;
  v.cash -= costs + opex.rent + opex.wages + opex.marketing + interest;
  const payment = monthlyPayment(v.debt);
  const principal = Math.min(v.debt, Math.max(0, round(payment - interest)) + L.repay);
  v.debt -= principal;
  v.cash -= principal;

  // Running out of cash means expensive emergency borrowing, or the end.
  if (v.cash < 0) {
    const need = -v.cash;
    if (v.debt + need > debtLimit(k) * 1.2) {
      v.status = 'bankrupt';
      notes.push('The bank declined an emergency loan. The company has run out of cash.');
    } else {
      const extra = round(need * (EMERGENCY_APR - APR) / 12);
      v.debt += need + extra;
      v.cash = 0;
      borrowed += need;
      notes.push(`Cash ran out. An emergency overdraft covered $${round(need).toLocaleString()} at ${Math.round(EMERGENCY_APR * 100)}%.`);
    }
  }

  // People and reputation respond to how the month went.
  const utilisation = capacity ? units / capacity : 1;
  if (turnedAway > demand * 0.15) {
    v.reputation -= Math.min(5, (turnedAway / demand) * 10);
    notes.push(`${turnedAway.toLocaleString()} ${k.units} of demand went unserved.`);
  } else v.reputation += 1.5;
  if (L.price > k.price * 1.4) v.reputation -= 1.5;
  // Reputation drifts back toward neutral when nothing much happens.
  v.reputation += (50 - v.reputation) * 0.04;
  // Running flat out, turning people away, wears a team down.
  if (utilisation > 0.97 && turnedAway > 0) v.morale -= 3;
  else if (utilisation < 0.6) v.morale += 1;
  else v.morale += 2;
  v.morale += (65 - v.morale) * 0.05;
  if (profit < 0 && cashStart > v.cash) v.morale -= 2;
  v.reputation = clamp(v.reputation, 0, 100);
  v.morale = clamp(v.morale, 0, 100);

  v.modifiers = v.modifiers.filter((m) => m.until > month + 1);
  v.month += 1;
  v.levers = { ...L, borrow: 0, repay: 0, upgrade: false };
  const result: MonthResult = {
    month: v.month,
    date: playedOn,
    calendar: calendarOf(v0, month),
    demand,
    capacity,
    units,
    turnedAway,
    price: L.price,
    revenue,
    cogs,
    waste,
    opex,
    profit,
    cashStart: round(cashStart),
    collected,
    spent: { stock: stockSpend, costs, opex: opex.rent + opex.wages + opex.marketing + interest, loan: principal, equipment: equipmentSpend },
    borrowed,
    cashEnd: round(v.cash),
    receivables: v.receivables.reduce((n, r) => n + r.amount, 0),
    inventory: v.inventory,
    reputation: round(v.reputation),
    morale: round(v.morale),
    debt: round(v.debt),
    notes,
    choice: v0.event?.chosen !== undefined ? v0.event.choices[v0.event.chosen]?.label : undefined,
  };
  v.cash = round(v.cash);
  v.debt = round(v.debt);
  v.history = [...v.history, result].slice(-60);
  v.event = null;
  v.achievements = [...new Set([...v.achievements, ...earned(v, result)])];
  return { venture: v, result };
}

// ---------- Milestones worth celebrating ----------

export const ACHIEVEMENTS: Record<string, { label: string; detail: string }> = {
  'first-month': { label: 'Open for business', detail: 'Run your first month' },
  'first-profit': { label: 'In the black', detail: 'A profitable month' },
  'cash-over-profit': { label: 'Profit isn’t cash', detail: 'Profitable, yet cash went down' },
  'first-hire': { label: 'First hire', detail: 'Employ someone' },
  'upgrade': { label: 'Invested', detail: 'Buy better equipment' },
  'crunch': { label: 'Survived a crunch', detail: 'Run out of cash and keep going' },
  'debt-free': { label: 'Debt-free', detail: 'Pay off every loan' },
  'loved': { label: 'Local favourite', detail: 'Reputation of 80 or more' },
  'year': { label: 'One year in', detail: 'Keep the company going for 12 months' },
  'streak-3': { label: 'Steady', detail: 'Three profitable months in a row' },
};
function earned(v: Venture, r: MonthResult): string[] {
  const out = ['first-month'];
  if (r.profit > 0) out.push('first-profit');
  if (r.profit > 0 && r.cashEnd < r.cashStart) out.push('cash-over-profit');
  if (v.levers.staff > 0) out.push('first-hire');
  if (v.equipment > 0) out.push('upgrade');
  if (r.notes.some((n) => n.startsWith('Cash ran out'))) out.push('crunch');
  if (v.debt === 0 && v.history.some((h) => h.debt > 0)) out.push('debt-free');
  if (v.reputation >= 80) out.push('loved');
  if (v.month >= 12) out.push('year');
  if (v.history.slice(-3).length === 3 && v.history.slice(-3).every((h) => h.profit > 0)) out.push('streak-3');
  return out;
}

// A rough, honest value: the balance sheet plus about a year and a half of
// recent profit, trusted fully only once there are three months of history.
export function value(v: Venture) {
  const recent = v.history.slice(-3);
  const profit = recent.length ? recent.reduce((n, h) => n + h.profit, 0) / recent.length : 0;
  const receivables = v.receivables.reduce((n, r) => n + r.amount, 0);
  const stock = v.inventory * KINDS[v.kind].unitCost;
  const earnings = Math.max(0, profit) * 18 * (recent.length / 3);
  return Math.max(0, round(earnings + v.cash + receivables + stock - v.debt));
}

// The company in a few lines, for the tutor and the storyteller.
export function summary(v: Venture) {
  const k = KINDS[v.kind];
  const last = v.history.at(-1);
  const owed = v.receivables.reduce((n, r) => n + r.amount, 0);
  return [
    `${v.name}, a ${k.label.toLowerCase()} run by ${v.founder}. Month ${v.month} (${MONTHS[calendarOf(v)]}).`,
    `Cash $${v.cash.toLocaleString()}, owed by customers $${owed.toLocaleString()}, debt $${v.debt.toLocaleString()}, ${k.inventory ? `${v.inventory.toLocaleString()} ${k.units} in stock, ` : ''}${v.levers.staff} staff, ${k.equipment[v.equipment].name.toLowerCase()}.`,
    `Price $${v.levers.price} per ${k.unit}; marketing $${v.levers.marketing.toLocaleString()} a month. Reputation ${Math.round(v.reputation)}/100, team morale ${Math.round(v.morale)}/100.`,
    last
      ? `Last month: sold ${last.units.toLocaleString()} of ${last.demand.toLocaleString()} ${k.units} demanded (capacity ${last.capacity.toLocaleString()}), revenue $${last.revenue.toLocaleString()}, profit $${last.profit.toLocaleString()}, cash ${last.cashEnd >= last.cashStart ? 'up' : 'down'} $${Math.abs(last.cashEnd - last.cashStart).toLocaleString()}.${last.choice ? ` Their decision: ${last.choice}.` : ''}`
      : 'It has not traded yet.',
  ].join('\n');
}

// A forecast of the coming month with the current plan and no luck: what
// the Cash forecast tool shows.
export const forecast = (v: Venture) => simulate(v, '', true).result;
export const unitMargin = (v: Venture) => v.levers.price - KINDS[v.kind].unitCost;
export function breakEven(v: Venture) {
  const k = KINDS[v.kind];
  const fixed = k.rent + k.founderPay + v.levers.staff * k.wage + v.levers.marketing + v.debt * (APR / 12) + v.equipment_cost / DEPRECIATION_MONTHS;
  const margin = unitMargin(v);
  return margin > 0 ? Math.ceil(fixed / margin) : Infinity;
}
