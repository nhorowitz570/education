import { NextResponse, after } from 'next/server';
import { z } from 'zod';
import { context, body, fail } from '@/lib/server/http';
import { ndjson } from '@/lib/server/stream';
import { afterAssess, assess, conduct, getPractice, say, startLive, voiceControl } from '@/lib/server/practice';

// The live route hosts the conductor for the whole call (Fluid compute keeps
// an idle function cheap); calls are capped below this limit.
export const maxDuration = 800;
const id = z.string().uuid();
const line = z.object({ role: z.enum(['user', 'assistant']), text: z.string().max(5000) });

export async function GET(r: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { user } = await context(r);
    return NextResponse.json({ practice: await getPractice(user.id, id.parse((await ctx.params).id)) });
  } catch (e) {
    return fail(e);
  }
}

const action = z.discriminatedUnion('action', [
  z.object({ action: z.literal('live'), sdp: z.string().min(20).max(60000) }),
  z.object({
    action: z.literal('control'),
    voiceId: z.string().uuid(),
    op: z.enum(['heartbeat', 'close']),
    seconds: z.number().min(0).max(3600).optional(),
  }),
  z.object({ action: z.literal('say'), message: z.string().trim().max(3000).default('') }),
  z.object({ action: z.literal('feedback'), transcript: z.array(line).max(600).optional() }),
]);

export async function POST(r: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { user } = await context(r);
    const practiceId = id.parse((await ctx.params).id);
    const v = action.parse(await body(r, 400000));
    switch (v.action) {
      case 'live': {
        const live = await startLive(user.id, practiceId, v.sdp);
        after(() => conduct(user.id, live.voiceRow, live.practice).catch((e) => console.error('conductor', e)));
        return NextResponse.json({
          voiceId: live.voiceId,
          sdp: live.sdp,
          limitSeconds: live.limitSeconds,
          plannedSeconds: live.plannedSeconds,
        });
      }
      case 'control':
        return NextResponse.json(await voiceControl(user.id, v.voiceId, v.op, v.seconds));
      case 'say':
        return ndjson(async (send) => {
          const out = await say(user.id, practiceId, v.message, (text) => send({ t: 'snap', data: { text } }));
          send({ t: 'done', data: out });
        });
      case 'feedback': {
        const feedback = await assess(user.id, practiceId, v.transcript);
        after(() => afterAssess(user.id, practiceId).catch((e) => console.error('afterAssess', e)));
        return NextResponse.json({ feedback });
      }
    }
  } catch (e) {
    return fail(e);
  }
}
