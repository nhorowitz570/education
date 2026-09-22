import { NextResponse } from 'next/server';
import { z } from 'zod';
import { body, fail } from '@/lib/server/http';
import { guidedFeedback, CASH_KEY } from '@/lib/server/reviewed';
export async function POST(r: Request) {
  try {
    const v = z
      .object({
        choice: z.number().int().min(0).max(2),
        reasoning: z.string().min(10).max(4000),
        transfer: z.string().max(4000).default(''),
        assisted: z.boolean().default(false),
      })
      .parse(await body(r, 12000));
    return NextResponse.json({
      feedback: guidedFeedback(v.choice, v.reasoning, v.transfer, v.assisted),
      correct: v.choice === 0,
      ...CASH_KEY.feedback,
      suggested: 'Opening cash and payment dates',
    });
  } catch (e) {
    return fail(e);
  }
}
