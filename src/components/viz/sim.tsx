'use client';
import { useId, useMemo, useState, type CSSProperties } from 'react';
import type { Viz } from '@/lib/viz/schema';
import { compile } from '@/lib/viz/formula';
import { Empty } from './charts';
import { arr, clamp, fmt, num, str, tc, toneOf, useTween } from './util';

type SimSpec = Extract<Viz, { type: 'sim' }>;

/**
 * Output formats. `percent` accepts either a ratio or a percentage: values with
 * |v| ≤ 1.5 are treated as ratios (0.24 → 24%), larger ones as already-percent
 * (24 → 24%). Models rarely mean "1.2%" as a result, and 150% margins are rare.
 */
function formatOut(v: number, format: string): string {
  if (!Number.isFinite(v)) return '—';
  if (format === 'currency') return fmt(Math.abs(v) >= 100 ? Math.round(v) : v, '$');
  if (format === 'percent') return fmt(Math.abs(v) <= 1.5 ? v * 100 : v, '%');
  if (Math.abs(v) >= 1e6) return fmt(v, '');
  return (v < 0 ? '−' : '') + ONE.format(Math.abs(v));
}
const ONE = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 });

const decimals = (step: number) => {
  const s = String(step);
  return s.includes('.') ? Math.min(4, s.split('.')[1].length) : 0;
};

function Output({ label, value, format, tone }: { label: string; value: number; format: string; tone: string }) {
  const shown = useTween(value);
  return (
    <div className={`viz-sim-out ${tc(tone)}`}>
      <dt>{label}</dt>
      <dd className="num" aria-live="polite">
        {formatOut(Number.isFinite(value) ? shown : NaN, format)}
      </dd>
    </div>
  );
}

export function Sim({ spec, label }: { spec: SimSpec; label: string }) {
  const uid = useId();
  const inputs = useMemo(
    () =>
      arr(spec.inputs)
        .filter((i) => i && str(i.id))
        .map((i) => {
          let min = num(i.min),
            max = num(i.max, min + 1);
          if (min > max) [min, max] = [max, min];
          if (min === max) max = min + 1;
          const step = num(i.step) > 0 ? num(i.step) : (max - min) / 100;
          return {
            id: str(i.id).toLowerCase(),
            label: str(i.label) || str(i.id),
            unit: str(i.unit),
            min,
            max,
            step,
            initial: clamp(num(i.value, min), min, max),
          };
        }),
    [spec.inputs],
  );
  const outputs = useMemo(
    () =>
      arr(spec.outputs)
        .filter(Boolean)
        .map((o) => {
          let run: ((v: Record<string, number>) => number) | null = null;
          try {
            run = compile(str(o.formula));
          } catch {
            run = null;
          }
          return { label: str(o.label), format: str(o.format), tone: toneOf(o.tone), run };
        }),
    [spec.outputs],
  );
  const [vals, setVals] = useState<Record<string, number>>({});
  const current = Object.fromEntries(inputs.map((i) => [i.id, vals[i.id] ?? i.initial]));
  if (!inputs.length && !outputs.length) return <Empty />;

  return (
    <div className="viz-sim" role="group" aria-label={label}>
      <div className="viz-sim-inputs">
        {inputs.map((i) => {
          const v = current[i.id];
          const p = ((v - i.min) / (i.max - i.min)) * 100;
          const id = `${uid}-${i.id}`;
          return (
            <div key={i.id} className="viz-sim-in">
              <label htmlFor={id} className="viz-sim-label">
                <span>{i.label}</span>
                <output htmlFor={id} className="num">
                  {fmt(Number(v.toFixed(decimals(i.step))), i.unit)}
                </output>
              </label>
              <input
                id={id}
                type="range"
                min={i.min}
                max={i.max}
                step={i.step}
                value={v}
                style={{ '--p': `${p}%` } as CSSProperties}
                aria-valuetext={fmt(v, i.unit)}
                onChange={(e) => setVals((s) => ({ ...s, [i.id]: Number(e.target.value) }))}
              />
            </div>
          );
        })}
      </div>
      {outputs.length > 0 && (
        <dl className="viz-sim-outs">
          {outputs.map((o, k) => {
            let v = NaN;
            if (o.run)
              try {
                v = o.run(current);
              } catch {
                v = NaN;
              }
            return <Output key={k} label={o.label} value={v} format={o.format} tone={o.tone} />;
          })}
        </dl>
      )}
    </div>
  );
}
