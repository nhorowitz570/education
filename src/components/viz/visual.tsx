'use client';
import { Component, type ReactNode } from 'react';
import { VIZ_LABELS, type Viz, type VizType } from '@/lib/viz/schema';
import { BarChart, LineChart, Statement, Stats, Waterfall } from './charts';
import { Compare, Concepts, Flow, Matrix, Spectrum, Timeline } from './diagrams';
import { Sim } from './sim';
import { str } from './util';

// A renderer bug must never take the lesson down with it.
class Guard extends Component<{ children: ReactNode; fallback: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

function Graphic({ spec, label }: { spec: Viz; label: string }) {
  switch (spec.type) {
    case 'bar':
      return <BarChart spec={spec} label={label} />;
    case 'line':
      return <LineChart spec={spec} label={label} />;
    case 'waterfall':
      return <Waterfall spec={spec} label={label} />;
    case 'flow':
      return <Flow spec={spec} label={label} />;
    case 'timeline':
      return <Timeline spec={spec} label={label} />;
    case 'compare':
      return <Compare spec={spec} label={label} />;
    case 'matrix':
      return <Matrix spec={spec} label={label} />;
    case 'concepts':
      return <Concepts spec={spec} label={label} />;
    case 'stat':
      return <Stats spec={spec} />;
    case 'statement':
      return <Statement spec={spec} label={label} />;
    case 'sim':
      return <Sim spec={spec} label={label} />;
    case 'spectrum':
      return <Spectrum spec={spec} label={label} />;
    default:
      return null;
  }
}

export function Visual({ spec, animate = true }: { spec: Viz; animate?: boolean }) {
  if (!spec || typeof spec !== 'object' || !(spec.type in VIZ_LABELS)) return null;
  const title = 'title' in spec ? str(spec.title) : '';
  const takeaway = str(spec.takeaway);
  const label = [title || VIZ_LABELS[spec.type], takeaway]
    .map((t) => t.replace(/[.\s]+$/, ''))
    .filter(Boolean)
    .join('. ');
  return (
    <figure className={`viz viz-${spec.type}`} data-anim={animate ? '' : undefined}>
      {title && <div className="viz-title">{title}</div>}
      <Guard fallback={<p className="viz-empty">This picture couldn’t be drawn.</p>}>
        <Graphic spec={spec} label={label} />
      </Guard>
      {takeaway && <figcaption className="viz-takeaway">{takeaway}</figcaption>}
    </figure>
  );
}

// Placeholder shapes, roughly matching each primitive's footprint.
const SHAPE: Record<VizType, 'rows' | 'plot' | 'tiles' | 'track' | 'square' | 'figures'> = {
  bar: 'rows',
  compare: 'rows',
  statement: 'rows',
  line: 'plot',
  waterfall: 'plot',
  concepts: 'plot',
  flow: 'tiles',
  timeline: 'tiles',
  matrix: 'square',
  stat: 'figures',
  sim: 'track',
  spectrum: 'track',
};

export function VisualSkeleton({ type }: { type?: string }) {
  const known = type && type in VIZ_LABELS ? (type as VizType) : null;
  const name = known ? VIZ_LABELS[known] : 'visual';
  const phrase = name.endsWith('s') ? name : `${/^[aeiou]/.test(name) ? 'an' : 'a'} ${name}`;
  const shape = known ? SHAPE[known] : 'plot';
  return (
    <figure className="viz viz-skeleton" aria-busy="true">
      <div className="viz-title">Drawing {phrase}…</div>
      <div className={`viz-sk viz-sk-${shape}`} aria-hidden>
        {shape === 'rows' || shape === 'tiles' || shape === 'figures'
          ? Array.from({ length: shape === 'rows' ? 4 : 3 }, (_, i) => <i key={i} />)
          : shape === 'track'
            ? [0, 1, 2].map((i) => <i key={i} />)
            : <i />}
      </div>
    </figure>
  );
}
