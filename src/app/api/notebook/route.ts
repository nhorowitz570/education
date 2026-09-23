import { NextResponse } from 'next/server';
import { context, fail } from '@/lib/server/http';
import { notebook, terms } from '@/lib/server/notebook';

// Every idea the learner has met. ?terms=1 returns the short form a lesson
// uses to recognise ideas taught before (optionally excluding one run).
export async function GET(r: Request) {
  try {
    const { user } = await context(r);
    const url = new URL(r.url);
    if (url.searchParams.get('terms')) return NextResponse.json({ terms: await terms(user.id, url.searchParams.get('run') || undefined) });
    return NextResponse.json(await notebook(user.id));
  } catch (e) {
    return fail(e);
  }
}
