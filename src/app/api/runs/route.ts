import { NextResponse } from 'next/server';
import { z } from 'zod';
import { context, body, fail } from '@/lib/server/http';
import { startRun } from '@/lib/server/runs';
import { adminClient } from '@/lib/supabase/server';

// Start (or resume) a session, review, return or exploration. No model call:
// the outline is built instantly and each step is generated when reached.
export async function POST(r: Request) {
  try {
    const { user } = await context(r);
    const v = z
      .object({
        kind: z.enum(['session', 'review', 'explore', 'return']),
        sessionId: z.string().max(100).optional(),
        minutes: z.number().int().min(5).max(240).optional(),
        topic: z.string().trim().min(2).max(400).optional(),
        concepts: z.array(z.string().max(80)).max(8).optional(),
      })
      .parse(await body(r));
    return NextResponse.json({ run: await startRun(user.id, v) });
  } catch (e) {
    return fail(e);
  }
}

// Recent history for the Path and Mastery views.
export async function GET(r: Request) {
  try {
    const { user } = await context(r);
    const { data, error } = await adminClient()
      .from('runs')
      .select('id,kind,title,status,session_id,summary,started_at,ended_at,minutes_planned')
      .eq('user_id', user.id)
      .order('started_at', { ascending: false })
      .limit(60);
    if (error) throw new Error('History could not be loaded.');
    return NextResponse.json({ runs: data });
  } catch (e) {
    return fail(e);
  }
}
