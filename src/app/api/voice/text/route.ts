import { NextResponse } from 'next/server';
import { z } from 'zod';
import { context, body, fail } from '@/lib/server/http';
import { structured, replySchema } from '@/lib/server/ai';
import { voiceInstructions } from '@/lib/voice';
export async function POST(r: Request) {
  try {
    const { user } = await context(r);
    const v = z
      .object({
        voice: z.enum(['cedar', 'willow']).default('willow'),
        message: z.string().min(1).max(2000),
        history: z
          .array(
            z.object({
              role: z.enum(['user', 'assistant']),
              text: z.string().max(3000),
            }),
          )
          .max(16),
        eventId: z.string().uuid(),
      })
      .parse(await body(r));
    return NextResponse.json(
      await structured(
        user.id,
        'voice-text:' + v.eventId,
        replySchema,
        voiceInstructions(6, v.voice),
        v,
        700,
      ),
    );
  } catch (e) {
    return fail(e);
  }
}
