import { NextResponse } from 'next/server';
import { z } from 'zod';
import { context, body, fail } from '@/lib/server/http';
import { createPractice, listPractice } from '@/lib/server/practice';
import { difficultySchema, modeSchema, voiceSchema } from '@/lib/practice/harness';

export const maxDuration = 60;

export async function GET(r: Request) {
  try {
    const { user } = await context(r);
    return NextResponse.json({ practices: await listPractice(user.id) });
  } catch (e) {
    return fail(e);
  }
}

export async function POST(r: Request) {
  try {
    const { user } = await context(r);
    const v = z
      .object({
        mode: modeSchema,
        topic: z.string().trim().min(3).max(600),
        side: z.string().trim().max(300).optional(),
        difficulty: difficultySchema.default('realistic'),
        minutes: z.union([z.literal(5), z.literal(8), z.literal(12)]).default(8),
        voice: voiceSchema.default('cedar'),
        parent: z.object({ runId: z.string().uuid(), beatId: z.string().max(80) }).optional(),
      })
      .parse(await body(r));
    return NextResponse.json({ practice: await createPractice(user.id, v) });
  } catch (e) {
    return fail(e);
  }
}
