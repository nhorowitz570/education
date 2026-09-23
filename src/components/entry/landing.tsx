import { Mark } from './mark';
import '@/app/entry.css';

// The public page describes the method, not the person: no progress, health or
// account data is ever rendered here.
const START = Date.UTC(2026, 8, 28); // Monday 28 September 2026
const WEEKS = 36;
const DAY = 86400000;
const TRACKS = ['finance', 'communication', 'finance', 'judgment'] as const;
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu'];
const BREAKS = [
  { from: 8, to: 8, label: 'Light week' },
  { from: 12, to: 13, label: 'Travel' },
];
const MILESTONES = [
  { week: 11, label: 'Milestone 1' },
  { week: 22, label: 'Milestone 2' },
  { week: 35, label: 'June 5' },
];
const CAPSTONE = { from: 30, to: 34 };
const MONTHS = ['Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'];

function YearField({ now }: { now: number }) {
  const col = 24,
    row = 22,
    left = 44,
    top = 40,
    width = left + WEEKS * col + 8,
    height = top + 4 * row + 34,
    elapsed = Math.floor((now - START) / DAY),
    nextIndex = (() => {
      // First scheduled Mon–Thu session on or after today.
      for (let w = 0; w < WEEKS; w++)
        for (let d = 0; d < 4; d++) {
          const date = START + (w * 7 + d) * DAY;
          if (date >= now - DAY / 2 && !BREAKS.some((b) => w >= b.from && w <= b.to))
            return w * 4 + d;
        }
      return -1;
    })(),
    x = (w: number) => left + w * col + col / 2,
    y = (d: number) => top + d * row + row / 2;
  return (
    <svg
      className="year-field"
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label="A 36-week year of four learning mornings a week, from September 28 to June 5, with two breaks, two milestones and a capstone."
    >
      <defs>
        <pattern id="hatch" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="5" stroke="rgba(242,241,237,.09)" strokeWidth="1.4" />
        </pattern>
        <radialGradient id="lit">
          <stop offset="0" stopColor="rgba(242,241,237,.55)" />
          <stop offset="1" stopColor="rgba(242,241,237,0)" />
        </radialGradient>
      </defs>
      {BREAKS.map((b) => (
        <g key={b.label}>
          <rect
            x={left + b.from * col + 2}
            y={top - 4}
            width={(b.to - b.from + 1) * col - 4}
            height={4 * row + 8}
            rx="6"
            fill="url(#hatch)"
          />
          <text className="yf-note" x={x(b.from) + ((b.to - b.from) * col) / 2} y={top + 4 * row + 22} textAnchor="middle">
            {b.label}
          </text>
        </g>
      ))}
      <rect
        x={left + CAPSTONE.from * col + 2}
        y={top - 4}
        width={(CAPSTONE.to - CAPSTONE.from + 1) * col - 4}
        height={4 * row + 8}
        rx="6"
        className="yf-capstone"
      />
      <text className="yf-note" x={x((CAPSTONE.from + CAPSTONE.to) / 2)} y={top + 4 * row + 22} textAnchor="middle">
        Capstone
      </text>
      {MILESTONES.map((m) => (
        <g key={m.label} className="yf-milestone">
          <line x1={x(m.week)} x2={x(m.week)} y1={top - 18} y2={top - 6} />
          <text x={x(m.week)} y={top - 24} textAnchor="middle">
            {m.label}
          </text>
        </g>
      ))}
      {DAYS.map((d, i) => (
        <text key={d} className="yf-axis" x={left - 12} y={y(i) + 4} textAnchor="end">
          {d}
        </text>
      ))}
      {MONTHS.map((m, i) => {
        const week = (Date.UTC(2026, 9 + i, 1) - START) / DAY / 7,
          at = left + week * col,
          notes = [...BREAKS, CAPSTONE].map(
            (b) => left + ((b.from + b.to + 1) / 2) * col,
          );
        // Month ticks give way to the break and capstone labels they'd collide with.
        if (week < 0 || week >= WEEKS || notes.some((n) => Math.abs(n - at) < 52))
          return null;
        return (
          <text key={m} className="yf-axis" x={at} y={top + 4 * row + 22}>
            {m}
          </text>
        );
      })}
      {Array.from({ length: WEEKS * 4 }, (_, i) => {
        const w = Math.floor(i / 4),
          d = i % 4,
          resting = BREAKS.some((b) => w >= b.from && w <= b.to),
          past = w * 7 + d < elapsed,
          next = i === nextIndex;
        if (resting) return null;
        return (
          <g key={i} className={'yf-dot t-' + TRACKS[d]} style={{ '--i': w } as React.CSSProperties}>
            {next && <circle cx={x(w)} cy={y(d)} r="16" fill="url(#lit)" className="yf-glow" />}
            <circle
              cx={x(w)}
              cy={y(d)}
              r={next ? 5.5 : 3.8}
              className={next ? 'next' : past ? 'past' : ''}
            />
          </g>
        );
      })}
    </svg>
  );
}

function CashSketch() {
  // A worked example of the "explain with a picture" behaviour: timing, not
  // totals, is what makes profit and cash diverge.
  const rows = [
    { label: 'Sold', value: 8000, tone: 'solid' },
    { label: 'Received', value: 2000, tone: 'solid' },
    { label: 'Due now', value: 5000, tone: 'due' },
  ];
  return (
    <div className="sketch" aria-label="Sold $8,000, received $2,000, $5,000 due this month.">
      {rows.map((r) => (
        <div className="sketch-row" key={r.label}>
          <span>{r.label}</span>
          <div className="sketch-track">
            <div className={'sketch-bar ' + r.tone} style={{ width: `${(r.value / 8000) * 100}%` }}>
              {r.label === 'Sold' && <div className="sketch-pending" style={{ width: '75%' }} />}
            </div>
          </div>
          <b>${r.value.toLocaleString('en-US')}</b>
        </div>
      ))}
      <div className="sketch-gap">
        <span>Short this month</span>
        <b>−$3,000</b>
      </div>
    </div>
  );
}

const PRINCIPLES = [
  {
    n: '01',
    title: 'A situation before a lecture',
    body: 'Every session opens on a realistic case. The idea arrives when I need it to make a decision.',
  },
  {
    n: '02',
    title: 'Short, then deeper on request',
    body: 'The tutor makes the point in a few lines, asks one good question, and goes deeper only when it matters.',
  },
  {
    n: '03',
    title: 'It remembers how I learn',
    body: 'What clicked, what didn’t, which examples land. The next explanation starts from there.',
  },
  {
    n: '04',
    title: 'Review just before forgetting',
    body: 'Ideas come back when they’re starting to fade, in a new situation, never as a pile of overdue cards.',
  },
];

const INSTEAD = [
  ['Lectures and chapters', 'A case, a decision, and a clear explanation of why'],
  ['Grades', 'Evidence I can show: a briefing, a memo, a role-play'],
  ['Cramming', 'Spaced recall, capped at ten minutes a day'],
  ['One pace for everyone', 'A model of what I know that decides what comes next'],
];

export function Landing() {
  const now = Date.now(),
    days = Math.ceil((START - now) / DAY);
  return (
    <div className="entry landing">
      <header className="landing-bar">
        <a className="wordmark" href="/welcome">
          <Mark size={26} />
          Fieldwork
        </a>
        <nav>
          <span className="private-tag">Private · by invitation</span>
          <a className="entry-button small" href="/login">
            Sign in
          </a>
        </nav>
      </header>

      <main>
        <section className="hero">
          <p className="eyebrow reveal">A personal learning environment</p>
          <h1 className="reveal">The way I learn.</h1>
          <p className="hero-lede reveal">
            Fieldwork is the system I built to keep learning on purpose: four
            mornings a week, a tutor that remembers how I think, and one clear
            next step whenever I open it.
          </p>
        </section>

        <section className="year reveal" aria-labelledby="year-title">
          <div className="year-head">
            <div>
              <h2 id="year-title">The year, at a glance</h2>
              <p>September 28 → June 5 · 144 mornings</p>
            </div>
            <ul className="legend">
              <li className="t-finance">Finance</li>
              <li className="t-communication">Communication</li>
              <li className="t-judgment">Judgment</li>
            </ul>
            <div className="year-stat">
              {days > 0 ? (
                <>
                  <b>{days}</b>
                  <span>{days === 1 ? 'day until it starts' : 'days until it starts'}</span>
                </>
              ) : (
                <>
                  <b>{Math.min(36, Math.floor(-days / 7) + 1)}</b>
                  <span>of 36 weeks</span>
                </>
              )}
            </div>
          </div>
          <div className="year-scroll">
            <YearField now={now} />
          </div>
        </section>

        <section className="principles" aria-label="How it works">
          {PRINCIPLES.map((p) => (
            <article key={p.n}>
              <span className="index">{p.n}</span>
              <h3>{p.title}</h3>
              <p>{p.body}</p>
            </article>
          ))}
        </section>

        <section className="moment" aria-labelledby="moment-title">
          <div className="moment-copy">
            <p className="eyebrow">What a session feels like</p>
            <h2 id="moment-title">A studio sold $8,000 of work. Can it pay its bills?</h2>
            <p>
              The tutor won’t lecture on accounting. It shows the gap, says
              the one thing that matters, and asks what I’d do.
            </p>
          </div>
          <div className="moment-demo">
            <CashSketch />
            <div className="tutor-line">
              <span className="tutor-mark" aria-hidden="true" />
              <p>
                Profitable on paper, short on cash: $6,000 of the sale hasn’t
                arrived, but the $5,000 of costs are due now.{' '}
                <em>What would you ask the client for first?</em>
              </p>
            </div>
          </div>
        </section>

        <section className="instead" aria-labelledby="instead-title">
          <h2 id="instead-title">What it replaces</h2>
          <dl>
            {INSTEAD.map(([a, b]) => (
              <div key={a}>
                <dt>{a}</dt>
                <dd>{b}</dd>
              </div>
            ))}
          </dl>
        </section>
      </main>

      <footer className="landing-foot">
        <div>
          <Mark size={22} />
          <p>
            Fieldwork is private. It isn’t a product and there’s no sign-up;
            accounts are added by hand.
          </p>
        </div>
        <a className="entry-button" href="/login">
          Sign in
        </a>
      </footer>
    </div>
  );
}
