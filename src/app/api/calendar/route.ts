import { NextResponse } from 'next/server';
import { context, fail, HttpError } from '@/lib/server/http';
import { connection, googleAccess, decrypt } from '@/lib/server/calendar';
import { privatePut, privateDelete, readState } from '@/lib/server/state';
export async function GET(r: Request) {
  try {
    const { user } = await context(r),
      c = await connection(user.id);
    return NextResponse.json({
      connected: !!c,
      lastSync: c?.metadata.lastSync,
      busy: c?.metadata.busy || [],
    });
  } catch (e) {
    return fail(e);
  }
}
export async function POST(r: Request) {
  try {
    const { user } = await context(r),
      { token, connection: c } = await googleAccess(user.id),
      state = await readState(user.id);
    const now = new Date(),
      until = new Date(now.getTime() + 28 * 864e5);
    const response = await fetch(
      'https://www.googleapis.com/calendar/v3/freeBusy',
      {
        method: 'POST',
        headers: {
          Authorization: 'Bearer ' + token,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          timeMin: now.toISOString(),
          timeMax: until.toISOString(),
          timeZone: state.plan?.schedule.timezone || 'America/Los_Angeles',
          items: [{ id: 'primary' }],
        }),
        signal: AbortSignal.timeout(12000),
      },
    );
    if (!response.ok)
      throw new HttpError(
        'Calendar sync failed. Your previous busy times may be stale.',
      );
    const value = await response.json(),
      calendar = value.calendars?.primary;
    if (calendar?.errors?.length || !Array.isArray(calendar?.busy))
      throw new HttpError('Google did not return valid busy times.');
    const busy = [
        ...new Map(
          calendar.busy.map((b: { start: string; end: string }) => [
            b.start + '|' + b.end,
            { start: b.start, end: b.end },
          ]),
        ).values(),
      ],
      lastSync = now.toISOString();
    await privatePut('connections', {
      ...c,
      metadata: { busy, lastSync },
      updated_at: lastSync,
    });
    return NextResponse.json({ connected: true, busy, lastSync });
  } catch (e) {
    return fail(e);
  }
}
export async function DELETE(r: Request) {
  try {
    const { user } = await context(r),
      c = await connection(user.id);
    if (c) {
      const t = decrypt(c.secret);
      await fetch('https://oauth2.googleapis.com/revoke', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ token: t.refresh_token || t.access_token }),
        signal: AbortSignal.timeout(10000),
      }).catch(() => {});
      await privateDelete('connections', user.id, 'google');
    }
    return NextResponse.json({ disconnected: true });
  } catch (e) {
    return fail(e);
  }
}
