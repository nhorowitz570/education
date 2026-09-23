import { aiEnv } from '@/lib/ai/env';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { context, body, fail, HttpError } from '@/lib/server/http';
import { privateRows, privatePut } from '@/lib/server/state';
export async function GET(r: Request) {
  try {
    const { user } = await context(r);
    const rows = await privateRows<{
      month: string;
      state: string;
      reserved_usd: number;
      actual_usd: number;
    }>('usage_events', user.id);
    const month = new Date().toISOString().slice(0, 7);
    return NextResponse.json({
      used: rows
        .filter((x) => x.month.startsWith(month))
        .reduce(
          (n, x) =>
            n +
            Number(
              x.state === 'reserved'
                ? x.reserved_usd
                : x.state === 'settled'
                  ? x.actual_usd
                  : 0,
            ),
          0,
        ),
      limit: aiEnv().AI_MONTHLY_LIMIT_USD ?? null,
      textModel: aiEnv().AI_MODEL_PRIMARY,
      textProvider: aiEnv().AI_PROVIDER === 'openrouter' ? 'OpenRouter' : 'OpenAI',
      voiceModel: aiEnv().OPENAI_VOICE_MODEL,
    });
  } catch (e) {
    return fail(e);
  }
}
export async function DELETE(r: Request) {
  try {
    const { user, db } = await context(r);
    z.object({ confirm: z.literal('DELETE MY ACCOUNT') }).parse(await body(r));
    const unresolved = (
      await privateRows<{ id: string; status: string; [key: string]: unknown }>(
        'voice_sessions',
        user.id,
      )
    ).filter((s) => s.status !== 'closed');
    if (unresolved.length) {
      for (const session of unresolved)
        if (session.status === 'active')
          await privatePut('voice_sessions', { ...session, status: 'closing' });
      throw new HttpError(
        'Your voice session is still closing or awaiting usage confirmation. Retry deletion after it finishes; unresolved provider usage needs administrator review.',
        409,
      );
    }
    // Remove private objects before deleting the auth owner. Keep deletion retryable.
    for (const folder of ['imports', 'food']) {
      let more = true;
      while (more) {
        const { data, error } = await db.storage
          .from('fieldwork-private')
          .list(`${user.id}/${folder}`, { limit: 100 });
        if (error) throw error;
        more = !!data?.length;
        if (more) {
          const { error: e } = await db.storage
            .from('fieldwork-private')
            .remove(data!.map((f) => `${user.id}/${folder}/${f.name}`));
          if (e) throw e;
        }
      }
    }
    const { error } = await db.auth.admin.deleteUser(user.id);
    if (error) throw error;
    return NextResponse.json({ deleted: true });
  } catch (e) {
    return fail(e);
  }
}
