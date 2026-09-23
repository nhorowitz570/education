'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState, startTransition } from 'react';
import { api } from '@/lib/client/api';
import { useCached } from '@/lib/client/cached';
import { Icon } from '@/components/icons';
import { useApp } from '@/components/app/provider';
import type { Action, TodayView } from '@/lib/learning/today';
import type { RunView } from '@/lib/learning/run';
import type { Progress } from '@/lib/gamify';
import { ProgressStrip, useProgress } from '@/components/progress/progress';

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

const STEP: Record<string, string> = {
  recall: 'Warm-up',
  situation: 'Situation',
  orient: 'Big picture',
  worked: 'Worked example',
  explain: 'Idea',
  check: 'Decide',
  attempt: 'Explain it',
  transfer: 'Transfer',
  produce: 'Evidence',
  roleplay: 'Role-play',
  break: 'Break',
  recap: 'Wrap-up',
};
const weekday = (d: string) => new Date(d + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long' });

// A one-line hook for the session, fetched after Today paints and kept for
// the day, so it costs one small call per session at most.
function useHook(owner: string, sessionId: string | undefined, date: string | undefined) {
  const [hook, setHook] = useState('');
  useEffect(() => {
    setHook('');
    if (!sessionId || !date) return;
    const key = `fw:${owner}:hook:${sessionId}:${date}`;
    try {
      const cached = localStorage.getItem(key);
      if (cached !== null) return setHook(cached);
    } catch {}
    let alive = true;
    void api<{ hook: string }>(`/api/today/hook?session=${encodeURIComponent(sessionId)}`)
      .then(({ hook }) => {
        if (!alive) return;
        setHook(hook);
        try {
          localStorage.setItem(key, hook);
        } catch {}
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [owner, sessionId, date]);
  return hook;
}

export function Today() {
  const { user, w, toast } = useApp();
  const { data, error, refresh } = useCached<Payload>('/api/today', user.id);
  const { data: progress } = useProgress();
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null),
    [startError, setStartError] = useState('');
  const t = data?.today;
  const hookFor = t?.primary && (t.primary.kind === 'session' || t.primary.kind === 'return') ? t.primary.sessionId : undefined;
  const hook = useHook(user.id, hookFor, data?.date);

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
      startTransition(() => router.push('/session/' + run.id));
    } catch (e) {
      setStartError((e as Error).message);
      setBusy(null);
      void refresh();
    }
  }
  const explore = (topic: string) => void run({ kind: 'explore', label: 'Explore', detail: '' }, { topic });

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
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
  const track = t.primary?.track || t.focus?.subject || 'general';
  const name = w.state.plan?.profile.name || '';
  const resume = t.secondary.find((s) => s.kind === 'resume');
  const tiles = t.secondary.filter((s) => s.kind === 'review' || s.kind === 'rehearsal' || s.kind === 'practice');
  const recapped = t.phase === 'done-today' && d.recap;

  const more = (d.insight || resume || d.exploring || tiles.length > 0) && (
    <section className="more" aria-label="More">
      {(d.insight || resume || d.exploring) && (
        <div className="rows">
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
        <Link href="/life" className="tile">
          <span className="row-glyph t-life">
            <Icon name="life" size={18} />
          </span>
          <span className="tile-label">Life</span>
          <span className="tile-sub">Workout, food, check-in</span>
        </Link>
      </div>
    </section>
  );

  return (
    <div className={'page today t-' + track}>
      <header className="today-top">
        <p className="label">
          {dateLabel}
          {t.week && t.phase !== 'before-start' ? ` · Week ${t.week.index} of ${t.week.total}` : ''}
        </p>
        <Link href="/you" className="page-you" aria-label="You and settings">
          {(name || 'You').slice(0, 1).toUpperCase()}
        </Link>
      </header>

      {t.phase === 'no-plan' ? (
        <div className="today-main">
          <section className="session-card stagger">
            <p className="muted">{t.greeting}</p>
            <h1 className="display">{t.headline}</h1>
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
              <section className="session-card stagger" aria-labelledby="today-headline">
                <p className="muted">{t.greeting}</p>
                <h1 className="display" id="today-headline">
                  {t.headline}
                </h1>
                {hook && <p className="hook serif">{hook}</p>}
                <p className="hero-why">
                  {t.primary?.track && <i className="dot lit" />}
                  {t.why}
                </p>
                {d.preview.length > 0 && <SessionShape steps={d.preview} />}
                {t.primary && (
                  <div className="hero-actions">
                    <button
                      className="btn primary large begin"
                      onClick={() => void run(t.primary!)}
                      data-busy={busy === t.primary.label || undefined}
                      disabled={!!busy}
                    >
                      {t.primary.label}
                      {busy !== t.primary.label && <Icon name="arrow" size={19} />}
                    </button>
                    {t.secondary
                      .filter((s) => s.kind === 'session')
                      .map((s) =>
                        s.label === 'Only 20 minutes' ? (
                          <button key={s.label} className="btn ghost short" onClick={() => void run(s)} disabled={!!busy} data-busy={busy === s.label || undefined}>
                            Short on time? <b>20 min</b>
                          </button>
                        ) : (
                          <button key={s.label} className="btn quiet large" onClick={() => void run(s)} disabled={!!busy}>
                            {s.label}
                          </button>
                        ),
                      )}
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
            )}
            <LearnAnything busy={busy === 'explore'} disabled={!!busy} onGo={explore} />
            {more}
          </div>

          <aside className="today-side stagger">
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
  const note =
    t.phase === 'done-today'
      ? null
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
  // With today's session done, the focus is the next one in the plan.
  const next = t.focus;
  return (
    <section className="session-card recap stagger" aria-labelledby="today-headline">
      <p className="muted">{t.greeting}</p>
      <h1 className="display" id="today-headline">
        Today’s done.
      </h1>
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

// The morning at a glance: each step sized by its time, like a route. Step
// names live in the bar itself rather than a list under it.
function SessionShape({ steps }: { steps: Payload['preview'] }) {
  const total = Math.round(steps.reduce((s, x) => s + x.minutes, 0));
  const required = Math.round(steps.filter((s) => !s.optional).reduce((s, x) => s + x.minutes, 0));
  const named = steps.filter((s) => s.type !== 'break');
  return (
    <div className="shape">
      <div className="shape-bar" role="img" aria-label={`About ${required} minutes: ${named.map((s) => STEP[s.type]).join(', ')}`}>
        {steps.map((s, i) => (
          <i
            key={i}
            className={'k-' + s.type + (s.optional ? ' optional' : '')}
            style={{ flexGrow: s.minutes, animationDelay: `${120 + i * 45}ms` }}
            title={`${STEP[s.type]} · ${Math.max(1, Math.round(s.minutes))} min${s.optional ? ' · optional' : ''}`}
          />
        ))}
      </div>
      <p className="label">
        About {required} min in {named.length} steps{total > required ? `, plus ${total - required} optional` : ''} · adapts as you go
      </p>
    </div>
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
