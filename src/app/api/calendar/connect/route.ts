import { NextResponse } from 'next/server';
import { randomBytes, createHash } from 'node:crypto';
import { cookies } from 'next/headers';
import { context, fail, HttpError } from '@/lib/server/http';
import { calendarConfigured, encrypt } from '@/lib/server/calendar';
export async function POST(r: Request) {
  try {
    const { user } = await context(r);
    if (!calendarConfigured())
      throw new HttpError(
        'Google Calendar is awaiting OAuth credentials.',
        503,
      );
    const state = randomBytes(24).toString('base64url'),
      verifier = randomBytes(32).toString('base64url'),
      jar = await cookies();
    jar.set('fieldwork-google', encrypt({ state, verifier, userId: user.id }), {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/api/calendar',
      maxAge: 600,
    });
    const params = new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      redirect_uri: process.env.NEXT_PUBLIC_APP_URL + '/api/calendar/callback',
      response_type: 'code',
      scope: 'https://www.googleapis.com/auth/calendar.freebusy',
      access_type: 'offline',
      prompt: 'consent',
      state,
      code_challenge: createHash('sha256').update(verifier).digest('base64url'),
      code_challenge_method: 'S256',
    });
    return NextResponse.json({
      url: 'https://accounts.google.com/o/oauth2/v2/auth?' + params,
    });
  } catch (e) {
    return fail(e);
  }
}
