'use client';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState, startTransition, ViewTransition } from 'react';
import { api } from '@/lib/client/api';
import { useCached } from '@/lib/client/cached';
import { Icon } from '@/components/icons';
import { useApp } from '@/components/app/provider';
import { greetingFor, type Action, type TodayView } from '@/lib/learning/today';
import type { RunView } from '@/lib/learning/run';
import { primeRun } from '@/components/session/use-run';
import type { Progress } from '@/lib/gamify';
import { ProgressStrip, useProgress } from '@/components/progress/progress';
import { Aperture } from '@/components/tutor/aperture';
import { TutorChat } from '@/components/tutor/chat';
import type { Brief } from '@/lib/tutor';

type Recap = { minutes: number; sessions: number; answers: number; ideas: string[]; more: number };
type Payload = {
  today: TodayView;
  date: string;
  preview: { type: string; minutes: number; optional?: boolean }[];
  insight: { id: string; headline: string } | null;
  exploring?: { id: string; title: string } | null;
  recap?: Recap | null;
  memories?: { fresh: number };
};

const weekday = (d: string) => new Date(d + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long' });

type AgendaItem = { label: string; kind: string; minutes: number | null; track: string | null; action?: Action };

// What the day holds, in order: the session, then anything else worth doing.
function agendaOf(t: TodayView): AgendaItem[] {
  const out: AgendaItem[] = [];
  const p = t.primary;
  if (p && p.kind !== 'explore' && p.kind !== 'practice')
    out.push({
      label: p.kind === 'review' ? p.label : t.focus?.title || t.headline,
      kind: p.kind,
      minutes: p.minutes ?? t.focus?.minutes ?? null,
      track: p.track || t.focus?.subject || null,
      action: p,
    });
  for (const s of t.secondary) {
    if (out.length >= 4) break;
    if (s.kind === 'review' && p?.kind !== 'review') out.push({ label: s.label, kind: 'review', minutes: s.minutes ?? null, track: 'review', action: s });
    if (s.kind === 'rehearsal') out.push({ label: s.label, kind: 'rehearsal', minutes: 30, track: 'judgment', action: s });
    if (s.kind === 'practice') out.push({ label: 'Practise it out loud', kind: 'practice', minutes: null, track: 'communication', action: s });
  }
  return out;
}

// The morning brief: written once a day from what the learner actually did,
// kept by the browser for the day so Today never waits on it twice.
function useBrief(owner: string, date: string | undefined, agenda: AgendaItem[], enabled: boolean) {
  const [brief, setBrief] = useState<Brief | null>(null);
  const [failed, setFailed] = useState(false);
  const items = agenda.map(({ label, kind, minutes, track }) => ({ label, kind, minutes, track }));
  const sig = JSON.stringify(items);
  useEffect(() => {
    setBrief(null);
    setFailed(false);
    if (!date || !enabled) return;
    const key = `fw:${owner}:brief:${date}:${sig.length}:${sig.slice(0, 80)}`;
    try {
      const cached = localStorage.getItem(key);
      if (cached) return setBrief(JSON.parse(cached) as Brief);
    } catch {}
    let alive = true;
    void api<{ brief: Brief }>('/api/today/brief', { date, agenda: JSON.parse(sig) })
      .then(({ brief }) => {
        if (!alive) return;
        setBrief(brief);
        try {
          localStorage.setItem(key, JSON.stringify(brief));
        } catch {}
      })
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [owner, date, sig, enabled]);
  return { brief, loading: enabled && !brief && !failed };
}

export function Today() {
  const { user, w, toast } = useApp();
  const { data, error, refresh } = useCached<Payload>('/api/today', user.id);
  const { data: progress } = useProgress();
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null),
    [startError, setStartError] = useState('');
  const t = data?.today;
  const agenda = t ? agendaOf(t) : [];
  const briefing = useBrief(user.id, data?.date, agenda, !!t && t.phase !== 'no-plan' && t.phase !== 'done-today');

  // New memories from recent sessions: said once, quietly, with a way to look.
  const fresh = data?.memories?.fresh || 0;
  const seenAt = String(w.state.records.find((r) => r.id === 'settings:memory')?.data.seen_at || 'never');
  useEffect(() => {
    if (!fresh) return;
    const key = `fw:${user.id}:memtoast:${seenAt}:${fresh}`;
    try {
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, '1');
    } catch {}
    toast(`Fieldwork noticed ${fresh === 1 ? 'something new' : `${fresh} new things`} about you.`, {
      label: 'Review',
      run: () => router.push('/you?memory=new'),
    });
  }, [fresh, seenAt, user.id, toast, router]);

  async function run(a: Action, extra?: { topic?: string }) {
    if (a.kind === 'practice') return router.push('/practice');
    if (a.kind === 'resume' && a.runId) return router.push('/session/' + a.runId);
    setBusy(a.kind === 'explore' ? 'explore' : a.label);
    setStartError('');
    try {
      const { run } = await api<{ run: RunView }>('/api/runs', {
        kind:
          a.kind === 'return' || a.kind === 'review' || a.kind === 'explore' || a.kind === 'rehearsal' ? a.kind : 'session',
        sessionId: a.sessionId,
        milestone: a.milestone,
        minutes: a.minutes,
        topic: extra?.topic,
      });
      primeRun(run);
      startTransition(() => router.push('/session/' + run.id));
    } catch (e) {
      setStartError((e as Error).message);
      setBusy(null);
      void refresh();
    }
  }
  const explore = (topic: string) => void run({ kind: 'explore', label: 'Explore', detail: '' }, { topic });

  // The tutor can send the learner here to begin today's session.
  const params = useSearchParams();
  const begin = params.get('begin') === '1';
  const primary = t?.primary;
  useEffect(() => {
    if (!begin || !primary || busy) return;
    router.replace('/');
    void run(primary);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [begin, primary]);

  if (!t)
    return (
      <div className="page today">
        {error ? (
          <div className="today-error">
            <p className="heading">Today couldn’t load.</p>
            <p className="muted">{error}</p>
            <button className="btn" onClick={() => void refresh()}>
              Try again
            </button>
          </div>
        ) : (
          <TodaySkeleton />
        )}
      </div>
    );

  const d = data!;
  const dateLabel = new Date((d.date || '') + 'T12:00:00').toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
  const track = t.primary?.track || t.focus?.subject || 'general';
  const name = w.state.plan?.profile.name || '';
  const resume = t.secondary.find((s) => s.kind === 'resume');
  const tiles = t.secondary.filter((s) => s.kind === 'review' || s.kind === 'rehearsal' || s.kind === 'practice');
  const recapped = t.phase === 'done-today' && d.recap;

  const shape = t.next;
  const more = (d.insight || resume || d.exploring || shape || tiles.length > 0) && (
    <section className="more" aria-label="More">
      {(d.insight || resume || d.exploring || shape) && (
        <div className="rows">
          {shape && (
            <Link href="/learn#next" className="row">
              <span className="row-glyph">
                <Icon name="calendar" size={18} />
              </span>
              <div className="grow">
                <p>{shape.ready ? 'Next week is ready to shape' : 'Shape next week'}</p>
                <p className="sub">
                  {shape.ready ? shape.note || `${shape.sessions} sessions drafted. Change anything until Monday.` : 'Drafted Sunday at noon, or now if you like.'}
                </p>
              </div>
              {shape.ready && <span className="new-dot" aria-label="New" />}
              <Icon name="chevron" size={18} />
            </Link>
          )}
          {d.insight && (
            <Link href="/insights" className="row insight-row">
              <span className="row-glyph insight-glyph">
                <Icon name="insights" size={18} />
              </span>
              <div className="grow">
                <p>Your week, read honestly</p>
                <p className="sub">{d.insight.headline}</p>
              </div>
              <span className="new-dot" aria-label="New" />
              <Icon name="chevron" size={18} />
            </Link>
          )}
          {resume && (
            <button className="row" onClick={() => void run(resume)} disabled={!!busy}>
              <span className="row-glyph">
                <Icon name="play" size={16} />
              </span>
              <div className="grow">
                <p>{resume.label}</p>
                <p className="sub">{resume.detail}</p>
              </div>
              <Icon name="chevron" size={18} />
            </button>
          )}
          {d.exploring && (
            <Link href={'/session/' + d.exploring.id} className="row">
              <span className="row-glyph">
                <Icon name="spark" size={18} />
              </span>
              <div className="grow">
                <p>Pick up your exploration</p>
                <p className="sub">{d.exploring.title}</p>
              </div>
              <Icon name="chevron" size={18} />
            </Link>
          )}
        </div>
      )}
      {tiles.length > 0 && (
        <div className="tiles">
          {tiles.map((s) => (
            <button key={s.label} className="tile" onClick={() => void run(s)} disabled={!!busy} data-busy={busy === s.label || undefined}>
              <span className={'row-glyph' + (s.kind === 'review' ? ' t-review' : '')}>
                <Icon name={s.kind === 'practice' ? 'practice' : s.kind === 'review' ? 'refresh' : 'target'} size={18} />
              </span>
              <span className="tile-label">{s.kind === 'practice' ? 'Practise out loud' : s.label}</span>
              <span className="tile-sub">{s.kind === 'practice' ? 'Debate, pitch, hard talks' : s.kind === 'review' ? `About ${s.minutes || 5} min` : '30-minute mock'}</span>
            </button>
          ))}
        </div>
      )}
    </section>
  );

  return (
    <div className={'page today t-' + track}>
      <header className="today-top">
        <div className="today-hello">
          <p className="eyebrow num">
            {dateLabel}
            {t.week && t.phase !== 'before-start' ? ` · Week ${t.week.index}${t.week.total ? ` of ${t.week.total}` : ''}` : ''}
          </p>
          <h1 className="display" id="today-headline">
            {greetingFor(new Date().getHours(), name)}
          </h1>
        </div>
        <Link href="/you" className="page-you" aria-label="You and settings">
          {(name || 'You').slice(0, 1).toUpperCase()}
        </Link>
      </header>

      {t.phase === 'no-plan' ? (
        <div className="today-main">
          <section className="session-card stagger">
            <h2 className="brief-title">{t.headline}</h2>
            <p className="hero-why">{t.why}</p>
            <div className="hero-actions">
              <Link href="/import" className="btn primary large">
                Import a plan <Icon name="arrow" size={18} />
              </Link>
            </div>
          </section>
          <LearnAnything busy={busy === 'explore'} disabled={!!busy} onGo={explore} />
          {more}
        </div>
      ) : (
        <div className="today-grid">
          <div className="today-main">
            {recapped ? (
              <RecapCard t={t} recap={d.recap!} progress={progress} busy={busy} onRun={(a) => void run(a)} />
            ) : (
              <BriefCard
                t={t}
                agenda={agenda}
                brief={briefing.brief}
                loading={briefing.loading}
                number={dayNumber(w.state.plan?.weeks[0]?.start_date, d.date)}
                busy={busy}
                startError={startError}
                onRun={(a) => void run(a)}
              />
            )}
            <LearnAnything busy={busy === 'explore'} disabled={!!busy} onGo={explore} />
            {more}
          </div>

          <aside className="today-side stagger">
            <div className="today-tutor">
              <TutorChat variant="embedded" page="/" />
            </div>
            {progress && (t.phase !== 'before-start' || progress.xp > 0) && <ProgressStrip progress={progress} />}
            {t.startsIn !== null && (
              <div className="stat big">
                <b className="num">{t.startsIn}</b>
                <span>{t.startsIn === 1 ? 'day until it starts' : 'days until it starts'}</span>
              </div>
            )}
            {t.week && <Week t={t} />}
          </aside>
        </div>
      )}

    </div>
  );
}

// Days since the plan began, counting today as one: the brief's number.
function dayNumber(start: string | undefined, date: string) {
  if (!start || !date) return null;
  const n = Math.round((Date.parse(date + 'T12:00:00') - Date.parse(start + 'T12:00:00')) / 86400000) + 1;
  return n > 0 ? n : null;
}

// The morning brief: what today is for, the day's agenda with the tutor's
// margin notes, and one way in.
function BriefCard({
  t,
  agenda,
  brief,
  loading,
  number,
  busy,
  startError,
  onRun,
}: {
  t: TodayView;
  agenda: AgendaItem[];
  brief: Brief | null;
  loading: boolean;
  number: number | null;
  busy: string | null;
  startError: string;
  onRun: (a: Action) => void;
}) {
  const total = agenda.filter((a) => a.kind !== 'practice').reduce((n, a) => n + (a.minutes || 0), 0);
  const ends = total ? new Date(Date.now() + total * 60000).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : null;
  return (
    <section className={'session-card brief stagger' + (loading ? ' is-loading' : '')} aria-labelledby="brief-title" aria-busy={loading || undefined}>
      <p className="brief-stamp">
        <Aperture size={20} busy={loading} />
        <span className="eyebrow num">
          {number ? `No. ${String(number).padStart(3, '0')} · ` : ''}
          {loading ? 'Developing…' : brief ? 'Prepared for you' : t.phase === 'rest-day' ? 'A rest day' : 'Today'}
        </span>
      </p>
      <h2 className="brief-title" id="brief-title">
        {brief?.title || (t.phase === 'rest-day' ? 'Nothing due today. Rest counts' : 'Here’s what we’re working on today')}
      </h2>
      <p className="brief-note" key={brief ? 'brief' : 'why'}>
        {brief?.note || t.why}
      </p>
      {agenda.length > 0 && (
        <ol className="agenda">
          {agenda.map((a, i) => {
            const note = brief?.item_notes[i] || null;
            const label =
              i === 0 && a.action ? (
                // Carries into the session's title bar when it begins.
                <ViewTransition name="session-title" share="session-title">
                  <span className="agenda-label">{a.label}</span>
                </ViewTransition>
              ) : (
                <span className="agenda-label">{a.label}</span>
              );
            return (
              <li key={a.label + i} className={a.track ? 't-' + a.track : ''}>
                <span className="agenda-n num">{String(i + 1).padStart(2, '0')}</span>
                <i className="dot lit" aria-hidden="true" />
                <span className="agenda-text">
                  {i > 0 && a.action ? (
                    <button className="agenda-go" onClick={() => onRun(a.action!)} disabled={!!busy}>
                      {label}
                    </button>
                  ) : (
                    label
                  )}
                  {note && <em className="agenda-note">{note}</em>}
                </span>
                <span className="agenda-min num">{a.minutes ? `${Math.max(1, Math.round(a.minutes))} min` : ''}</span>
              </li>
            );
          })}
        </ol>
      )}
      {t.primary && (
        <div className="hero-actions">
          <button className="btn primary large begin" onClick={() => onRun(t.primary!)} data-busy={busy === t.primary.label || undefined} disabled={!!busy}>
            {t.primary.label}
            {busy !== t.primary.label && <Icon name="arrow" size={19} />}
          </button>
          {t.secondary
            .filter((s) => s.kind === 'session')
            .map((s) =>
              s.label === 'Only 20 minutes' ? (
                <button key={s.label} className="btn ghost short" onClick={() => onRun(s)} disabled={!!busy} data-busy={busy === s.label || undefined}>
                  Short on time? <b>20 min</b>
                </button>
              ) : (
                <button key={s.label} className="btn quiet large" onClick={() => onRun(s)} disabled={!!busy}>
                  {s.label}
                </button>
              ),
            )}
          {ends && <span className="label num brief-ends">Ends around {ends} · adapts as you go</span>}
        </div>
      )}
      {startError && <p className="today-error-line">{startError}</p>}
      {t.focus?.evidence && t.phase === 'learning-day' && (
        <p className="card-note">
          <span className="eyebrow">This week you’ll produce</span>
          <span>{t.focus.evidence}</span>
        </p>
      )}
    </section>
  );
}

// Curiosity, answered on the spot: a one-off outside the plan.
function LearnAnything({ busy, disabled, onGo }: { busy: boolean; disabled: boolean; onGo: (topic: string) => void }) {
  const [topic, setTopic] = useState('');
  const ok = topic.trim().length > 2;
  return (
    <form
      className="learn-anything"
      onSubmit={(e) => {
        e.preventDefault();
        if (ok) onGo(topic.trim());
      }}
    >
      <label htmlFor="learn-anything">
        <span className="eyebrow">Learn anything</span>
        <span className="label">A one-off, outside your plan. It still remembers what it learns about you.</span>
      </label>
      <div className="learn-field">
        <Icon name="spark" size={18} />
        <input
          id="learn-anything"
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          placeholder="Why do planes fly? How do index funds work?"
          enterKeyHint="go"
          maxLength={200}
          autoComplete="off"
        />
        <button className="btn primary icon small" disabled={!ok || disabled} data-busy={busy || undefined} aria-label="Start exploring">
          {!busy && <Icon name="arrow" size={17} />}
        </button>
      </div>
    </form>
  );
}

function Week({ t }: { t: TodayView }) {
  const week = t.week!;
  // What comes after today. The end-of-day card already says it, so the
  // week stays quiet then.
  const after = week.days.find((x) => x.status === 'planned' || x.status === 'reduced');
  // Other sessions still open this week, besides the one on the card.
  const alsoOpen = week.days.filter((x) => x.status === 'open' && x.title !== t.focus?.title);
  const note =
    t.phase === 'done-today'
      ? null
      : alsoOpen.length
        ? `Also open: ${alsoOpen.map((x) => x.weekday).join(', ')} · ${alsoOpen[0].title}`
        : after
          ? `Next: ${after.weekday} · ${after.title}`
          : t.phase === 'learning-day'
            ? 'The last session this week.'
            : 'Rest days count too.';
  return (
    <div className="week">
      <div className="week-head">
        <p className="eyebrow">This week</p>
        <p className="label num">
          {week.done}/{week.planned} done
        </p>
      </div>
      <div className="week-days">
        {week.days.map((x) => (
          <div key={x.date} className={'day s-' + x.status + (x.track ? ' t-' + x.track : '')} title={x.title}>
            <span className="day-mark" aria-hidden="true" />
            <span className="day-name">{x.weekday.slice(0, 1)}</span>
          </div>
        ))}
      </div>
      {note && <p className="label week-note">{note}</p>}
      {t.milestone && (
        <p className="label week-milestone">
          <Icon name="target" size={14} /> <b className="num">{t.milestone.days}</b> days to {t.milestone.title.split(':')[0]}
        </p>
      )}
    </div>
  );
}

// The end of a learning day: what it added up to, and what comes next.
function RecapCard({
  t,
  recap,
  progress,
  busy,
  onRun,
}: {
  t: TodayView;
  recap: Recap;
  progress: Progress | null;
  busy: string | null;
  onRun: (a: Action) => void;
}) {
  const { w } = useApp();
  // With today's session done, the focus is the next one in the plan.
  const next = t.focus;
  return (
    <section className="session-card recap stagger" aria-labelledby="today-headline">
      <p className="brief-stamp">
        <Aperture size={20} />
        <span className="eyebrow">Wrapped for today</span>
      </p>
      <h2 className="brief-title">Today’s done.</h2>
      <div className="recap-stats">
        <div className="stat">
          <b className="num">{recap.minutes}</b>
          <span>minutes</span>
        </div>
        <div className="stat">
          <b className="num">{recap.answers}</b>
          <span>{recap.answers === 1 ? 'answer' : 'answers'}</span>
        </div>
        {!!progress?.todayXp && (
          <div className="stat xp">
            <b className="num">+{progress.todayXp}</b>
            <span>XP</span>
          </div>
        )}
      </div>
      {recap.ideas.length > 0 && (
        <div className="recap-ideas">
          <p className="eyebrow">Ideas you worked on</p>
          <ul>
            {recap.ideas.map((idea) => (
              <li key={idea}>{idea}</li>
            ))}
            {recap.more > 0 && <li className="faint">and {recap.more} more</li>}
          </ul>
        </div>
      )}
      {next && (
        <p className="card-note">
          <span className="eyebrow">Next up · {weekday(next.date)}</span>
          <span>{next.title}</span>
        </p>
      )}
      {t.primary && (
        <div className="hero-actions">
          <button className="btn quiet large" onClick={() => onRun(t.primary!)} disabled={!!busy} data-busy={busy === t.primary.label || undefined}>
            {t.primary.label}
          </button>
          <p className="label recap-optional">Anything more is optional.</p>
        </div>
      )}
    </section>
  );
}

function TodaySkeleton() {
  return (
    <div className="today-grid" aria-busy="true">
      <section className="session-card">
        <div className="skeleton line" style={{ width: 120 }} />
        <div className="skeleton" style={{ height: 52, width: '70%', marginTop: 16 }} />
        <div className="skeleton line" style={{ width: '45%', marginTop: 18 }} />
        <div className="skeleton" style={{ height: 54, width: 160, marginTop: 28, borderRadius: 16 }} />
      </section>
    </div>
  );
}
