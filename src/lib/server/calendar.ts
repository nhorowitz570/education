import 'server-only';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { privateRows, privatePut } from './state';
import { HttpError } from './http';
export const calendarConfigured = () =>
  !!process.env.GOOGLE_CLIENT_ID &&
  !!process.env.GOOGLE_CLIENT_SECRET &&
  !!process.env.TOKEN_ENCRYPTION_KEY;
function key() {
  const k = Buffer.from(process.env.TOKEN_ENCRYPTION_KEY || '', 'base64');
  if (k.length !== 32)
    throw new Error('Calendar encryption is not configured.');
  return k;
}
export function encrypt(value: unknown) {
  const iv = randomBytes(12),
    cipher = createCipheriv('aes-256-gcm', key(), iv),
    ciphertext = Buffer.concat([
      cipher.update(JSON.stringify(value)),
      cipher.final(),
    ]);
  return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString(
    'base64',
  );
}
export function decrypt(value: string) {
  const bytes = Buffer.from(value, 'base64'),
    decipher = createDecipheriv('aes-256-gcm', key(), bytes.subarray(0, 12));
  decipher.setAuthTag(bytes.subarray(12, 28));
  return JSON.parse(
    Buffer.concat([
      decipher.update(bytes.subarray(28)),
      decipher.final(),
    ]).toString(),
  );
}
export type Connection = {
  user_id: string;
  provider: string;
  secret: string;
  metadata: Record<string, unknown>;
  updated_at: string;
};
export async function connection(userId: string) {
  return (await privateRows<Connection>('connections', userId)).find(
    (c) => c.provider === 'google',
  );
}
export async function googleAccess(userId: string) {
  const c = await connection(userId);
  if (!c) throw new HttpError('Connect Google Calendar first.');
  const token = decrypt(c.secret);
  if (Date.now() < token.expiresAt - 60000)
    return { token: token.access_token, connection: c };
  if (!token.refresh_token)
    throw new HttpError('Google access expired. Reconnect your calendar.', 401);
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      refresh_token: token.refresh_token,
      grant_type: 'refresh_token',
    }),
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok)
    throw new HttpError(
      'Google access was revoked or expired. Reconnect your calendar.',
      401,
    );
  const refreshed = await res.json();
  await privatePut('connections', {
    ...c,
    secret: encrypt({
      ...token,
      ...refreshed,
      expiresAt: Date.now() + refreshed.expires_in * 1000,
    }),
  });
  return { token: refreshed.access_token, connection: c };
}
