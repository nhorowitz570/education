'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, startTransition } from 'react';
import { api } from '@/lib/client/api';
import { useCached } from '@/lib/client/cached';
import { Icon } from '@/components/icons';
import { useApp } from '@/components/app/provider';
import type { Action, TodayView } from '@/lib/learning/today';
import type { RunView } from '@/lib/learning/run';
import { ProgressCard, useProgress } from '@/components/progress/progress';

type Payload = {
  today: TodayView;
  date: string;
  preview: { type: string; minutes: number; optional?: boolean }[];
  insight: { id: string; headline: string } | null;
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

export function Today() {
  const { user, w } = useApp();
  const { data, error, refresh } = useCached<Payload>('/api/today', user.id);
  const { data: progress } = useProgress();
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null),
    [exploring, setExploring] = useState(false),
    [topic, setTopic] = useState(''),
    [startError, setStartError] = useState('');
  const t = data?.today;
  const name = w.state.plan?.profile.name || '';

  async function run(a: Action, extra?: { topic?: string }) {
    if (a.kind === 'practice') return router.push('/practice');
    if (a.kind === 'explore' && !extra?.topic) return setExploring(true);
    if (a.kind === 'resume' && a.runId) return router.push('/session/' + a.runId);
    setBusy(a.label);
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

  const dateLabel = new Date((data!.date || '') + 'T12:00:00').toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
  const track = t.primary?.track || t.focus?.subject || 'general';
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
        <section className="hero stagger">
          <p className="muted">{t.greeting}</p>
          <h1 className="display">{t.headline}</h1>
          <p className="hero-why">{t.why}</p>
          <div className="hero-actions">
            <Link href="/import" className="btn primary large">
              Import a plan <Icon name="arrow" size={18} />
            </Link>
          </div>
        </section>
      ) : (
        <div className="today-grid">
          <section className="hero stagger" aria-labelledby="today-headline">
            <p className="muted">{t.greeting}</p>
            <h1 className="display" id="today-headline">
              {t.headline}
            </h1>
            <p className="hero-why">
              {t.primary?.track && <i className="dot lit" />}
              {t.why}
            </p>
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
                  .map((s) => (
                    <button key={s.label} className="btn quiet large" onClick={() => void run(s)} disabled={!!busy}>
                      {s.label}
                    </button>
                  ))}
              </div>
            )}
            {startError && <p className="today-error-line">{startError}</p>}
            {data!.preview.length > 0 && <SessionShape steps={data!.preview} />}
          </section>

          <aside className="today-side stagger">
            {progress && (t.phase !== 'before-start' || progress.xp > 0) && <ProgressCard progress={progress} />}
            {t.startsIn !== null && (
              <div className="stat big">
                <b className="num">{t.startsIn}</b>
                <span>{t.startsIn === 1 ? 'day until it starts' : 'days until it starts'}</span>
              </div>
            )}
            {t.week && (
              <div className="week">
                <div className="week-head">
                  <p className="eyebrow">This week</p>
                  <p className="label num">
                    {t.week.done}/{t.week.planned}
                  </p>
                </div>
                <div className="week-days">
                  {t.week.days.map((d) => (
                    <div key={d.date} className={'day s-' + d.status + (d.track ? ' t-' + d.track : '')} title={d.title}>
                      <span className="day-mark" aria-hidden="true" />
                      <span className="day-name">{d.weekday.slice(0, 1)}</span>
                    </div>
                  ))}
                </div>
                <p className="label week-note">
                  {t.week.days.find((d) => d.status === 'today')?.title ||
                    t.week.days.find((d) => d.status === 'planned')?.title ||
                    'Rest days count too.'}
                </p>
              </div>
            )}
            {t.focus?.evidence && (
              <div className="evidence-note">
                <p className="eyebrow">This week you’ll produce</p>
                <p className="serif">{t.focus.evidence}</p>
              </div>
            )}
            <div className="side-stats">
              {t.due.count > 0 && (
                <div className="stat">
                  <b className="num">{t.due.count}</b>
                  <span>ideas ready to review</span>
                </div>
              )}
              {t.milestone && (
                <div className="stat">
                  <b className="num">{t.milestone.days}</b>
                  <span>days to {t.milestone.title.split(':')[0].toLowerCase()}</span>
                </div>
              )}
            </div>
          </aside>
        </div>
      )}

      <section className="more" aria-label="More">
        <p className="eyebrow">{t.phase === 'learning-day' ? 'Also' : 'A bit more'}</p>
        <div className="rows">
          {data!.insight && (
            <Link href="/insights" className="row insight-row">
              <span className="row-glyph insight-glyph">
                <Icon name="insights" size={18} />
              </span>
              <div className="grow">
                <p>Your week, read honestly</p>
                <p className="sub">{data!.insight.headline}</p>
              </div>
              <span className="new-dot" aria-label="New" />
              <Icon name="chevron" size={18} />
            </Link>
          )}
          {t.secondary
            .filter((s) => s.kind !== 'session')
            .map((s) => (
              <button key={s.label} className="row" onClick={() => void run(s)} disabled={!!busy}>
                <span className="row-glyph">
                  <Icon
                    name={s.kind === 'practice' ? 'practice' : s.kind === 'review' ? 'refresh' : s.kind === 'rehearsal' ? 'target' : 'spark'}
                    size={18}
                  />
                </span>
                <div className="grow">
                  <p>{s.label}</p>
                  <p className="sub">{s.detail}</p>
                </div>
                <Icon name="chevron" size={18} />
              </button>
            ))}
          <Link href="/life" className="row">
            <span className="row-glyph t-life">
              <Icon name="life" size={18} />
            </span>
            <div className="grow">
              <p>Life</p>
              <p className="sub">Workout, food and a two-minute check-in</p>
            </div>
            <Icon name="chevron" size={18} />
          </Link>
        </div>
        {exploring && (
          <form
            className="explore rise"
            onSubmit={(e) => {
              e.preventDefault();
              if (topic.trim().length > 2) void run({ kind: 'explore', label: 'Explore', detail: '' }, { topic: topic.trim() });
            }}
          >
            <label className="sr-only" htmlFor="explore">
              What are you curious about?
            </label>
            <input
              id="explore"
              className="input"
              autoFocus
              placeholder="What are you curious about?"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              enterKeyHint="go"
            />
            <button className="btn primary" disabled={topic.trim().length < 3 || !!busy} data-busy={busy === 'Explore' || undefined}>
              Explore
            </button>
          </form>
        )}
      </section>
    </div>
  );
}

// The morning at a glance: each step sized by its time, like a route.
function SessionShape({ steps }: { steps: Payload['preview'] }) {
  const total = Math.round(steps.reduce((s, x) => s + x.minutes, 0));
  const required = Math.round(steps.filter((s) => !s.optional).reduce((s, x) => s + x.minutes, 0));
  return (
    <div className="shape" aria-label={`About ${required} minutes in ${steps.length} steps`}>
      <div className="shape-bar">
        {steps.map((s, i) => (
          <i
            key={i}
            className={'k-' + s.type + (s.optional ? ' optional' : '')}
            style={{ flexGrow: s.minutes, animationDelay: `${120 + i * 45}ms` }}
          />
        ))}
      </div>
      <ol className="shape-steps">
        {steps
          .filter((s) => s.type !== 'break')
          .map((s, i) => (
            <li key={i} className={s.optional ? 'optional' : ''}>
              {STEP[s.type]}
            </li>
          ))}
      </ol>
      <p className="label">
        About {required} min{total > required ? `, plus ${total - required} optional` : ''} · adapts to how you’re doing
      </p>
    </div>
  );
}

function TodaySkeleton() {
  return (
    <div className="today-grid" aria-busy="true">
      <section className="hero">
        <div className="skeleton line" style={{ width: 120 }} />
        <div className="skeleton" style={{ height: 52, width: '70%', marginTop: 16 }} />
        <div className="skeleton line" style={{ width: '45%', marginTop: 18 }} />
        <div className="skeleton" style={{ height: 54, width: 160, marginTop: 28, borderRadius: 16 }} />
      </section>
    </div>
  );
}
