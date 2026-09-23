'use client';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '@/lib/client/api';
import { useCached } from '@/lib/client/cached';
import { useApp } from '@/components/app/provider';
import { Icon } from '@/components/icons';
import { Disclosure, Sheet } from '@/components/ui';
import {
  GRADE_BANDS,
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
type Point = { week: string; score: number | null };

const band = (s: number | null) => (s === null ? 'none' : s >= 75 ? 'high' : s >= 60 ? 'good' : s >= 45 ? 'mixed' : 'low');
const rangeLabel = (start: string, end: string) => {
  const f = (d: string, o: Intl.DateTimeFormatOptions) => new Date(d + 'T12:00:00').toLocaleDateString('en-US', o);
  const sameMonth = start.slice(0, 7) === end.slice(0, 7);
  return `${f(start, { month: 'short', day: 'numeric' })} – ${f(end, sameMonth ? { day: 'numeric' } : { month: 'short', day: 'numeric' })}`;
};
const shortDate = (d: string) => new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
const hourLabel = (h: number) => `${((h + 11) % 12) + 1}${h < 12 ? 'am' : 'pm'}`;
const plural = (n: number, one: string, many = one + 's') => `${n.toLocaleString('en-US')} ${n === 1 ? one : many}`;
const reduced = () => typeof window !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

// Sections rise into view as they're reached, and their charts draw then.
// Runs after every render so sections that appear later are picked up too.
// Folded sections don't use it: their content is marked in when it mounts,
// so charts draw as the fold opens.
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
  const weeks = useMemo(() => data?.weeks || [], [data]);
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
  const ready = useMemo(() => weeks.filter((w) => w.status === 'ready'), [weeks]);
  const previous = useMemo(() => (insight ? ready.find((w) => w.week_start < insight.week_start) || null : null), [ready, insight]);
  const latest = !!insight && ready[0]?.id === insight.id;
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
        {insight && <WeekStepper weeks={weeks} current={insight} onPick={setId} />}
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
            didn’t. Each area is graded against fixed anchors. A new read arrives every Monday.
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
        <Report key={insight.id} insight={insight} report={report} metrics={metrics} previous={previous} weeks={ready} latest={latest} />
      )}
    </div>
  );
}

// One week at a time, stepped through like pages.
function WeekStepper({ weeks, current, onPick }: { weeks: InsightSummary[]; current: InsightRow; onPick: (id: string) => void }) {
  const i = weeks.findIndex((w) => w.id === current.id);
  const older = weeks[i + 1],
    newer = i > 0 ? weeks[i - 1] : undefined;
  return (
    <nav className="week-step" aria-label="Choose a week">
      <button className="btn icon small ghost" disabled={!older} onClick={() => older && onPick(older.id)} aria-label="Earlier week">
        <Icon name="chevron" size={18} className="flip" />
      </button>
      <span className="week-step-label num" aria-live="polite">
        {rangeLabel(current.week_start, current.week_end)}
      </span>
      <button className="btn icon small ghost" disabled={!newer} onClick={() => newer && onPick(newer.id)} aria-label="Later week">
        <Icon name="chevron" size={18} />
      </button>
    </nav>
  );
}

function Report({
  insight,
  report,
  metrics,
  previous,
  weeks,
  latest,
}: {
  insight: InsightRow;
  report: InsightReport;
  metrics: InsightMetrics;
  previous: InsightSummary | null;
  weeks: InsightSummary[];
  latest: boolean;
}) {
  const prev = new Map((previous?.grades || []).map((g) => [g.key, g.score]));
  const t = metrics.totals;
  const graded = report.grades.filter((g) => g.score !== null);
  const overall = graded.length ? Math.round(graded.reduce((s, g) => s + g.score!, 0) / graded.length) : null;
  const [howOpen, setHowOpen] = useState(false);
  // Up to eight weeks of each grade, oldest first, ending at this one.
  const trend = useMemo(() => {
    const span = weeks
      .filter((w) => w.week_start <= insight.week_start)
      .slice(0, 8)
      .reverse();
    return new Map<GradeKey, Point[]>(
      GRADE_KEYS.map((k) => [k, span.map((w) => ({ week: w.week_start, score: w.grades.find((g) => g.key === k)?.score ?? null }))]),
    );
  }, [weeks, insight.week_start]);
  const peak = metrics.by_hour.indexOf(Math.max(...metrics.by_hour));
  const hasHours = metrics.by_hour.some((h) => h > 0);
  const a = metrics.answers;
  const kinds = report.patterns.reduce<Record<string, number>>((m, p) => ((m[p.kind] = (m[p.kind] || 0) + 1), m), {});
  const lowest = [...graded].sort((x, y) => x.score! - y.score!)[0];

  const secondary = [
    plural(t.answers, 'answer'),
    plural(t.words_written, 'word') + ' written',
    plural(t.questions_asked, 'question') + ' asked',
    t.words_spoken > 0 ? plural(t.words_spoken, 'word') + ' spoken' : '',
    t.practices > 0 ? plural(t.practices, 'practice conversation') : '',
  ].filter(Boolean);

  return (
    <>
      <section className="ins-hero" data-reveal>
        <p className="eyebrow">{previous ? 'Compared with the week before' : 'Your first read'}</p>
        <h2 className="ins-headline">{report.headline}</h2>
        <p className="ins-summary">{report.summary}</p>
        {report.data_note && (
          <p className="ins-note">
            <Icon name="spark" size={14} /> {report.data_note}
          </p>
        )}
      </section>

      <FocusCard insight={insight} report={report} previous={previous} latest={latest} />

      <section className="ins-stats" data-reveal aria-label="The week in numbers">
        <div className="ins-stats-main">
          <Stat value={t.minutes} label="minutes learning" />
          <Stat value={t.days_active} label="days active" of={7} />
          <Stat value={t.sessions_finished} label={`session${t.sessions_finished === 1 ? '' : 's'} finished`} />
        </div>
        <p className="ins-stats-more">{secondary.join(' · ')}</p>
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
            return g ? <GradeRow key={k} g={g} prev={prev.get(k) ?? null} trend={trend.get(k) || []} i={i} /> : null;
          })}
          <p className="label grade-list-key">Tap an area for the evidence. The tick marks last week.</p>
        </div>
      </section>

      {report.moment && (
        <section className="ins-moment" data-reveal>
          <p className="eyebrow">Moment of the week</p>
          <blockquote className="serif">“{report.moment.quote}”</blockquote>
          <p className="muted">{report.moment.why}</p>
        </section>
      )}

      <div className="ins-more" data-reveal>
        <Disclosure
          title="Rhythm"
          teaser={`${plural(t.days_active, 'active day')}${hasHours ? ` · most active around ${hourLabel(peak)}` : ''}`}
        >
          <div className="ins-rhythm in">
            <div className="ins-card">
              <p className="eyebrow">Day by day</p>
              <Days days={metrics.by_day} />
            </div>
            <div className="ins-card">
              <p className="eyebrow">When you learn</p>
              <Clock hours={metrics.by_hour} />
            </div>
          </div>
        </Disclosure>
        {a.total > 0 && (
          <Disclosure
            title="How your answers landed"
            teaser={`${plural(a.total, 'answer')}${a.avg_score !== null ? ` · average ${Math.round(a.avg_score * 100)}` : ''} · ${a.solid} solid`}
          >
            <div className="ins-card ins-answers in">
              <Answers a={a} schedule={metrics.schedule} />
            </div>
          </Disclosure>
        )}
        {report.patterns.length > 0 && (
          <Disclosure
            title="How you learn"
            teaser={[
              kinds.strength ? plural(kinds.strength, 'strength') : '',
              kinds.watch ? `${kinds.watch} to watch` : '',
              kinds.observation ? `${kinds.observation} noticed` : '',
            ]
              .filter(Boolean)
              .join(' · ')}
          >
            <div className="patterns in">
              {report.patterns.map((p, i) => (
                <article key={i} className={'pattern k-' + p.kind} style={{ '--i': i } as React.CSSProperties}>
                  <span className="pattern-kind">{p.kind === 'strength' ? 'Strength' : p.kind === 'watch' ? 'Watch' : 'Noticed'}</span>
                  <h3>{p.title}</h3>
                  <p>{p.body}</p>
                </article>
              ))}
            </div>
          </Disclosure>
        )}
        {report.mind.length > 0 && (
          <Disclosure title="Behind the numbers" teaser={report.mind.map((m) => m.title).join(' · ')}>
            <div className="mind in">
              {report.mind.map((m, i) => (
                <article key={i} style={{ '--i': i } as React.CSSProperties}>
                  <h3>{m.title}</h3>
                  <p className="serif">{m.body}</p>
                </article>
              ))}
              <p className="label">Observations from how you worked this week, not a diagnosis of anything.</p>
            </div>
          </Disclosure>
        )}
      </div>

      <AskWeek id={insight.id} lowest={lowest} />

      <footer className="ins-foot" data-reveal>
        <p className="label">
          Written by {insight.model?.includes('astra') ? 'Astra' : 'the reasoning model'} from{' '}
          {plural(t.answers + t.questions_asked + t.steps_done, 'measured moment')}.{' '}
          <button className="link inline-link" onClick={() => setHowOpen(true)}>
            How grades work
          </button>
        </p>
      </footer>
      {howOpen && <HowGrades onClose={() => setHowOpen(false)} />}
    </>
  );
}

const VERDICT: Record<NonNullable<InsightReport['focus_check']>['verdict'], string> = {
  yes: 'Done',
  partly: 'Partly',
  no: 'Not yet',
  unclear: 'Unclear',
};

// What to do next, first: it is the part of the read you can act on.
function FocusCard({
  insight,
  report,
  previous,
  latest,
}: {
  insight: InsightRow;
  report: InsightReport;
  previous: InsightSummary | null;
  latest: boolean;
}) {
  const { toast } = useApp();
  const [focus, setFocus] = useState(report.focus),
    [busy, setBusy] = useState(false);
  const check = report.focus_check;
  async function toggle() {
    setBusy(true);
    try {
      const r = await api<{ focus: InsightReport['focus'] }>('/api/insights', { action: 'adopt', id: insight.id, on: !focus.adopted });
      setFocus(r.focus);
      toast(r.focus.adopted ? 'Pinned. Your sessions will lean into it this week.' : 'Focus removed from memory.');
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="ins-focus" data-reveal>
      {check && (
        <p className={'focus-check v-' + check.verdict}>
          <span className="focus-check-tag">{VERDICT[check.verdict]}</span>
          <span>
            <b>Last week{previous?.focus ? `: ${previous.focus}` : ''}.</b> {check.note}
          </span>
        </p>
      )}
      <p className="eyebrow">Your focus next week</p>
      <h3>{focus.title}</h3>
      <p className="muted">{focus.why}</p>
      <div className="focus-try">
        <Icon name="target" size={18} />
        <p>{focus.try}</p>
      </div>
      {latest ? (
        <div className="focus-actions">
          <button
            className={'btn ' + (focus.adopted ? 'quiet' : 'primary')}
            onClick={() => void toggle()}
            disabled={busy}
            data-busy={busy || undefined}
            aria-pressed={!!focus.adopted}
          >
            {focus.adopted ? (
              <>
                <Icon name="check" size={16} /> Your focus this week
              </>
            ) : (
              'Make this my focus'
            )}
          </button>
          <p className="label">
            {focus.adopted ? 'Pinned to memory, so every session works on it with you. Tap to remove.' : 'Pins it to memory so your tutor works on it with you.'}
          </p>
        </div>
      ) : (
        focus.adopted && (
          <p className="label focus-was">
            <Icon name="check" size={14} /> You made this your focus.
          </p>
        )
      )}
    </section>
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

// A grade as one line: name, bar against last week, score. The evidence and
// the trend across weeks fold out.
function GradeRow({ g, prev, trend, i }: { g: Grade; prev: number | null; trend: Point[]; i: number }) {
  const [open, setOpen] = useState(false);
  const delta = g.score !== null && prev !== null ? g.score - prev : null;
  const shown = trend.filter((p) => p.score !== null).length;
  const levels = ['low', 'medium', 'high'];
  return (
    <article className={'grade b-' + band(g.score)} style={{ '--i': i } as React.CSSProperties} data-open={open || undefined}>
      <button className="grade-head" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <span className="grade-name">
          <b>{GRADE_LABEL[g.key]}</b>
          <span className="grade-tag">{g.label}</span>
        </span>
        {shown >= 2 ? <Spark points={trend} /> : <span className="spark" aria-hidden="true" />}
        <span className="grade-bar" aria-hidden="true">
          <i style={{ '--v': (g.score ?? 0) / 100 } as React.CSSProperties} />
          {prev !== null && <b style={{ left: `${prev}%` }} />}
        </span>
        <span className="grade-score">
          {g.score === null ? <span className="grade-na">—</span> : <Count to={g.score} />}
          {delta !== null && delta !== 0 && (
            <span className={'grade-delta ' + (delta > 0 ? 'up' : 'down')} aria-label={`${delta > 0 ? 'up' : 'down'} ${Math.abs(delta)} from last week`}>
              <Icon name={delta > 0 ? 'up' : 'down'} size={11} />
              {Math.abs(delta)}
            </span>
          )}
        </span>
        <Icon name="down" size={16} className="grade-chev" />
      </button>
      {open && (
        <div className="grade-more">
          <p className="grade-evidence">{g.evidence}</p>
          <p className="grade-meta">
            <span>{GRADE_HINT[g.key]}</span>
            <span className={'conf c-' + g.confidence}>
              {levels.map((c, j) => (
                <i key={c} className={j <= levels.indexOf(g.confidence) ? 'on' : ''} />
              ))}
              {g.confidence} confidence
            </span>
          </p>
          {shown >= 2 && <Trend points={trend} />}
        </div>
      )}
    </article>
  );
}

// The same grade over recent weeks, small enough to sit in the row.
function Spark({ points }: { points: Point[] }) {
  const w = 56,
    h = 20;
  const xy = points.map((p, i) => (p.score === null ? null : ([points.length < 2 ? w / 2 : (i / (points.length - 1)) * w, h - 2 - (p.score / 100) * (h - 4)] as const)));
  const line = xy.filter(Boolean).map((p) => p!.join(',')).join(' ');
  const last = xy.at(-1);
  return (
    <svg className="spark" viewBox={`-2 0 ${w + 4} ${h}`} aria-hidden="true">
      <polyline points={line} />
      {last && <circle cx={last[0]} cy={last[1]} r={2.4} />}
    </svg>
  );
}

function Trend({ points }: { points: Point[] }) {
  // The right gutter holds the anchor's label, clear of the latest point.
  const w = 320,
    h = 88,
    top = 10,
    bottom = 22,
    gutter = 52;
  const x = (i: number) => (points.length < 2 ? (w - gutter) / 2 : 8 + (i / (points.length - 1)) * (w - gutter - 16));
  const y = (s: number) => top + (1 - s / 100) * (h - top - bottom);
  const segs: string[][] = [[]];
  points.forEach((p, i) => (p.score === null ? segs.push([]) : segs.at(-1)!.push(`${x(i)},${y(p.score)}`)));
  return (
    <figure className="trend">
      <svg viewBox={`0 0 ${w} ${h}`} role="img" aria-label={points.map((p) => `${shortDate(p.week)}: ${p.score ?? 'not graded'}`).join(', ')}>
        <line className="trend-anchor" x1={0} x2={w - gutter + 4} y1={y(60)} y2={y(60)} />
        <text className="trend-anchor-label" x={w} y={y(60)} textAnchor="end" dominantBaseline="middle">
          60 solid
        </text>
        {segs
          .filter((s) => s.length > 1)
          .map((s, i) => (
            <polyline key={i} className="trend-line" points={s.join(' ')} />
          ))}
        {points.map((p, i) =>
          p.score === null ? null : (
            <circle key={p.week} className={'trend-dot b-' + band(p.score)} cx={x(i)} cy={y(p.score)} r={i === points.length - 1 ? 4 : 3} />
          ),
        )}
        <text className="trend-label" x={x(0)} y={h - 4} textAnchor="start">
          {shortDate(points[0].week)}
        </text>
        <text className="trend-label" x={x(points.length - 1)} y={h - 4} textAnchor="end">
          This week
        </text>
      </svg>
    </figure>
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
  const total = hours.reduce((a, b) => a + b, 0);
  return (
    <div className="clock-wrap">
      <svg className="clock" viewBox={`0 0 ${size} ${size}`} role="img" aria-label={total ? `Most active around ${hourLabel(peak)}` : 'No activity'}>
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
              {h === 0 ? '12am' : h === 12 ? '12pm' : hourLabel(h)}
            </text>
          );
        })}
        <text x={c} y={c - 6} className="clock-peak" textAnchor="middle">
          {total ? hourLabel(peak) : '—'}
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

// A question about the read, answered from the same week's numbers.
function AskWeek({ id, lowest }: { id: string; lowest?: Grade }) {
  const [q, setQ] = useState(''),
    [thread, setThread] = useState<{ q: string; a: string }[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const suggestions = [
    lowest ? `Why is ${GRADE_LABEL[lowest.key].toLowerCase()} ${lowest.score}?` : '',
    'What should I change first?',
    'What went best this week?',
  ].filter(Boolean);
  async function ask(question: string) {
    const text = question.trim();
    if (text.length < 3 || busy) return;
    setBusy(true);
    setError('');
    try {
      const { answer } = await api<{ answer: string }>('/api/insights', { action: 'ask', id, question: text });
      setThread((t) => [...t, { q: text, a: answer }]);
      setQ('');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="ins-ask" data-reveal aria-label="Ask about this week">
      <p className="eyebrow">Ask about this week</p>
      {thread.map((t, i) => (
        <div key={i} className="ask-turn">
          <p className="ask-q">{t.q}</p>
          <p className="ask-a serif">{t.a}</p>
        </div>
      ))}
      {!thread.length && (
        <div className="chips">
          {suggestions.map((s) => (
            <button key={s} className="chip" onClick={() => void ask(s)} disabled={busy}>
              {s}
            </button>
          ))}
        </div>
      )}
      <form
        className="ask-form"
        onSubmit={(e) => {
          e.preventDefault();
          void ask(q);
        }}
      >
        <input
          className="input"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          maxLength={300}
          placeholder="Why did retention drop?"
          aria-label="Your question about this week"
          enterKeyHint="send"
        />
        <button className="btn primary icon" disabled={q.trim().length < 3 || busy} data-busy={busy || undefined} aria-label="Ask">
          {!busy && <Icon name="send" size={18} />}
        </button>
      </form>
      {error && <p className="conversation-error">{error}</p>}
    </section>
  );
}

function HowGrades({ onClose }: { onClose: () => void }) {
  return (
    <Sheet title="How grades work" subtitle="The same fixed anchors every week." onClose={onClose}>
      <ul className="bands">
        {GRADE_BANDS.map((b) => (
          <li key={b.from} className={'b-' + band(b.from)}>
            <span className="num band-range">
              {b.from}–{b.to}
            </span>
            <span>
              <b>{b.label}</b> {b.note}
            </span>
          </li>
        ))}
      </ul>
      <p className="muted">
        60 means doing what the plan asks, well. Grades aren’t adjusted to encourage you or to push you, and an area without enough evidence is
        left ungraded rather than guessed.
      </p>
      <ul className="band-areas">
        {GRADE_KEYS.map((k) => (
          <li key={k}>
            <b>{GRADE_LABEL[k]}</b>
            <span>{GRADE_HINT[k]}</span>
          </li>
        ))}
      </ul>
    </Sheet>
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
