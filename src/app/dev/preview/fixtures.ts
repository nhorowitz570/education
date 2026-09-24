import type { NotebookView, Term } from '@/lib/notebook';
import type { RunView } from '@/lib/learning/run';

// Dev-only sample data for /dev/preview. Realistic enough to judge layout
// and copy; none of it is a real learner's.
const now = Date.now();
const ago = (days: number) => new Date(now - days * 86400000).toISOString();

const NOTEBOOK: NotebookView = {
  tracks: [
    { id: 'finance', title: 'Finance' },
    { id: 'communication', title: 'Communication' },
    { id: 'explore', title: 'Side trips' },
  ],
  entries: [
    {
      key: 'profit-vs-cash',
      title: 'Profit vs cash',
      track: 'finance',
      trackTitle: 'Finance',
      summary: 'Why a profitable business can still run out of money.',
      offPlan: false,
      strength: 0.78,
      level: 'solid',
      due_at: ago(-4),
      first_seen: ago(12),
      last_seen: ago(1),
      explanation:
        'Profit is an **opinion about a period**: revenue earned minus the costs of earning it. Cash is a **fact about a moment**: what is in the account right now.\n\nThey drift apart whenever money moves at a different time from the work: customers who pay in 60 days, stock bought before it sells, equipment paid for up front.',
      visual: {
        type: 'waterfall',
        title: 'A profitable month that drains cash',
        takeaway: 'Profit of $4k, but cash fell $6k because customers hadn’t paid yet.',
        start: { label: 'Opening cash', value: 12000 },
        steps: [
          { label: 'Collected', delta: 18000 },
          { label: 'Payroll', delta: -14000 },
          { label: 'Stock bought', delta: -9000 },
          { label: 'Rent', delta: -1000 },
        ],
        end_label: 'Closing cash',
        unit: '$',
      },
      words: [
        {
          text: 'The studio booked the sale, so it shows as profit, but the client pays in 60 days. Until then the studio still has to pay its designers and rent from the cash it actually has, which is why a good month on paper can still be a scary month in the bank.',
          verdict: 'solid',
          step: 'attempt',
          run: 'r1',
          at: ago(1),
        },
        { text: 'Profit is what you earned, cash is what you can spend today.', verdict: 'partial', step: 'check', run: 'r0', at: ago(12) },
      ],
      asks: [
        {
          question: 'Why?',
          quote: 'Profit is an opinion about a period',
          answer: 'Because it depends on accounting choices: when you recognise revenue, how you spread the cost of equipment over its life. Two honest accountants can report different profit for the same month. Cash has no such choices.',
          run: 'r1',
          at: ago(1),
        },
      ],
      notes: [{ id: 'n1', text: 'Ask the studio owner at work how long clients actually take to pay.', quote: null, run: 'r1', beat: 'b2', concept: 'profit-vs-cash', at: ago(1) }],
      sources: [
        { run: 'r1', title: 'Explain why profit isn’t cash', kind: 'session', at: ago(1) },
        { run: 'r0', title: 'Reading a P&L', kind: 'session', at: ago(12) },
      ],
      misconceptions: ['Treats revenue as cash received on the day of the sale.'],
      shared: null,
    },
    {
      key: 'working-capital',
      title: 'Working capital',
      track: 'finance',
      trackTitle: 'Finance',
      summary: 'The cash tied up in running the business day to day.',
      offPlan: false,
      strength: 0.41,
      level: 'learning',
      due_at: ago(0),
      first_seen: ago(5),
      last_seen: ago(5),
      explanation: 'Working capital is current assets minus current liabilities: roughly, what you’re owed plus what you hold, minus what you owe soon.',
      visual: null,
      words: [],
      asks: [],
      notes: [],
      sources: [{ run: 'r2', title: 'Where the cash goes', kind: 'session', at: ago(5) }],
      misconceptions: [],
      shared: null,
    },
    {
      key: 'naming-the-problem',
      title: 'Naming the problem before the fix',
      track: 'communication',
      trackTitle: 'Communication',
      summary: 'In hard feedback, agree on what went wrong before proposing what to do.',
      offPlan: false,
      strength: 0.63,
      level: 'practiced',
      due_at: ago(-2),
      first_seen: ago(8),
      last_seen: ago(3),
      explanation: 'People defend solutions they didn’t help define. Naming the problem first, and checking they see it too, turns the conversation from a verdict into a shared job.',
      visual: null,
      words: [
        {
          text: 'I’d start with what I saw: the deck went out without the numbers we agreed. Then ask how it looked from their side before saying what should change.',
          verdict: 'solid',
          step: 'transfer',
          run: 'r3',
          at: ago(3),
        },
      ],
      asks: [],
      notes: [],
      sources: [{ run: 'r3', title: 'Feedback that lands', kind: 'session', at: ago(3) }],
      misconceptions: [],
      shared: 'demo-token-aaaaaaaaaaaaaaaa',
    },
    {
      key: 'trip:x1',
      title: 'How do index funds actually work?',
      track: 'explore',
      trackTitle: 'Side trips',
      summary: '',
      offPlan: true,
      strength: 0,
      level: 'new',
      due_at: null,
      first_seen: ago(2),
      last_seen: ago(2),
      explanation: 'An index fund buys everything in a list (an index) in proportion to its size, so it doesn’t need anyone to pick winners.',
      visual: null,
      words: [],
      asks: [],
      notes: [],
      sources: [{ run: 'x1', title: 'How do index funds actually work?', kind: 'explore', at: ago(2) }],
      misconceptions: [],
      shared: null,
    },
  ],
};

const TERMS: Term[] = NOTEBOOK.entries
  .filter((e) => !e.offPlan)
  .map((e) => ({ key: e.key, title: e.title, track: e.track, strength: e.strength, level: e.level, words: e.words[0]?.text || null, phrases: [] }));

export const RUN: RunView = {
  id: 'r1',
  kind: 'session',
  title: 'Explain why profit isn’t cash',
  status: 'done',
  cursor: 6,
  started_at: ago(0.01),
  minutes_planned: 45,
  elapsed: 38.4,
  summary: null,
  session: { id: 's1', title: 'Explain why profit isn’t cash', subject: 'finance', date: ago(0).slice(0, 10), objective: '' },
  beats: [
    { id: 'b1', type: 'situation', intent: '', minutes: 2, status: 'done', concept: 'profit-vs-cash', blocks: [{ type: 'text', md: 'A studio made the sale.' }] },
    {
      id: 'b2',
      type: 'check',
      intent: '',
      minutes: 2,
      status: 'done',
      concept: 'profit-vs-cash',
      blocks: [{ type: 'text', md: 'Can it pay the bills?' }],
      feedback: { verdict: 'solid', score: 0.9, blocks: [{ type: 'text', md: 'Exactly: the sale is profit, not cash.' }] },
    },
    {
      id: 'b3',
      type: 'attempt',
      intent: '',
      minutes: 5,
      status: 'done',
      concept: 'working-capital',
      blocks: [{ type: 'text', md: 'Explain it.' }],
      feedback: { verdict: 'partial', score: 0.6, blocks: [{ type: 'text', md: 'Close. Name the timing gap.' }] },
    },
  ] as RunView['beats'],
};

// A lesson in progress, for term marks, notes and the streaming caret.
const LESSON: RunView = {
  id: 'r2',
  kind: 'session',
  title: 'Where the cash goes',
  status: 'active',
  cursor: 1,
  started_at: ago(0.01),
  minutes_planned: 45,
  elapsed: 12,
  summary: null,
  adaptive: true,
  session: { id: 's2', title: 'Where the cash goes', subject: 'finance', date: ago(0).slice(0, 10), objective: '' },
  beats: [
    {
      id: 'c1',
      type: 'situation',
      intent: '',
      minutes: 2,
      status: 'done',
      concept: 'cash-cycle',
      blocks: [{ type: 'text', md: 'Megan’s studio just landed its biggest client. The work starts Monday, the invoice goes out in six weeks, and the client pays on 60-day terms.' }],
    },
    {
      id: 'c2',
      type: 'explain',
      intent: '',
      minutes: 3,
      status: 'ready',
      concept: 'cash-cycle',
      blocks: [
        {
          type: 'text',
          md: 'You already know that **profit** and cash drift apart. The cash cycle is how long that drift lasts: the days between paying for the work and being paid for it.\n\nFor Megan, that’s about fourteen weeks of salaries paid before a dollar arrives. That gap is what **working capital** has to cover, and why fast-growing studios often feel poorer, not richer.',
        },
        { type: 'callout', md: 'The longer the cycle, the more cash growth eats.' },
      ],
    },
  ] as RunView['beats'],
};

type Fixture = unknown | ((url: URL, body?: Record<string, unknown>) => unknown);
const iso = (d: number) => new Date(now + d * 86400000).toISOString().slice(0, 10);
const TODAY = {
  today: {
    phase: 'learning-day',
    greeting: 'Good morning',
    headline: 'Working capital: why growing can drain cash',
    why: 'Finance · the timing gap between paying and being paid.',
    primary: { kind: 'session', label: 'Begin', detail: '', sessionId: 's1', minutes: 40, track: 'finance' },
    secondary: [
      { kind: 'session', label: 'Only 20 minutes', detail: '', sessionId: 's1', minutes: 20 },
      { kind: 'review', label: 'Review 3 ideas', detail: 'About 8 minutes, before they fade.', minutes: 8 },
      { kind: 'practice', label: 'Practise out loud', detail: 'A debate, a hard conversation or a pitch, by voice.' },
    ],
    week: {
      index: 4,
      total: 26,
      done: 3,
      planned: 5,
      days: [
        { date: iso(-3), weekday: 'Mon', status: 'done', track: 'finance', title: 'Profit vs cash' },
        { date: iso(-2), weekday: 'Tue', status: 'done', track: 'communication', title: 'Framing a request' },
        { date: iso(-1), weekday: 'Wed', status: 'done', track: 'finance', title: 'Margins' },
        { date: iso(0), weekday: 'Thu', status: 'today', track: 'finance', title: 'Working capital' },
        { date: iso(1), weekday: 'Fri', status: 'planned', track: 'judgment', title: 'Base rates' },
        { date: iso(2), weekday: 'Sat', status: 'rest' },
        { date: iso(3), weekday: 'Sun', status: 'rest' },
      ],
    },
    focus: { title: 'Working capital: why growing can drain cash', subject: 'finance', objective: 'Explain why growth can drain cash.', evidence: 'A one-page cash forecast for a small business.', date: iso(0), minutes: 40 },
    due: { count: 3, minutes: 8 },
    milestone: { title: 'Read a P&L cold', date: iso(40), days: 40 },
    startsIn: null,
    next: null,
  },
  date: iso(0),
  preview: [],
  insight: null,
  exploring: null,
  recap: null,
  memories: { fresh: 0 },
};

const BRIEF = {
  brief: {
    title: 'Today we fix the timing problem',
    note: 'Yesterday you nailed why cash and profit drift apart, then froze the moment payment timing came up. Today goes straight at that: working capital, and why a café that grows fast can run out of money.',
    item_notes: ['the bit you froze on', null, null],
  },
};

// A tutor reply delivered as a stream of snapshots, a few words at a time,
// so the preview shows exactly how streaming looks.
const REPLY =
  'Because the money goes out before it comes in. You pay for beans, milk and staff this week, but a catering client on 30-day terms pays you next month.\n\nThe faster you grow, the bigger that gap gets: more orders means more cash tied up waiting to arrive. That is **working capital**, and it is why growing businesses often feel poorer, not richer.';
const TUTOR_STREAM = {
  __stream: Array.from({ length: Math.ceil(REPLY.length / 9) }, (_, i) => ({ t: 'snap', data: { blocks: [{ type: 'text', md: REPLY.slice(0, (i + 1) * 9) }] } })).concat([
    {
      t: 'done',
      data: {
        blocks: [
          { type: 'text', md: REPLY },
          {
            type: 'visual',
            visual: {
              type: 'cycle',
              title: 'The cash gap in a growing café',
              centre: 'cash tied up',
              steps: [
                { label: 'Buy stock', detail: null, tone: 'default' },
                { label: 'Serve the order', detail: null, tone: 'default' },
                { label: 'Invoice, wait 30 days', detail: null, tone: 'accent' },
                { label: 'Get paid', detail: null, tone: 'positive' },
              ],
              takeaway: 'Growth widens the gap between the first step and the last.',
            },
          },
        ],
        suggestions: ['How do I fix the gap?', 'Quiz me on this'],
        actions: [],
      },
    } as never,
  ]),
};

let pos = 0;
const concept = (key: string, title: string, track: string, strength: number, level: string, extra: Record<string, unknown> = {}) => ({
  key,
  title,
  track,
  summary: '',
  prerequisites: [],
  sessions: [],
  position: pos++,
  strength,
  before: Math.max(0, strength - 0.2),
  recall: strength,
  level,
  due_at: level === 'new' ? null : ago(-3 + strength * 6),
  last_seen_at: level === 'new' ? null : ago(2),
  successes: Math.round(strength * 6),
  lapses: strength < 0.5 ? 1 : 0,
  misconceptions: [],
  model: null,
  ...extra,
});
const MASTERY = {
  hasPlan: true,
  mapped: true,
  concepts: [
    concept('profit-vs-cash', 'Profit vs cash', 'finance', 0.78, 'solid', { summary: 'Why a profitable business can still run out of money.' }),
    concept('working-capital', 'Working capital', 'finance', 0.41, 'learning', { prerequisites: ['profit-vs-cash'], misconceptions: ['Treats revenue as cash received'] }),
    concept('margins', 'Margin vs markup', 'finance', 0.63, 'practiced'),
    concept('income-statement', 'Reading an income statement', 'finance', 0.55, 'practiced', { prerequisites: ['profit-vs-cash'] }),
    concept('break-even', 'Break-even', 'finance', 0, 'new', { prerequisites: ['margins'] }),
    concept('state-the-point', 'State the point first', 'communication', 0.82, 'solid'),
    concept('active-listening', 'Listening before answering', 'communication', 0.48, 'learning'),
    concept('delegation', 'Delegating so it comes back right', 'communication', 0, 'new'),
    concept('base-rates', 'Base rates', 'judgment', 0.36, 'learning'),
    concept('steelman', 'Steelmanning the other side', 'judgment', 0.7, 'practiced'),
    concept('filibuster', 'How the filibuster works', 'judgment', 0.58, 'practiced'),
  ],
  evidence: [{ run: 'r1', title: 'Cash briefing', date: ago(3), text: 'A one-page cash forecast for the café’s first quarter, showing the May low point.', verdict: 'solid' }],
  practice: [{ id: 'p1', title: 'Deposit before the shoot', date: ago(4), mode: 'negotiation', score: 0.72, headline: 'Held your ground on the deposit without losing the client.' }],
  history: [
    { id: 'r1', kind: 'session', title: 'Profit vs cash', date: ago(3), summary: 'Covered why profit and cash drift apart.' },
    { id: 'r2', kind: 'session', title: 'Margins', date: ago(1), summary: 'Margin vs markup, with two worked examples.' },
    { id: 'r3', kind: 'review', title: 'Review', date: ago(0.2), summary: null },
  ],
  weeks: Array.from({ length: 8 }, (_, i) => ({ week: ago((7 - i) * 7).slice(0, 10), count: [0, 2, 5, 3, 8, 6, 9, 7][i], solid: [0, 1, 3, 2, 5, 4, 6, 5][i] })),
  calibration: { low: { n: 5, right: 2 }, medium: { n: 9, right: 6 }, high: { n: 7, right: 6 } },
  milestones: [{ date: iso(40), title: 'Read a P&L cold' }],
};

export const FIXTURES: Record<string, Fixture> = {
  'GET /api/today': TODAY,
  'POST /api/today/brief': BRIEF,
  'POST /api/tutor': TUTOR_STREAM,
  'GET /api/notebook': (url: URL) => (url.searchParams.get('terms') ? { terms: TERMS } : NOTEBOOK),
  'GET /api/memory': {
    memories: [
      { id: 'm1', kind: 'goal', content: 'Be able to read a small company’s accounts by June.', concept_keys: [], confidence: 1, evidence: 1, status: 'active', pinned: true, source: 'import', created_at: ago(20), updated_at: ago(20), last_used_at: null },
      { id: 'm2', kind: 'preference', content: 'Likes examples from design studios and coffee shops.', concept_keys: [], confidence: 0.8, evidence: 3, status: 'active', pinned: false, source: 'inferred', created_at: ago(0.2), updated_at: ago(0.2), last_used_at: null },
    ],
    style: { depth: 0.62, challenge: 0.71, visual: 0.8, questions: 0.3, examples: 0.86, observations: 42 },
    origins: {},
  },
  'POST /api/memory': (_u: URL, b?: Record<string, unknown>) => ({ memory: { ...b, id: 'm' + Math.random(), status: 'active', created_at: new Date().toISOString() } }),
  'GET /api/usage': { total: 3.42, byTier: { fast: { calls: 210, usd: 0.31 }, primary: { calls: 96, usd: 2.4 }, voice: { calls: 3, usd: 0.71 } }, cacheRate: 0.64, models: { fast: 'Luna', primary: 'Sol' } },
  'GET /api/progress': {
    xp: 1840,
    todayXp: 60,
    level: 7,
    rank: 'Practitioner',
    into: 140,
    span: 400,
    next: 2100,
    streak: { current: 3, best: 5, todayDone: true, unit: 'week' },
    quests: [
      { id: 'q1', label: 'Answer three questions', done: true, progress: 3, target: 3, xp: 15 },
      { id: 'q2', label: 'Ask the tutor why', done: false, progress: 0, target: 1, xp: 10 },
      { id: 'q3', label: 'Finish a review', done: false, progress: 0, target: 1, xp: 10 },
    ],
    badges: [],
  },
  'GET /api/mastery': MASTERY,
  'GET /api/practice': { practices: [] },
  'POST /api/shares': { token: 'demo-token-bbbbbbbbbbbbbbbb' },
  'DELETE /api/shares': { ok: true },
  'GET /api/notes': { notes: [{ id: 'n9', run_id: 'r2', beat_id: 'c1', concept_key: 'cash-cycle', quote: null, text: 'This is exactly the agency I freelance for.', created_at: ago(0.005) }] },
  'POST /api/notes': (_u: URL, b?: Record<string, unknown>) => ({ note: { id: (b?.id as string) || 'n' + Math.round(Math.random() * 1e6), run_id: b?.runId, beat_id: b?.beatId, concept_key: 'cash-cycle', quote: b?.quote || null, text: b?.text, created_at: new Date().toISOString() } }),
  'DELETE /api/notes': { ok: true },
  'GET /api/runs/r2': { run: LESSON },
};
