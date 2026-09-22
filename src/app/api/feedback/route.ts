import { NextResponse } from 'next/server';
import { z } from 'zod';
import { context, body, fail, HttpError } from '@/lib/server/http';
import { getLesson, assessDecision } from '@/lib/server/lessons';
export async function POST(r: Request) {
  try {
    const { user } = await context(r);
    const v = z
      .object({
        sessionId: z.string().max(100),
        reviewOf: z.string().uuid().optional(),
        choice: z.number().int().min(0).max(3),
        reasoning: z.string().min(10).max(4000),
      })
      .parse(await body(r));
    const { lesson, key } = await getLesson(user.id, v.sessionId, v.reviewOf);
    if (v.choice >= lesson.choices.length)
      throw new HttpError('Choose one of the answers.');
    return NextResponse.json(
      await assessDecision(user.id, lesson, key, v.choice, v.reasoning),
    );
  } catch (e) {
    return fail(e);
  }
}
