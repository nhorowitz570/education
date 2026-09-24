import 'server-only';
import { createSign } from 'node:crypto';
import { connect } from 'node:http2';

// Apple Push Notification service for the iPhone app. Needs an APNs auth key
// (.p8) from the Apple Developer account: APNS_KEY_ID, APNS_TEAM_ID and
// APNS_PRIVATE_KEY (the file's contents; literal \n are accepted). Builds
// installed from Xcode register sandbox tokens, TestFlight and App Store
// builds production ones, so each token remembers which host it belongs to.
export const APNS_TOPIC = process.env.APNS_TOPIC || 'co.nhorowitz.fieldwork';

export function apnsReady() {
  return !!(process.env.APNS_KEY_ID && process.env.APNS_TEAM_ID && process.env.APNS_PRIVATE_KEY);
}

// Provider tokens are valid for an hour and Apple rejects refreshing them
// more than every 20 minutes, so one is reused for 40.
let cached: { jwt: string; at: number } | null = null;
function providerToken() {
  if (cached && Date.now() - cached.at < 40 * 60000) return cached.jwt;
  const b64 = (v: object | Buffer) => (Buffer.isBuffer(v) ? v : Buffer.from(JSON.stringify(v))).toString('base64url');
  const head = b64({ alg: 'ES256', kid: process.env.APNS_KEY_ID }),
    claims = b64({ iss: process.env.APNS_TEAM_ID, iat: Math.floor(Date.now() / 1000) });
  const signature = createSign('SHA256')
    .update(`${head}.${claims}`)
    .sign({ key: process.env.APNS_PRIVATE_KEY!.replace(/\\n/g, '\n'), dsaEncoding: 'ieee-p1363' });
  cached = { jwt: `${head}.${claims}.${b64(signature)}`, at: Date.now() };
  return cached.jwt;
}

export type ApnsTarget = { token: string; sandbox: boolean };
export type ApnsMessage = { title?: string; body: string; url: string; tag: string };

// Resolves with Apple's status: 200 sent, 410/400 BadDeviceToken means the
// token is dead and should be forgotten.
export function sendApns(target: ApnsTarget, message: ApnsMessage): Promise<{ status: number; reason?: string }> {
  const host = target.sandbox ? 'https://api.sandbox.push.apple.com' : 'https://api.push.apple.com';
  const payload = JSON.stringify({
    aps: {
      alert: { title: message.title || 'Fieldwork', body: message.body },
      sound: 'default',
      'thread-id': message.tag.split(':')[0],
    },
    url: message.url,
  });
  return new Promise((resolve) => {
    const session = connect(host);
    const done = (r: { status: number; reason?: string }) => {
      session.close();
      resolve(r);
    };
    session.on('error', () => done({ status: 0, reason: 'ConnectionFailed' }));
    const req = session.request({
      ':method': 'POST',
      ':path': `/3/device/${target.token}`,
      authorization: `bearer ${providerToken()}`,
      'apns-topic': APNS_TOPIC,
      'apns-push-type': 'alert',
      'apns-priority': '10',
      'apns-expiration': String(Math.floor(Date.now() / 1000) + 900),
      'apns-collapse-id': message.tag.slice(0, 64),
      'content-type': 'application/json',
    });
    let status = 0,
      body = '';
    req.setTimeout(10000, () => {
      req.close();
      done({ status: 0, reason: 'Timeout' });
    });
    req.on('response', (h) => (status = Number(h[':status'])));
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      let reason: string | undefined;
      try {
        reason = body ? (JSON.parse(body) as { reason?: string }).reason : undefined;
      } catch {}
      done({ status, reason });
    });
    req.on('error', () => done({ status: 0, reason: 'RequestFailed' }));
    req.end(payload);
  });
}

export const deadToken = (r: { status: number; reason?: string }) =>
  r.status === 410 || (r.status === 400 && /BadDeviceToken|DeviceTokenNotForTopic/.test(r.reason || ''));
