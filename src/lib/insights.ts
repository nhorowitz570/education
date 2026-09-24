// Shared between the server and the Insights page.

export const GRADE_KEYS = [
  'effort',
  'engagement',
  'consistency',
  'understanding',
  'retention',
  'transfer',
  'calibration',
  'communication',
] as const;
export type GradeKey = (typeof GRADE_KEYS)[number];

export const GRADE_LABEL: Record<GradeKey, string> = {
  effort: 'Effort',
  engagement: 'Engagement',
  consistency: 'Consistency',
  understanding: 'Understanding',
  retention: 'Retention',
  transfer: 'Transfer',
  calibration: 'Calibration',
  communication: 'Communication',
};
export const GRADE_HINT: Record<GradeKey, string> = {
  effort: 'Time, follow-through and care in your answers',
  engagement: 'Curiosity: questions, highlights, exploring',
  consistency: 'Showing up on the days you planned',
  understanding: 'Getting new ideas right',
  retention: 'Remembering earlier ideas',
  transfer: 'Using ideas in new situations',
  calibration: 'Knowing when you know',
  communication: 'Practice conversations',
};

export type Grade = {
  key: GradeKey;
  score: number | null;
  confidence: 'low' | 'medium' | 'high';
  label: string;
  evidence: string;
};
export type InsightReport = {
  headline: string;
  summary: string;
  data_note: string | null;
  grades: Grade[];
  patterns: { kind: 'strength' | 'watch' | 'observation'; title: string; body: string }[];
  mind: { title: string; body: string }[];
  moment: { quote: string; why: string } | null;
  // adopted: the learner made this their focus; it lives on as a pinned memory.
  focus: { title: string; why: string; try: string; adopted?: { memory_id: string; at: string } | null };
  // Whether last week's focus showed up in this week's behaviour.
  focus_check?: { verdict: 'yes' | 'partly' | 'no' | 'unclear'; note: string } | null;
};

type Cal = { n: number; right: number };
export type InsightMetrics = {
  week: { start: string; end: string; zone: string };
  totals: {
    minutes: number;
    days_active: number;
    sessions_started: number;
    sessions_finished: number;
    reviews: number;
    explorations: number;
    rehearsals: number;
    practices: number;
    steps_done: number;
    steps_skipped: number;
    answers: number;
    questions_asked: number;
    words_written: number;
    words_spoken: number;
  };
  by_day: { date: string; minutes: number; answers: number; asks: number }[];
  by_hour: number[];
  schedule: {
    planned: number;
    completed: number;
    missed: number;
    skipped_by_choice: number;
    reduced: number;
    optional_steps_taken: number;
  };
  answers: {
    total: number;
    solid: number;
    partial: number;
    missed: number;
    skipped: number;
    avg_score: number | null;
    retries: number;
    retries_improved: number;
    words_written: number;
    avg_words: number | null;
    by_type: Record<string, { n: number; avg: number }>;
    calibration: { low: Cal; medium: Cal; high: Cal };
  };
  asks: { total: number; by_intent: Record<string, number>; highlighted: number; examples: string[] };
  practice: {
    mode: string;
    difficulty: string;
    channel: string | null;
    minutes: number;
    words_spoken: number;
    score: number | null;
    headline: string | null;
    criteria: { name: string; rating: string }[];
    best: string | null;
    finished: boolean;
  }[];
  concepts: { total: number; touched: number; levels: Record<string, number>; due: number; new_misconceptions: string[] };
  samples: { step: string; text: string; verdict: string; confidence: string | null; retried: boolean }[];
  empty: boolean;
};

export type InsightRow = {
  id: string;
  week_start: string;
  week_end: string;
  status: 'generating' | 'ready' | 'failed';
  metrics: InsightMetrics | Record<string, never>;
  report: InsightReport | null;
  model: string | null;
  error: string | null;
  seen_at: string | null;
  created_at: string;
  updated_at: string;
};
export type InsightSummary = {
  id: string;
  week_start: string;
  week_end: string;
  status: InsightRow['status'];
  seen_at: string | null;
  created_at: string;
  headline: string | null;
  focus: string | null;
  grades: { key: GradeKey; score: number | null }[];
};

// The fixed anchors every grade is read against, shared by the grading
// prompt and the page that explains it.
export const GRADE_BANDS: { from: number; to: number; label: string; note: string }[] = [
  { from: 90, to: 100, label: 'Exceptional', note: 'Rare, and only with strong evidence.' },
  { from: 75, to: 89, label: 'Strong', note: 'Clearly above what the plan asks.' },
  { from: 60, to: 74, label: 'Solid', note: 'Doing what the plan asks, well.' },
  { from: 45, to: 59, label: 'Mixed', note: 'Real effort with clear gaps, or uneven.' },
  { from: 30, to: 44, label: 'Below', note: 'Below what the plan asks.' },
  { from: 0, to: 29, label: 'Largely absent', note: 'Little to grade.' },
];

// What the model reads: the measured week, with every free-text field capped
// and counted. It never sees transcripts, only a handful of short excerpts.
// If the whole still runs long, free text is shed (least useful first) rather
// than cutting the JSON mid-way.
export const DIGEST_LIMIT = 16000;
const clip = (s: string | null | undefined, n: number) => (s && s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s ?? null);
export function digest(m: InsightMetrics) {
  const peak = m.by_hour
    .map((n, hour) => ({ hour, events: n }))
    .filter((h) => h.events > 0)
    .sort((a, b) => b.events - a.events)
    .slice(0, 3);
  const d = {
    week: m.week,
    totals: m.totals,
    by_day: m.by_day,
    peak_hours: peak,
    schedule: m.schedule,
    answers: {
      ...m.answers,
      by_type: Object.fromEntries(Object.entries(m.answers.by_type).map(([k, v]) => [k, { n: v.n, avg: Math.round(v.avg * 100) / 100 }])),
    },
    asks: { ...m.asks, examples: m.asks.examples.slice(0, 6).map((e) => clip(e, 140)) },
    practice: m.practice.slice(-6).map((p) => ({
      ...p,
      headline: clip(p.headline, 160),
      best: clip(p.best, 200),
      criteria: p.criteria.slice(0, 5),
    })),
    concepts: { ...m.concepts, new_misconceptions: m.concepts.new_misconceptions.slice(0, 4).map((t) => clip(t, 160)) },
    samples: m.samples.slice(0, 6).map((x) => ({ ...x, text: clip(x.text, 300) })),
  };
  const shed = [
    () => (d.asks.examples = d.asks.examples.slice(0, 3)),
    () => (d.practice = d.practice.slice(-3)),
    () => (d.samples = d.samples.slice(0, 3)),
    () => {
      d.asks.examples = [];
      d.samples = [];
      d.practice = d.practice.map((p) => ({ ...p, best: null, headline: null }));
    },
  ];
  let out = JSON.stringify(d);
  for (const step of shed) {
    if (out.length <= DIGEST_LIMIT) break;
    step();
    out = JSON.stringify(d);
  }
  return out;
}
