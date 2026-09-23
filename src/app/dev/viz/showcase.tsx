'use client';
import { useEffect, useState } from 'react';
import type { Viz } from '@/lib/viz/schema';
import { Visual, VisualSkeleton } from '@/components/viz/visual';

const EXAMPLES: { spec: Viz; wide?: boolean }[] = [
  {
    spec: {
      type: 'stat',
      items: [
        { label: 'Revenue', value: '$184k', delta: '+12% vs Q2', tone: 'accent' },
        { label: 'Net margin', value: '14.2%', delta: '+1.8 pts', tone: 'default' },
        { label: 'Cash runway', value: '7 mo', delta: '−2 mo', tone: 'negative' },
        { label: 'DSO', value: '41 d', delta: null, tone: 'muted' },
      ],
      takeaway: 'Growth is healthy, but slower collections are eating the runway.',
    },
    wide: true,
  },
  {
    spec: {
      type: 'waterfall',
      title: 'Why profit isn’t cash — Q3',
      unit: '$',
      start: { label: 'Net profit', value: 42000 },
      steps: [
        { label: 'Depreciation', delta: 8000 },
        { label: 'Receivables up', delta: -21500 },
        { label: 'Inventory up', delta: -9000 },
        { label: 'Payables up', delta: 6500 },
        { label: 'Equipment', delta: -18000 },
      ],
      end_label: 'Cash change',
      takeaway: 'You earned $42k but kept only $8k: customers are paying you later.',
    },
  },
  {
    spec: {
      type: 'line',
      title: 'Cash balance, actual and forecast',
      unit: '$',
      x_label: 'Month',
      series: [
        {
          name: 'Actual',
          tone: 'accent',
          dashed: false,
          points: [
            { x: 'Jan', y: 48000 },
            { x: 'Feb', y: 51000 },
            { x: 'Mar', y: 46500 },
            { x: 'Apr', y: 53000 },
            { x: 'May', y: 49500 },
            { x: 'Jun', y: 41000 },
          ],
        },
        {
          name: 'Forecast',
          tone: 'default',
          dashed: true,
          points: [
            { x: 'Jun', y: 41000 },
            { x: 'Jul', y: 36000 },
            { x: 'Aug', y: 29500 },
            { x: 'Sep', y: 31000 },
            { x: 'Oct', y: 24000 },
          ],
        },
      ],
      annotations: [{ x: 'Mar', label: 'Hired 2 staff' }],
      takeaway: 'At this pace, cash drops below one month of costs by October.',
    },
  },
  {
    spec: {
      type: 'sim',
      title: 'Break-even: move the levers',
      inputs: [
        { id: 'price', label: 'Price per unit', min: 20, max: 120, step: 1, value: 60, unit: '$' },
        { id: 'unit_cost', label: 'Variable cost per unit', min: 5, max: 80, step: 1, value: 28, unit: '$' },
        { id: 'fixed', label: 'Fixed costs / month', min: 2000, max: 40000, step: 500, value: 16000, unit: '$' },
        { id: 'units', label: 'Units sold / month', min: 0, max: 1500, step: 10, value: 620, unit: 'units' },
      ],
      outputs: [
        { label: 'Break-even units', formula: 'round(fixed / max(price - unit_cost, 0.01))', format: 'number', tone: 'accent' },
        { label: 'Monthly profit', formula: 'units * (price - unit_cost) - fixed', format: 'currency', tone: 'default' },
        { label: 'Contribution margin', formula: '(price - unit_cost) / price', format: 'percent', tone: 'muted' },
      ],
      takeaway: 'Each dollar of margin per unit lowers the break-even point faster than cutting fixed costs.',
    },
    wide: true,
  },
  {
    spec: {
      type: 'bar',
      title: 'Revenue by client, Q3',
      unit: '$',
      bars: [
        { label: 'Northwind', value: 64000, tone: 'accent', pending: 22000, note: 'Net-60 terms' },
        { label: 'Contoso', value: 41500, tone: 'default', pending: null, note: null },
        { label: 'Fabrikam', value: 28000, tone: 'default', pending: 9500, note: null },
        { label: 'Adventure Works Cycles Ltd', value: 12000, tone: 'muted', pending: null, note: null },
      ],
      takeaway: 'A third of your biggest client’s revenue hasn’t arrived yet.',
    },
  },
  {
    spec: {
      type: 'statement',
      title: 'Income statement, Q3',
      unit: '$',
      sections: [
        {
          heading: 'Revenue',
          rows: [
            { label: 'Product sales', value: 152000, emphasis: 'normal' },
            { label: 'Services', value: 32000, emphasis: 'normal' },
            { label: 'Total revenue', value: 184000, emphasis: 'subtotal' },
          ],
        },
        {
          heading: 'Costs',
          rows: [
            { label: 'Cost of goods sold', value: -78000, emphasis: 'normal' },
            { label: 'Salaries', value: -46000, emphasis: 'normal' },
            { label: 'Rent & software', value: -11000, emphasis: 'normal' },
            { label: 'Depreciation', value: -7000, emphasis: 'normal' },
            { label: 'Operating profit', value: 42000, emphasis: 'subtotal' },
          ],
        },
        {
          heading: null,
          rows: [
            { label: 'Tax', value: -15900, emphasis: 'normal' },
            { label: 'Net profit', value: 26100, emphasis: 'total' },
          ],
        },
      ],
      takeaway: 'Gross margin is 58%; salaries are the next lever after cost of goods.',
    },
  },
  {
    spec: {
      type: 'compare',
      title: 'Three ways to price the retainer',
      columns: [
        { heading: 'Hourly', tone: 'muted' },
        { heading: 'Monthly retainer', tone: 'accent' },
        { heading: 'Per project', tone: 'default' },
      ],
      rows: [
        { label: 'Cash predictability', cells: ['Low', 'High', 'Medium'] },
        { label: 'Client perceives', cells: ['Time spent', 'Access to you', 'Outcome'] },
        { label: 'Scope creep risk', cells: ['None', 'Moderate — cap hours', 'High'] },
        { label: 'Best when', cells: ['Work is undefined', 'Ongoing, steady needs', 'Clear deliverable'] },
      ],
      takeaway: 'Retainers trade some upside for cash you can plan around.',
    },
  },
  {
    spec: {
      type: 'matrix',
      title: 'Where to spend your week',
      x_axis: { label: 'Effort', low: 'Low', high: 'High' },
      y_axis: { label: 'Impact', low: 'Low', high: 'High' },
      items: [
        { label: 'Chase overdue invoices', x: 0.18, y: 0.86, tone: 'accent' },
        { label: 'Raise prices 8%', x: 0.28, y: 0.78, tone: 'positive' },
        { label: 'New website', x: 0.82, y: 0.34, tone: 'muted' },
        { label: 'Hire a bookkeeper', x: 0.62, y: 0.66, tone: 'default' },
        { label: 'Reorganise files', x: 0.3, y: 0.14, tone: 'muted' },
        { label: 'Enter new market', x: 0.9, y: 0.8, tone: 'default' },
      ],
      takeaway: 'Two quick wins sit top-left; do those before anything else.',
    },
  },
  {
    spec: {
      type: 'spectrum',
      title: 'Positions on a carbon tax',
      left: 'Oppose any tax',
      right: 'High tax, no rebate',
      markers: [
        { label: 'Status quo party', position: 0.12, tone: 'muted' },
        { label: 'Industry lobby', position: 0.2, tone: 'default' },
        { label: 'Fee and dividend', position: 0.52, tone: 'accent' },
        { label: 'Cap and trade', position: 0.47, tone: 'default' },
        { label: 'Green platform', position: 0.88, tone: 'default' },
      ],
      takeaway: 'The live debate sits near the centre: how to price carbon, not whether.',
    },
  },
  {
    spec: {
      type: 'flow',
      title: 'Delegating a task well',
      steps: [
        { label: 'Define the outcome', detail: 'What done looks like, and by when.', tone: 'accent' },
        { label: 'Hand over context', detail: 'Why it matters; what you’ve tried.', tone: 'default' },
        { label: 'Agree check-ins', detail: 'One midpoint, not constant pings.', tone: 'default' },
        { label: 'Review & debrief', detail: 'Feedback on the work, not the person.', tone: 'positive' },
      ],
      loops: true,
      takeaway: 'Most delegation fails at step one: the outcome was never said out loud.',
    },
    wide: true,
  },
  {
    spec: {
      type: 'timeline',
      title: 'Founding the federal system',
      events: [
        { when: '1776', label: 'Declaration of Independence', detail: null, tone: 'default' },
        { when: '1781', label: 'Articles of Confederation', detail: 'A weak centre; no power to tax.', tone: 'muted' },
        { when: '1787', label: 'Constitutional Convention', detail: 'The Great Compromise on representation.', tone: 'accent' },
        { when: '1788', label: 'Ratification', detail: 'Nine states make it law.', tone: 'default' },
        { when: '1791', label: 'Bill of Rights', detail: 'Ten amendments limit federal power.', tone: 'positive' },
      ],
      takeaway: 'The Constitution was a repair job on a government that could not raise money.',
    },
    wide: true,
  },
  {
    spec: {
      type: 'concepts',
      title: 'How the three statements connect',
      nodes: [
        { id: 'is', label: 'Income statement', tone: 'default', emphasis: false },
        { id: 'np', label: 'Net profit', tone: 'accent', emphasis: true },
        { id: 'bs', label: 'Balance sheet', tone: 'default', emphasis: false },
        { id: 'cf', label: 'Cash flow statement', tone: 'default', emphasis: false },
        { id: 're', label: 'Retained earnings', tone: 'default', emphasis: false },
        { id: 'cash', label: 'Cash', tone: 'positive', emphasis: false },
        { id: 'wc', label: 'Working capital', tone: 'negative', emphasis: false },
      ],
      edges: [
        { from: 'is', to: 'np', label: 'ends in' },
        { from: 'np', to: 're', label: 'adds to' },
        { from: 'np', to: 'cf', label: 'starts' },
        { from: 're', to: 'bs', label: 'sits on' },
        { from: 'wc', to: 'cf', label: 'adjusts' },
        { from: 'cf', to: 'cash', label: 'explains change in' },
        { from: 'cash', to: 'bs', label: null },
        { from: 'ghost', to: 'bs', label: 'unknown id, skipped' },
      ],
      takeaway: 'Net profit is the thread: it flows into both the balance sheet and cash flow.',
    },
    wide: true,
  },
];

// Deliberately malformed specs, as a model might emit them.
const EDGE: Viz[] = [
  { type: 'bar', title: 'Empty bars', unit: '$', bars: [], takeaway: 'Nothing to compare yet.' },
  {
    type: 'bar',
    title: 'Mixed signs & identical values',
    unit: 'hrs',
    bars: [
      { label: 'Planned', value: 12, tone: 'default', pending: null, note: null },
      { label: 'Overrun', value: -4.5, tone: 'negative', pending: null, note: null },
      { label: 'Same', value: 12, tone: 'accent', pending: 40, note: null },
      { label: 'Bad', value: NaN, tone: 'default', pending: null, note: null },
    ],
    takeaway: 'Negative values extend left of zero.',
  },
  {
    type: 'line',
    title: 'Single point, flat series',
    unit: '%',
    x_label: null,
    series: [
      { name: 'One', tone: 'accent', dashed: false, points: [{ x: 'Q1', y: 5 }] },
      { name: 'Flat', tone: 'default', dashed: true, points: [{ x: 'Q1', y: 5 }, { x: 'Q2', y: 5 }] },
    ],
    annotations: [{ x: 'nope', label: 'Unknown x' }],
    takeaway: 'Zero range should not divide by zero.',
  },
  {
    type: 'sim',
    title: 'Swapped range, broken formula',
    inputs: [{ id: 'x', label: 'X', min: 10, max: 0, step: 0, value: 50, unit: '%' }],
    outputs: [
      { label: 'Broken', formula: 'x * (', format: 'number', tone: 'negative' },
      { label: 'Unknown input', formula: 'y + 1', format: 'currency', tone: 'default' },
      { label: 'Half', formula: 'x / 2', format: 'number', tone: 'accent' },
    ],
    takeaway: 'Bad formulas show a dash.',
  },
  {
    type: 'compare',
    title: 'Ragged cells',
    columns: [{ heading: 'A', tone: 'default' }, { heading: 'B', tone: 'accent' }],
    rows: [
      { label: 'Short row', cells: ['only one'] },
      { label: 'Long row', cells: ['x', 'y', 'dropped'] },
    ],
    takeaway: 'Missing cells are padded.',
  },
];

export function Showcase() {
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [key, setKey] = useState(0);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);
  return (
    <main className="page viz-dev">
      <header className="viz-dev-head">
        <div>
          <h1>Visual primitives</h1>
          <p>Every spec type the tutor can emit, rendered natively.</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="viz-dev-toggle" onClick={() => setKey((k) => k + 1)}>
            Replay
          </button>
          <button
            className="viz-dev-toggle"
            onClick={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
          >
            {theme === 'dark' ? 'Light' : 'Dark'} theme
          </button>
        </div>
      </header>
      <div className="viz-dev-grid" key={key}>
        {EXAMPLES.map(({ spec, wide }, i) => (
          <section key={i} className={'viz-dev-item' + (wide ? ' wide' : '')}>
            <span className="viz-dev-tag">{spec.type}</span>
            <Visual spec={spec} />
          </section>
        ))}
        <section className="viz-dev-item">
          <span className="viz-dev-tag">skeleton · line</span>
          <VisualSkeleton type="line" />
        </section>
        <section className="viz-dev-item">
          <span className="viz-dev-tag">skeleton · stat</span>
          <VisualSkeleton type="stat" />
        </section>
        {EDGE.map((spec, i) => (
          <section key={`e${i}`} className="viz-dev-item">
            <span className="viz-dev-tag">edge case · {spec.type}</span>
            <Visual spec={spec} animate={false} />
          </section>
        ))}
      </div>
    </main>
  );
}
