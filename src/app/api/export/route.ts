import { NextResponse } from 'next/server';
import { context, fail } from '@/lib/server/http';
import { adminClient } from '@/lib/supabase/server';

// Everything the learner owns, in readable form. Embeddings and answer keys
// are internal and left out.
const OWN: [table: string, columns: string][] = [
  ['profiles', '*'],
  ['plan_versions', '*'],
  ['workspaces', '*'],
  ['attempts', '*'],
  ['lesson_versions', '*'],
];
const LEARNING: [table: string, columns: string][] = [
  ['concepts', 'plan_id,key,title,track,summary,prerequisites,session_ids,position'],
  ['concept_states', '*'],
  ['learning_events', '*'],
  ['runs', 'id,kind,plan_id,session_id,title,status,outline,beats,context,summary,minutes_planned,started_at,ended_at'],
  ['memories', 'id,kind,content,concept_keys,confidence,evidence,status,pinned,source,created_at,updated_at'],
  ['learner_profiles', '*'],
];

export async function GET(r: Request) {
  try {
    const { user, db } = await context(r);
    const read = async (client: typeof db, [t, cols]: [string, string]) => {
      const { data, error } = await client.from(t).select(cols).eq('user_id', user.id);
      if (error) throw error;
      return [t, data] as const;
    };
    const records = await Promise.all([
      ...OWN.map((t) => read(db, t)),
      ...LEARNING.map((t) => read(adminClient() as typeof db, t)),
    ]);
    return NextResponse.json(
      { exported_at: new Date().toISOString(), ...Object.fromEntries(records) },
      { headers: { 'Content-Disposition': 'attachment; filename="fieldwork-account.json"' } },
    );
  } catch (e) {
    return fail(e);
  }
}
