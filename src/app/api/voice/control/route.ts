import { NextResponse } from 'next/server';
import { z } from 'zod';
import { context, body, fail, HttpError } from '@/lib/server/http';
import { privateRows, privatePut } from '@/lib/server/state';
export async function POST(r: Request) {
  try {
    const { user } = await context(r),
      v = z
        .object({
          id: z.string().max(200),
          action: z.enum(['heartbeat', 'close']),
        })
        .parse(await body(r));
    const rows = await privateRows<Record<string, unknown>>(
        'voice_sessions',
        user.id,
      ),
      row = rows.find((s) => s.id === v.id);
    if (!row) throw new HttpError('Conversation not found.', 404);
    await privatePut('voice_sessions', {
      ...row,
      client_seen_at: new Date().toISOString(),
      status:
        v.action === 'close' && row.status === 'active'
          ? 'closing'
          : row.status,
    });
    return NextResponse.json({
      status: row.status,
      finalized: row.final_usage_confirmed,
      seconds: row.usage_seconds,
    });
  } catch (e) {
    return fail(e);
  }
}
