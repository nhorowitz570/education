import { NextResponse } from 'next/server';
import { context, fail } from '@/lib/server/http';
import { readState } from '@/lib/server/state';
import { ensureHorizon } from '@/lib/server/horizon';
export async function GET(r: Request) {
  try {
    const { user } = await context(r);
    return NextResponse.json({
      ownerId: user.id,
      // The plan is brought up to today (weeks closed, this week planned).
      state: await ensureHorizon(user.id).catch(() => readState(user.id)),
    });
  } catch (e) {
    return fail(e);
  }
}
