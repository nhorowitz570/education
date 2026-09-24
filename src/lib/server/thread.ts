import 'server-only';
import { adminClient } from '@/lib/supabase/server';
import { plainOf, type ChatMessage, type TutorReply } from '@/lib/tutor';
import { THREAD_KEEP, messageOf, type ThreadRow } from '@/lib/thread';
import type { z } from 'zod';
import type { importInput } from '@/lib/thread';

const table = () => adminClient().from('tutor_messages');
const COLUMNS = 'id,role,text,blocks,actions,suggestions,created_at';

export async function readThread(userId: string, limit = THREAD_KEEP): Promise<ChatMessage[]> {
  const { data, error } = await table()
    .select(COLUMNS)
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return ((data || []) as ThreadRow[]).reverse().map(messageOf);
}

// The recent conversation as plain text turns, the way the tutor reads it.
export async function recentTurns(userId: string) {
  return (await readThread(userId, 16))
    .map((m) => ({ role: m.role, text: (m.role === 'user' ? m.text || '' : plainOf(m.blocks)).slice(0, 4000) }))
    .filter((t) => t.text);
}

// A resent message (a retry after a failed reply) keeps its first copy.
export async function saveUserMessage(userId: string, id: string, text: string, page: string) {
  const { error } = await table().upsert(
    { id, user_id: userId, role: 'user', text, page },
    { onConflict: 'id', ignoreDuplicates: true },
  );
  if (error) throw error;
}

export async function saveReply(userId: string, id: string, reply: Pick<TutorReply, 'blocks' | 'suggestions' | 'actions'>) {
  const { error } = await table().upsert({
    id,
    user_id: userId,
    role: 'tutor',
    blocks: reply.blocks,
    suggestions: reply.suggestions,
    actions: reply.actions,
  });
  if (error) throw error;
}

export async function clearThread(userId: string) {
  const { error } = await table().delete().eq('user_id', userId);
  if (error) throw error;
}

// Moves a device-kept thread onto the account, only while the account has
// none, so a second device can't duplicate or overwrite it.
export async function importThread(userId: string, messages: z.infer<typeof importInput>['messages']) {
  const { count } = await table().select('id', { count: 'exact', head: true }).eq('user_id', userId);
  if (count || !messages.length) return false;
  const { error } = await table().insert(
    messages.map((m) => ({
      id: m.id,
      user_id: userId,
      role: m.role,
      text: m.role === 'user' ? (m.text || '').slice(0, 4000) : null,
      blocks: m.role === 'tutor' ? m.blocks || [] : null,
      suggestions: m.suggestions || null,
      created_at: m.at,
    })),
  );
  if (error) throw error;
  return true;
}
