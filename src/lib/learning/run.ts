import { z } from 'zod';
import { vizSchema } from '@/lib/viz/schema';
import type { OutlineBeat } from './outline';

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
export type Ask = {
  id: string;
  prompt: string;
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
  response?: { choice?: number; text?: string; at: string };
  feedback?: Feedback;
  asks?: Ask[];
  practice?: { id: string; status: 'open' | 'done' };
  tier?: string;
};

export type RunView = {
  id: string;
  kind: 'session' | 'review' | 'explore' | 'practice' | 'return';
  title: string;
  status: 'active' | 'done' | 'abandoned';
  cursor: number;
  beats: Beat[];
  summary: string | null;
  started_at: string;
  session: { id: string; title: string; subject: string; date: string; objective: string } | null;
  minutes_planned: number | null;
};

// Streaming protocol (NDJSON lines) for beat generation, grading and asks.
export type StreamEvent =
  | { t: 'snap'; data: unknown }
  | { t: 'done'; data: unknown }
  | { t: 'meta'; tier: string; cached?: boolean }
  | { t: 'error'; message: string; status: number };

export const QUESTION_BEATS = ['recall', 'check', 'attempt', 'transfer', 'produce'] as const;
export const isQuestionBeat = (t: string) => (QUESTION_BEATS as readonly string[]).includes(t);
