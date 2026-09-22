import type { Plan } from './plan';
export type RecordKind =
  | 'checkin'
  | 'food'
  | 'social'
  | 'workout'
  | 'reflection'
  | 'memory'
  | 'draft'
  | 'settings'
  | 'busy'
  | 'body'
  | 'external';
export type UserRecord = {
  id: string;
  kind: RecordKind;
  data: Record<string, unknown>;
  updated_at: string;
};
export type Feedback = {
  strength: string;
  gap: string;
  next: string;
  independent: boolean;
  correct: boolean;
  rubric: {
    issue: string;
    evidence: string;
    reasoning: string;
    uncertainty: string;
  };
};
export type Attempt = {
  id: string;
  plan_id?: string;
  session_id: string;
  objective_id: string;
  lesson_id: string;
  completed_at: string;
  date: string;
  reduced: boolean;
  assisted: boolean;
  reasoning: string;
  transfer: string;
  feedback: Feedback;
  points: number;
  review_of?: string;
};
export type ScheduleEntry = {
  date: string;
  start_local: string;
  duration_minutes: number;
  status: 'planned' | 'skipped' | 'travel' | 'reduced';
};
export type Revision = {
  id: string;
  reason: string;
  created_at: string;
  before: Record<string, ScheduleEntry>;
  after: Record<string, ScheduleEntry>;
  undone_at?: string;
};
export type AppState = {
  plan?: Plan;
  planVersionId?: string;
  attempts: Attempt[];
  records: UserRecord[];
  overrides: Record<string, ScheduleEntry>;
  revisions: Revision[];
  revision: number;
};
export type Source = {
  title: string;
  url: string;
  checked_at: string;
  supports: string;
  excerpt?: string;
};
export type Lesson = {
  id: string;
  session_id: string;
  objective_id: string;
  title: string;
  subject: string;
  duration: number;
  scenario: string;
  facts: { label: string; value: string }[];
  explanation: string;
  question: string;
  choices: string[];
  reasoning_prompt: string;
  transfer: { scenario: string; question: string };
  sources: Source[];
  uncertainty: string;
  fictional: boolean;
  generated: boolean;
  review_of?: string;
};
export type LessonKey = {
  correct_choice: number;
  concepts: string[];
  transfer_concepts: string[];
  rubric: string;
  feedback: { strength: string; gap: string; next: string };
};
export type AppConfig = {
  supabase: boolean;
  backend: boolean;
  ai: boolean;
  voice: boolean;
  voiceProvider: string;
  calendar: boolean;
  push: boolean;
  demo: boolean;
};
export const emptyState: AppState = {
  attempts: [],
  records: [],
  overrides: {},
  revisions: [],
  revision: 0,
};
