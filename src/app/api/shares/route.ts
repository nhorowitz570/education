import { NextResponse } from 'next/server';
import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { context, body, fail, HttpError } from '@/lib/server/http';
import { adminClient } from '@/lib/supabase/server';
import { cardOf, notebook } from '@/lib/server/notebook';
import { readState } from '@/lib/server/state';

// Share one Notebook entry as a card anyone with the link can see. The card
// is a snapshot, so later sessions (and anything private) never leak into it,
// and turning the link off makes it disappear.
export async function POST(r: Request) {
  try {
    const { user } = await context(r);
    const v = z.object({ key: z.string().min(1).max(120), words: z.boolean().default(true), name: z.boolean().default(false) }).parse(await body(r));
    const [{ entries }, state] = await Promise.all([notebook(user.id), readState(user.id)]);
    const entry = entries.find((e) => e.key === v.key);
    if (!entry) throw new HttpError('That idea isn’t in your Notebook.', 404);
    const db = adminClient();
    // One live link per idea: sharing again replaces the old snapshot.
    await db.from('shares').update({ revoked_at: new Date().toISOString() }).eq('user_id', user.id).eq('concept_key', v.key).is('revoked_at', null);
    const token = randomBytes(18).toString('base64url');
    const name = v.name ? state.plan?.profile.name?.split(' ')[0] || null : null;
    const { error } = await db.from('shares').insert({ token, user_id: user.id, concept_key: v.key, card: cardOf(entry, { words: v.words, name }) });
    if (error) throw new HttpError(error.code === '42P01' || error.code === 'PGRST205' ? 'Sharing needs the latest database update.' : 'The link could not be made.', 503);
    return NextResponse.json({ token, url: new URL('/c/' + token, r.url).toString() });
  } catch (e) {
    return fail(e);
  }
}

export async function DELETE(r: Request) {
  try {
    const { user } = await context(r);
    const { key } = z.object({ key: z.string().min(1).max(120) }).parse(await body(r));
    const { error } = await adminClient()
      .from('shares')
      .update({ revoked_at: new Date().toISOString() })
      .eq('user_id', user.id)
      .eq('concept_key', key)
      .is('revoked_at', null);
    if (error) throw new Error('The link could not be turned off.');
    return NextResponse.json({ ok: true });
  } catch (e) {
    return fail(e);
  }
}
