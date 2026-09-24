import { NextResponse } from 'next/server';
import { z } from 'zod';
import { context, body, fail } from '@/lib/server/http';
import { deleteMemory, listMemories, originsOf, reviewMemory, writeMemory } from '@/lib/server/memory';
import { adminClient } from '@/lib/supabase/server';

// What Fieldwork knows about the learner: visible, editable, deletable.
export async function GET(r: Request) {
  try {
    const { user } = await context(r);
    const [memories, profile] = await Promise.all([
      listMemories(user.id),
      adminClient().from('learner_profiles').select('style').eq('user_id', user.id).maybeSingle(),
    ]);
    return NextResponse.json({ memories, style: profile.data?.style || null, origins: await originsOf(user.id, memories) });
  } catch (e) {
    return fail(e);
  }
}

const kind = z.enum(['goal', 'interest', 'preference', 'background', 'knowledge', 'episode', 'style']);
export async function POST(r: Request) {
  try {
    const { user } = await context(r);
    const input = await body(r);
    const verdict = z.object({ id: z.string().uuid(), review: z.enum(['keep', 'dismiss']) }).safeParse(input);
    if (verdict.success) return NextResponse.json({ memory: await reviewMemory(user.id, verdict.data.id, verdict.data.review) });
    const v = z
      .object({
        id: z.string().uuid().optional(),
        kind: kind.default('preference'),
        content: z.string().trim().min(3).max(600),
        pinned: z.boolean().optional(),
        status: z.enum(['active', 'archived']).optional(),
      })
      .parse(input);
    return NextResponse.json({ memory: await writeMemory(user.id, v) });
  } catch (e) {
    return fail(e);
  }
}

export async function DELETE(r: Request) {
  try {
    const { user } = await context(r);
    const v = z.object({ id: z.string().uuid().optional(), all: z.literal(true).optional() }).parse(await body(r));
    if (v.all) {
      await adminClient().from('memories').delete().eq('user_id', user.id);
      await adminClient().from('learner_profiles').delete().eq('user_id', user.id);
    } else if (v.id) await deleteMemory(user.id, v.id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return fail(e);
  }
}
