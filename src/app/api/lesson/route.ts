import { NextResponse } from 'next/server';
import { z } from 'zod';
import { context, body, fail } from '@/lib/server/http';
import { privateRows, privatePut } from '@/lib/server/state';
import { getLesson } from '@/lib/server/lessons';
export async function POST(r: Request) {
  try {
    const { user } = await context(r);
    const v = z
      .object({
        sessionId: z.string().max(100),
        reviewOf: z.string().uuid().optional(),
        retry: z.boolean().optional(),
      })
      .parse(await body(r));
    if (v.retry) {
      const jobs = await privateRows<Record<string, unknown>>('jobs', user.id);
      for (const j of jobs.filter(
        (j) =>
          j.kind === 'lesson' &&
          j.status === 'failed' &&
          (j.payload as { sessionId: string }).sessionId === v.sessionId,
      )) {
        await privatePut('jobs', {
          ...j,
          status: 'pending',
          attempts: 0,
          run_after: new Date().toISOString(),
          lease_until: null,
          last_error: null,
        });
      }
    }
    const { lesson } = await getLesson(user.id, v.sessionId, v.reviewOf);
    return NextResponse.json({ lesson });
  } catch (e) {
    return fail(e);
  }
}
