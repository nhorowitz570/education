import { NextResponse } from 'next/server';
import { z } from 'zod';
import { adminClient, configured } from '@/lib/supabase/server';
import { body, fail, HttpError } from '@/lib/server/http';
import { crossSite } from '@/lib/server/origin';

// Public "request access" form. No account involved: the same-site check
// stands in for authentication, the honeypot catches naive bots, and a repeat
// email updates the earlier answer instead of piling up rows.
const Interest = z.object({
  name: z.string().trim().max(80).optional().default(''),
  email: z.string().trim().toLowerCase().pipe(z.email().max(200)),
  learn: z.string().trim().min(1).max(400),
  learnsWith: z.array(z.string().max(40)).max(8).default([]),
  wouldPay: z.string().max(40).nullable().default(null),
  website: z.string().max(200).optional().default(''),
});

export async function POST(request: Request) {
  try {
    if (crossSite(request)) throw new HttpError('This request came from a different site.', 403);
    const input = Interest.parse(await body(request, 8000));
    if (input.website) return NextResponse.json({ ok: true });
    if (!configured() || !process.env.SUPABASE_SECRET_KEY)
      throw new HttpError('Requests aren’t being collected yet. Try again soon.', 503);
    const { error } = await adminClient()
      .from('interest_requests')
      .upsert(
        {
          name: input.name || null,
          email: input.email,
          learn: input.learn,
          learns_with: input.learnsWith,
          would_pay: input.wouldPay,
        },
        { onConflict: 'email' },
      );
    // Until the migration is applied the table doesn't exist yet.
    if (error && (error.code === 'PGRST205' || error.code === '42P01'))
      throw new HttpError('Requests aren’t being collected yet. Try again soon.', 503);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (e) {
    return fail(e);
  }
}
