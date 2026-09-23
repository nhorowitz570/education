'use client';
import { useId, useMemo, type CSSProperties } from 'react';
import type { Viz } from '@/lib/viz/schema';
import {
  arr,
  clamp,
  fit,
  fmt,
  fmtAcct,
  monotonePath,
  niceTicks,
  num,
  str,
  tc,
  textWidth,
  toneOf,
  useWidth,
} from './util';

type Of<T extends Viz['type']> = Extract<Viz, { type: T }>;
const vars = (o: Record<string, string | number>) => o as CSSProperties;

// ---------- Bar ----------
export function BarChart({ spec, label }: { spec: Of<'bar'>; label: string }) {
  const unit = str(spec.unit);
  const bars = arr(spec.bars).map((b) => {
    const value = num(b?.value);
    return {
      label: str(b?.label),
      value,
      pending: clamp(Math.abs(num(b?.pending)), 0, Math.abs(value)),
      tone: toneOf(b?.tone),
      note: str(b?.note),
    };
  });
  if (!bars.length) return <Empty />;
  const lo = Math.min(0, ...bars.map((b) => b.value));
  const hi = Math.max(0, ...bars.map((b) => b.value));
  const span = hi - lo || 1;
  const zero = (-lo / span) * 100;
  const aria = `${label}. ${bars.map((b) => `${b.label}: ${fmt(b.value, unit)}`).join('; ')}`;
  return (
    <div className="viz-bars" role="img" aria-label={aria}>
      {bars.map((b, i) => {
        const neg = b.value < 0;
        const left = ((Math.min(b.value, 0) - lo) / span) * 100;
        const width = (Math.abs(b.value) / span) * 100;
        const p = b.value ? b.pending / Math.abs(b.value) : 0;
        return (
          <div key={i} className={`viz-bar ${tc(b.tone)}`} style={vars({ '--i': i })}>
            <div className="viz-bar-label">
              <span title={b.label}>{b.label}</span>
              {b.note && <small title={b.note}>{b.note}</small>}
            </div>
            <div className="viz-bar-track">
              {lo < 0 && <i className="viz-bar-zero" style={{ left: `${zero}%` }} />}
              <div
                className={'viz-bar-fill' + (neg ? ' neg' : '')}
                style={{ left: `${left}%`, width: `max(${width}%, ${b.value ? 2 : 0}px)` }}
              >
                <i className="solid" style={{ flexGrow: 1 - p }} />
                {p > 0 && <i className="hatch" style={{ flexGrow: p }} />}
              </div>
            </div>
            <div className="viz-bar-value">
              <span className="num">{fmt(b.value, unit)}</span>
              {b.pending > 0 && <small className="num">{fmt(b.pending, unit)} pending</small>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ---------- Line ----------
export function LineChart({ spec, label }: { spec: Of<'line'>; label: string }) {
  const [ref, w] = useWidth<HTMLDivElement>();
  const gid = useId().replace(/:/g, '');
  const unit = str(spec.unit);
  const narrow = w > 0 && w < 480;
  const H = narrow ? 180 : 220;

  const series = useMemo(
    () =>
      arr(spec.series)
        .map((s) => ({
          name: str(s?.name),
          tone: toneOf(s?.tone),
          dashed: !!s?.dashed,
          pts: arr(s?.points)
            .filter((p) => p && Number.isFinite(p.y))
            .map((p) => ({ x: str(p.x), y: p.y })),
        }))
        .filter((s) => s.pts.length),
    [spec.series],
  );

  const m = useMemo(() => {
    if (!w || !series.length) return null;
    const xs: string[] = [];
    const xi = new Map<string, number>();
    for (const s of series)
      for (const p of s.pts) if (!xi.has(p.x)) xi.set(p.x, xs.push(p.x) - 1);
    const ys = series.flatMap((s) => s.pts.map((p) => p.y));
    let lo = Math.min(...ys),
      hi = Math.max(...ys);
    if (lo > 0 && lo < hi * 0.5) lo = 0;
    if (hi < 0 && hi > lo * 0.5) hi = 0;
    const ticks = niceTicks(lo, hi, narrow ? 3 : 4);
    const d0 = ticks[0],
      d1 = ticks[ticks.length - 1];

    const anns = arr(spec.annotations).filter((a) => a && xi.has(str(a.x)));
    const ends = series.map((s) => fmt(s.pts[s.pts.length - 1].y, unit));
    const right = Math.min(84, Math.max(...ends.map((e) => textWidth(e, 12, 500))) + 14);
    const top = anns.length ? 26 : 12,
      bottom = 26;
    const pw = Math.max(40, w - right),
      ph = H - top - bottom;
    const n = xs.length;
    const X = (i: number) => (n === 1 ? pw / 2 : 4 + (i / (n - 1)) * (pw - 8));
    const Y = (v: number) => top + (1 - (v - d0) / (d1 - d0 || 1)) * ph;
    const base = Y(clamp(0, d0, d1));

    const lines = series.map((s, si) => {
      const pts = s.pts
        .map((p) => ({ x: X(xi.get(p.x)!), y: Y(p.y), i: xi.get(p.x)! }))
        .sort((a, b) => a.i - b.i);
      const d = monotonePath(pts);
      const last = pts[pts.length - 1];
      const area =
        s.tone === 'accent' && pts.length > 1
          ? `${d}L${last.x},${base}L${pts[0].x},${base}Z`
          : null;
      return { ...s, pts, d, area, last, end: ends[si], atEnd: last.i === n - 1 };
    });

    // End labels: right of the final point, nudged apart vertically.
    const labels = lines
      .map((l, i) => ({ i, y: l.atEnd ? l.last.y + 4 : l.last.y - 10, x: l.last.x, atEnd: l.atEnd }))
      .sort((a, b) => a.y - b.y);
    for (let k = 1; k < labels.length; k++)
      if (labels[k].atEnd && labels[k - 1].atEnd && labels[k].y - labels[k - 1].y < 14)
        labels[k].y = labels[k - 1].y + 14;

    // X labels thinned to fit; first and last always shown.
    const lw = Math.max(...xs.map((x) => textWidth(x, 11))) + 14;
    const step = Math.max(1, Math.ceil(n / Math.max(1, Math.floor(pw / lw))));
    const shown = xs.map((_, i) => i === 0 || i === n - 1 || (i % step === 0 && n - 1 - i >= step * 0.6));

    const annLabels = anns.map((a) => {
      const x = X(xi.get(str(a.x))!);
      const flip = x > pw * 0.7;
      return { x, flip, text: fit(str(a.label), Math.max(60, pw * 0.4), 11) };
    });

    return { xs, ticks, X, Y, base, pw, top, lines, labels, shown, annLabels, n };
  }, [w, series, spec.annotations, narrow, unit, H]);

  const aria = `${label}. ${series
    .map((s) => `${s.name}${s.dashed ? ' (dashed)' : ''}: ${s.pts.map((p) => `${p.x} ${fmt(p.y, unit)}`).join(', ')}`)
    .join('. ')}`;

  return (
    <div className="viz-line">
      {series.length > 1 && (
        <ul className="viz-legend" aria-hidden>
          {series.map((s, i) => (
            <li key={i} className={tc(s.tone)}>
              <i className={s.dashed ? 'dashed' : ''} />
              {s.name}
            </li>
          ))}
        </ul>
      )}
      <div ref={ref} className="viz-plot" style={{ height: H }} role="img" aria-label={aria}>
        {m && (
          <svg width={w} height={H} viewBox={`0 0 ${w} ${H}`}>
            <defs>
              <linearGradient id={`${gid}a`} x1="0" x2="0" y1="0" y2="1">
                <stop offset="0" className="viz-area-top" />
                <stop offset="1" className="viz-area-bottom" />
              </linearGradient>
            </defs>
            {m.ticks.map((t, i) => (
              <g key={i} className="viz-grid">
                <line x1={0} x2={m.pw} y1={m.Y(t)} y2={m.Y(t)} className={t === 0 || i === 0 ? 'base' : ''} />
              </g>
            ))}
            {m.annLabels.map((a, i) => (
              <g key={i} className="viz-ann">
                <line x1={a.x} x2={a.x} y1={m.top - 8} y2={m.base} />
                <text x={a.flip ? a.x - 5 : a.x + 5} y={m.top - 12} textAnchor={a.flip ? 'end' : 'start'}>
                  {a.text}
                </text>
              </g>
            ))}
            {m.lines.map((l, i) => (
              <g key={i} className={`viz-series ${tc(l.tone)}`} style={vars({ '--i': i })}>
                {l.area && <path d={l.area} className="viz-area" fill={`url(#${gid}a)`} />}
                {l.dashed ? (
                  <>
                    <mask id={`${gid}m${i}`} maskUnits="userSpaceOnUse" x={0} y={0} width={w} height={H}>
                      <path d={l.d} className="viz-draw viz-mask" pathLength={1} />
                    </mask>
                    <path d={l.d} className="viz-stroke dashed" mask={`url(#${gid}m${i})`} />
                  </>
                ) : (
                  <path d={l.d} className="viz-stroke viz-draw" pathLength={1} />
                )}
                <circle cx={l.last.x} cy={l.last.y} r={l.pts.length === 1 ? 4 : 3} className="viz-end" />
              </g>
            ))}
            {m.ticks.map((t, i) =>
              i > 0 ? (
                <text key={i} x={0} y={m.Y(t) - 5} className="viz-tick">
                  {fmt(t, unit)}
                </text>
              ) : null,
            )}
            {m.labels.map((lb) => {
              const l = m.lines[lb.i];
              return (
                <text
                  key={lb.i}
                  x={lb.atEnd ? lb.x + 8 : lb.x}
                  y={lb.y}
                  textAnchor={lb.atEnd ? 'start' : 'middle'}
                  className={`viz-endlabel num ${tc(l.tone)}`}
                >
                  {l.end}
                </text>
              );
            })}
            {m.xs.map((x, i) =>
              m.shown[i] ? (
                <text
                  key={i}
                  x={m.X(i)}
                  y={H - 8}
                  className="viz-tick"
                  textAnchor={m.n === 1 ? 'middle' : i === 0 ? 'start' : i === m.n - 1 ? 'end' : 'middle'}
                >
                  {x}
                </text>
              ) : null,
            )}
          </svg>
        )}
      </div>
      {spec.x_label && <p className="viz-axis-note">{spec.x_label}</p>}
    </div>
  );
}

// ---------- Waterfall ----------
export function Waterfall({ spec, label }: { spec: Of<'waterfall'>; label: string }) {
  const [ref, w] = useWidth<HTMLDivElement>();
  const unit = str(spec.unit);
  const H = 200;
  const cols = useMemo(() => {
    const start = num(spec.start?.value);
    let lvl = start;
    const out = [{ kind: 'start', label: str(spec.start?.label) || 'Start', from: 0, to: start, v: start }];
    for (const s of arr(spec.steps)) {
      const d = num(s?.delta);
      out.push({ kind: d >= 0 ? 'up' : 'down', label: str(s?.label), from: lvl, to: lvl + d, v: d });
      lvl += d;
    }
    out.push({ kind: 'end', label: str(spec.end_label) || 'End', from: 0, to: lvl, v: lvl });
    return out;
  }, [spec]);

  const m = useMemo(() => {
    if (!w) return null;
    const vals = cols.flatMap((c) => [c.from, c.to]);
    const lo = Math.min(0, ...vals),
      hi = Math.max(0, ...vals);
    const top = 22,
      bottom = lo < 0 ? 22 : 6;
    const Y = (v: number) => top + (1 - (v - lo) / (hi - lo || 1)) * (H - top - bottom);
    const band = w / cols.length;
    const bw = Math.min(56, band * 0.62);
    const full = cols.map((c) => fmt(c.v, unit, { sign: c.kind === 'up' || c.kind === 'down' }));
    const compact = full.some((t) => textWidth(t, 11, 500) > band - 4);
    // Labels: wrap within the column when words fit; otherwise stagger them
    // over two rows so each can use two columns of width.
    const stagger = cols.some((c) =>
      c.label.split(/\s+/).some((wd) => textWidth(wd, 11) > band - 6),
    );
    const maxW = stagger ? band * 2 - 8 : band - 4;
    const labels = cols.map((c, i) => {
      const lw = Math.min(maxW, stagger ? textWidth(c.label, 11, c.kind === 'end' ? 500 : 400) + 1 : maxW);
      return {
        left: clamp(band * (i + 0.5) - lw / 2, 0, w - lw),
        width: lw,
        row: stagger ? i % 2 : 0,
      };
    });
    return {
      Y,
      band,
      bw,
      stagger,
      labels,
      zero: Y(0),
      text: compact
        ? cols.map((c) => fmt(c.v, unit, { sign: c.kind === 'up' || c.kind === 'down', compact: true }))
        : full,
    };
  }, [w, cols, unit]);

  const aria = `${label}. ${cols.map((c) => `${c.label}: ${fmt(c.v, unit, { sign: c.kind === 'up' || c.kind === 'down' })}`).join('; ')}`;
  return (
    <div className="viz-wf">
      <div ref={ref} className="viz-plot" style={{ height: H }} role="img" aria-label={aria}>
        {m && (
          <svg width={w} height={H} viewBox={`0 0 ${w} ${H}`}>
            <line x1={0} x2={w} y1={m.zero} y2={m.zero} className="viz-baseline" />
            {cols.map((c, i) => {
              const cx = m.band * (i + 0.5);
              const y1 = m.Y(Math.max(c.from, c.to)),
                y2 = m.Y(Math.min(c.from, c.to));
              const below = Math.max(c.from, c.to) <= 0 && c.to < 0;
              const grow = c.kind === 'down' || (c.to < 0 && c.kind !== 'up') ? 'top' : 'bottom';
              const next = cols[i + 1];
              return (
                <g key={i} className={`viz-wf-col is-${c.kind}`} style={vars({ '--i': i })}>
                  {next && (
                    <line
                      className="viz-connector"
                      x1={cx + m.bw / 2}
                      x2={m.band * (i + 1.5) - m.bw / 2}
                      y1={m.Y(c.to)}
                      y2={m.Y(c.to)}
                    />
                  )}
                  <rect
                    className={`viz-wf-bar grow-${grow}`}
                    x={cx - m.bw / 2}
                    y={y1}
                    width={m.bw}
                    height={Math.max(1.5, y2 - y1)}
                    rx={Math.min(5, m.bw / 4)}
                  />
                  <text x={cx} y={below ? y2 + 15 : y1 - 7} textAnchor="middle" className="viz-wf-value num">
                    {m.text[i]}
                  </text>
                </g>
              );
            })}
          </svg>
        )}
      </div>
      <div className={'viz-wf-labels' + (m?.stagger ? ' stagger' : '')} aria-hidden>
        {m &&
          cols.map((c, i) => (
            <span
              key={i}
              title={c.label}
              className={c.kind === 'end' ? 'is-end' : ''}
              style={{ left: m.labels[i].left, width: m.labels[i].width, top: m.labels[i].row * 15 }}
            >
              {c.label}
            </span>
          ))}
      </div>
    </div>
  );
}

// ---------- Stat ----------
const UP = /^\s*[+▲↑]/,
  DOWN = /^\s*[-−–▼↓]/;
export function Stats({ spec }: { spec: Of<'stat'> }) {
  const items = arr(spec.items).slice(0, 4);
  if (!items.length) return <Empty />;
  return (
    <dl className="viz-stats" data-n={items.length}>
      {items.map((it, i) => {
        const tone = toneOf(it?.tone);
        const delta = str(it?.delta);
        // Tone states the good/bad direction when given; otherwise read the sign.
        const dir =
          tone === 'positive' || tone === 'negative'
            ? tone
            : UP.test(delta)
              ? 'positive'
              : DOWN.test(delta)
                ? 'negative'
                : 'muted';
        return (
          <div key={i} className={`viz-stat ${tc(tone)}`} style={vars({ '--i': i })}>
            <dt>{str(it?.label)}</dt>
            <dd className="viz-stat-value num" title={str(it?.value)}>
              {str(it?.value) || '—'}
            </dd>
            {delta && <dd className={`viz-stat-delta num tone-${dir}`}>{delta}</dd>}
          </div>
        );
      })}
    </dl>
  );
}

// ---------- Statement ----------
export function Statement({ spec, label }: { spec: Of<'statement'>; label: string }) {
  const unit = str(spec.unit);
  const sections = arr(spec.sections).filter((s) => s && (s.heading || arr(s.rows).length));
  if (!sections.length) return <Empty />;
  return (
    <table className="viz-stmt" aria-label={label}>
      {sections.map((s, i) => (
        <tbody key={i}>
          {s.heading && (
            <tr className="viz-stmt-head">
              <th colSpan={2} scope="colgroup">
                {s.heading}
              </th>
            </tr>
          )}
          {arr(s.rows).map((r, j) => {
            const v = num(r?.value, NaN);
            const e = r?.emphasis === 'total' || r?.emphasis === 'subtotal' ? r.emphasis : 'normal';
            return (
              <tr key={j} className={`is-${e}${v < 0 ? ' neg' : ''}`}>
                <th scope="row" title={str(r?.label)}>
                  {str(r?.label)}
                </th>
                <td className="num">{fmtAcct(v, unit)}</td>
              </tr>
            );
          })}
        </tbody>
      ))}
    </table>
  );
}

export function Empty() {
  return <p className="viz-empty">Nothing to show yet.</p>;
}
