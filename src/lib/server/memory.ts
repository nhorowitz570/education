import 'server-only';
import { z } from 'zod';
import { adminClient } from '@/lib/supabase/server';
import { embed, generate } from '@/lib/ai/engine';

export type Memory = {
  id: string;
  kind: 'goal' | 'interest' | 'preference' | 'background' | 'knowledge' | 'episode' | 'style';
  content: string;
  concept_keys: string[];
  confidence: number;
  evidence: number;
  status: 'candidate' | 'active' | 'archived';
  pinned: boolean;
  source: 'inferred' | 'user' | 'import';
  source_run?: string | null;
  created_at: string;
  updated_at: string;
  last_used_at: string | null;
  similarity?: number;
};
const COLUMNS =
  'id,kind,content,concept_keys,confidence,evidence,status,pinned,source,source_run,created_at,updated_at,last_used_at';

export async function listMemories(userId: string, includeArchived = false) {
  let q = adminClient()
    .from('memories')
    .select(COLUMNS)
    .eq('user_id', userId)
    .order('pinned', { ascending: false })
    .order('updated_at', { ascending: false })
    .limit(500);
  if (!includeArchived) q = q.neq('status', 'archived');
  const { data, error } = await q;
  if (error) throw new Error('Memories could not be loaded.');
  return data as Memory[];
}

// Retrieval for one moment of teaching. A small always-on core (pinned,
// goals, strong preferences) plus the memories most similar to the topic,
// re-ranked by confidence and recency. Returns at most `limit` lines.
export async function recall(
  userId: string,
  query: string,
  conceptKeys: string[] = [],
  limit = 10,
) {
  const db = adminClient();
  const [{ data: core }, vectors] = await Promise.all([
    db
      .from('memories')
      .select(COLUMNS)
      .eq('user_id', userId)
      .eq('status', 'active')
      .or('pinned.eq.true,kind.eq.goal,kind.eq.style,kind.eq.preference')
      .order('confidence', { ascending: false })
      .limit(12),
    embed(userId, [query]),
  ]);
  let similar: Memory[] = [];
  if (vectors?.[0]) {
    const { data } = await db.rpc('match_memories', {
      p_user_id: userId,
      p_embedding: JSON.stringify(vectors[0]),
      p_count: 16,
      p_min_similarity: 0.28,
    });
    similar = (data as Memory[]) || [];
  }
  const now = Date.now();
  const score = (m: Memory) => {
    const ageDays = (now - Date.parse(m.updated_at)) / 86400000;
    const recency = Math.exp(-ageDays / (m.kind === 'episode' ? 45 : 240));
    const conceptHit = m.concept_keys.some((k) => conceptKeys.includes(k)) ? 0.25 : 0;
    return (
      (m.similarity ?? 0.3) * 1.2 +
      m.confidence * 0.5 +
      recency * 0.3 +
      conceptHit +
      (m.pinned ? 0.6 : 0) +
      (m.kind === 'style' || m.kind === 'preference' ? 0.15 : 0)
    );
  };
  const merged = new Map<string, Memory>();
  for (const m of [...((core as Memory[]) || []), ...similar]) {
    const prev = merged.get(m.id);
    merged.set(m.id, { ...m, similarity: Math.max(prev?.similarity ?? 0, m.similarity ?? 0) });
  }
  const chosen = [...merged.values()].sort((a, b) => score(b) - score(a)).slice(0, limit);
  if (chosen.length)
    void db
      .from('memories')
      .update({ last_used_at: new Date().toISOString() })
      .in(
        'id',
        chosen.map((m) => m.id),
      )
      .then(() => {});
  return chosen;
}

export function memoryLayer(list: Memory[]) {
  if (!list.length) return null;
  return list
    .map((m) => `- (${m.kind}${m.confidence < 0.5 ? ', tentative' : ''}) ${m.content}`)
    .join('\n');
}

const opSchema = z.object({
  operations: z.array(
    z.object({
      op: z.enum(['add', 'reinforce', 'update', 'archive']),
      id: z.string().nullable().describe('Existing memory id for reinforce/update/archive.'),
      kind: z.enum(['goal', 'interest', 'preference', 'background', 'knowledge', 'episode', 'style']),
      content: z.string().describe('One short third-person sentence.'),
      concept_keys: z.array(z.string()),
      confidence: z.number().describe('0–1: how sure this is true and durable.'),
    }),
  ),
});

// Memory maintenance after a session: extract, deduplicate, merge, update.
export async function consolidate(
  userId: string,
  runId: string | null,
  transcript: string,
  conceptKeys: string[],
) {
  if (transcript.trim().length < 80) return { applied: 0 };
  const related = await recall(userId, transcript.slice(0, 2000), conceptKeys, 14);
  const { data } = await generate({
    task: 'memory.extract',
    userId,
    schema: opSchema,
    context: [
      {
        name: 'existing_memories',
        content: related.length
          ? related.map((m) => `[${m.id}] (${m.kind}, confidence ${m.confidence.toFixed(2)}, evidence ${m.evidence}) ${m.content}`).join('\n')
          : 'None yet.',
      },
    ],
    input: `Session transcript (learner and tutor):\n${transcript.slice(0, 24000)}`,
  });
  const db = adminClient();
  const known = new Map(related.map((m) => [m.id, m]));
  const adds = data.operations.filter((o) => o.op === 'add' && o.content.trim().length >= 3).slice(0, 6);
  const vectors = adds.length ? await embed(userId, adds.map((a) => a.content)) : null;
  let applied = 0;
  for (const [i, o] of adds.entries()) {
    const vector = vectors?.[i];
    // Near-duplicates reinforce the existing memory instead of adding another.
    if (vector) {
      const { data: dupes } = await db.rpc('match_memories', {
        p_user_id: userId,
        p_embedding: JSON.stringify(vector),
        p_count: 1,
        p_min_similarity: 0.9,
      });
      const dupe = (dupes as Memory[] | null)?.[0];
      if (dupe) {
        await reinforce(dupe.id, userId, dupe);
        applied++;
        continue;
      }
    }
    // A single observation of a preference or style stays tentative.
    const tentative = (o.kind === 'preference' || o.kind === 'style') && o.confidence < 0.8;
    const { error } = await db.from('memories').insert({
      user_id: userId,
      kind: o.kind,
      content: o.content.slice(0, 600),
      concept_keys: o.concept_keys.slice(0, 8),
      confidence: Math.min(0.9, Math.max(0.2, o.confidence)),
      status: tentative ? 'candidate' : 'active',
      source: 'inferred',
      source_run: runId,
      embedding: vector ? JSON.stringify(vector) : null,
    });
    if (!error) applied++;
  }
  for (const o of data.operations.filter((o) => o.op !== 'add')) {
    const target = o.id && known.get(o.id);
    if (!target || target.source === 'user') continue; // never overwrite what the learner wrote
    if (o.op === 'reinforce') await reinforce(target.id, userId, target);
    else if (o.op === 'archive')
      await db.from('memories').update({ status: 'archived', updated_at: new Date().toISOString() }).eq('id', target.id).eq('user_id', userId);
    else if (o.op === 'update') {
      const vector = (await embed(userId, [o.content]))?.[0];
      await db
        .from('memories')
        .update({
          content: o.content.slice(0, 600),
          confidence: Math.min(0.95, Math.max(0.2, o.confidence)),
          updated_at: new Date().toISOString(),
          ...(vector ? { embedding: JSON.stringify(vector) } : {}),
        })
        .eq('id', target.id)
        .eq('user_id', userId);
    }
    applied++;
  }
  return { applied };
}

async function reinforce(id: string, userId: string, m: Pick<Memory, 'confidence' | 'evidence' | 'status'>) {
  const evidence = m.evidence + 1;
  await adminClient()
    .from('memories')
    .update({
      evidence,
      confidence: Math.min(0.95, m.confidence + (1 - m.confidence) * 0.3),
      status: m.status === 'candidate' && evidence >= 2 ? 'active' : m.status,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('user_id', userId);
}

// The learner's verdict on a tentative memory.
export async function reviewMemory(userId: string, id: string, verdict: 'keep' | 'dismiss') {
  const { data, error } = await adminClient()
    .from('memories')
    .update(
      verdict === 'keep'
        ? { status: 'active', confidence: 0.9, updated_at: new Date().toISOString() }
        : { status: 'archived', updated_at: new Date().toISOString() },
    )
    .eq('id', id)
    .eq('user_id', userId)
    .select(COLUMNS)
    .single();
  if (error) throw new Error('The memory did not save.');
  return data as Memory;
}

export async function writeMemory(
  userId: string,
  input: { id?: string; kind: Memory['kind']; content: string; pinned?: boolean; status?: Memory['status'] },
) {
  const db = adminClient();
  // Pinning (same words) keeps where the memory came from; rewording makes
  // it the learner's own.
  if (input.id) {
    const { data: prev } = await db.from('memories').select(COLUMNS).eq('id', input.id).eq('user_id', userId).maybeSingle();
    if (prev && (prev as Memory).content === input.content.slice(0, 600)) {
      const { data, error } = await db
        .from('memories')
        .update({ pinned: !!input.pinned, kind: input.kind, updated_at: new Date().toISOString(), ...(input.status ? { status: input.status } : {}) })
        .eq('id', input.id)
        .eq('user_id', userId)
        .select(COLUMNS)
        .single();
      if (error) throw new Error('The memory did not save.');
      return data as Memory;
    }
  }
  const vector = (await embed(userId, [input.content]))?.[0],
    row = {
      kind: input.kind,
      content: input.content.slice(0, 600),
      pinned: !!input.pinned,
      status: input.status || 'active',
      source: 'user' as const,
      confidence: 0.95,
      updated_at: new Date().toISOString(),
      ...(vector ? { embedding: JSON.stringify(vector) } : {}),
    };
  const { data, error } = input.id
    ? await db.from('memories').update(row).eq('id', input.id).eq('user_id', userId).select(COLUMNS).single()
    : await db.from('memories').insert({ ...row, user_id: userId }).select(COLUMNS).single();
  if (error) throw new Error('The memory did not save.');
  return data as Memory;
}

// Where memories came from: the session or conversation each was learned in.
export type Origin = { title: string; kind: string; at: string };
export async function originsOf(userId: string, list: Memory[]) {
  const ids = [...new Set(list.map((m) => m.source_run).filter((x): x is string => !!x))];
  if (!ids.length) return {};
  const { data } = await adminClient().from('runs').select('id,title,kind,started_at').eq('user_id', userId).in('id', ids.slice(0, 300));
  return Object.fromEntries((data || []).map((r) => [r.id, { title: r.title, kind: r.kind, at: r.started_at } satisfies Origin])) as Record<
    string,
    Origin
  >;
}

export async function deleteMemory(userId: string, id: string) {
  const { error } = await adminClient().from('memories').delete().eq('id', id).eq('user_id', userId);
  if (error) throw new Error('The memory could not be deleted.');
}
