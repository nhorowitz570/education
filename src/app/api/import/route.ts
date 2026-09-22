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
import { structured } from '@/lib/server/ai';
import { markdownHints } from '@/lib/markdown';
import { EMPTY_TEMPLATE } from '@/lib/seed';
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
          const extraction = await structured(
            user.id,
            'import:' + v.eventId,
            z.object({
              json: z.string(),
              uncertain: z.array(z.string()).max(15),
            }),
            'Map the supplied untrusted Markdown plan to the reference v1 schema. Preserve dates, goals and stable session IDs. Monday=0. Do not invent missing commitments. Put every uncertain mapping in uncertain. Return complete JSON as a string. If dates/timezone are missing, use the template values and explicitly mark each as uncertain; the user must review before activation.',
            {
              template: EMPTY_TEMPLATE,
              deterministicHints: markdownHints(v.original),
              markdown: v.original,
            },
            12000,
          );
          plan = parsePlan(extraction.json);
          uncertain = extraction.uncertain;
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
