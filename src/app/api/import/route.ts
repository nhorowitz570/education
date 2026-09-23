import { NextResponse } from 'next/server';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { context, body, fail, HttpError } from '@/lib/server/http';
import {
  parsePlan,
  planSchema,
  planDiff,
  canonical,
  MAX_IMPORT_BYTES,
} from '@/lib/plan';
import { readState, mutate } from '@/lib/server/state';
import { generate } from '@/lib/ai/engine';
import { skeletonSchema, expand } from '@/lib/import/skeleton';
import { markdownHints } from '@/lib/markdown';
// Long Markdown plans take a while to read.
export const maxDuration = 300;
export async function POST(r: Request) {
  try {
    const { user, db } = await context(r),
      v = z
        .object({
          action: z.enum(['preview', 'activate']),
          filename: z.string().min(1).max(200),
          original: z.string().max(MAX_IMPORT_BYTES),
          plan: planSchema.optional(),
          eventId: z.string().uuid(),
        })
        .parse(await body(r, MAX_IMPORT_BYTES * 2 + 100000));
    if (!/\.(json|md|markdown|txt)$/i.test(v.filename))
      throw new HttpError('Choose a JSON or Markdown plan.');
    if (new TextEncoder().encode(v.original).length > MAX_IMPORT_BYTES)
      throw new HttpError('Choose a file smaller than 2 MB.');
    let plan = v.plan;
    let uncertain: string[] = [];
    if (v.action === 'preview') {
      if (v.filename.toLowerCase().endsWith('.json'))
        plan = parsePlan(v.original);
      else {
        const fenced = v.original.match(/```json\s*([\s\S]*?)```/i);
        if (fenced) plan = parsePlan(fenced[1]);
        else {
          if (v.original.length > 80000)
            throw new HttpError(
              'For a long plan, export the v1 JSON format from ChatGPT. Markdown extraction is limited to 80,000 characters.',
            );
          const hints = markdownHints(v.original);
          const { data } = await generate({
            task: 'import.markdown',
            userId: user.id,
            schema: skeletonSchema,
            context: [{ name: 'hints', content: JSON.stringify(hints) }],
            input: `<plan untrusted="true">\n${v.original}\n</plan>`,
          });
          try {
            ({ plan, uncertain } = expand(data, { timezone: hints.timezone }));
          } catch (e) {
            throw new HttpError((e as Error).message + ' Try exporting the plan as v1 JSON instead.', 422);
          }
        }
      }
    }
    if (!plan) throw new HttpError('Review a plan before activation.');
    const state = await readState(user.id),
      diff = planDiff(state.plan, plan);
    if (v.action === 'preview')
      return NextResponse.json({ plan, diff, uncertain });
    const hash = createHash('sha256').update(canonical(plan)).digest('hex'),
      ext = v.filename.toLowerCase().endsWith('.json') ? 'json' : 'md',
      path = `${user.id}/imports/${hash}.${ext}`;
    const { error: upload } = await db.storage
      .from('fieldwork-private')
      .upload(path, v.original, {
        contentType: ext === 'json' ? 'application/json' : 'text/markdown',
        upsert: false,
      });
    if (upload && !/already exists|Duplicate/i.test(upload.message))
      throw new Error('Your original plan could not be stored privately.');
    const { data: version, error } = await db.rpc('activate_plan', {
      p_user_id: user.id,
      p_hash: hash,
      p_document: plan,
      p_path: path,
    });
    if (error) throw new Error(error.message);
    const next = await mutate(
      user.id,
      v.eventId,
      (s) => ({
        ...s,
        plan,
        records:
          s.plan?.plan_id === plan.plan_id
            ? s.records
            : s.records.filter((r) => r.kind !== 'draft'),
        overrides: s.plan?.plan_id === plan.plan_id ? s.overrides : {},
        revisions: s.plan?.plan_id === plan.plan_id ? s.revisions : [],
      }),
      undefined,
      version,
    );
    return NextResponse.json({ state: next, version, diff });
  } catch (e) {
    return fail(e);
  }
}
