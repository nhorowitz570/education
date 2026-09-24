import { z } from 'zod';
import type { ChatMessage } from './tutor';

// The tutor thread is kept on the account (public.tutor_messages), so web
// and the iPhone app share one conversation. Clients send only the new
// message; the server reads the recent turns itself.
export const THREAD_KEEP = 60;

export const sendInput = z.object({
  // Chosen by the client so its optimistic bubbles keep their identity.
  id: z.string().uuid(),
  reply_id: z.string().uuid(),
  text: z.string().trim().min(1).max(2000),
  page: z.string().max(120).default('/'),
});
export type SendInput = z.infer<typeof sendInput>;

// A one-time move of a thread that was kept on a device before it synced.
const importedMessage = z.object({
  id: z.string().uuid(),
  role: z.enum(['user', 'tutor']),
  text: z.string().max(4000).optional(),
  blocks: z.array(z.unknown()).max(40).optional(),
  suggestions: z.array(z.string().max(120)).max(3).optional(),
  at: z.string().datetime({ offset: true }),
});
export const importInput = z.object({ messages: z.array(importedMessage).max(THREAD_KEEP) });

export type ThreadRow = {
  id: string;
  role: 'user' | 'tutor';
  text: string | null;
  blocks: ChatMessage['blocks'] | null;
  actions: ChatMessage['actions'] | null;
  suggestions: string[] | null;
  created_at: string;
};

export const messageOf = (r: ThreadRow): ChatMessage => ({
  id: r.id,
  role: r.role,
  ...(r.text ? { text: r.text } : {}),
  ...(r.blocks ? { blocks: r.blocks } : {}),
  ...(r.actions?.length ? { actions: r.actions } : {}),
  ...(r.suggestions?.length ? { suggestions: r.suggestions } : {}),
  at: r.created_at,
});
