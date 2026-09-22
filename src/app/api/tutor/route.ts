import { NextResponse } from 'next/server';
import { z } from 'zod';
import { context, body, fail } from '@/lib/server/http';
import { structured, replySchema } from '@/lib/server/ai';
import { getLesson } from '@/lib/server/lessons';
import { readState } from '@/lib/server/state';
export async function POST(r: Request) {
  try {
    const { user } = await context(r);
    const v = z
      .object({
        sessionId: z.string().max(100),
        message: z.string().min(1).max(2000),
        history: z
          .array(
            z.object({
              role: z.enum(['user', 'assistant']),
              content: z.string().max(3000),
            }),
          )
          .max(8),
        eventId: z.string().uuid(),
      })
      .parse(await body(r));
    const { lesson } = await getLesson(user.id, v.sessionId),
      state = await readState(user.id);
    return NextResponse.json(
      await structured(
        user.id,
        'tutor:' + v.eventId,
        replySchema,
        'Be a concise Socratic tutor. Use plain conversational text, usually under 100 words, without Markdown headings or lists. Use this lesson’s verified sources only. Give one useful hint and one question. Never claim unsupported facts. Say when more research is needed. Respect learning preferences.',
        {
          lesson,
          message: v.message,
          history: v.history,
          memory: state.records
            .filter((r) => r.kind === 'memory')
            .slice(-5)
            .map((r) => r.data),
        },
        1000,
      ),
    );
  } catch (e) {
    return fail(e);
  }
}
