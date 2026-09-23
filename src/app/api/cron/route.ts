import { NextResponse, after } from 'next/server';
import { tick } from '@/lib/server/cron';
import { prepareSessions } from '@/lib/server/prepare';
import { buildInsight, dueWeeklyInsight } from '@/lib/server/insights';
import { draftWeek, dueWeekDraft } from '@/lib/server/horizon';

// Weekly insights run in the background of the tick and can take minutes.
export const maxDuration = 800;

// Vercel Cron calls this with the project's CRON_SECRET as a bearer token.
export async function GET(r: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || r.headers.get('authorization') !== `Bearer ${secret}`)
    return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  const [base, prepared, insight, drafting] = await Promise.all([
    tick(),
    prepareSessions().catch((e) => (console.error('prepare', e), 'failed')),
    dueWeeklyInsight().catch((e) => (console.error('insights', e), null)),
    dueWeekDraft().catch((e) => (console.error('week drafts', e), null)),
  ]);
  if (insight) after(() => buildInsight(insight.userId, insight.id, insight.week, true));
  // Sunday from noon: next week's draft, with a notification when it's ready.
  if (drafting) after(() => draftWeek(drafting, { notify: true }).then(() => undefined).catch((e) => console.error('week draft', e)));
  return NextResponse.json({ ...base, prepared, insight: insight ? insight.week.start : null, drafted: !!drafting });
}
