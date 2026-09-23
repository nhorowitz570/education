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
      blocks: [{ type: 'text', md: 'Maya’s studio just landed its biggest client. The work starts Monday, the invoice goes out in six weeks, and the client pays on 60-day terms.' }],
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
          md: 'You already know that **profit** and cash drift apart. The cash cycle is how long that drift lasts: the days between paying for the work and being paid for it.\n\nFor Maya, that’s about fourteen weeks of salaries paid before a dollar arrives. That gap is what **working capital** has to cover, and why fast-growing studios often feel poorer, not richer.',
        },
        { type: 'callout', md: 'The longer the cycle, the more cash growth eats.' },
      ],
    },
  ] as RunView['beats'],
};

type Fixture = unknown | ((url: URL, body?: Record<string, unknown>) => unknown);
export const FIXTURES: Record<string, Fixture> = {
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
  'GET /api/mastery': { concepts: [
    { key: 'profit-vs-cash', title: 'Profit vs cash', track: 'finance', strength: 0.78, before: 0.52, level: 'solid' },
    { key: 'working-capital', title: 'Working capital', track: 'finance', strength: 0.41, before: 0.3, level: 'learning' },
  ] },
  'GET /api/practice': { practices: [] },
  'POST /api/shares': { token: 'demo-token-bbbbbbbbbbbbbbbb' },
  'DELETE /api/shares': { ok: true },
  'GET /api/notes': { notes: [{ id: 'n9', run_id: 'r2', beat_id: 'c1', concept_key: 'cash-cycle', quote: null, text: 'This is exactly the agency I freelance for.', created_at: ago(0.005) }] },
  'POST /api/notes': (_u: URL, b?: Record<string, unknown>) => ({ note: { id: (b?.id as string) || 'n' + Math.round(Math.random() * 1e6), run_id: b?.runId, beat_id: b?.beatId, concept_key: 'cash-cycle', quote: b?.quote || null, text: b?.text, created_at: new Date().toISOString() } }),
  'DELETE /api/notes': { ok: true },
  'GET /api/runs/r2': { run: LESSON },
};
