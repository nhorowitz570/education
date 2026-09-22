import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { context, fail, HttpError } from '@/lib/server/http';
import { encrypt, decrypt } from '@/lib/server/calendar';
import { privatePut } from '@/lib/server/state';
export async function GET(r: Request) {
  try {
    const { user } = await context(r),
      url = new URL(r.url),
      jar = await cookies(),
      stored = jar.get('fieldwork-google')?.value;
    jar.delete('fieldwork-google');
    if (!stored)
      throw new HttpError('Calendar connection expired. Start again.');
    const v = decrypt(stored);
    if (
      v.state !== url.searchParams.get('state') ||
      v.userId !== user.id ||
      !url.searchParams.get('code')
    )
      throw new HttpError(
        'Calendar connection was cancelled or could not be verified.',
      );
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        code: url.searchParams.get('code')!,
        grant_type: 'authorization_code',
        redirect_uri:
          process.env.NEXT_PUBLIC_APP_URL + '/api/calendar/callback',
        code_verifier: v.verifier,
      }),
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok)
      throw new HttpError('Google could not finish connecting.');
    const token = await response.json();
    await privatePut('connections', {
      user_id: user.id,
      provider: 'google',
      secret: encrypt({
        ...token,
        expiresAt: Date.now() + token.expires_in * 1000,
      }),
      metadata: {},
      updated_at: new Date().toISOString(),
    });
    return NextResponse.redirect(new URL('/?calendar=connected', r.url));
  } catch (e) {
    return fail(e);
  }
}
