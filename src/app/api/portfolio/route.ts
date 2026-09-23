import { NextResponse } from 'next/server';
import { context, fail } from '@/lib/server/http';
import { readState } from '@/lib/server/state';
import { adminClient } from '@/lib/supabase/server';
import { dateInZone } from '@/lib/plan';
import type { Beat, Block } from '@/lib/learning/run';
import { zoneOf } from '@/lib/zone';

type Piece = { run: string; title: string; date: string; brief: string; text: string; verdict: string | null; feedback: string };

const plain = (blocks: Block[] = []) =>
  blocks
    .map((b) => (b.type === 'visual' ? '' : b.md))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();

// Work produced in sessions and rehearsals, grouped under the milestone it
// builds toward. ?format=md downloads it as a Markdown document.
export async function GET(r: Request) {
  try {
    const { user } = await context(r);
    const state = await readState(user.id),
      plan = state.plan,
      zone = zoneOf(state);
    const { data } = await adminClient()
      .from('runs')
      .select('id,kind,title,beats,started_at,ended_at')
      .eq('user_id', user.id)
      .eq('status', 'done')
      .neq('kind', 'practice')
      .order('started_at')
      .limit(400);
    const pieces: Piece[] = (data || []).flatMap((r) =>
      (r.beats as Beat[])
        .filter((b) => b.type === 'produce' && b.response?.text)
        .map((b) => ({
          run: r.id,
          title: r.title,
          date: dateInZone(zone, new Date(r.ended_at || r.started_at)),
          // The brief is the question itself: the last text block of the step.
          brief: plain((b.blocks || []).filter((x) => x.type === 'text').slice(-1)),
          text: b.response!.text!,
          verdict: b.feedback?.verdict || null,
          feedback: plain(b.feedback?.blocks),
        })),
    );
    const milestones = [...(plan?.milestones || [])].sort((a, b) => a.date.localeCompare(b.date));
    const groups = milestones.map((m, i) => ({
      title: m.title,
      date: m.date,
      items: pieces.filter((p) => p.date <= m.date && (i === 0 || p.date > milestones[i - 1].date)),
    }));
    const after = pieces.filter((p) => !milestones.length || p.date > milestones.at(-1)!.date);
    if (after.length || !milestones.length) groups.push({ title: milestones.length ? 'Beyond the milestones' : 'Your work', date: '', items: after });

    if (new URL(r.url).searchParams.get('format') !== 'md') return NextResponse.json({ groups, count: pieces.length });

    const name = plan?.profile.name || 'Learner';
    const md = [
      `# ${plan?.title || 'Portfolio'}`,
      `${name} · exported ${dateInZone(zone)} · ${pieces.length} piece${pieces.length === 1 ? '' : 's'} of work`,
      ...groups
        .filter((g) => g.items.length)
        .flatMap((g) => [
          `\n## ${g.title}${g.date ? ` (${g.date})` : ''}`,
          ...g.items.flatMap((p) => [
            `\n### ${p.title} · ${p.date}`,
            p.brief ? `> ${p.brief}` : '',
            `\n${p.text}`,
            p.feedback ? `\n*Feedback${p.verdict ? ` (${p.verdict})` : ''}:* ${p.feedback}` : '',
          ]),
        ]),
    ]
      .filter((l) => l !== '')
      .join('\n');
    return new NextResponse(md + '\n', {
      headers: {
        'Content-Type': 'text/markdown; charset=utf-8',
        'Content-Disposition': `attachment; filename="fieldwork-portfolio-${dateInZone(zone)}.md"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (e) {
    return fail(e);
  }
}
