'use client';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '@/lib/client/api';
import { useCached } from '@/lib/client/cached';
import { useApp } from '@/components/app/provider';
import { Icon } from '@/components/icons';
import {
  GRADE_HINT,
  GRADE_KEYS,
  GRADE_LABEL,
  type Grade,
  type GradeKey,
  type InsightMetrics,
  type InsightReport,
  type InsightRow,
  type InsightSummary,
} from '@/lib/insights';

type Data = { weeks: InsightSummary[]; insight: InsightRow | null };

const band = (s: number | null) => (s === null ? 'none' : s >= 75 ? 'high' : s >= 60 ? 'good' : s >= 45 ? 'mixed' : 'low');
const rangeLabel = (start: string, end: string) => {
  const f = (d: string, o: Intl.DateTimeFormatOptions) => new Date(d + 'T12:00:00').toLocaleDateString('en-US', o);
  const sameMonth = start.slice(0, 7) === end.slice(0, 7);
  return `${f(start, { month: 'short', day: 'numeric' })} – ${f(end, sameMonth ? { day: 'numeric' } : { month: 'short', day: 'numeric' })}`;
};
const reduced = () => typeof window !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

// Sections rise into view as they're reached, and their charts draw then.
// Runs after every render so sections that appear later are picked up too.
function useReveal() {
  const root = useRef<HTMLDivElement>(null);
  const io = useRef<IntersectionObserver | null>(null);
  const seen = useRef(new WeakSet<Element>());
  useEffect(() => () => io.current?.disconnect(), []);
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const fresh = [...el.querySelectorAll<HTMLElement>('[data-reveal]')].filter((i) => !seen.current.has(i));
    if (!fresh.length) return;
    fresh.forEach((i) => seen.current.add(i));
    if (reduced() || !('IntersectionObserver' in window)) {
      fresh.forEach((i) => i.classList.add('in'));
      return;
    }
    io.current ??= new IntersectionObserver(
      (entries) =>
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add('in');
            io.current?.unobserve(e.target);
          }
        }),
      { rootMargin: '0px 0px -8% 0px', threshold: 0.12 },
    );
    fresh.forEach((i) => io.current!.observe(i));
  });
  return root;
}

// Numbers count up once, when their section comes into view.
function Count({ to, decimals = 0, suffix = '' }: { to: number; decimals?: number; suffix?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const format = (v: number) => v.toLocaleString('en-US', { maximumFractionDigits: decimals, minimumFractionDigits: decimals }) + suffix;
    if (reduced()) {
      el.textContent = format(to);
      return;
    }
    el.textContent = format(0);
    let frame = 0;
    const run = () => {
      const start = performance.now(),
        dur = 1100 + Math.min(900, Math.log10(Math.max(10, to)) * 220);
      const step = (t: number) => {
        const k = Math.min(1, (t - start) / dur),
          eased = 1 - Math.pow(1 - k, 4);
        el.textContent = format(to * eased);
        if (k < 1) frame = requestAnimationFrame(step);
      };
      frame = requestAnimationFrame(step);
    };
    const host = el.closest('[data-reveal]');
    if (!host || host.classList.contains('in')) run();
    else {
      const mo = new MutationObserver(() => {
        if (host.classList.contains('in')) {
          mo.disconnect();
          run();
        }
      });
      mo.observe(host, { attributes: true, attributeFilter: ['class'] });
      return () => {
        mo.disconnect();
        cancelAnimationFrame(frame);
      };
    }
    return () => cancelAnimationFrame(frame);
  }, [to, decimals, suffix]);
  return <span ref={ref} className="num" aria-label={to.toLocaleString('en-US') + suffix} />;
}

export function Insights() {
  const { user } = useApp();
  const [id, setId] = useState<string | null>(null);
  const { data, error, refresh } = useCached<Data>(id ? `/api/insights?id=${id}` : '/api/insights', user.id);
  const insight = data?.insight || null;
  const weeks = data?.weeks || [];
  const [starting, setStarting] = useState(false),
    [startError, setStartError] = useState('');

  // While a read is being written, check back every few seconds.
  const generating = insight?.status === 'generating' || (starting && !insight);
  useEffect(() => {
    if (!generating) return;
    const t = setInterval(() => void refresh(), 4000);
    return () => clearInterval(t);
  }, [generating, refresh]);

  // Opening a fresh read marks it seen, which clears Today's notice.
  const marked = useRef<string | null>(null);
  useEffect(() => {
    if (insight?.status === 'ready' && !insight.seen_at && marked.current !== insight.id) {
      marked.current = insight.id;
      void api('/api/insights', { action: 'seen', id: insight.id }).catch(() => {});
    }
  }, [insight]);

  const start = useCallback(async () => {
    setStarting(true);
    setStartError('');
    try {
      await api('/api/insights', { action: 'generate' });
      await refresh();
    } catch (e) {
      setStartError((e as Error).message);
    } finally {
      setStarting(false);
    }
  }, [refresh]);

  const report = insight?.status === 'ready' ? insight.report : null;
  const metrics = insight?.status === 'ready' && 'totals' in (insight.metrics || {}) ? (insight.metrics as InsightMetrics) : null;
  const previous = useMemo(() => {
    if (!insight) return null;
    return weeks.find((w) => w.week_start < insight.week_start && w.status === 'ready') || null;
  }, [weeks, insight]);
  const root = useReveal();

  return (
    <div className="page insights" ref={root}>
      <div className="insights-aura" aria-hidden="true">
        <i />
        <i />
        <i />
      </div>
      <header className="page-head insights-head">
        <div>
          <p className="eyebrow">Insights</p>
          <h1 className="title">Your week, read honestly.</h1>
        </div>
        {weeks.length > 1 && (
          <nav className="week-picker" aria-label="Choose a week">
            {weeks.map((w) => (
              <button
                key={w.id}
                className={'chip' + (w.id === insight?.id ? ' on' : '')}
                aria-pressed={w.id === insight?.id}
                onClick={() => setId(w.id)}
              >
                {rangeLabel(w.week_start, w.week_end)}
              </button>
            ))}
          </nav>
        )}
      </header>

      {!data && !error && <InsightsSkeleton />}
      {error && !data && (
        <div className="today-error">
          <p className="heading">Insights couldn’t load.</p>
          <p className="muted">{error}</p>
          <button className="btn" onClick={() => void refresh()}>
            Try again
          </button>
        </div>
      )}

      {data && !insight && !starting && (
        <section className="insights-empty" data-reveal>
          <div className="empty-orb" aria-hidden="true" />
          <h2 className="heading">Your first read</h2>
          <p className="muted">
            Once a week, Fieldwork looks at how you actually learned: time, follow-through, curiosity, what stuck and what
            didn’t. It grades each area against fixed anchors and says plainly what it sees. Each Monday brings a new one.
          </p>
          <button className="btn primary large" onClick={() => void start()}>
            <Icon name="insights" size={18} /> Read my last seven days
          </button>
          {startError && <p className="conversation-error">{startError}</p>}
        </section>
      )}

      {generating && <Generating />}

      {insight?.status === 'failed' && (
        <section className="insights-empty" data-reveal>
          <h2 className="heading">This read didn’t finish.</h2>
          <p className="muted">Something went wrong while it was being written. Nothing was lost.</p>
          <button className="btn primary" onClick={() => void start()} data-busy={starting || undefined}>
            Try again
          </button>
          {startError && <p className="conversation-error">{startError}</p>}
        </section>
      )}

      {insight?.status === 'ready' && !report && (
        <section className="insights-empty" data-reveal>
          <p className="eyebrow">{rangeLabel(insight.week_start, insight.week_end)}</p>
          <h2 className="heading">A quiet week.</h2>
          <p className="muted">There was no learning activity to read. Rest weeks count too; the next read arrives Monday.</p>
          <Link href="/" className="btn primary">
            Back to Today
          </Link>
        </section>
      )}

      {insight && report && metrics && (
        <Report key={insight.id} insight={insight} report={report} metrics={metrics} previous={previous} />
      )}
    </div>
  );
}

function Report({
  insight,
  report,
  metrics,
  previous,
}: {
  insight: InsightRow;
  report: InsightReport;
  metrics: InsightMetrics;
  previous: InsightSummary | null;
}) {
  const prev = new Map((previous?.grades || []).map((g) => [g.key, g.score]));
  const t = metrics.totals;
  const graded = report.grades.filter((g) => g.score !== null);
  const overall = graded.length ? Math.round(graded.reduce((s, g) => s + g.score!, 0) / graded.length) : null;
  return (
    <>
      <section className="ins-hero" data-reveal>
        <p className="eyebrow">
          {rangeLabel(insight.week_start, insight.week_end)}
          {previous ? ' · compared with the week before' : ''}
        </p>
        <h2 className="ins-headline">{report.headline}</h2>
        <p className="ins-summary">{report.summary}</p>
        {report.data_note && (
          <p className="ins-note">
            <Icon name="spark" size={14} /> {report.data_note}
          </p>
        )}
      </section>

      <section className="ins-stats" data-reveal aria-label="The week in numbers">
        <Stat value={t.minutes} label="minutes learning" />
        <Stat value={t.days_active} label="days active" of={7} />
        <Stat value={t.sessions_finished} label={`session${t.sessions_finished === 1 ? '' : 's'} finished`} />
        <Stat value={t.answers} label="answers given" />
        <Stat value={t.words_written} label="words written" />
        <Stat value={t.questions_asked} label="questions asked" />
        {t.words_spoken > 0 && <Stat value={t.words_spoken} label="words spoken" />}
        {t.practices > 0 && <Stat value={t.practices} label={`practice${t.practices === 1 ? '' : 's'}`} />}
      </section>

      <section className="ins-grades" data-reveal>
        <div className="ins-radar-wrap">
          <Radar grades={report.grades} previous={prev} />
          {overall !== null && (
            <div className="ins-overall">
              <b>
                <Count to={overall} />
              </b>
              <span>across {graded.length} graded areas</span>
            </div>
          )}
        </div>
        <div className="grade-list">
          {GRADE_KEYS.map((k, i) => {
            const g = report.grades.find((x) => x.key === k);
            return g ? <GradeCard key={k} g={g} prev={prev.get(k) ?? null} i={i} /> : null;
          })}
        </div>
      </section>

      <section className="ins-rhythm" data-reveal>
        <div className="ins-card">
          <p className="eyebrow">Day by day</p>
          <Days days={metrics.by_day} />
        </div>
        <div className="ins-card">
          <p className="eyebrow">When you learn</p>
          <Clock hours={metrics.by_hour} />
        </div>
      </section>

      {metrics.answers.total > 0 && (
        <section className="ins-answers ins-card" data-reveal>
          <p className="eyebrow">How your answers landed</p>
          <Answers a={metrics.answers} schedule={metrics.schedule} />
        </section>
      )}

      {report.patterns.length > 0 && (
        <section className="ins-section" data-reveal>
          <p className="eyebrow">How you learn</p>
          <div className="patterns">
            {report.patterns.map((p, i) => (
              <article key={i} className={'pattern k-' + p.kind} style={{ '--i': i } as React.CSSProperties}>
                <span className="pattern-kind">{p.kind === 'strength' ? 'Strength' : p.kind === 'watch' ? 'Watch' : 'Noticed'}</span>
                <h3>{p.title}</h3>
                <p>{p.body}</p>
              </article>
            ))}
          </div>
        </section>
      )}

      {report.mind.length > 0 && (
        <section className="ins-section ins-mind" data-reveal>
          <p className="eyebrow">Behind the numbers</p>
          <div className="mind">
            {report.mind.map((m, i) => (
              <article key={i} style={{ '--i': i } as React.CSSProperties}>
                <h3>{m.title}</h3>
                <p className="serif">{m.body}</p>
              </article>
            ))}
          </div>
          <p className="label mind-note">Observations from how you worked this week, not a diagnosis of anything.</p>
        </section>
      )}

      {report.moment && (
        <section className="ins-moment" data-reveal>
          <p className="eyebrow">Moment of the week</p>
          <blockquote className="serif">“{report.moment.quote}”</blockquote>
          <p className="muted">{report.moment.why}</p>
        </section>
      )}

      <section className="ins-focus" data-reveal>
        <p className="eyebrow">Next week</p>
        <h3>{report.focus.title}</h3>
        <p className="muted">{report.focus.why}</p>
        <div className="focus-try">
          <Icon name="target" size={18} />
          <p>{report.focus.try}</p>
        </div>
      </section>

      <footer className="ins-foot" data-reveal>
        <p className="label">
          Written by {insight.model?.includes('astra') ? 'Astra' : 'the reasoning model'} from{' '}
          {t.answers + t.questions_asked + t.steps_done} measured moments. Grades use the same fixed anchors every week: 60 means
          doing what the plan asks, well. They aren’t adjusted to encourage you or to push you.
        </p>
      </footer>
    </>
  );
}

function Stat({ value, label, of }: { value: number; label: string; of?: number }) {
  return (
    <div className="ins-stat">
      <b>
        <Count to={value} />
        {of && <span className="of">/{of}</span>}
      </b>
      <span>{label}</span>
      {of && (
        <span className="stat-dots" aria-hidden="true">
          {Array.from({ length: of }, (_, i) => (
            <i key={i} className={i < value ? 'on' : ''} style={{ animationDelay: `${300 + i * 70}ms` }} />
          ))}
        </span>
      )}
    </div>
  );
}

// Eight grades on eight spokes. Last week sits behind as a faint outline, so
// the shape of the change reads at a glance.
function Radar({ grades, previous }: { grades: Grade[]; previous: Map<GradeKey, number | null> }) {
  const size = 320,
    c = size / 2,
    r = 118;
  const keys = GRADE_KEYS;
  const at = (i: number, v: number) => {
    const a = -Math.PI / 2 + (i / keys.length) * Math.PI * 2;
    return [c + Math.cos(a) * r * v, c + Math.sin(a) * r * v] as const;
  };
  const score = (k: GradeKey) => grades.find((g) => g.key === k)?.score ?? null;
  const shape = (get: (k: GradeKey) => number | null) =>
    keys.map((k, i) => at(i, Math.max(0.04, (get(k) ?? 0) / 100)).join(',')).join(' ');
  const hasPrev = keys.some((k) => previous.get(k) != null);
  return (
    <svg className="radar" viewBox={`-64 -16 ${size + 128} ${size + 32}`} role="img" aria-label={grades.map((g) => `${GRADE_LABEL[g.key]} ${g.score ?? 'not graded'}`).join(', ')}>
      {[0.25, 0.5, 0.75, 1].map((f) => (
        <polygon key={f} className="radar-ring" points={keys.map((_, i) => at(i, f).join(',')).join(' ')} />
      ))}
      {keys.map((k, i) => {
        const [x, y] = at(i, 1);
        return <line key={k} className="radar-spoke" x1={c} y1={c} x2={x} y2={y} />;
      })}
      {hasPrev && <polygon className="radar-prev" points={shape((k) => previous.get(k) ?? null)} />}
      <g className="radar-shape" style={{ transformOrigin: `${c}px ${c}px` }}>
        <polygon className="radar-fill" points={shape(score)} />
        <polygon className="radar-line" points={shape(score)} pathLength={1} />
        {keys.map((k, i) => {
          const s = score(k);
          if (s === null) return null;
          const [x, y] = at(i, s / 100);
          return <circle key={k} className={'radar-dot b-' + band(s)} cx={x} cy={y} r={4} style={{ animationDelay: `${700 + i * 60}ms` }} />;
        })}
      </g>
      {keys.map((k, i) => {
        const [x, y] = at(i, 1.17);
        const s = score(k);
        return (
          <text
            key={k}
            x={x}
            y={y}
            className={'radar-label' + (s === null ? ' muted' : '')}
            textAnchor={Math.abs(x - c) < 8 ? 'middle' : x > c ? 'start' : 'end'}
            dominantBaseline="middle"
          >
            {GRADE_LABEL[k]}
          </text>
        );
      })}
    </svg>
  );
}

function GradeCard({ g, prev, i }: { g: Grade; prev: number | null; i: number }) {
  const delta = g.score !== null && prev !== null ? g.score - prev : null;
  return (
    <article className={'grade b-' + band(g.score)} style={{ '--i': i } as React.CSSProperties}>
      <div className="grade-top">
        <div>
          <h3>{GRADE_LABEL[g.key]}</h3>
          <p className="grade-hint">{GRADE_HINT[g.key]}</p>
        </div>
        <div className="grade-score">
          {g.score === null ? <span className="grade-na">—</span> : <Count to={g.score} />}
          {delta !== null && delta !== 0 && (
            <span className={'grade-delta ' + (delta > 0 ? 'up' : 'down')}>
              <Icon name={delta > 0 ? 'up' : 'down'} size={12} />
              {Math.abs(delta)}
            </span>
          )}
        </div>
      </div>
      <div className="grade-bar" aria-hidden="true">
        <i style={{ '--v': (g.score ?? 0) / 100 } as React.CSSProperties} />
        {prev !== null && <b style={{ left: `${prev}%` }} />}
      </div>
      <p className="grade-label">
        <span>{g.label}</span>
        <span className={'conf c-' + g.confidence} title={`${g.confidence} confidence`}>
          {['low', 'medium', 'high'].map((c, j) => (
            <i key={c} className={j <= ['low', 'medium', 'high'].indexOf(g.confidence) ? 'on' : ''} />
          ))}
          {g.confidence} confidence
        </span>
      </p>
      <p className="grade-evidence">{g.evidence}</p>
    </article>
  );
}

function Days({ days }: { days: InsightMetrics['by_day'] }) {
  const max = Math.max(30, ...days.map((d) => d.minutes));
  return (
    <div className="days" role="img" aria-label={days.map((d) => `${d.date}: ${d.minutes} minutes`).join(', ')}>
      {days.map((d, i) => {
        const wd = new Date(d.date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short' });
        return (
          <div key={d.date} className={'day-col' + (d.minutes ? '' : ' rest')}>
            <span className="num day-min">{d.minutes ? d.minutes : ''}</span>
            <div className="day-bar">
              <i style={{ height: `${Math.max(d.minutes ? 6 : 0, (d.minutes / max) * 100)}%`, animationDelay: `${i * 70}ms` }} />
            </div>
            <span className="day-dots" aria-hidden="true">
              {Array.from({ length: Math.min(6, d.answers) }, (_, j) => (
                <i key={'a' + j} className="a" />
              ))}
              {Array.from({ length: Math.min(4, d.asks) }, (_, j) => (
                <i key={'q' + j} className="q" />
              ))}
            </span>
            <span className="day-name">{wd}</span>
          </div>
        );
      })}
      <p className="days-key label">
        <i className="a" /> answers <i className="q" /> questions asked
      </p>
    </div>
  );
}

// A 24-hour dial: each spoke is an hour, its length how much happened then.
function Clock({ hours }: { hours: number[] }) {
  const size = 240,
    c = size / 2,
    inner = 44,
    outer = 104;
  const max = Math.max(1, ...hours);
  const peak = hours.indexOf(Math.max(...hours));
  const fmt = (h: number) => `${((h + 11) % 12) + 1}${h < 12 ? 'am' : 'pm'}`;
  const total = hours.reduce((a, b) => a + b, 0);
  return (
    <div className="clock-wrap">
      <svg className="clock" viewBox={`0 0 ${size} ${size}`} role="img" aria-label={total ? `Most active around ${fmt(peak)}` : 'No activity'}>
        <circle cx={c} cy={c} r={inner - 8} className="clock-face" />
        {hours.map((v, h) => {
          const a = -Math.PI / 2 + (h / 24) * Math.PI * 2;
          const len = inner + (outer - inner) * (v / max);
          return (
            <line
              key={h}
              x1={c + Math.cos(a) * inner}
              y1={c + Math.sin(a) * inner}
              x2={c + Math.cos(a) * (v ? len : inner + 3)}
              y2={c + Math.sin(a) * (v ? len : inner + 3)}
              className={'clock-spoke' + (v ? ' on' : '') + (h === peak && v ? ' peak' : '')}
              style={{ animationDelay: `${h * 30}ms` }}
            />
          );
        })}
        {[0, 6, 12, 18].map((h) => {
          const a = -Math.PI / 2 + (h / 24) * Math.PI * 2;
          return (
            <text key={h} x={c + Math.cos(a) * (outer + 14)} y={c + Math.sin(a) * (outer + 14)} className="clock-label" textAnchor="middle" dominantBaseline="middle">
              {h === 0 ? '12am' : h === 12 ? '12pm' : fmt(h)}
            </text>
          );
        })}
        <text x={c} y={c - 6} className="clock-peak" textAnchor="middle">
          {total ? fmt(peak) : '—'}
        </text>
        <text x={c} y={c + 12} className="clock-sub" textAnchor="middle">
          {total ? 'your peak' : 'no activity'}
        </text>
      </svg>
    </div>
  );
}

function Answers({ a, schedule }: { a: InsightMetrics['answers']; schedule: InsightMetrics['schedule'] }) {
  const r = 52,
    circ = 2 * Math.PI * r;
  const parts = [
    { k: 'solid', n: a.solid, label: 'Solid' },
    { k: 'partial', n: a.partial, label: 'Partly there' },
    { k: 'missed', n: a.missed, label: 'Not yet' },
  ];
  let offset = 0;
  const cal = a.calibration;
  const pct = (x: { n: number; right: number }) => (x.n ? Math.round((x.right / x.n) * 100) : null);
  return (
    <div className="answers">
      <div className="donut-wrap">
        <svg className="donut" viewBox="0 0 140 140" role="img" aria-label={parts.map((p) => `${p.label} ${p.n}`).join(', ')}>
          <circle cx="70" cy="70" r={r} className="donut-bg" />
          {parts.map((p, i) => {
            const len = a.total ? (p.n / a.total) * circ : 0;
            const el = (
              <circle
                key={p.k}
                cx="70"
                cy="70"
                r={r}
                className={'donut-seg v-' + p.k}
                strokeDasharray={`${Math.max(0, len - 2)} ${circ}`}
                strokeDashoffset={-offset}
                style={{ animationDelay: `${200 + i * 180}ms` }}
              />
            );
            offset += len;
            return el;
          })}
          <text x="70" y="66" textAnchor="middle" className="donut-n">
            {a.avg_score !== null ? Math.round(a.avg_score * 100) : '—'}
          </text>
          <text x="70" y="86" textAnchor="middle" className="donut-sub">
            average score
          </text>
        </svg>
        <ul className="donut-legend">
          {parts.map((p) => (
            <li key={p.k}>
              <i className={'dot v-' + p.k} /> {p.label} <b className="num">{p.n}</b>
            </li>
          ))}
        </ul>
      </div>
      <div className="answer-facts">
        <div>
          <b className="num">{a.avg_words ?? '—'}</b>
          <span>words per written answer</span>
        </div>
        <div>
          <b className="num">
            {a.retries_improved}/{a.retries}
          </b>
          <span>retries that closed the gap</span>
        </div>
        <div>
          <b className="num">{a.skipped}</b>
          <span>questions skipped</span>
        </div>
        <div>
          <b className="num">{schedule.optional_steps_taken}</b>
          <span>optional steps taken</span>
        </div>
      </div>
      {cal.low.n + cal.medium.n + cal.high.n > 0 && (
        <div className="mini-calib">
          <p className="label">Right when…</p>
          {(
            [
              ['low', 'guessing'],
              ['medium', 'fairly sure'],
              ['high', 'certain'],
            ] as const
          ).map(([k, l], i) => (
            <div key={k} className="mini-row">
              <span>{l}</span>
              <div className="mini-bar">
                <i style={{ '--v': (pct(cal[k]) ?? 0) / 100, animationDelay: `${i * 120}ms` } as React.CSSProperties} />
              </div>
              <span className="num">{pct(cal[k]) === null ? '—' : pct(cal[k]) + '%'}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Generating() {
  const lines = ['Gathering the week', 'Measuring time and follow-through', 'Reading your answers', 'Weighing the evidence', 'Writing it up'];
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setI((x) => Math.min(lines.length - 1, x + 1)), 6000);
    return () => clearInterval(t);
  }, [lines.length]);
  return (
    <section className="ins-generating" role="status">
      <div className="gen-orb" aria-hidden="true">
        <i />
        <i />
        <i />
      </div>
      <p className="heading" key={i}>
        {lines[i]}…
      </p>
      <p className="muted">Astra is reading your week. This takes a minute or two, and you can leave; it will be here when you come back.</p>
    </section>
  );
}

function InsightsSkeleton() {
  return (
    <div aria-busy="true" className="ins-skeleton">
      <div className="skeleton line" style={{ width: 140 }} />
      <div className="skeleton" style={{ height: 44, width: '80%', marginTop: 16 }} />
      <div className="skeleton" style={{ height: 120, marginTop: 28, borderRadius: 20 }} />
    </div>
  );
}
