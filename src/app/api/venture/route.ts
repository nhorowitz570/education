import { NextResponse } from 'next/server';
import { z } from 'zod';
import { context, body, fail } from '@/lib/server/http';
import { ventureAct, ventureView } from '@/lib/server/venture';

// Luna writes each month's story, which can take a few seconds.
export const maxDuration = 60;

export async function GET(r: Request) {
  try {
    const { user } = await context(r);
    return NextResponse.json(await ventureView(user.id));
  } catch (e) {
    return fail(e);
  }
}

const levers = z
  .object({
    price: z.number(),
    marketing: z.number(),
    staff: z.number().int(),
    restock: z.number(),
    borrow: z.number(),
    repay: z.number(),
    upgrade: z.boolean(),
  })
  .partial();
const action = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('create'),
    kind: z.enum(['roastery', 'studio', 'truck']),
    name: z.string().trim().min(1).max(40),
    founder: z.string().trim().max(40).default(''),
    loan: z.boolean().default(false),
    restart: z.boolean().optional(),
  }),
  z.object({ action: z.literal('levers'), revision: z.number().int(), levers }),
  z.object({ action: z.literal('choose'), revision: z.number().int(), index: z.number().int().min(0).max(4) }),
  z.object({ action: z.literal('advance'), revision: z.number().int(), levers: levers.optional() }),
]);

export async function POST(r: Request) {
  try {
    const { user } = await context(r);
    return NextResponse.json(await ventureAct(user.id, action.parse(await body(r))));
  } catch (e) {
    return fail(e);
  }
}
