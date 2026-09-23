import { NextResponse } from 'next/server';
import { tick } from '@/lib/server/cron';

export const maxDuration = 120;

// Vercel Cron calls this with the project's CRON_SECRET as a bearer token.
export async function GET(r: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || r.headers.get('authorization') !== `Bearer ${secret}`)
    return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  return NextResponse.json(await tick());
}
