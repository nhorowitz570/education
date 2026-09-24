'use client';
import { useMemo, type CSSProperties } from 'react';
import type { Viz } from '@/lib/viz/schema';
import { Empty } from './charts';
import { arr, clamp, fit, fmt, num, str, tc, textWidth, useWidth } from './util';

// General-purpose pictures for ideas that aren't quantities: loops,
// hierarchies, shares, trade-offs and overlaps. Like every primitive, they
// render plain data with the app's tokens; nothing generated runs.

type Of<T extends Viz['type']> = Extract<Viz, { type: T }>;
const vars = (o: Record<string, string | number>) => o as CSSProperties;

// Up to two lines per item, then an ellipsis.
function wrap(text: string, max: number, size: number, weight: number) {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const next = line ? line + ' ' + word : word;
    if (textWidth(next, size, weight) <= max || !line) line = next;
    else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  if (lines.length <= 2) return lines.map((l) => fit(l, max, size, weight));
  return [lines[0], fit(lines.slice(1).join(' '), max, size, weight)];
}

// ---------- Cycle ----------
export function Cycle({ spec, label }: { spec: Of<'cycle'>; label: string }) {
  const [ref, w] = useWidth<HTMLDivElement>();
  const steps = arr(spec.steps).filter(Boolean).slice(0, 6);
  const L = useMemo(() => {
    if (!w || !steps.length) return null;
    const n = steps.length;
    // The ring shrinks to leave room for the side labels, so names aren't cut.
    const widest = Math.min(w * 0.36, Math.max(...steps.map((s) => textWidth(str(s.label), 12.5, 500))));
    const r = Math.max(52, Math.min(136, w / 2 - widest - 20));
    const H = Math.round(2 * r + 84);
    const cx = w / 2,
      cy = H / 2;
    const pts = steps.map((s, i) => {
      const a = -Math.PI / 2 + (i * 2 * Math.PI) / n;
      const x = cx + r * Math.cos(a),
        y = cy + r * Math.sin(a);
      const right = Math.cos(a) > 0.25,
        left = Math.cos(a) < -0.25;
      const lines = wrap(str(s.label), right || left ? Math.max(60, w / 2 - r - 18) : w * 0.6, 12.5, 500);
      const up = Math.sin(a) < -0.5,
        down = Math.sin(a) > 0.5;
      return {
        s,
        x,
        y,
        lines,
        tx: right ? x + 12 : left ? x - 12 : x,
        // Two-line labels grow away from the ring.
        ty: up ? y - 12 - (lines.length - 1) * 15 : down ? y + 22 : y + 4 - ((lines.length - 1) * 15) / 2,
        anchor: right ? 'start' : left ? 'end' : 'middle',
      };
    });
    // Arcs between stages, stopping short of each dot, with an arrowhead.
    const gap = 0.16;
    const arcs = pts.map((_, i) => {
      const a0 = -Math.PI / 2 + (i * 2 * Math.PI) / n + gap,
        a1 = -Math.PI / 2 + ((i + 1) * 2 * Math.PI) / n - gap;
      const p = (a: number) => `${cx + r * Math.cos(a)},${cy + r * Math.sin(a)}`;
      return `M${p(a0)} A${r},${r} 0 0 1 ${p(a1)}`;
    });
    return { H, cx, cy, r, pts, arcs };
  }, [w, steps]);
  if (!steps.length) return <Empty />;
  return (
    <div ref={ref} className="viz-plot viz-cycle" style={{ height: L?.H ?? 260 }} role="img" aria-label={`${label}. ${steps.map((s) => str(s.label)).join(', then ')}, and back to the start.`}>
      {L && (
        <svg width={w} height={L.H} viewBox={`0 0 ${w} ${L.H}`}>
          <defs>
            <marker id="viz-cy-h" viewBox="0 0 8 8" refX="6" refY="4" markerWidth="7" markerHeight="7" orient="auto">
              <path d="M1 1.2 6.4 4 1 6.8" className="viz-cy-head" />
            </marker>
          </defs>
          {L.arcs.map((d, i) => (
            <path key={i} d={d} className="viz-cy-arc" markerEnd="url(#viz-cy-h)" style={vars({ '--i': i })} />
          ))}
          {spec.centre && (
            <text x={L.cx} y={L.cy + 5} textAnchor="middle" className="viz-cy-centre">
              {fit(str(spec.centre), L.r * 1.75, 13, 500)}
            </text>
          )}
          {L.pts.map((p, i) => (
            <g key={i} className={`viz-cy-node ${tc(p.s.tone)}`} style={vars({ '--i': i })}>
              <title>{[str(p.s.label), str(p.s.detail)].filter(Boolean).join(': ')}</title>
              <circle cx={p.x} cy={p.y} r={6} />
              <text x={p.tx} y={p.ty} textAnchor={p.anchor as 'start' | 'middle' | 'end'}>
                {p.lines.map((l, j) => (
                  <tspan key={j} x={p.tx} dy={j ? 15 : 0}>
                    {l}
                  </tspan>
                ))}
              </text>
            </g>
          ))}
        </svg>
      )}
    </div>
  );
}

// ---------- Tree ----------
type TreeNode = Of<'tree'>['nodes'][number] & { kids: TreeNode[] };
export function Tree({ spec, label }: { spec: Of<'tree'>; label: string }) {
  const root = useMemo(() => {
    const nodes = arr(spec.nodes).filter((n) => n && str(n.id)).slice(0, 14);
    const by = new Map<string, TreeNode>(nodes.map((n) => [str(n.id), { ...n, kids: [] }]));
    let top: TreeNode | undefined;
    for (const n of by.values()) {
      const parent = n.parent ? by.get(str(n.parent)) : undefined;
      if (parent && parent !== n) parent.kids.push(n);
      else top ??= n;
    }
    return top;
  }, [spec.nodes]);
  if (!root) return <Empty />;
  const Node = ({ n, depth }: { n: TreeNode; depth: number }) => (
    <li className={`viz-tree-node ${tc(n.tone)}`} style={vars({ '--d': depth })}>
      <div className="viz-tree-card">
        <b>
          <i className="viz-dot" />
          {str(n.label)}
        </b>
        {n.detail && <p>{n.detail}</p>}
      </div>
      {n.kids.length > 0 && depth < 2 && (
        <ul>
          {n.kids.map((k, i) => (
            <Node key={str(k.id) + i} n={k} depth={depth + 1} />
          ))}
        </ul>
      )}
    </li>
  );
  return (
    <ul className="viz-tree" aria-label={label}>
      <Node n={root} depth={0} />
    </ul>
  );
}

// ---------- Parts of a whole ----------
export function Parts({ spec, label }: { spec: Of<'parts'>; label: string }) {
  const parts = arr(spec.parts)
    .filter((p) => p && num(p.value) > 0)
    .slice(0, 8);
  const total = parts.reduce((n, p) => n + num(p.value), 0);
  if (!parts.length || !total) return <Empty />;
  return (
    <div className="viz-parts" role="img" aria-label={`${label}. ${parts.map((p) => `${str(p.label)} ${Math.round((num(p.value) / total) * 100)}%`).join(', ')}`}>
      <div className="viz-parts-bar">
        {parts.map((p, i) => (
          <i key={i} className={tc(p.tone)} style={vars({ flexGrow: num(p.value), '--i': i })} title={str(p.label)} />
        ))}
      </div>
      <ul className="viz-parts-legend">
        {parts.map((p, i) => (
          <li key={i} className={tc(p.tone)}>
            <i className="viz-dot" />
            <span>{str(p.label)}</span>
            <b className="num">{fmt(num(p.value), spec.unit, { compact: true })}</b>
            <em className="num">{Math.round((num(p.value) / total) * 100)}%</em>
          </li>
        ))}
      </ul>
      {spec.total_label && (
        <p className="viz-parts-total">
          {spec.total_label} <b className="num">{fmt(total, spec.unit, { compact: true })}</b>
        </p>
      )}
    </div>
  );
}

// ---------- Balance ----------
export function Balance({ spec, label }: { spec: Of<'balance'>; label: string }) {
  const side = (s: Of<'balance'>['left'] | undefined) => ({
    label: str(s?.label),
    items: arr(s?.items)
      .filter(Boolean)
      .slice(0, 5)
      .map((x) => ({ label: str(x.label), weight: clamp(Math.round(num(x.weight, 1)), 1, 3) })),
  });
  const left = side(spec.left),
    right = side(spec.right);
  const wl = left.items.reduce((n, x) => n + x.weight, 0),
    wr = right.items.reduce((n, x) => n + x.weight, 0);
  if (!wl && !wr) return <Empty />;
  // The beam tips toward the heavier side, at most 9 degrees.
  const tilt = clamp(((wr - wl) / Math.max(1, wl + wr)) * 18, -9, 9);
  const Pan = ({ s, which }: { s: typeof left; which: 'left' | 'right' }) => (
    <div className={`viz-bal-pan is-${which}`}>
      <p className="viz-bal-head">{s.label}</p>
      <ul>
        {s.items.map((x, i) => (
          <li key={i} style={vars({ '--i': i })}>
            <span>{x.label}</span>
            <span className="viz-bal-w" aria-label={`weight ${x.weight} of 3`}>
              {[1, 2, 3].map((k) => (
                <i key={k} data-on={k <= x.weight ? '' : undefined} />
              ))}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
  return (
    <div className="viz-bal" role="group" aria-label={`${label}. ${left.label} weighs ${wl}, ${right.label} weighs ${wr}.`}>
      <div className="viz-bal-beam" aria-hidden style={vars({ '--tilt': `${tilt}deg` })}>
        <i className="viz-bal-bar" />
        <i className="viz-bal-pivot" />
      </div>
      <div className="viz-bal-pans">
        <Pan s={left} which="left" />
        <Pan s={right} which="right" />
      </div>
    </div>
  );
}

// ---------- Venn ----------
export function Venn({ spec, label }: { spec: Of<'venn'>; label: string }) {
  const [ref, w] = useWidth<HTMLDivElement>();
  const sets = arr(spec.sets).filter(Boolean).slice(0, 3);
  const regions = arr(spec.regions).filter(Boolean);
  const L = useMemo(() => {
    if (!w || sets.length < 2) return null;
    const three = sets.length === 3;
    const H = Math.round(clamp(w * (three ? 0.78 : 0.56), 220, 420));
    const r = Math.min(three ? H * 0.3 : H * 0.42, w * (three ? 0.24 : 0.3));
    const cx = w / 2,
      cy = three ? H * 0.46 : H / 2;
    const d = r * (three ? 0.62 : 0.6);
    const centres = three
      ? [
          { x: cx - d, y: cy - d * 0.45 },
          { x: cx + d, y: cy - d * 0.45 },
          { x: cx, y: cy + d * 0.85 },
        ]
      : [
          { x: cx - d, y: cy },
          { x: cx + d, y: cy },
        ];
    // Where each region's items sit: the average of its sets' centres,
    // pushed away from the sets it doesn't belong to.
    const spot = (members: number[]) => {
      const ms = members.filter((m) => m >= 0 && m < centres.length);
      if (!ms.length) return null;
      let x = ms.reduce((n, m) => n + centres[m].x, 0) / ms.length,
        y = ms.reduce((n, m) => n + centres[m].y, 0) / ms.length;
      if (ms.length === 1 && centres.length > 1) {
        const others = centres.filter((_, i) => i !== ms[0]);
        const ox = others.reduce((n, c) => n + c.x, 0) / others.length,
          oy = others.reduce((n, c) => n + c.y, 0) / others.length;
        const len = Math.hypot(x - ox, y - oy) || 1;
        x += ((x - ox) / len) * r * 0.42;
        y += ((y - oy) / len) * r * 0.42;
      }
      return { x, y };
    };
    const placed = regions
      .map((g) => {
        const members = arr(g.sets).map((n) => num(n, -1));
        const at = spot(members);
        if (!at) return null;
        const shared = members.length > 1;
        // Overlaps are narrow; a set's own region has more room.
        const maxW = shared ? r * (three ? 0.62 : 0.78) : r * (three ? 0.85 : 0.9);
        const items = arr(g.items)
          .slice(0, 3)
          .flatMap((t) => wrap(str(t), maxW, 12, shared ? 500 : 400));
        return { ...at, items: items.slice(0, 5), shared };
      })
      .filter(Boolean) as { x: number; y: number; items: string[]; shared: boolean }[];
    const labels = centres.map((c, i) => {
      const text = fit(str(sets[i].label), r * 1.6, 13, 600);
      const above = !three || i < 2;
      return { x: three ? c.x + (i === 0 ? -r * 0.35 : i === 1 ? r * 0.35 : 0) : c.x + (i === 0 ? -r * 0.3 : r * 0.3), y: above ? c.y - r - 10 : c.y + r + 20, text, w: textWidth(text, 13, 600) };
    });
    return { H, r, centres, placed, labels };
  }, [w, sets, regions]);
  if (sets.length < 2) return <Empty />;
  return (
    <div ref={ref} className="viz-plot viz-venn" style={{ height: L?.H ?? 260 }} role="img" aria-label={`${label}. ${regions.map((g) => `${arr(g.sets).map((n) => str(sets[num(n)]?.label)).join(' and ')}: ${arr(g.items).join(', ')}`).join('. ')}`}>
      {L && (
        <svg width={w} height={L.H} viewBox={`0 0 ${w} ${L.H}`}>
          {L.centres.map((c, i) => (
            <circle key={i} cx={c.x} cy={c.y} r={L.r} className={`viz-venn-set ${tc(sets[i].tone)}`} style={vars({ '--i': i })} />
          ))}
          {L.labels.map((l, i) => (
            <text key={i} x={l.x} y={l.y} textAnchor="middle" className={`viz-venn-label ${tc(sets[i].tone)}`}>
              {l.text}
            </text>
          ))}
          {L.placed.map((g, i) => (
            <text key={i} x={g.x} y={g.y - ((g.items.length - 1) * 15) / 2 + 4} textAnchor="middle" className={'viz-venn-items' + (g.shared ? ' is-shared' : '')}>
              {g.items.map((t, j) => (
                <tspan key={j} x={g.x} dy={j ? 15 : 0}>
                  {t}
                </tspan>
              ))}
            </text>
          ))}
        </svg>
      )}
    </div>
  );
}
