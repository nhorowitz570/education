import { NextResponse } from 'next/server';
import { z } from 'zod';
import { context, body, fail } from '@/lib/server/http';
import { createPractice, listPractice, redoPractice } from '@/lib/server/practice';
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
    const raw = await body(r);
    const redo = z.object({ redo: z.object({ from: z.string().uuid(), line: z.number().int().min(0).max(600) }) }).safeParse(raw);
    if (redo.success) return NextResponse.json({ practice: await redoPractice(user.id, redo.data.redo.from, redo.data.redo.line) });
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
      .parse(raw);
    return NextResponse.json({ practice: await createPractice(user.id, v) });
  } catch (e) {
    return fail(e);
  }
}
