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
  focus: { title: string; why: string; try: string };
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
  checkins: { date: string; energy: number; mood: string }[];
  reflections: string[];
  workouts: number;
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
  grades: { key: GradeKey; score: number | null }[];
};
