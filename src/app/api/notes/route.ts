import { NextResponse } from 'next/server';
import { z } from 'zod';
import { context, body, fail, HttpError } from '@/lib/server/http';
import { adminClient } from '@/lib/supabase/server';
import type { Beat } from '@/lib/learning/run';

// The learner's own notes on session steps. Each belongs to one step of one
// of their runs, and to that step's idea so the Notebook can gather them.
const COLUMNS = 'id,run_id,beat_id,concept_key,quote,text,created_at';
const unavailable = (e: { code?: string } | null) =>
  e?.code === '42P01' || e?.code === 'PGRST205' ? new HttpError('Notes need the latest database update.', 503) : null;

export async function GET(r: Request) {
  try {
    const { user } = await context(r);
    const run = z.string().uuid().parse(new URL(r.url).searchParams.get('run'));
    const { data, error } = await adminClient().from('notes').select(COLUMNS).eq('user_id', user.id).eq('run_id', run).order('created_at');
    if (unavailable(error)) return NextResponse.json({ notes: [] });
    if (error) throw new Error('Notes could not be loaded.');
    return NextResponse.json({ notes: data });
  } catch (e) {
    return fail(e);
  }
}

export async function POST(r: Request) {
  try {
    const { user } = await context(r);
    const v = z
      .object({
        id: z.string().uuid().optional(),
        runId: z.string().uuid(),
        beatId: z.string().min(1).max(120),
        text: z.string().trim().min(1).max(2000),
        quote: z.string().trim().max(600).optional(),
      })
      .parse(await body(r));
    const db = adminClient();
    const { data: run } = await db.from('runs').select('id,kind,beats').eq('id', v.runId).eq('user_id', user.id).maybeSingle();
    const beat = (run?.beats as Beat[] | undefined)?.find((b) => b.id === v.beatId);
    if (!run || !beat) throw new HttpError('That step isn’t in your sessions.', 404);
    const concept_key = run.kind === 'explore' ? 'trip:' + run.id : beat.concept || null;
    const row = { user_id: user.id, run_id: v.runId, beat_id: v.beatId, concept_key, text: v.text, quote: v.quote || null, updated_at: new Date().toISOString() };
    const { data, error } = v.id
      ? await db.from('notes').update(row).eq('id', v.id).eq('user_id', user.id).select(COLUMNS).single()
      : await db.from('notes').insert(row).select(COLUMNS).single();
    const missing = unavailable(error);
    if (missing) throw missing;
    if (error) throw new Error('The note could not be saved.');
    return NextResponse.json({ note: data });
  } catch (e) {
    return fail(e);
  }
}

export async function DELETE(r: Request) {
  try {
    const { user } = await context(r);
    const { id } = z.object({ id: z.string().uuid() }).parse(await body(r));
    const { error } = await adminClient().from('notes').delete().eq('id', id).eq('user_id', user.id);
    if (error) throw new Error('The note could not be removed.');
    return NextResponse.json({ ok: true });
  } catch (e) {
    return fail(e);
  }
}
