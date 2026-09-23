'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { api } from '@/lib/client/api';
import { useCached } from '@/lib/client/cached';
import { Icon } from '@/components/icons';
import { Sheet, dateLabel } from '@/components/ui';
import { useApp } from '@/components/app/provider';
import { useViewProps } from '@/components/app/legacy';
import { Schedule } from '@/components/settings';
import { scheduled } from '@/lib/schedule';
import type { Plan, Session } from '@/lib/plan';
import { chapters, type ChapterName } from '@/lib/chapters';
import type { RunView } from '@/lib/learning/run';

type Concept = { key: string; title: string; track: string; strength: number; level: string; sessions: string[]; misconceptions: string[] };
type Status = 'done' | 'today' | 'planned' | 'missed' | 'skipped' | 'travel' | 'reduced';

type Week = Plan['weeks'][number] & { index: number; sessions: (Session & { status: string })[] };

export function Learn() {
  const { w, today, user } = useApp();
  const plan = w.state.plan;
  const [modal, setModal] = useState('');
  const props = useViewProps(setModal);
  const [open, setOpen] = useState<Session | null>(null);
  const { data } = useCached<{ concepts: Concept[] }>(plan ? '/api/mastery' : null, user.id);
  const { data: named } = useCached<{ names: ChapterName[] }>(plan ? '/api/chapters' : null, user.id);
  const done = useMemo(() => new Set(w.state.attempts.map((a) => a.session_id)), [w.state.attempts]);
  const weeks = useMemo<Week[]>(() => {
    if (!plan) return [];
    const sessions = plan.sessions.map((s) => scheduled(s, w.state));
    return plan.weeks.map((wk, i) => {
      const end = plan.weeks[i + 1]?.start_date || '9999-12-31';
      return {
        ...wk,
        index: i + 1,
        sessions: sessions
          .filter((s) => s.date >= wk.start_date && s.date < end)
          .sort((a, b) => a.date.localeCompare(b.date)),
      };
    });
  }, [plan, w.state]);
  const book = useMemo(() => {
    if (!plan) return [];
    const names = new Map((named?.names || []).map((n) => [n.id, n]));
    return chapters(plan).map((c) => ({ ...c, ...(names.get(c.id) || {}) }));
  }, [plan, named]);
  const status = (s: Session & { status: string }): Status =>
    done.has(s.id)
      ? 'done'
      : s.status === 'skipped' || s.status === 'travel'
        ? (s.status as Status)
        : s.date === today
          ? 'today'
          : s.date < today
            ? 'missed'
            : s.status === 'reduced'
              ? 'reduced'
              : 'planned';
  const current = weeks.findIndex((wk, i) => today >= wk.start_date && (i === weeks.length - 1 || today < weeks[i + 1].start_date));
  const before = !!plan && today < plan.weeks[0]?.start_date;
  // This week and next, or the first two before the plan starts.
  const now = before ? [0, 1] : current >= 0 ? [current, current + 1] : [];
  const shown = now.map((i) => weeks[i]).filter(Boolean);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const chapterOf = (weekId: string) => book.find((c) => c.weeks.includes(weekId));
  const jump = (wk: Week) => {
    if (shown.some((x) => x.id === wk.id)) return document.getElementById('week-' + wk.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    const ch = chapterOf(wk.id);
    if (!ch) return;
    setExpanded((e) => new Set(e).add(ch.id));
    setTimeout(() => document.getElementById('chapter-week-' + wk.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
  };
  const strengthFor = (s: Session) => {
    const cs = (data?.concepts || []).filter((c) => c.sessions.includes(s.id));
    return cs.length ? cs.reduce((a, c) => a + c.strength, 0) / cs.length : null;
  };

  if (!plan)
    return (
      <div className="page">
        <header className="page-head">
          <div>
            <p className="eyebrow">Learn</p>
            <h1 className="title">No plan yet.</h1>
          </div>
        </header>
        <Link className="btn primary" href="/import">
          Import a plan
        </Link>
      </div>
    );

  const totalDone = weeks.reduce((n, wk) => n + wk.sessions.filter((s) => done.has(s.id)).length, 0);
  const totalPlanned = weeks.reduce((n, wk) => n + wk.sessions.filter((s) => !s.optional).length, 0);
  const block = (wk: Week, label?: string, anchor = 'week-') => (
    <section key={wk.id} id={anchor + wk.id} className={'week-block' + (wk.index - 1 === current ? ' now' : '')}>
      <div className="week-title">
        <p className="heading">{label || `Week ${wk.index}`}</p>
        <p className="label">
          {label ? `Week ${wk.index} · ` : ''}
          {dateLabel(wk.start_date, false)}
          {wk.mode !== 'standard' ? ` · ${wk.mode}` : ''}
        </p>
      </div>
      <div className="rows">
        {wk.sessions.map((s) => {
          const st = status(s),
            strength = strengthFor(s);
          return (
            <button key={s.id} className={'row session-row s-' + st + ' t-' + s.subject} onClick={() => setOpen(s)}>
              <span className="session-day">
                <span>{new Date(s.date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short' })}</span>
                <b className="num">{Number(s.date.slice(8))}</b>
              </span>
              <i className={'dot' + (st === 'done' ? '' : ' hollow') + (st === 'today' ? ' lit' : '')} />
              <div className="grow">
                <p>{s.title}</p>
                <p className="sub">
                  {s.subject}
                  {s.optional ? ' · optional' : ''}
                  {st === 'today' ? ' · today' : st === 'missed' ? ' · not done' : st === 'reduced' ? ' · shortened' : ''}
                </p>
              </div>
              {strength !== null && strength > 0 && (
                <span className="meter mini" aria-label={`${Math.round(strength * 100)}% strength`}>
                  <i style={{ '--v': strength } as React.CSSProperties} />
                </span>
              )}
              {st === 'done' ? <Icon name="check" size={17} /> : <Icon name="chevron" size={17} />}
            </button>
          );
        })}
      </div>
      {wk.evidence && <p className="week-evidence serif">{wk.evidence}</p>}
    </section>
  );

  return (
    <div className="page learn">
      <header className="page-head">
        <div>
          <p className="eyebrow">Learn</p>
          <h1 className="title">{plan.title}</h1>
          <p className="label" style={{ marginTop: 6 }}>
            {dateLabel(plan.start_date, false)} → {dateLabel(plan.end_date, false)} · {totalDone} of {totalPlanned} sessions
          </p>
        </div>
        <div className="row-inline">
          <button className="btn quiet" onClick={() => setModal('schedule')}>
            Adjust schedule
          </button>
        </div>
      </header>

      <div className="field-map" role="img" aria-label={`${totalDone} of ${totalPlanned} sessions complete`}>
        {weeks.map((wk, i) => (
          <button key={wk.id} className={'fm-week' + (i === current ? ' now' : '')} onClick={() => jump(wk)} aria-label={`Week ${wk.index}`}>
            {wk.sessions
              .filter((s) => !s.optional || wk.sessions.every((x) => x.optional))
              .slice(0, 4)
              .map((s) => (
                <i key={s.id} className={'t-' + s.subject + ' s-' + status(s)} />
              ))}
          </button>
        ))}
      </div>

      {shown.length > 0 && (
        <div className="weeks">
          {shown.map((wk, j) => block(wk, before ? (j ? 'The week after' : 'Your first week') : j ? 'Next week' : 'This week'))}
        </div>
      )}

      <section className="chapters" aria-label="The whole plan, by chapter">
        <p className="eyebrow">The whole plan</p>
        {book.map((ch, n) => {
          const inside = weeks.filter((wk) => ch.weeks.includes(wk.id));
          const sessions = inside.flatMap((wk) => wk.sessions.filter((s) => !s.optional));
          const finished = sessions.filter((s) => done.has(s.id)).length;
          const isNow = ch.start <= today && today <= ch.end;
          const past = ch.end < today;
          const isOpen = expanded.has(ch.id);
          const tracks = [...new Set(sessions.map((s) => s.subject))];
          return (
            <div key={ch.id} className={'chapter' + (isNow ? ' now' : '') + (past ? ' past' : '') + (ch.interlude ? ' interlude' : '') + (isOpen ? ' open' : '')}>
              <button
                className="chapter-head"
                aria-expanded={isOpen}
                aria-controls={'chapter-' + ch.id}
                onClick={() =>
                  setExpanded((e) => {
                    const next = new Set(e);
                    if (next.has(ch.id)) next.delete(ch.id);
                    else next.add(ch.id);
                    return next;
                  })
                }
              >
                <ChapterRing done={finished} total={sessions.length} n={n + 1} />
                <div className="grow">
                  <p className="chapter-title">
                    {ch.title}
                    {isNow && <span className="pill-now">Now</span>}
                  </p>
                  {ch.outcome && <p className="chapter-outcome">{ch.outcome}</p>}
                  <p className="label">
                    {dateLabel(ch.start, false)} – {dateLabel(ch.end, false)} · {inside.length} week{inside.length === 1 ? '' : 's'}
                    {sessions.length ? ` · ${finished}/${sessions.length} sessions` : ''}
                    {ch.milestone ? ` · milestone: ${ch.milestone}` : ''}
                  </p>
                  {tracks.length > 0 && (
                    <span className="chapter-tracks" aria-hidden="true">
                      {tracks.map((t) => (
                        <i key={t} className={'dot t-' + t} />
                      ))}
                    </span>
                  )}
                </div>
                <Icon name="down" size={18} />
              </button>
              {isOpen && (
                <div className="chapter-body weeks" id={'chapter-' + ch.id}>
                  {inside.map((wk) => block(wk, undefined, 'chapter-week-'))}
                </div>
              )}
            </div>
          );
        })}
      </section>

      {open && <SessionSheet session={open} concepts={(data?.concepts || []).filter((c) => c.sessions.includes(open.id))} done={done.has(open.id)} onClose={() => setOpen(null)} onAdjust={() => { setOpen(null); setModal('schedule'); }} />}
      {(modal === 'schedule' || modal === 'short') && <Schedule {...props} mode={modal} close={() => setModal('')} />}
    </div>
  );
}

// How much of a chapter is done, as a small ring around its number.
function ChapterRing({ done, total, n }: { done: number; total: number; n: number }) {
  const r = 17,
    c = 2 * Math.PI * r,
    p = total ? done / total : 0;
  return (
    <span className={'chapter-ring' + (total && done === total ? ' complete' : '')} aria-label={`${done} of ${total} sessions done`}>
      <svg viewBox="0 0 42 42" aria-hidden="true">
        <circle cx="21" cy="21" r={r} className="ring-bg" />
        <circle cx="21" cy="21" r={r} className="ring-fg" strokeDasharray={c} strokeDashoffset={c * (1 - p)} />
      </svg>
      {total && done === total ? <Icon name="check" size={16} strokeWidth={2.2} /> : <b className="num">{n}</b>}
    </span>
  );
}

function SessionSheet({
  session,
  concepts,
  done,
  onClose,
  onAdjust,
}: {
  session: Session;
  concepts: Concept[];
  done: boolean;
  onClose: () => void;
  onAdjust: () => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  async function start(kind: 'session' | 'review') {
    setBusy(true);
    setError('');
    try {
      const { run } = await api<{ run: RunView }>('/api/runs', {
        kind,
        sessionId: kind === 'session' ? session.id : undefined,
        concepts: kind === 'review' ? concepts.map((c) => c.key) : undefined,
      });
      router.push('/session/' + run.id);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }
  return (
    <Sheet title={session.title} subtitle={`${dateLabel(session.date)} · ${session.subject} · ${session.duration_minutes} min`} onClose={onClose}>
      <p className="serif" style={{ fontSize: 18, lineHeight: 1.5 }}>
        {session.objective}
      </p>
      {session.evidence && (
        <div className="field">
          <span>Evidence this week</span>
          <p>{session.evidence}</p>
        </div>
      )}
      {concepts.length > 0 && (
        <div className="rows">
          {concepts.map((c) => (
            <div className={'row t-' + c.track} key={c.key}>
              <div className="grow">
                <p>{c.title}</p>
                <p className="sub">
                  {c.level}
                  {c.misconceptions.length ? ` · watch: ${c.misconceptions[0]}` : ''}
                </p>
              </div>
              <span className="meter mini">
                <i style={{ '--v': c.strength } as React.CSSProperties} />
              </span>
            </div>
          ))}
        </div>
      )}
      {error && <p className="conversation-error">{error}</p>}
      <div className="row-inline" style={{ flexWrap: 'wrap' }}>
        {done ? (
          concepts.length > 0 && (
            <button className="btn primary" onClick={() => void start('review')} data-busy={busy || undefined}>
              Review these ideas
            </button>
          )
        ) : (
          <button className="btn primary" onClick={() => void start('session')} data-busy={busy || undefined}>
            Start this session
          </button>
        )}
        {!done && (
          <button className="btn quiet" onClick={onAdjust}>
            Move or shorten
          </button>
        )}
      </div>
    </Sheet>
  );
}
