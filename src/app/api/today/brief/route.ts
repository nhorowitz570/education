import { NextResponse } from 'next/server';
import { context, body, fail } from '@/lib/server/http';
import { morningBrief } from '@/lib/server/tutor';
import { briefInput } from '@/lib/tutor';

export const maxDuration = 60;

// The morning brief on Today: what the day is for, written from what the
// learner actually did recently. Written once per day per device; the
// browser keeps it for the day.
export async function POST(r: Request) {
  try {
    const { user } = await context(r);
    const input = briefInput.parse(await body(r, 16000));
    return NextResponse.json({ brief: await morningBrief(user.id, input) });
  } catch (e) {
    return fail(e);
  }
}
