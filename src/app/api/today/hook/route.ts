import { NextResponse } from 'next/server';
import { z } from 'zod';
import { context, fail, HttpError } from '@/lib/server/http';
import { readState } from '@/lib/server/state';
import { listMemories } from '@/lib/server/memory';
import { generate } from '@/lib/ai/engine';

// One line that makes the next session worth opening. Fetched after Today has
// painted, and cached by the browser for the day, so it never slows Today.
export async function GET(r: Request) {
  try {
    const { user } = await context(r);
    const sessionId = z.string().min(1).max(120).parse(new URL(r.url).searchParams.get('session'));
    const state = await readState(user.id);
    const session = state.plan?.sessions.find((s) => s.id === sessionId);
    if (!session) throw new HttpError('That session isn’t in your plan.', 404);
    const interests = (await listMemories(user.id))
      .filter((m) => m.status === 'active' && (m.kind === 'interest' || m.kind === 'background'))
      .slice(0, 4)
      .map((m) => m.content);
    const { data } = await generate({
      task: 'today.hook',
      userId: user.id,
      schema: z.object({ hook: z.string() }),
      context: [{ name: 'learner_interests', content: interests.length ? interests.join('\n') : null }],
      input: `Session: ${session.title} (${session.subject}).\nObjective: ${session.objective}`,
    });
    const hook = data.hook.trim().replace(/^["“]|["”]$/g, '');
    return NextResponse.json({ hook: hook.split(/\s+/).length <= 26 ? hook : '' }, { headers: { 'Cache-Control': 'private, max-age=43200' } });
  } catch (e) {
    return fail(e);
  }
}
