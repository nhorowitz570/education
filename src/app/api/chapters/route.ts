import { NextResponse } from 'next/server';
import { z } from 'zod';
import { context, fail } from '@/lib/server/http';
import { readState } from '@/lib/server/state';
import { adminClient } from '@/lib/supabase/server';
import { generate } from '@/lib/ai/engine';
import { chapterKey, chapters, type ChapterName } from '@/lib/chapters';

const naming = new Map<string, Promise<ChapterName[]>>();

// Outcome names for the plan's chapters. Written once per plan by the fast
// model and cached; the page shows deterministic names until they exist.
export async function GET(r: Request) {
  try {
    const { user } = await context(r);
    const plan = (await readState(user.id)).plan;
    if (!plan) return NextResponse.json({ names: [] });
    const list = chapters(plan);
    const key = chapterKey(list);
    const db = adminClient();
    const { data } = await db.from('plan_chapters').select('chapters').eq('user_id', user.id).eq('plan_id', plan.plan_id).maybeSingle();
    const cached = data?.chapters as { key?: string; names?: ChapterName[] }[] | undefined;
    const hit = cached?.find((c) => c.key === key);
    if (hit?.names) return NextResponse.json({ names: hit.names });

    const job =
      naming.get(user.id + key) ||
      (async () => {
        const { data: out } = await generate({
          task: 'plan.chapters',
          userId: user.id,
          schema: z.object({ chapters: z.array(z.object({ id: z.string(), title: z.string(), outcome: z.string() })) }),
          input: list
            .map((c) => {
              const weeks = plan.weeks.filter((w) => c.weeks.includes(w.id));
              return [
                `id: ${c.id}${c.interlude ? ' (interlude)' : ''}${c.milestone ? ` (ends with milestone: ${c.milestone})` : ''}`,
                ...weeks.map((w) => `- ${Object.values(w.topics).join(' / ')} → ${w.evidence}`),
              ].join('\n');
            })
            .join('\n\n'),
        });
        const ids = new Set(list.map((c) => c.id));
        const names = out.chapters
          .filter((c) => ids.has(c.id))
          .map((c) => ({ id: c.id, title: c.title.slice(0, 80), outcome: c.outcome.slice(0, 300) }));
        await db.from('plan_chapters').upsert({ user_id: user.id, plan_id: plan.plan_id, chapters: [{ key, names }] });
        return names;
      })().finally(() => naming.delete(user.id + key));
    naming.set(user.id + key, job);
    return NextResponse.json({ names: await job });
  } catch (e) {
    return fail(e);
  }
}
