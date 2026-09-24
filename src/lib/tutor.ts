import { z } from 'zod';
import { blockSchema, type Block } from '@/lib/learning/run';
import { writingSchema } from '@/lib/learning/voice';

// The tutor outside lessons: a persistent chat on every page. Its replies are
// the same blocks a lesson uses, plus a few small actions the app carries out
// (never anything the learner didn't ask for).

export const TUTOR_ROUTES = ['/', '/learn', '/practice', '/mastery', '/notebook', '/insights', '/life', '/you'] as const;

export const actionSchema = z.object({
  type: z.enum(['set_writing', 'open', 'remember', 'checkin', 'start_today']),
  writing: writingSchema.nullable(),
  href: z.enum(TUTOR_ROUTES).nullable(),
  label: z.string().nullable().describe('Button text for open, ≤ 4 words.'),
  content: z.string().nullable().describe('remember: one short third-person sentence.'),
  energy: z.number().int().nullable().describe('checkin: 1 (drained) to 5 (sharp).'),
  mood: z.string().nullable().describe('checkin: one word.'),
});
export type TutorAction = z.infer<typeof actionSchema>;

export const replySchema = z.object({
  blocks: z.array(blockSchema),
  suggestions: z.array(z.string()).describe('Up to three short follow-ups (≤ 6 words each).'),
  actions: z.array(actionSchema).describe('Usually empty.'),
});
export type TutorReply = z.infer<typeof replySchema>;

export type ChatMessage = {
  id: string;
  role: 'user' | 'tutor';
  text?: string;
  blocks?: Block[];
  actions?: TutorAction[];
  suggestions?: string[];
  at: string;
};

// What the server is sent: recent turns as plain text, so a long thread
// stays cheap and nothing but words crosses back.
export const turnSchema = z.object({ role: z.enum(['user', 'tutor']), text: z.string().max(4000) });
export const chatInput = z.object({
  turns: z.array(turnSchema).min(1).max(20),
  page: z.string().max(120).default('/'),
});

export const briefSchema = z.object({
  title: z.string(),
  note: z.string(),
  item_notes: z.array(z.string().nullable()),
});
export type Brief = z.infer<typeof briefSchema>;
export const briefInput = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  agenda: z
    .array(z.object({ label: z.string().max(160), kind: z.string().max(20), minutes: z.number().min(0).max(300).nullable(), track: z.string().max(40).nullable() }))
    .max(6),
});

export function plainOf(blocks: Block[] | undefined, max = 1200) {
  return (blocks || [])
    .map((b) => (b.type === 'visual' ? `[${(b.visual as { type?: string })?.type || 'visual'}]` : b.md || ''))
    .join('\n')
    .slice(0, max);
}
