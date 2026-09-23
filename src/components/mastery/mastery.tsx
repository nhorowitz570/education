'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/client/api';
import { useCached } from '@/lib/client/cached';
import { Sheet, dateLabel } from '@/components/ui';
import { useApp } from '@/components/app/provider';
import { MODES, type Mode } from '@/lib/practice/harness';
import { Icon } from '@/components/icons';
import { fresh, projected, type Calibration, type ConceptState } from '@/lib/learning/model';
import type { RunView } from '@/lib/learning/run';

type Concept = {
  key: string;
  title: string;
  track: string;
  summary: string;
  prerequisites: string[];
  sessions: string[];
  position: number;
  strength: number;
  recall: number;
  level: 'new' | 'learning' | 'practiced' | 'solid' | 'mastered';
  due_at: string | null;
  last_seen_at: string | null;
  successes: number;
  lapses: number;
  misconceptions: string[];
  model?: { p_known: number; stability: number; exposures: number; last_seen_at: string | null } | null;
};
type Data = {
  concepts: Concept[];
  mapped: boolean;
  hasPlan: boolean;
  evidence: { run: string; title: string; date: string; text: string; verdict: string | null }[];
  practice: { id: string; title: string; date: string; mode: Mode; score: number | null; headline: string | null }[];
  history: { id: string; kind: string; title: string; date: string; summary: string | null }[];
  weeks: { week: string; count: number; solid: number }[];
  calibration?: Calibration;
  milestones?: { date: string; title: string }[];
};
type Portfolio = {
  count: number;
  groups: { title: string; date: string; items: { run: string; title: string; date: string; text: string; verdict: string | null }[] }[];
};

// Days ahead the map can look, assuming nothing is reviewed in between.
const AHEAD = [
  { days: 0, label: 'Today' },
  { days: 3, label: '3 days' },
  { days: 7, label: '1 week' },
  { days: 14, label: '2 weeks' },
  { days: 30, label: '1 month' },
];
const RANK: Record<Concept['level'], number> = { new: 0, learning: 1, practiced: 2, solid: 3, mastered: 4 };

// The concept as the forgetting curve expects it to be at a future moment.
function project(c: Concept, at: number): Concept {
  if (!c.model) return c;
  const s: ConceptState = { ...fresh(c.key), ...c.model };
  const p = projected(s, at);
  return { ...c, strength: p.strength, recall: p.recall, level: p.level };
}
const LEVEL_R: Record<Concept['level'], number> = { new: 3.2, learning: 4.2, practiced: 5.2, solid: 6.2, mastered: 7.2 };
const LEVEL_LABEL: Record<Concept['level'], string> = {
  new: 'Not started',
  learning: 'Learning',
  practiced: 'Practised',
  solid: 'Solid',
  mastered: 'Mastered',
};

export function Mastery() {
  const { user } = useApp();
  const { data, error, refresh } = useCached<Data>('/api/mastery', user.id);
  const [focus, setFocus] = useState<Concept | null>(null);
  const [ahead, setAhead] = useState(0);
  const [now] = useState(() => Date.now());
  const today = useMemo(() => data?.concepts || [], [data]);
  const concepts = useMemo(
    () => (ahead ? today.map((c) => project(c, now + ahead * 86400000)) : today),
    [today, ahead, now],
  );
  // Older no-plan responses may still be in session storage after a deploy.
  const noPlan = data &&
    (data.hasPlan === false || (data.hasPlan === undefined && !data.weeks && !data.history));
  if (noPlan)
    return (
      <div className="page mastery">
        <header className="page-head">
          <div>
            <p className="eyebrow">Mastery</p>
            <h1 className="title">Your map starts with a plan.</h1>
          </div>
        </header>
        <Link className="btn primary" href="/import">
          Import a plan
        </Link>
      </div>
    );
  const touched = concepts.filter((c) => c.level !== 'new');
  const fading = touched.filter((c) => c.due_at && Date.parse(c.due_at) <= now + ahead * 86400000);
  const solid = touched.filter((c) => c.level === 'solid' || c.level === 'mastered');
  return (
    <div className="page mastery">
      <header className="page-head">
        <div>
          <p className="eyebrow">Mastery</p>
          <h1 className="title">What you can do.</h1>
        </div>
        <Link href="/insights" className="btn quiet insights-link">
          <Icon name="insights" size={17} /> Weekly insights
        </Link>
      </header>
      <div className="mastery-stats">
        <div className="stat">
          <b className="num">{touched.length}</b>
          <span>ideas practised</span>
        </div>
        <div className="stat">
          <b className="num" style={{ color: solid.length ? 'var(--positive)' : undefined }}>
            {solid.length}
          </b>
          <span>solid or better</span>
        </div>
        <div className="stat">
          <b className="num" style={{ color: fading.length ? 'var(--review)' : undefined }}>
            {fading.length}
          </b>
          <span>ready to review</span>
        </div>
        <div className="stat">
          <b className="num">{concepts.length}</b>
          <span>in the plan{data && !data.mapped ? ' (mapping)' : ''}</span>
        </div>
      </div>

      {data && today.some((c) => c.model) && (
        <Forecast today={today} concepts={concepts} ahead={ahead} onAhead={setAhead} />
      )}
      {data ? (
        <KnowledgeMap concepts={concepts} onPick={setFocus} ahead={ahead > 0} />
      ) : error ? (
        <div className="today-error">
          <p className="heading">Mastery couldn’t load.</p>
          <p className="muted">{error}</p>
          <button className="btn" onClick={() => void refresh()}>
            Try again
          </button>
        </div>
      ) : (
        <div className="skeleton" style={{ height: 260, borderRadius: 20 }} />
      )}

      <div className="mastery-grid">
        {data?.weeks && (
          <section>
            <p className="eyebrow">Momentum · 8 weeks</p>
            <Momentum weeks={data.weeks} />
          </section>
        )}
        {data?.calibration && <CalibrationChart c={data.calibration} />}
        {data && (data.practice?.length || 0) > 0 && (
          <section>
            <p className="eyebrow">Speaking practice</p>
            <div className="rows">
              {data.practice.slice(0, 6).map((p) => (
                <Link key={p.id} href={'/practice/' + p.id} className="row">
                  <i className={'dot ' + (p.score === null ? 'hollow' : p.score >= 0.75 ? 'v-solid' : p.score >= 0.4 ? 'v-partial' : 'v-missed')} />
                  <div className="grow">
                    <p>{p.title}</p>
                    <p className="sub">
                      {MODES[p.mode]?.label} · {dateLabel(p.date.slice(0, 10), false)}
                    </p>
                  </div>
                  {p.score !== null && <span className="num label">{Math.round(p.score * 100)}</span>}
                </Link>
              ))}
            </div>
          </section>
        )}
      </div>

      {data?.weeks && <PortfolioSection milestones={data.milestones || []} />}

      {data && (data.history?.length || 0) > 0 && (
        <section className="mastery-section">
          <p className="eyebrow">Sessions</p>
          <div className="rows">
            {data.history.slice(0, 20).map((h) => (
              <Link key={h.id} className="row" href={'/session/' + h.id}>
                <div className="grow">
                  <p>{h.title}</p>
                  <p className="sub">{h.summary || (h.kind === 'review' ? 'Review' : h.kind === 'explore' ? 'Exploration' : 'Session')}</p>
                </div>
                <span className="label">{dateLabel(h.date.slice(0, 10), false)}</span>
              </Link>
            ))}
          </div>
        </section>
      )}
      {focus && <ConceptSheet concept={focus} all={concepts} onClose={() => setFocus(null)} />}
    </div>
  );
}

// Every concept in the plan: tracks as bands, curriculum order left to
// right, size and light by level. The shape of what you know.
function useNarrow() {
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const q = matchMedia('(max-width: 600px)');
    const on = () => setNarrow(q.matches);
    on();
    q.addEventListener('change', on);
    return () => q.removeEventListener('change', on);
  }, []);
  return narrow;
}

function KnowledgeMap({ concepts, onPick, ahead = false }: { concepts: Concept[]; onPick: (c: Concept) => void; ahead?: boolean }) {
  const { w } = useApp();
  // Time runs left to right: each concept sits at its first session.
  const order = useMemo(() => {
    const m = new Map<string, number>();
    (w.state.plan?.sessions || []).forEach((s, i) => m.set(s.id, i));
    return m;
  }, [w.state.plan]);
  const when = (c: Concept) => Math.min(...c.sessions.map((s) => order.get(s) ?? c.position), Number.MAX_SAFE_INTEGER);
  const tracks = useMemo(() => {
    const first = new Map<string, number>();
    for (const c of concepts) first.set(c.track, Math.min(first.get(c.track) ?? Infinity, c.position));
    return [...first.keys()].sort((a, b) => first.get(a)! - first.get(b)!);
  }, [concepts]);
  // Phones read time top to bottom, one column per track; wider screens
  // read it left to right, one lane per track.
  const vertical = useNarrow();
  const max = Math.max(1, ...concepts.map(when));
  const geo = vertical
    ? { width: 360, top: 40, left: 8, col: (360 - 16) / Math.max(1, tracks.length) }
    : { width: 1000, top: 18, left: 110, band: 64 };
  const span = vertical ? Math.max(420, Math.min(1400, concepts.length * 9)) : 0;
  const height = vertical ? geo.top + span + 24 : geo.top + tracks.length * geo.band! + 10;
  const pos = useMemo(() => {
    const m = new Map<string, { x: number; y: number }>();
    const taken = new Map<string, number>();
    for (const c of [...concepts].sort((a, b) => when(a) - when(b))) {
      const t = tracks.indexOf(c.track);
      const along = when(c) / max;
      // Concepts introduced in the same session sit side by side in the lane.
      const main = vertical ? geo.top + 12 + along * span : geo.left + along * (geo.width - geo.left - 24);
      const slot = `${t}:${Math.round(main / 14)}`;
      const n = taken.get(slot) || 0;
      taken.set(slot, n + 1);
      const offset = n === 0 ? 0 : (n % 2 ? -1 : 1) * Math.ceil(n / 2) * 11;
      m.set(
        c.key,
        vertical
          ? { x: geo.left + t * geo.col! + geo.col! / 2 + offset, y: main }
          : { x: main, y: geo.top + t * geo.band! + geo.band! / 2 + offset },
      );
    }
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [concepts, tracks, order, vertical]);
  if (!concepts.length) return <p className="muted">Import a plan to see its map.</p>;
  return (
    <div className="kmap-wrap">
      <svg className={'kmap' + (vertical ? ' vertical' : '') + (ahead ? ' ahead' : '')} viewBox={`0 0 ${geo.width} ${height}`} role="img" aria-label="Knowledge map of every concept in the plan">
        {tracks.map((t, i) => {
          const label = t[0].toUpperCase() + t.slice(1);
          if (vertical) {
            const x = geo.left + i * geo.col! + geo.col! / 2;
            return (
              <g key={t} className={'t-' + t}>
                <line x1={x} x2={x} y1={geo.top} y2={height - 8} className="kmap-lane" />
                <text x={x} y={16} textAnchor="middle" className="kmap-track">
                  {label}
                </text>
              </g>
            );
          }
          const y = geo.top + i * geo.band! + geo.band! / 2;
          return (
            <g key={t} className={'t-' + t}>
              <line x1={geo.left - 12} x2={geo.width - 12} y1={y} y2={y} className="kmap-lane" />
              <text x={0} y={y + 4} className="kmap-track">
                {label}
              </text>
            </g>
          );
        })}
        {concepts.flatMap((c) =>
          c.prerequisites.map((p) => {
            const a = pos.get(p),
              b = pos.get(c.key);
            if (!a || !b) return null;
            const lit = c.level !== 'new';
            return (
              <path
                key={c.key + p}
                d={
                  vertical
                    ? `M${a.x},${a.y} C${a.x},${(a.y + b.y) / 2} ${b.x},${(a.y + b.y) / 2} ${b.x},${b.y}`
                    : `M${a.x},${a.y} C${(a.x + b.x) / 2},${a.y} ${(a.x + b.x) / 2},${b.y} ${b.x},${b.y}`
                }
                className={'kmap-edge' + (lit ? ' lit' : '')}
              />
            );
          }),
        )}
        {concepts.map((c, i) => {
          const p = pos.get(c.key)!;
          return (
            <g
              key={c.key}
              className={'kmap-node t-' + c.track + ' l-' + c.level}
              transform={`translate(${p.x},${p.y})`}
              style={{ animationDelay: `${Math.min(i * 6, 600)}ms` }}
              tabIndex={0}
              role="button"
              aria-label={`${c.title}: ${LEVEL_LABEL[c.level]}`}
              onClick={() => onPick(c)}
              onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onPick(c)}
            >
              <circle r={14} className="hit" />
              <circle r={LEVEL_R.mastered + 5} className={'halo' + (c.level === 'mastered' ? '' : ' off')} />
              {/* Drawn at full size and scaled, so level changes animate smoothly. */}
              <circle
                r={LEVEL_R.mastered}
                className="core"
                style={{
                  transform: `scale(${LEVEL_R[c.level] / LEVEL_R.mastered})`,
                  opacity: c.level === 'new' ? 1 : 0.3 + c.strength * 0.7,
                }}
              />
              <title>{c.title}</title>
            </g>
          );
        })}
      </svg>
      <div className="kmap-legend">
        {(['new', 'learning', 'practiced', 'solid', 'mastered'] as const).map((l) => (
          <span key={l} className={'l-' + l}>
            <i />
            {LEVEL_LABEL[l]}
          </span>
        ))}
      </div>
    </div>
  );
}

function Momentum({ weeks }: { weeks: Data['weeks'] }) {
  const max = Math.max(4, ...weeks.map((w) => w.count));
  return (
    <div className="momentum" role="img" aria-label="Learning activity over the last eight weeks">
      {weeks.map((w, i) => (
        <div key={w.week} className={'mo-col' + (i === weeks.length - 1 ? ' now' : '')}>
          <div className="mo-bar" style={{ height: `${Math.max(4, (w.count / max) * 100)}%` }}>
            <i style={{ height: w.count ? `${(w.solid / w.count) * 100}%` : 0 }} />
          </div>
          <span className="num">{w.count || ''}</span>
        </div>
      ))}
    </div>
  );
}

function ConceptSheet({ concept, all, onClose }: { concept: Concept; all: Concept[]; onClose: () => void }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const prereqs = all.filter((c) => concept.prerequisites.includes(c.key));
  return (
    <Sheet title={concept.title} subtitle={`${LEVEL_LABEL[concept.level]} · ${concept.track}`} onClose={onClose}>
      {concept.summary && <p className="serif" style={{ fontSize: 18, lineHeight: 1.5 }}>{concept.summary}</p>}
      <div className="concept-stats">
        <div className="stat">
          <b className="num">{Math.round(concept.strength * 100)}</b>
          <span>strength</span>
        </div>
        <div className="stat">
          <b className="num">{Math.round(concept.recall * 100)}</b>
          <span>recall today</span>
        </div>
        <div className="stat">
          <b className="num">{concept.successes}</b>
          <span>successes</span>
        </div>
        {concept.lapses > 0 && (
          <div className="stat">
            <b className="num">{concept.lapses}</b>
            <span>forgotten</span>
          </div>
        )}
      </div>
      {concept.misconceptions.length > 0 && (
        <div className="field">
          <span>Still tricky</span>
          <p>{concept.misconceptions.join('; ')}</p>
        </div>
      )}
      {prereqs.length > 0 && (
        <div className="field">
          <span>Builds on</span>
          <p>{prereqs.map((p) => p.title).join(', ')}</p>
        </div>
      )}
      {concept.last_seen_at && (
        <p className="label">
          Last practised {dateLabel(concept.last_seen_at.slice(0, 10))}
          {concept.due_at ? ` · review ${Date.parse(concept.due_at) <= Date.now() ? 'now' : dateLabel(concept.due_at.slice(0, 10))}` : ''}
        </p>
      )}
      {error && <p className="conversation-error">{error}</p>}
      {concept.level !== 'new' && (
        <button
          className="btn primary"
          data-busy={busy || undefined}
          onClick={async () => {
            setBusy(true);
            try {
              const { run } = await api<{ run: RunView }>('/api/runs', { kind: 'review', concepts: [concept.key] });
              router.push('/session/' + run.id);
            } catch (e) {
              setError((e as Error).message);
              setBusy(false);
            }
          }}
        >
          Review this now
        </button>
      )}
    </Sheet>
  );
}

// Scrub forward in time: the map fades as the forgetting curve says it will
// if nothing is reviewed, which is the honest case for a short review now.
function Forecast({
  today,
  concepts,
  ahead,
  onAhead,
}: {
  today: Concept[];
  concepts: Concept[];
  ahead: number;
  onAhead: (d: number) => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const i = Math.max(0, AHEAD.findIndex((a) => a.days === ahead));
  const before = new Map(today.map((c) => [c.key, c]));
  // Fading: dropping a level, or falling below the 70% recall that "solid" needs.
  const slipping = concepts.filter((c) => {
    const was = before.get(c.key);
    return !!c.model && !!was && (RANK[c.level] < RANK[was.level] || (was.recall >= 0.7 && c.recall < 0.7));
  });
  const solidNow = today.filter((c) => RANK[c.level] >= 3).length,
    solidThen = concepts.filter((c) => RANK[c.level] >= 3).length;
  const avg = (list: Concept[]) => {
    const t = list.filter((c) => c.model);
    return t.length ? Math.round((t.reduce((s, c) => s + c.recall, 0) / t.length) * 100) : 0;
  };
  return (
    <section className="forecast" aria-label="Forgetting forecast">
      <div className="forecast-head">
        <div>
          <p className="eyebrow">If you don’t review</p>
          <p className="forecast-line" aria-live="polite">
            {ahead === 0 ? (
              <>Slide ahead to see what fades without review.</>
            ) : slipping.length ? (
              <>
                In {AHEAD[i].label}, <b className="num">{slipping.length}</b> idea{slipping.length === 1 ? '' : 's'} fade
                {solidNow > solidThen ? (
                  <>
                    {' '}
                    and <b className="num">{solidNow - solidThen}</b> drop below solid
                  </>
                ) : null}
                . Average recall {avg(today)}% → <b className="num">{avg(concepts)}%</b>.
              </>
            ) : (
              <>
                Everything holds for {AHEAD[i].label}. Average recall {avg(today)}% → <b className="num">{avg(concepts)}%</b>.
              </>
            )}
          </p>
        </div>
        {ahead > 0 && slipping.length > 0 && (
          <button
            className="btn primary"
            data-busy={busy || undefined}
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setError('');
              try {
                const keys = [...slipping].sort((a, b) => a.recall - b.recall).slice(0, 6).map((c) => c.key);
                const { run } = await api<{ run: RunView }>('/api/runs', { kind: 'review', concepts: keys });
                router.push('/session/' + run.id);
              } catch (e) {
                setError((e as Error).message);
                setBusy(false);
              }
            }}
          >
            Review these now
          </button>
        )}
      </div>
      <div className="scrub" style={{ '--p': i / (AHEAD.length - 1) } as React.CSSProperties}>
        <input
          type="range"
          min={0}
          max={AHEAD.length - 1}
          step={1}
          value={i}
          onChange={(e) => onAhead(AHEAD[Number(e.target.value)].days)}
          aria-label="Look ahead"
          aria-valuetext={AHEAD[i].label}
        />
        <div className="scrub-stops" aria-hidden="true">
          {AHEAD.map((a, j) => (
            <button key={a.days} tabIndex={-1} className={j === i ? 'on' : ''} onClick={() => onAhead(a.days)}>
              {a.label}
            </button>
          ))}
        </div>
      </div>
      {error && <p className="conversation-error">{error}</p>}
    </section>
  );
}

// Knowing when you know: accuracy at each confidence level.
function CalibrationChart({ c }: { c: Calibration }) {
  const rows = [
    { key: 'low' as const, label: 'Guessing' },
    { key: 'medium' as const, label: 'Fairly sure' },
    { key: 'high' as const, label: 'Certain' },
  ];
  const pct = (k: keyof Calibration) => (c[k].n ? Math.round((c[k].right / c[k].n) * 100) : null);
  const total = c.low.n + c.medium.n + c.high.n;
  const hi = pct('high'),
    lo = pct('low');
  const read =
    total < 6
      ? 'Rate a few more answers and this will show whether your confidence matches your accuracy.'
      : hi !== null && c.high.n >= 3 && hi < 70
        ? `When you feel certain, you’re right ${hi}% of the time. Those are the answers worth double-checking.`
        : hi !== null && lo !== null && hi - lo >= 25
          ? 'Your confidence tracks your accuracy well: when you’re sure, you’re usually right.'
          : lo !== null && c.low.n >= 3 && lo >= 70
            ? `Your guesses are right ${lo}% of the time. You know more than you give yourself credit for.`
            : 'Your confidence and accuracy are close to even. Keep rating honestly and the pattern will sharpen.';
  return (
    <section>
      <p className="eyebrow">Knowing when you know</p>
      <div className="calib" role="img" aria-label={rows.map((r) => `${r.label}: ${pct(r.key) ?? 'no'} percent right`).join(', ')}>
        {rows.map((r, i) => {
          const p = pct(r.key);
          return (
            <div key={r.key} className={'calib-col c-' + r.key}>
              <span className="num calib-pct">{p === null ? '–' : p + '%'}</span>
              <div className="calib-bar">
                <i style={{ height: `${p ?? 0}%`, animationDelay: `${i * 120}ms` }} />
              </div>
              <span className="calib-label">{r.label}</span>
              <span className="label">
                {c[r.key].n} answer{c[r.key].n === 1 ? '' : 's'}
              </span>
            </div>
          );
        })}
      </div>
      <p className="muted calib-read">{read}</p>
    </section>
  );
}

// Everything produced, filed under the milestone it builds toward, with a
// rehearsal for each milestone still ahead.
function PortfolioSection({ milestones }: { milestones: { date: string; title: string }[] }) {
  const { user } = useApp();
  const router = useRouter();
  const { data } = useCached<Portfolio>('/api/portfolio', user.id);
  const [busy, setBusy] = useState(''),
    [error, setError] = useState('');
  const today = new Date().toISOString().slice(0, 10);
  if (!data?.groups || (!data.count && !milestones.length)) return null;
  return (
    <section className="mastery-section portfolio">
      <div className="portfolio-head">
        <p className="eyebrow">
          Portfolio · {data.count} piece{data.count === 1 ? '' : 's'}
        </p>
        {data.count > 0 && (
          <a className="btn small quiet" href="/api/portfolio?format=md" download>
            <Icon name="download" size={15} /> Export
          </a>
        )}
      </div>
      {error && <p className="conversation-error">{error}</p>}
      <div className="portfolio-groups">
        {data.groups.map((g) => {
          const upcoming = !!g.date && g.date >= today;
          return (
            <div key={g.title + g.date} className={'portfolio-group' + (upcoming ? ' upcoming' : '')}>
              <div className="portfolio-milestone">
                <i className="dot lit" />
                <div className="grow">
                  <p>{g.title}</p>
                  {g.date && <p className="label">{dateLabel(g.date, false)}</p>}
                </div>
                {upcoming && (
                  <button
                    className="btn small"
                    data-busy={busy === g.date || undefined}
                    disabled={!!busy}
                    onClick={async () => {
                      setBusy(g.date);
                      setError('');
                      try {
                        const { run } = await api<{ run: RunView }>('/api/runs', { kind: 'rehearsal', milestone: g.date });
                        router.push('/session/' + run.id);
                      } catch (e) {
                        setError((e as Error).message);
                        setBusy('');
                      }
                    }}
                  >
                    <Icon name="target" size={15} /> Rehearse
                  </button>
                )}
              </div>
              {g.items.length ? (
                <div className="evidence">
                  {g.items.map((e, i) => (
                    <article key={e.run + i}>
                      <p className="label">
                        {e.verdict && <i className={'dot v-' + e.verdict} />} {e.title} · {dateLabel(e.date, false)}
                      </p>
                      <p className="serif">{e.text}</p>
                    </article>
                  ))}
                </div>
              ) : (
                <p className="muted portfolio-empty">
                  {upcoming ? 'Nothing filed yet. Work you produce toward this lands here.' : 'No work filed here.'}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
