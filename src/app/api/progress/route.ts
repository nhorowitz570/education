import { NextResponse } from 'next/server';
import { context, fail } from '@/lib/server/http';
import { progressFor } from '@/lib/server/gamify';

// XP, level, streak, today's quests and badges.
export async function GET(r: Request) {
  try {
    const { user } = await context(r);
    return NextResponse.json(await progressFor(user.id));
  } catch (e) {
    return fail(e);
  }
}
