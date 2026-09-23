import { NextResponse, after } from 'next/server';
import { z } from 'zod';
import { context, body, fail, HttpError } from '@/lib/server/http';
import { readState } from '@/lib/server/state';
import { adoptFocus, askInsight, buildInsight, claimWeek, getInsight, listInsights, markSeen, trailingWeek, zoneFor } from '@/lib/server/insights';

// Generation runs Astra at high effort in the background of this request.
export const maxDuration = 800;

// Every week's summary, plus one week in full (the newest unless ?id= says).
export async function GET(r: Request) {
  try {
    const { user } = await context(r);
    const weeks = await listInsights(user.id);
    const want = new URL(r.url).searchParams.get('id');
    const pick = want ? weeks.find((w) => w.id === want) : weeks.find((w) => w.status === 'ready') || weeks[0];
    if (want && !pick) throw new HttpError('That week isn’t available.', 404);
    return NextResponse.json({ weeks, insight: pick ? await getInsight(user.id, pick.id) : null });
  } catch (e) {
    return fail(e);
  }
}

export async function POST(r: Request) {
  try {
    const { user } = await context(r);
    const v = z
      .discriminatedUnion('action', [
        z.object({ action: z.literal('generate') }),
        z.object({ action: z.literal('seen'), id: z.string().uuid() }),
        z.object({ action: z.literal('adopt'), id: z.string().uuid(), on: z.boolean() }),
        z.object({ action: z.literal('ask'), id: z.string().uuid(), question: z.string().trim().min(3).max(300) }),
      ])
      .parse(await body(r));
    if (v.action === 'seen') {
      await markSeen(user.id, v.id);
      return NextResponse.json({ ok: true });
    }
    if (v.action === 'adopt') return NextResponse.json({ focus: await adoptFocus(user.id, v.id, v.on) });
    if (v.action === 'ask') return NextResponse.json({ answer: await askInsight(user.id, v.id, v.question) });
    // On demand only for a first read, or to retry one that failed. After
    // that, insights arrive once a week on their own.
    const weeks = await listInsights(user.id);
    if (weeks.some((w) => w.status !== 'failed') && weeks[0]?.status !== 'failed')
      throw new HttpError('Your next read arrives on Monday.', 409);
    const state = await readState(user.id);
    const week = weeks[0]?.status === 'failed' ? { start: weeks[0].week_start, end: weeks[0].week_end } : trailingWeek(zoneFor(state));
    const id = await claimWeek(user.id, week);
    if (!id) throw new HttpError('This week’s read is already being written.', 409);
    after(() => buildInsight(user.id, id, week));
    return NextResponse.json({ id, status: 'generating' });
  } catch (e) {
    return fail(e);
  }
}
