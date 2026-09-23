import { NextResponse, after } from 'next/server';
import { z } from 'zod';
import { context, body, fail } from '@/lib/server/http';
import { breakStillRunning, startBreak } from '@/lib/server/runs';
import { pushTo } from '@/lib/server/push';

// Breaks run up to ten minutes; the reminder waits in the background for
// the break to end, so this route may live that long.
export const maxDuration = 800;
const id = z.string().uuid();

export async function POST(r: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { user } = await context(r);
    const runId = id.parse((await ctx.params).id);
    const { beatId } = z.object({ beatId: z.string().max(80) }).parse(await body(r));
    const { until, fresh } = await startBreak(user.id, runId, beatId);
    if (fresh)
      after(async () => {
        await new Promise((resolve) => setTimeout(resolve, Math.max(0, Date.parse(until) - Date.now())));
        // Skip it if they came back early or finished.
        if (!(await breakStillRunning(user.id, runId, until))) return;
        await pushTo(user.id, `break:${runId}:${beatId}`, {
          title: 'Break’s over',
          body: 'Ready when you are. The next step is waiting.',
          url: '/session/' + runId,
        }).catch((e) => console.error('break push', e));
      });
    return NextResponse.json({ until });
  } catch (e) {
    return fail(e);
  }
}
