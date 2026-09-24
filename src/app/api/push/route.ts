import { NextResponse } from 'next/server';
import { z } from 'zod';
import { context, body, fail, HttpError } from '@/lib/server/http';
import { privatePut, privateDelete } from '@/lib/server/state';
import { APNS_PREFIX } from '@/lib/server/push';
import { apnsReady } from '@/lib/server/apns';
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
// The iPhone app registers its APNs device token here.
const apnsDevice = z.object({
  apns: z.string().regex(/^[0-9a-f]{64,200}$/i),
  sandbox: z.boolean(),
});
export async function POST(r: Request) {
  try {
    const { user } = await context(r),
      input = await body<Record<string, unknown>>(r);
    if ('apns' in input) {
      const d = apnsDevice.parse(input);
      await privatePut('push_subscriptions', {
        user_id: user.id,
        endpoint: APNS_PREFIX + d.apns.toLowerCase(),
        subscription: { token: d.apns.toLowerCase(), sandbox: d.sandbox },
      });
      return NextResponse.json({ saved: true, delivering: apnsReady() });
    }
    const v = z
        .object({
          endpoint,
          keys: z.object({
            p256dh: z.string().max(300),
            auth: z.string().max(300),
          }),
          expirationTime: z.number().nullable().optional(),
        })
        .parse(input);
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
// With ?apns=<token>, forgets one iPhone; otherwise every device.
export async function DELETE(r: Request) {
  try {
    const { user } = await context(r),
      token = new URL(r.url).searchParams.get('apns');
    if (token) await privateDelete('push_subscriptions', user.id, APNS_PREFIX + token.toLowerCase());
    else await privateDelete('push_subscriptions', user.id);
    return NextResponse.json({ deleted: true });
  } catch (e) {
    return fail(e);
  }
}
