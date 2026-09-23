'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/client/api';
import { useCached } from '@/lib/client/cached';
import { Sheet, dateLabel } from '@/components/ui';
import { useApp } from '@/components/app/provider';
import { MODES, type Mode } from '@/lib/practice/harness';
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
};
type Data = {
  concepts: Concept[];
  mapped: boolean;
  hasPlan: boolean;
  evidence: { run: string; title: string; date: string; text: string; verdict: string | null }[];
  practice: { id: string; title: string; date: string; mode: Mode; score: number | null; headline: string | null }[];
  history: { id: string; kind: string; title: string; date: string; summary: string | null }[];
  weeks: { week: string; count: number; solid: number }[];
};
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
  const concepts = data?.concepts || [];
  const touched = concepts.filter((c) => c.level !== 'new');
  const now = Date.now();
  const fading = touched.filter((c) => c.due_at && Date.parse(c.due_at) <= now);
  const solid = touched.filter((c) => c.level === 'solid' || c.level === 'mastered');
  return (
    <div className="page mastery">
      <header className="page-head">
        <div>
          <p className="eyebrow">Mastery</p>
          <h1 className="title">What you can do.</h1>
        </div>
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

      {data ? (
        <KnowledgeMap concepts={concepts} onPick={setFocus} />
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

      {data && (data.evidence?.length || 0) > 0 && (
        <section className="mastery-section">
          <p className="eyebrow">Evidence</p>
          <div className="evidence">
            {data.evidence.map((e) => (
              <article key={e.run + e.date}>
                <p className="label">
                  {e.title} · {dateLabel(e.date.slice(0, 10), false)}
                </p>
                <p className="serif">{e.text}</p>
              </article>
            ))}
          </div>
        </section>
      )}

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

function KnowledgeMap({ concepts, onPick }: { concepts: Concept[]; onPick: (c: Concept) => void }) {
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
      <svg className={'kmap' + (vertical ? ' vertical' : '')} viewBox={`0 0 ${geo.width} ${height}`} role="img" aria-label="Knowledge map of every concept in the plan">
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
              {c.level === 'mastered' && <circle r={LEVEL_R[c.level] + 5} className="halo" />}
              <circle r={LEVEL_R[c.level]} className="core" style={{ opacity: c.level === 'new' ? 1 : 0.35 + c.strength * 0.65 }} />
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
