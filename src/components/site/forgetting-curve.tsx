import { forgettingCurve } from './curves';
import s from './site.module.css';

const W = 1152,
  H = 330;
const curve = forgettingCurve(W, H);
const pct = (x: number) => `${(x / W) * 100}%`;

// Drawn once on the server; the reveal observer starts the line drawing.
export function ForgettingCurve() {
  return (
    <figure className={`${s.card} ${s.curveCard}`} data-reveal>
      <div className={s.curveWrap}>
        <svg
          className={s.curveSvg}
          viewBox={`0 0 ${W} ${H}`}
          role="img"
          aria-label="Illustration: without review, recall falls steeply within days. With spaced reviews, recall resets and decays more slowly each time."
        >
          <defs>
            <linearGradient id="curve-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#5fe0a4" stopOpacity="0.13" />
              <stop offset="1" stopColor="#5fe0a4" stopOpacity="0" />
            </linearGradient>
          </defs>
          {curve.grid.map((y) => (
            <line key={y} className={s.curveGrid} x1="0" x2={W} y1={y} y2={y} />
          ))}
          <path className={s.curveArea} d={curve.area} fill="url(#curve-fill)" />
          <path className={s.curvePlain} d={curve.plain} />
          <path className={s.curveLine} d={curve.line} pathLength={1} />
          {curve.peaks.map(([x, y], k) => (
            <circle
              key={k}
              className={s.curvePeak}
              cx={x}
              cy={y}
              r="4.5"
              style={{ '--k': k } as React.CSSProperties}
            />
          ))}
        </svg>
        <span
          className={s.curveLabel}
          style={{ left: pct(curve.labelWithout.x), top: `${(curve.labelWithout.y / H) * 100}%` }}
        >
          Without review
        </span>
        <span
          className={`${s.curveLabel} ${s.curveLabelMint}`}
          style={{ left: pct(curve.peaks[3][0] + 60), top: `${((curve.peaks[3][1] - 10) / H) * 100}%` }}
        >
          With Fieldwork
        </span>
      </div>
      <div className={s.curveTicks} aria-hidden>
        {curve.ticks.map((t) => (
          <span key={t.d} style={{ left: pct(t.x) }}>
            Day {t.d}
          </span>
        ))}
      </div>
      <div className={s.intervals}>
        {[
          ['Day 1', 'First return, while it’s fresh'],
          ['2½ days', 'Then a little further out'],
          ['6 days', 'In a new situation each time'],
          ['15+ days', 'Until it’s simply yours'],
        ].map(([n, l]) => (
          <div key={n}>
            <span className={s.bigNum}>{n}</span>
            <span>{l}</span>
          </div>
        ))}
      </div>
    </figure>
  );
}
