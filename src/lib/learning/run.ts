import { z } from 'zod';
import { vizSchema } from '@/lib/viz/schema';
import type { OutlineBeat } from './outline';
import type { Gauge } from './planner';
export type { Gauge };

// Shared between server and client: what a session run looks like on screen.
export const blockSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('text'), md: z.string() }),
  z.object({ type: z.literal('visual'), visual: vizSchema }),
  z.object({ type: z.literal('callout'), md: z.string() }),
]);
export type Block = z.infer<typeof blockSchema>;

export type Question = {
  kind: 'choice' | 'text';
  options: string[] | null;
  placeholder: string | null;
  long: boolean;
};
export type Verdict = 'solid' | 'partial' | 'missed';
export type Feedback = { verdict: Verdict; score: number; blocks: Block[] };
// How sure the learner was before seeing feedback.
export type Confidence = 'low' | 'medium' | 'high';
export const CONFIDENCE_LABEL: Record<Confidence, string> = { low: 'Guessing', medium: 'Fairly sure', high: 'Certain' };
// unknown: "I don't know yet", a request to be taught rather than an attempt.
export type Response = { choice?: number; text?: string; confidence?: Confidence; unknown?: boolean; gauge?: Gauge; at: string };
export type Ask = {
  id: string;
  prompt: string;
  // The passage the learner highlighted, when they asked about one.
  quote?: string;
  intent: AskIntent;
  blocks: Block[];
  follow_ups?: string[];
  at: string;
};
export type AskIntent = 'why' | 'example' | 'deeper' | 'simpler' | 'visual' | 'free';

export type Beat = OutlineBeat & {
  status: 'pending' | 'generating' | 'ready' | 'answered' | 'done' | 'skipped';
  generating_at?: string;
  blocks?: Block[];
  follow_ups?: string[];
  question?: Question;
  response?: Response;
  feedback?: Feedback;
  // Earlier tries at this question, kept when the learner retries after feedback.
  attempts?: { response: Response; feedback: Feedback }[];
  asks?: Ask[];
  practice?: { id: string; status: 'open' | 'done' };
  tier?: string;
};

export type RunView = {
  id: string;
  kind: 'session' | 'review' | 'explore' | 'practice' | 'return' | 'rehearsal';
  title: string;
  status: 'active' | 'done' | 'abandoned';
  cursor: number;
  beats: Beat[];
  summary: string | null;
  started_at: string;
  session: { id: string; title: string; subject: string; date: string; objective: string } | null;
  minutes_planned: number | null;
  // Set while a break is running, so a reminder can reach the learner.
  break_until?: string | null;
  // Planned step by step (plan sessions), rather than a fixed outline.
  adaptive?: boolean;
  // Active minutes so far: idle gaps are not counted.
  elapsed?: number;
  wrapping?: boolean;
};

// A text answer that missed can be retried once, with the feedback in view.
export const canRetry = (b: Beat) =>
  !!b.feedback && b.feedback.verdict !== 'solid' && b.question?.kind === 'text' && !b.attempts?.length && !b.response?.unknown;

// Streaming protocol (NDJSON lines) for beat generation, grading and asks.
export type StreamEvent =
  | { t: 'snap'; data: unknown }
  | { t: 'done'; data: unknown }
  | { t: 'meta'; tier: string; cached?: boolean }
  | { t: 'plan'; data: Beat[] }
  | { t: 'error'; message: string; status: number };

export const QUESTION_BEATS = ['recall', 'check', 'attempt', 'transfer', 'produce'] as const;
export const isQuestionBeat = (t: string) => (QUESTION_BEATS as readonly string[]).includes(t);
