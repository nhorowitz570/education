import { NextResponse } from 'next/server';
import { z } from 'zod';
import { context, body, fail, HttpError } from '@/lib/server/http';
import { privatePut, privateDelete } from '@/lib/server/state';
const endpoint = z
  .string()
  .url()
  .max(2000)
  .refine((s) => {
    const u = new URL(s);
    return (
      u.protocol === 'https:' &&
      /^(?:[a-z0-9-]+\.)?(?:push\.services\.mozilla\.com|fcm\.googleapis\.com|web\.push\.apple\.com|notify\.windows\.com)$/.test(
        u.hostname,
      )
    );
  }, 'Unknown push provider.');
export async function GET(r: Request) {
  try {
    await context(r);
    const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    if (!key || !process.env.VAPID_PRIVATE_KEY)
      throw new HttpError('Push is awaiting server configuration.', 503);
    return NextResponse.json({ key });
  } catch (e) {
    return fail(e);
  }
}
export async function POST(r: Request) {
  try {
    const { user } = await context(r),
      v = z
        .object({
          endpoint,
          keys: z.object({
            p256dh: z.string().max(300),
            auth: z.string().max(300),
          }),
          expirationTime: z.number().nullable().optional(),
        })
        .parse(await body(r));
    await privatePut('push_subscriptions', {
      user_id: user.id,
      endpoint: v.endpoint,
      subscription: v,
    });
    return NextResponse.json({ saved: true });
  } catch (e) {
    return fail(e);
  }
}
export async function DELETE(r: Request) {
  try {
    const { user } = await context(r);
    await privateDelete('push_subscriptions', user.id);
    return NextResponse.json({ deleted: true });
  } catch (e) {
    return fail(e);
  }
}
