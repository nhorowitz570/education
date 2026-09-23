'use client';
import { useId, useMemo, type CSSProperties } from 'react';
import type { Viz } from '@/lib/viz/schema';
import { Empty } from './charts';
import { arr, clamp, fit, num, overlaps, str, tc, textWidth, toneOf, useWidth, type Box } from './util';

type Of<T extends Viz['type']> = Extract<Viz, { type: T }>;
const vars = (o: Record<string, string | number>) => o as CSSProperties;

const Chevron = () => (
  <svg className="viz-chev" viewBox="0 0 16 16" aria-hidden>
    <path d="M6 3.5 10.5 8 6 12.5" />
  </svg>
);

// ---------- Flow ----------
export function Flow({ spec, label }: { spec: Of<'flow'>; label: string }) {
  const steps = arr(spec.steps).filter(Boolean);
  if (!steps.length) return <Empty />;
  return (
    <div className="viz-flow-wrap" data-loops={spec.loops ? '' : undefined}>
      <ol className="viz-flow" aria-label={label} data-many={steps.length > 4 ? '' : undefined}>
        {steps.map((s, i) => (
          <li key={i} className={`viz-step ${tc(s.tone)}`} style={vars({ '--i': i })}>
            <div className="viz-step-tile">
              <b title={str(s.label)}>
                <i className="viz-dot" />
                {str(s.label)}
              </b>
              {s.detail && <p>{s.detail}</p>}
            </div>
            {i < steps.length - 1 && <Chevron />}
          </li>
        ))}
      </ol>
      {spec.loops && steps.length > 1 && (
        <div className="viz-flow-loop" aria-label="Repeats from the first step">
          <span>repeats</span>
        </div>
      )}
    </div>
  );
}

// ---------- Timeline ----------
export function Timeline({ spec, label }: { spec: Of<'timeline'>; label: string }) {
  const events = arr(spec.events).filter(Boolean);
  if (!events.length) return <Empty />;
  return (
    <ol className="viz-tl" aria-label={label} data-dense={events.length > 5 ? '' : undefined}
      style={vars({ '--n': events.length })}>
      {events.map((e, i) => (
        <li key={i} className={tc(e.tone)} style={vars({ '--i': i })}>
          <i className="viz-tl-dot" />
          <time className="num">{str(e.when)}</time>
          <b>{str(e.label)}</b>
          {e.detail && <p>{e.detail}</p>}
        </li>
      ))}
    </ol>
  );
}

// ---------- Compare ----------
export function Compare({ spec, label }: { spec: Of<'compare'>; label: string }) {
  const rows = arr(spec.rows).filter(Boolean);
  const cols = arr(spec.columns).filter(Boolean);
  const n = cols.length || Math.max(0, ...rows.map((r) => arr(r.cells).length));
  if (!n || !rows.length) return <Empty />;
  const heads = Array.from({ length: n }, (_, i) => cols[i] ?? { heading: '', tone: 'default' as const });
  return (
    <div className="viz-scroll">
      <table className="viz-cmp" aria-label={label}>
        <thead>
          <tr>
            <td />
            {heads.map((c, i) => (
              <th key={i} scope="col" className={tc(c.tone)}>
                <i className="viz-dot" />
                {str(c.heading)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              <th scope="row">{str(r.label)}</th>
              {heads.map((c, j) => {
                const v = str(arr(r.cells)[j]).trim();
                return (
                  <td key={j} className={toneOf(c.tone) === 'accent' ? 'is-accent' : ''}>
                    {v || <span className="viz-nil">—</span>}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------- Matrix ----------
export function Matrix({ spec, label }: { spec: Of<'matrix'>; label: string }) {
  const [ref, w] = useWidth<HTMLDivElement>();
  const W = w,
    H = Math.round(Math.min(420, w / 1.2));
  const items = arr(spec.items).filter(Boolean);
  const placed = useMemo(() => {
    if (!W) return [];
    const inset = 14;
    const boxes: Box[] = [];
    const pts = items.map((it) => ({
      it,
      x: inset + clamp(num(it.x, 0.5), 0, 1) * (W - 2 * inset),
      y: inset + (1 - clamp(num(it.y, 0.5), 0, 1)) * (H - 2 * inset),
    }));
    pts.forEach((p) => boxes.push({ x: p.x - 6, y: p.y - 6, w: 12, h: 12 }));
    return pts.map((p) => {
      const text = fit(str(p.it.label), W * 0.42, 12, 500);
      const tw = textWidth(text, 12, 500),
        th = 14;
      // Candidate spots around the dot, clamped inside the plot.
      const cands = [
        [p.x + 10, p.y - th / 2],
        [p.x - 10 - tw, p.y - th / 2],
        [p.x - tw / 2, p.y - 10 - th],
        [p.x - tw / 2, p.y + 10],
        [p.x + 10, p.y - th - 6],
        [p.x + 10, p.y + 6],
        [p.x - 10 - tw, p.y - th - 6],
        [p.x - 10 - tw, p.y + 6],
      ].map(([x, y]) => ({ x: clamp(x, 2, W - tw - 2), y: clamp(y, 2, H - th - 2), w: tw, h: th }));
      const hits = (c: Box) => boxes.filter((b) => overlaps(c, b)).length;
      const pick = cands.find((c) => !hits(c)) ?? [...cands].sort((a, b) => hits(a) - hits(b))[0];
      boxes.push(pick);
      const tx = pick.x;
      return { ...p, text, full: str(p.it.label), tx, ty: pick.y + th - 3 };
    });
  }, [W, H, items]);
  const x = spec.x_axis ?? { label: '', low: '', high: '' },
    y = spec.y_axis ?? { label: '', low: '', high: '' };
  const aria = `${label}. ${items
    .map((it) => `${str(it.label)}: ${str(x.label)} ${Math.round(num(it.x) * 100)}%, ${str(y.label)} ${Math.round(num(it.y) * 100)}%`)
    .join('; ')}`;
  return (
    <div className="viz-mx">
      <div className="viz-mx-y" aria-hidden>
        <span>{str(y.low)}</span>
        <b>{str(y.label)}</b>
        <span>{str(y.high)}</span>
      </div>
      <div ref={ref} className="viz-plot" style={{ height: H || undefined }} role="img" aria-label={aria}>
        {W > 0 && (
          <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
            <rect className="viz-mx-bg" width={W} height={H} rx={14} />
            <path className="viz-mx-q" d={`M${W / 2} 0H${W - 14}a14 14 0 0 1 14 14V${H / 2}H${W / 2}Z`} />
            <line className="viz-mx-axis" x1={W / 2} x2={W / 2} y1={0} y2={H} />
            <line className="viz-mx-axis" x1={0} x2={W} y1={H / 2} y2={H / 2} />
            {placed.map((p, i) => (
              <g key={i} className={`viz-mx-item ${tc(p.it.tone)}`} style={vars({ '--i': i })}>
                <title>{p.full}</title>
                <circle cx={p.x} cy={p.y} r={5.5} />
                <text x={p.tx} y={p.ty}>
                  {p.text}
                </text>
              </g>
            ))}
          </svg>
        )}
      </div>
      <span />
      <div className="viz-mx-x" aria-hidden>
        <span>{str(x.low)}</span>
        <b>{str(x.label)}</b>
        <span>{str(x.high)}</span>
      </div>
    </div>
  );
}

// ---------- Concepts ----------
type N = { id: string; label: string; tone: string; emphasis: boolean };
function layoutConcepts(nodes: N[], edges: { from: string; to: string; label: string }[], W: number) {
  const idx = new Map(nodes.map((n, i) => [n.id, i]));
  const out: number[][] = nodes.map(() => []);
  const E = edges.filter((e) => idx.has(e.from) && idx.has(e.to) && e.from !== e.to);
  E.forEach((e) => out[idx.get(e.from)!].push(idx.get(e.to)!));
  // DFS: drop back-edges (cycles) and collect a topological order.
  const state = nodes.map(() => 0),
    order: number[] = [];
  const dag: number[][] = nodes.map(() => []);
  const visit = (v: number) => {
    state[v] = 1;
    for (const t of out[v]) {
      if (state[t] === 1) continue;
      dag[v].push(t);
      if (!state[t]) visit(t);
    }
    state[v] = 2;
    order.push(v);
  };
  nodes.forEach((_, v) => !state[v] && visit(v));
  const level = nodes.map(() => 0);
  for (const v of order.reverse()) for (const t of dag[v]) level[t] = Math.max(level[t], level[v] + 1);
  const linked = new Set(E.flatMap((e) => [idx.get(e.from)!, idx.get(e.to)!]));
  const maxL = Math.max(0, ...[...linked].map((v) => level[v]));
  nodes.forEach((_, v) => !linked.has(v) && linked.size && (level[v] = maxL + 1));

  const H = 34,
    gap = 14;
  const size = nodes.map((n) => {
    const text = fit(n.label, Math.min(200, W - 40), 13, 500);
    const dot = !n.emphasis && (n.tone === 'positive' || n.tone === 'negative');
    return { text, w: textWidth(text, 13, 500) + 30 + (dot ? 14 : 0), dot };
  });
  const parents: number[][] = nodes.map(() => []);
  E.forEach((e) => parents[idx.get(e.to)!].push(idx.get(e.from)!));
  const pos: { x: number; y: number }[] = nodes.map(() => ({ x: 0, y: 0 }));
  const rows: number[][] = [];
  const levels = [...new Set(level)].sort((a, b) => a - b);
  const placedX = new Map<number, number>();
  for (const l of levels) {
    let group = nodes.map((_, v) => v).filter((v) => level[v] === l);
    const bary = (v: number) => {
      const ps = parents[v].filter((p) => placedX.has(p));
      return ps.length ? ps.reduce((s, p) => s + placedX.get(p)!, 0) / ps.length : Infinity;
    };
    group = group.map((v, i) => ({ v, b: bary(v), i })).sort((a, b) => a.b - b.b || a.i - b.i).map((o) => o.v);
    // Wrap a level into several rows when it is wider than the canvas.
    let row: number[] = [],
      used = 0;
    for (const v of group) {
      if (row.length && used + gap + size[v].w > W) {
        rows.push(row);
        row = [];
        used = 0;
      }
      used += (row.length ? gap : 0) + size[v].w;
      row.push(v);
    }
    if (row.length) rows.push(row);
    // Position this level's rows now so the next level can order by them:
    // evenly slotted, then pulled under their parents, then de-overlapped.
    for (const r of rows.filter((r) => level[r[0]] === l)) {
      const total = r.reduce((sum, v) => sum + size[v].w, 0) + gap * (r.length - 1);
      const slot = Math.min(W / r.length, 240);
      const slotted = total <= slot * r.length;
      let x = (W - total) / 2;
      const want = r.map((v, k) => {
        const packed = x + size[v].w / 2;
        x += size[v].w + gap;
        const b = bary(v);
        const base = slotted ? (W - slot * r.length) / 2 + slot * (k + 0.5) : packed;
        return Number.isFinite(b) ? b : base;
      });
      const half = (k: number) => size[r[k]].w / 2;
      for (let k = 0; k < r.length; k++) {
        want[k] = Math.max(want[k], half(k));
        if (k) want[k] = Math.max(want[k], want[k - 1] + half(k - 1) + gap + half(k));
      }
      for (let k = r.length - 1; k >= 0; k--) {
        want[k] = Math.min(want[k], W - half(k));
        if (k < r.length - 1) want[k] = Math.min(want[k], want[k + 1] - half(k + 1) - gap - half(k));
      }
      r.forEach((v, k) => placedX.set(v, want[k]));
    }
  }
  const hasLabels = E.some((e) => e.label);
  const same = E.some((e) => rows.findIndex((r) => r.includes(idx.get(e.from)!)) === rows.findIndex((r) => r.includes(idx.get(e.to)!)));
  const rowGap = hasLabels ? 88 : 68,
    top = same ? 34 : 4;
  rows.forEach((r, ri) => r.forEach((v) => (pos[v] = { x: placedX.get(v)!, y: top + H / 2 + ri * rowGap })));
  const rowOf = (v: number) => rows.findIndex((r) => r.includes(v));

  // Spread several edges leaving (or entering) one pill across its edge.
  const port = new Map<string, number>();
  const spread = (key: 'from' | 'to', other: 'from' | 'to') => {
    const groups = new Map<number, typeof E>();
    E.forEach((e) => {
      const v = idx.get(e[key])!;
      groups.set(v, [...(groups.get(v) ?? []), e]);
    });
    groups.forEach((es, v) => {
      es.sort((x, y) => pos[idx.get(x[other])!].x - pos[idx.get(y[other])!].x);
      const gap = Math.min(16, size[v].w / (es.length + 1));
      es.forEach((e, k) => port.set(`${key}${E.indexOf(e)}`, (k - (es.length - 1) / 2) * gap));
    });
  };
  spread('from', 'to');
  spread('to', 'from');
  const blocked: Box[] = nodes.map((_, v) => ({
    x: pos[v].x - size[v].w / 2,
    y: pos[v].y - H / 2,
    w: size[v].w,
    h: H,
  }));
  const links = E.map((e, ei) => {
    const a = idx.get(e.from)!,
      b = idx.get(e.to)!;
    const s = { x: pos[a].x + (port.get(`from${ei}`) ?? 0), y: pos[a].y },
      t = { x: pos[b].x + (port.get(`to${ei}`) ?? 0), y: pos[b].y };
    const ra = rowOf(a),
      rb = rowOf(b);
    let p: number[];
    if (ra === rb) {
      const sx = s.x + (t.x > s.x ? 1 : -1) * size[a].w * 0.25,
        tx = t.x - (t.x > s.x ? 1 : -1) * size[b].w * 0.25;
      p = [sx, s.y - H / 2, sx, s.y - H / 2 - 30, tx, t.y - H / 2 - 30, tx, t.y - H / 2 - 3];
    } else {
      const down = rb > ra;
      const sy = s.y + (down ? H / 2 : -H / 2),
        ty = t.y + (down ? -H / 2 - 3 : H / 2 + 3);
      const my = (sy + ty) / 2;
      p = [s.x, sy, s.x, my, t.x, my, t.x, ty];
    }
    // Edge label: the first point along the curve that keeps clear of pills
    // and of labels already placed.
    const label = e.label ? fit(e.label, 130, 11) : '';
    const lw = textWidth(label, 11) + 6;
    const at = (t: number) => {
      const u = 1 - t;
      return [
        u * u * u * p[0] + 3 * u * u * t * p[2] + 3 * u * t * t * p[4] + t * t * t * p[6],
        u * u * u * p[1] + 3 * u * u * t * p[3] + 3 * u * t * t * p[5] + t * t * t * p[7],
      ];
    };
    let [mx, my] = at(0.5);
    if (label) {
      for (const t of [0.5, 0.38, 0.62, 0.28, 0.72]) {
        const [x, y] = at(t);
        const box = { x: x - lw / 2, y: y - 8, w: lw, h: 16 };
        if (!blocked.some((b) => overlaps(box, b, 1))) {
          [mx, my] = [x, y];
          break;
        }
      }
      blocked.push({ x: mx - lw / 2, y: my - 8, w: lw, h: 16 });
    }
    return {
      d: `M${p[0]},${p[1]}C${p[2]},${p[3]} ${p[4]},${p[5]} ${p[6]},${p[7]}`,
      label,
      full: e.label,
      mx,
      my,
    };
  });
  const height = top + H + Math.max(0, rows.length - 1) * rowGap + 4;
  return { pos, size, links, height, H };
}

export function Concepts({ spec, label }: { spec: Of<'concepts'>; label: string }) {
  const [ref, w] = useWidth<HTMLDivElement>();
  const mid = useId().replace(/:/g, '');
  const nodes = useMemo(() => {
    const seen = new Set<string>();
    return arr(spec.nodes)
      .filter((n) => n && str(n.id) && !seen.has(str(n.id)) && seen.add(str(n.id)))
      .map((n) => ({ id: str(n.id), label: str(n.label) || str(n.id), tone: toneOf(n.tone), emphasis: !!n.emphasis }));
  }, [spec.nodes]);
  const edges = useMemo(
    () => arr(spec.edges).filter(Boolean).map((e) => ({ from: str(e.from), to: str(e.to), label: str(e.label) })),
    [spec.edges],
  );
  const L = useMemo(() => (w && nodes.length ? layoutConcepts(nodes, edges, w) : null), [w, nodes, edges]);
  if (!nodes.length) return <Empty />;
  const byId = new Map(nodes.map((n) => [n.id, n.label]));
  const aria = `${label}. ${edges
    .filter((e) => byId.has(e.from) && byId.has(e.to))
    .map((e) => `${byId.get(e.from)} ${e.label || 'relates to'} ${byId.get(e.to)}`)
    .join('; ')}`;
  return (
    <div ref={ref} className="viz-plot viz-cm" style={{ height: L?.height ?? 160 }} role="img" aria-label={aria}>
      {L && (
        <svg width={w} height={L.height} viewBox={`0 0 ${w} ${L.height}`}>
          <defs>
            <marker id={`${mid}h`} viewBox="0 0 8 8" refX="6" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M1 1.2 6.4 4 1 6.8" className="viz-cm-head" />
            </marker>
          </defs>
          {L.links.map((l, i) => (
            <path key={i} d={l.d} className="viz-cm-edge" markerEnd={`url(#${mid}h)`} style={vars({ '--i': i })} />
          ))}
          {nodes.map((n, i) => {
            const p = L.pos[i],
              s = L.size[i];
            return (
              <g
                key={n.id}
                className={`viz-cm-node ${tc(n.tone)}${n.emphasis ? ' is-em' : ''}`}
                style={vars({ '--i': i })}
                transform={`translate(${p.x - s.w / 2} ${p.y - L.H / 2})`}
              >
                <title>{n.label}</title>
                <rect width={s.w} height={L.H} rx={L.H / 2} />
                {s.dot && <circle cx={17} cy={L.H / 2} r={3.5} className="viz-cm-dot" />}
                <text x={s.w / 2 + (s.dot ? 7 : 0)} y={L.H / 2 + 4.5} textAnchor="middle">
                  {s.text}
                </text>
              </g>
            );
          })}
          {L.links.map((l, i) =>
            l.label ? (
              <text key={i} x={l.mx} y={l.my + 4} className="viz-cm-elabel" textAnchor="middle">
                <title>{l.full}</title>
                {l.label}
              </text>
            ) : null,
          )}
        </svg>
      )}
    </div>
  );
}

// ---------- Spectrum ----------
export function Spectrum({ spec, label }: { spec: Of<'spectrum'>; label: string }) {
  const [ref, w] = useWidth<HTMLDivElement>();
  const gid = useId().replace(/:/g, '');
  const markers = useMemo(
    () =>
      arr(spec.markers)
        .filter(Boolean)
        .map((m) => ({ label: str(m.label), pos: clamp(num(m.position, 0.5), 0, 1), tone: toneOf(m.tone) }))
        .sort((a, b) => a.pos - b.pos),
    [spec.markers],
  );
  const L = useMemo(() => {
    if (!w) return null;
    const pad = 10,
      lh = 16;
    const taken: Box[][] = [];
    const lanes = [-1, 1, -2, 2, -3, 3];
    const placed = markers.map((m) => {
      const x = pad + m.pos * (w - 2 * pad);
      const text = fit(m.label, Math.max(80, w * 0.42), 12, 500);
      const tw = textWidth(text, 12, 500);
      const bx = clamp(x - tw / 2, 0, w - tw);
      const box = { x: bx, y: 0, w: tw, h: 1 };
      let lane = lanes.find((l) => !(taken[l + 3] ?? []).some((b) => overlaps(box, b, 8))) ?? lanes[0];
      (taken[lane + 3] ??= []).push(box);
      return { ...m, x, text, tx: bx + tw / 2, lane };
    });
    const up = Math.max(0, ...placed.map((p) => -p.lane)),
      down = Math.max(0, ...placed.map((p) => p.lane));
    const ty = 14 + up * lh + 4;
    const height = ty + 14 + down * lh + 2;
    return {
      ty,
      height,
      placed: placed.map((p) => ({
        ...p,
        ly: p.lane < 0 ? ty - 14 - (-p.lane - 1) * lh : ty + 24 + (p.lane - 1) * lh,
      })),
    };
  }, [w, markers]);
  const aria = `${label}. From ${str(spec.left)} to ${str(spec.right)}: ${markers
    .map((m) => `${m.label} at ${Math.round(m.pos * 100)}%`)
    .join('; ')}`;
  return (
    <div className="viz-spec">
      <div ref={ref} className="viz-plot" style={{ height: L?.height ?? 60 }} role="img" aria-label={aria}>
        {L && (
          <svg width={w} height={L.height} viewBox={`0 0 ${w} ${L.height}`}>
            <defs>
              <linearGradient id={`${gid}t`}>
                <stop offset="0" className="viz-spec-end" />
                <stop offset="0.5" className="viz-spec-mid" />
                <stop offset="1" className="viz-spec-end" />
              </linearGradient>
            </defs>
            <rect x={0} y={L.ty - 1} width={w} height={2} rx={1} fill={`url(#${gid}t)`} />
            <line className="viz-spec-centre" x1={w / 2} x2={w / 2} y1={L.ty - 5} y2={L.ty + 5} />
            {L.placed.map((p, i) => (
              <g key={i} className={`viz-spec-m ${tc(p.tone)}`} style={vars({ '--i': i })}>
                <title>{p.label}</title>
                {Math.abs(p.lane) > 1 && (
                  <line className="viz-spec-lead" x1={p.x} x2={p.x}
                    y1={p.lane < 0 ? p.ly + 4 : L.ty + 8} y2={p.lane < 0 ? L.ty - 8 : p.ly - 12} />
                )}
                <circle cx={p.x} cy={L.ty} r={6} />
                <text x={p.tx} y={p.ly} textAnchor="middle">
                  {p.text}
                </text>
              </g>
            ))}
          </svg>
        )}
      </div>
      <div className="viz-spec-poles" aria-hidden>
        <span>{str(spec.left)}</span>
        <span>{str(spec.right)}</span>
      </div>
    </div>
  );
}
