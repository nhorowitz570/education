import { NextResponse } from 'next/server';
import { context, fail } from '@/lib/server/http';
import { readState } from '@/lib/server/state';
export async function GET() {
  try {
    const { user } = await context();
    return NextResponse.json({
      ownerId: user.id,
      state: await readState(user.id),
    });
  } catch (e) {
    return fail(e);
  }
}
