import { NextResponse } from 'next/server';
import { z } from 'zod';
import { context, body, fail } from '@/lib/server/http';
import { draftWeek } from '@/lib/server/horizon';

// Drafting reads the learner model and asks the planning model once.
export const maxDuration = 120;

// Draft next week now (before Sunday's automatic draft), or redraft it after
// steering.
export async function POST(r: Request) {
  try {
    const { user } = await context(r);
    const v = z.object({ action: z.enum(['draft', 'redraft']) }).parse(await body(r));
    const state = await draftWeek(user.id, { regenerate: v.action === 'redraft' });
    return NextResponse.json({ state, ownerId: user.id });
  } catch (e) {
    return fail(e);
  }
}
