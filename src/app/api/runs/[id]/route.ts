import { NextResponse, after } from 'next/server';
import { z } from 'zod';
import { context, body, fail } from '@/lib/server/http';
import { ndjson } from '@/lib/server/stream';
import { readState } from '@/lib/server/state';
import {
  advance,
  afterFinish,
  answerBeat,
  askBeat,
  finishRun,
  loadRun,
  streamBeat,
  view,
} from '@/lib/server/runs';

export const maxDuration = 300;
const id = z.string().uuid();

export async function GET(r: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { user } = await context(r);
    const runId = id.parse((await ctx.params).id);
    const [row, state] = await Promise.all([loadRun(user.id, runId), readState(user.id)]);
    return NextResponse.json({ run: view(row, state.plan) });
  } catch (e) {
    return fail(e);
  }
}

const action = z.discriminatedUnion('action', [
  z.object({ action: z.literal('beat'), beatId: z.string().max(80) }),
  z.object({
    action: z.literal('answer'),
    beatId: z.string().max(80),
    choice: z.number().int().min(0).max(9).optional(),
    text: z.string().trim().max(6000).optional(),
  }),
  z.object({
    action: z.literal('ask'),
    beatId: z.string().max(80),
    intent: z.enum(['why', 'example', 'deeper', 'simpler', 'visual', 'free']),
    prompt: z.string().trim().max(2000).default(''),
  }),
  z.object({ action: z.literal('advance'), beatId: z.string().max(80), skip: z.boolean().default(false) }),
  z.object({ action: z.literal('finish') }),
]);

export async function POST(r: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { user } = await context(r);
    const runId = id.parse((await ctx.params).id);
    const v = action.parse(await body(r, 64000));
    switch (v.action) {
      case 'beat':
        return ndjson((send) => streamBeat(user.id, runId, v.beatId, send));
      case 'answer':
        if (v.choice === undefined && !v.text)
          return NextResponse.json({ error: 'Write an answer or choose an option.' }, { status: 400 });
        return ndjson((send) => answerBeat(user.id, runId, v.beatId, { choice: v.choice, text: v.text }, send));
      case 'ask':
        if (v.intent === 'free' && !v.prompt)
          return NextResponse.json({ error: 'Ask a question first.' }, { status: 400 });
        return ndjson((send) => askBeat(user.id, runId, v.beatId, v.prompt, v.intent, send));
      case 'advance':
        return NextResponse.json(await advance(user.id, runId, v.beatId, v.skip));
      case 'finish': {
        const { alreadyDone, row } = await finishRun(user.id, runId);
        if (!alreadyDone) after(() => afterFinish(user.id, row).catch((e) => console.error('afterFinish', e)));
        return NextResponse.json({ ok: true });
      }
    }
  } catch (e) {
    return fail(e);
  }
}
