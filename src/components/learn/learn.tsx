'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '@/lib/client/api';
import { useCached } from '@/lib/client/cached';
import { Icon } from '@/components/icons';
import { Sheet, dateLabel } from '@/components/ui';
import { useApp } from '@/components/app/provider';
import { useViewProps } from '@/components/app/legacy';
import { Schedule } from '@/components/settings';
import { scheduled } from '@/lib/schedule';
import type { Session } from '@/lib/plan';
import type { RunView } from '@/lib/learning/run';

type Concept = { key: string; title: string; track: string; strength: number; level: string; sessions: string[]; misconceptions: string[] };
type Status = 'done' | 'today' | 'planned' | 'missed' | 'skipped' | 'travel' | 'reduced';

export function Learn() {
  const { w, today, user } = useApp();
  const plan = w.state.plan;
  const [modal, setModal] = useState('');
  const props = useViewProps(setModal);
  const [open, setOpen] = useState<Session | null>(null);
  const { data } = useCached<{ concepts: Concept[] }>(plan ? '/api/mastery' : null, user.id);
  const done = useMemo(() => new Set(w.state.attempts.map((a) => a.session_id)), [w.state.attempts]);
  const weeks = useMemo(() => {
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
  const refs = useRef<Record<number, HTMLElement | null>>({});
  const scrolled = useRef(false);
  useEffect(() => {
    if (scrolled.current || current < 1) return;
    scrolled.current = true;
    refs.current[current]?.scrollIntoView({ block: 'start' });
  }, [current]);
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
          <button
            key={wk.id}
            className={'fm-week' + (i === current ? ' now' : '')}
            onClick={() => refs.current[i]?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
            aria-label={`Week ${wk.index}`}
          >
            {wk.sessions
              .filter((s) => !s.optional || wk.sessions.every((x) => x.optional))
              .slice(0, 4)
              .map((s) => (
                <i key={s.id} className={'t-' + s.subject + ' s-' + status(s)} />
              ))}
          </button>
        ))}
      </div>

      <div className="weeks">
        {weeks.map((wk, i) => (
          <section key={wk.id} className={'week-block' + (i === current ? ' now' : '')} ref={(el) => void (refs.current[i] = el)}>
            <div className="week-title">
              <p className="heading">Week {wk.index}</p>
              <p className="label">
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
        ))}
      </div>

      {open && <SessionSheet session={open} concepts={(data?.concepts || []).filter((c) => c.sessions.includes(open.id))} done={done.has(open.id)} onClose={() => setOpen(null)} onAdjust={() => { setOpen(null); setModal('schedule'); }} />}
      {(modal === 'schedule' || modal === 'short') && <Schedule {...props} mode={modal} close={() => setModal('')} />}
    </div>
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
