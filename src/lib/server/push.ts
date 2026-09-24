import 'server-only';
import webpush from 'web-push';
import { adminClient } from '@/lib/supabase/server';
import { privateRows, privateDelete, readState } from './state';
import { allowsPush, prefsOf } from '@/lib/prefs';
import { apnsReady, deadToken, sendApns, type ApnsTarget } from './apns';

// Web push subscriptions and iPhone (APNs) device tokens share one table; an
// iPhone's endpoint is `apns:<token>`.
type Sub = { user_id: string; endpoint: string; subscription: webpush.PushSubscription | ApnsTarget };
export const APNS_PREFIX = 'apns:';
const isApns = (s: Sub) => s.endpoint.startsWith(APNS_PREFIX);

function webReady() {
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
    key = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !key) return false;
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:admin@example.com', pub, key);
  return true;
}

export function pushReady() {
  return webReady() || apnsReady();
}

export const subscriptions = () => privateRows<Sub>('push_subscriptions');

// Sends one notification to every device a learner has subscribed, at most
// once per key (the database dedupes, so overlapping callers are harmless).
export async function pushTo(
  userId: string,
  key: string,
  message: { body: string; url: string; title?: string },
  subs?: Sub[],
) {
  const web = webReady(),
    apns = apnsReady();
  if (!web && !apns) return 0;
  const mine = (subs || (await privateRows<Sub>('push_subscriptions', userId))).filter(
    (s) => s.user_id === userId && (isApns(s) ? apns : web),
  );
  if (!mine.length) return 0;
  // Each kind of notification has its own switch under You → Notifications.
  if (!allowsPush(prefsOf(await readState(userId)), key)) return 0;
  const { data: claimed, error } = await adminClient().rpc('claim_notification', { p_user_id: userId, p_event_key: key });
  if (error || !claimed) return 0;
  let sent = 0;
  for (const sub of mine) {
    if (isApns(sub)) {
      const r = await sendApns(sub.subscription as ApnsTarget, { ...message, tag: key });
      if (r.status === 200) sent++;
      else if (deadToken(r)) await privateDelete('push_subscriptions', userId, sub.endpoint);
      continue;
    }
    try {
      await webpush.sendNotification(sub.subscription as webpush.PushSubscription, JSON.stringify({ ...message, tag: 'fieldwork:' + key }), { TTL: 900 });
      sent++;
    } catch (e) {
      if ([404, 410].includes((e as { statusCode: number }).statusCode)) await privateDelete('push_subscriptions', userId, sub.endpoint);
    }
  }
  return sent;
}
