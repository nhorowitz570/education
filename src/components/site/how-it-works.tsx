import { evidenceChart } from './curves';
import { Finale } from './finale';
import s from './site.module.css';

const v = (vars: Record<string, string | number>) => vars as React.CSSProperties;

const SYSTEMS = [
  'Session planner',
  'Streaming tutor',
  'Private grader',
  'Learner model',
  'Forgetting curve',
  'Concept map',
  'Memory',
  'Style profile',
  'Visual engine',
  'Voice conductor',
  'Morning scheduler',
];

const MORNING = [
  ['6:15', 'Written while you sleep', 'The session is planned and its first step written before you wake.'],
  ['7:30', 'One nudge', 'A single reminder. Tap it and you’re in.'],
  ['7:30', 'Begin', 'It opens instantly. Nothing to wait for.'],
  ['7:31', 'Recall', 'Three ideas that were about to slip, in a new setting.'],
  ['7:36', 'The situation', 'A real case, a short explanation, one good question.'],
  ['7:47', 'Say it out loud', 'A five-minute call with someone who pushes back.'],
  ['7:55', 'Done', 'A one-line recap. Memory quietly updates.'],
];

function Chapter({ system, verb, children, visual }: { system: string; verb: string; children: React.ReactNode; visual: React.ReactNode }) {
  return (
    <div className={s.chapter}>
      <div className={`${s.chapterText} ${s.rv}`} data-reveal>
        <span className={s.small}>{system}</span>
        <h3 className={s.verb}>{verb}</h3>
        <p className={s.body} style={{ fontSize: 17 }}>
          {children}
        </p>
      </div>
      <div className={`${s.card} ${s.visual} ${s.rv}`} data-reveal style={v({ '--d': 1 })}>
        {visual}
      </div>
    </div>
  );
}

// Concept map, in a 660 × 354 box.
const NODES = [
  { id: 'rev', x: 70, y: 70, label: 'Revenue', c: 'var(--mint)' },
  { id: 'cost', x: 70, y: 240, label: 'Costs', c: 'var(--mint)' },
  { id: 'prof', x: 260, y: 155, label: 'Profit', c: 'var(--mint)' },
  { id: 'recv', x: 260, y: 290, label: 'Receivables', c: 'var(--mint)', o: 0.7 },
  { id: 'cash', x: 460, y: 155, label: 'Cash vs. profit', focus: true },
  { id: 'terms', x: 460, y: 290, label: 'Payment terms', c: 'var(--mint)', open: true },
  { id: 'ask', x: 460, y: 36, label: 'Framing a hard ask', c: 'var(--amber)', o: 0.7 },
  { id: 'runway', x: 600, y: 230, label: 'Runway', c: 'var(--mint)', open: true },
];
const EDGES = [
  ['rev', 'prof'],
  ['cost', 'prof'],
  ['prof', 'cash'],
  ['recv', 'cash'],
  ['ask', 'cash'],
  ['recv', 'terms'],
  ['cash', 'runway'],
  ['terms', 'runway'],
];
const at = (id: string) => NODES.find((n) => n.id === id)!;

function Graph() {
  return (
    <div className={s.graph} data-reveal role="img" aria-label="Revenue and costs lead to profit; profit and receivables lead to cash versus profit, which leads to runway.">
      <svg viewBox="0 0 660 354" aria-hidden>
        {EDGES.map(([a, b], i) => {
          const p = at(a),
            q = at(b),
            mx = (p.x + q.x) / 2;
          return (
            <path
              key={a + b}
              className={s.edge}
              d={`M${p.x} ${p.y} C${mx} ${p.y} ${mx} ${q.y} ${q.x} ${q.y}`}
              pathLength={1}
              style={v({ '--i': i })}
            />
          );
        })}
      </svg>
      {NODES.map((n, i) => (
        <div
          key={n.id}
          className={`${s.node} ${n.focus ? s.nodeFocus : ''} ${n.open ? s.nodeOpen : ''}`}
          style={v({ left: `${(n.x / 660) * 100}%`, top: `${(n.y / 354) * 100}%`, '--c': n.c ?? '', '--o': n.o ?? 1, '--i': i })}
        >
          <i />
          {n.label}
        </div>
      ))}
    </div>
  );
}

const PLAN = [
  ['Recall', 'Two ideas due for review', '3 min'],
  ['Situation', 'A studio that can’t pay rent', '4 min'],
  ['Explain', 'Skipped. You showed this yesterday.', ''],
  ['Check', 'One question, graded privately', '3 min'],
  ['Attempt', 'Your turn, with the numbers', '6 min'],
  ['Transfer', 'Same idea, a different business', '5 min'],
  ['Recap', 'One line to keep', '1 min'],
];

function Plan() {
  return (
    <div className={s.plan}>
      <div className={s.zero}>
        <b>0ms</b>
        <span>between tapping Begin and reading. No model call.</span>
      </div>
      <ol className={s.planRows} data-reveal>
        {PLAN.map(([n, b, t], i) => (
          <li key={n} className={t ? '' : s.skipped} style={v({ '--i': i })}>
            <b>{n}</b>
            <span>{b}</span>
            <span>{t}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function GradeFlow() {
  return (
    <div className={s.gradeFlow} data-reveal>
      <div className={s.fieldBlock}>
        <span className={s.small} style={{ fontSize: 12.5 }}>
          Your answer
        </span>
        <div className={s.answer}>Ask for a deposit on their next project.</div>
      </div>
      <div className={s.tiers}>
        <div className={s.tier}>
          <b>Luna</b>
          <span>Quick grade. Under a tenth of a cent.</span>
        </div>
        <span className={s.tierArrow} aria-hidden>
          →
        </span>
        <div className={s.tier}>
          <b>Sol</b>
          <span>Called in when it’s close or subtle.</span>
        </div>
        <span className={s.tierArrow} aria-hidden>
          →
        </span>
        <div className={`${s.tier} ${s.tierDashed}`}>
          <b>Astra</b>
          <span>Only for stubborn misconceptions.</span>
        </div>
      </div>
      <div className={s.lock}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#5fe0a4" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
          <rect x="5" y="10.5" width="14" height="10" rx="2.5" />
          <path d="M8.5 10.5V7.5a3.5 3.5 0 0 1 7 0v3" />
        </svg>
        Answer key and rubric: stored on the server, never sent to your browser.
      </div>
    </div>
  );
}

const LEVELS: [number, string][] = [
  [0.1, 'New'],
  [0.35, 'Learning'],
  [0.6, 'Practised'],
  [0.8, 'Solid'],
  [0.95, 'Mastered'],
];
const model = evidenceChart(690, 280, 70, 14);

function ModelChart() {
  return (
    <div className={s.modelChart} data-reveal>
      <svg viewBox="0 0 690 280" role="img" aria-label="The estimate of what you know rises with right answers, dips after a miss, and rises again.">
        <defs>
          <linearGradient id="model-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#5fe0a4" stopOpacity="0.16" />
            <stop offset="1" stopColor="#5fe0a4" stopOpacity="0" />
          </linearGradient>
        </defs>
        {LEVELS.map(([p, label]) => (
          <g key={label}>
            <line x1="70" x2="676" y1={model.y(p)} y2={model.y(p)} stroke="rgba(242,241,237,0.06)" />
            <text className={s.axisLabel} x="0" y={model.y(p) + 4}>
              {label}
            </text>
          </g>
        ))}
        <path className={s.modelArea} d={model.area} fill="url(#model-fill)" />
        <path className={s.modelLine} d={model.line} pathLength={1} />
        {model.dots.map((dot, i) =>
          dot.kind === 'right' ? (
            <circle key={i} className={s.modelDot} cx={dot.x} cy={dot.y} r="4.5" fill="#5fe0a4" style={v({ '--i': i })} />
          ) : (
            <circle
              key={i}
              className={s.modelDot}
              cx={dot.x}
              cy={dot.y}
              r="5"
              fill="#111114"
              stroke={dot.kind === 'missed' ? '#ff8a6b' : '#5fe0a4'}
              strokeWidth="2"
              strokeDasharray={dot.kind === 'hint' ? '2.5 2.5' : undefined}
              style={v({ '--i': i })}
            />
          ),
        )}
      </svg>
      <ul className={s.legend}>
        <li>
          <i style={{ background: '#5fe0a4' }} />
          Right answer
        </li>
        <li>
          <i style={{ boxShadow: 'inset 0 0 0 2px #ff8a6b' }} />
          Missed
        </li>
        <li>
          <i style={{ boxShadow: 'inset 0 0 0 1.5px #5fe0a4', opacity: 0.8 }} />
          Right, with a hint (counts half)
        </li>
      </ul>
    </div>
  );
}

function Merge() {
  return (
    <div className={s.merge} data-reveal>
      <div className={s.mergeCol}>
        <span className={s.small} style={{ fontSize: 12.5 }}>
          Tuesday’s session
        </span>
        <div className={`${s.mem} ${s.memCandidate}`}>
          Asked for a real example twice
          <small>A hunch. Seen once.</small>
        </div>
        <span className={s.small} style={{ fontSize: 12.5, paddingTop: 6 }}>
          Thursday’s session
        </span>
        <div className={`${s.mem} ${s.memCandidate}`}>
          Understood it once it saw a café’s numbers
          <small>A hunch. Seen once.</small>
        </div>
      </div>
      <div className={s.similarity}>
        <b>0.93</b>
        <span>similar enough to merge</span>
        <span aria-hidden>→</span>
      </div>
      <div className={s.mergeCol}>
        <span className={s.small} style={{ fontSize: 12.5, color: 'var(--mint)' }}>
          Remembered
        </span>
        <div className={`${s.mem} ${s.memKept}`}>
          Learns faster from a real case than a definition
          <small>Confirmed. Shapes every explanation now.</small>
        </div>
        <span className={s.small} style={{ fontSize: 12.5, fontWeight: 400, lineHeight: 1.5 }}>
          Visible to you under You → Memory. Pin it, edit it or delete it.
        </span>
      </div>
    </div>
  );
}

const CUES = [
  { at: 0, label: 'Opens', sub: 'With the brief’s first line', c: 'var(--text-2)' },
  { at: 38, label: 'Complication', sub: 'Finance pays in 30 days', c: 'var(--amber)' },
  { at: 66, label: 'Complication', sub: 'A rival quote appears', c: 'var(--amber)' },
  { at: 87.5, label: 'Wrap-up', sub: '60 seconds before the end', c: 'var(--text-2)' },
];

function CallLine() {
  return (
    <div className={s.callLine} data-reveal>
      <div className={s.simRow}>
        <b>Negotiation with Dana Okafor</b>
        <span>8 minutes</span>
      </div>
      <div className={s.callTrack}>
        <div className={s.callBars} aria-hidden>
          {Array.from({ length: 64 }, (_, i) => (
            <i
              key={i}
              style={v({
                height: `${6 + Math.abs(Math.sin(i * 0.7) * Math.cos(i * 0.23)) * 62}px`,
                opacity: Math.floor(i / 8) % 2 ? 0.55 : 1,
                '--i': i,
              })}
            />
          ))}
        </div>
        {CUES.map((c, i) => (
          <div
            key={i}
            className={`${s.cueMark} ${i === 0 ? s.cueStart : ''}`}
            style={v({ left: `${c.at}%`, '--c': c.c, '--i': i })}
          >
            <b>{c.label}</b>
            <span>{c.sub}</span>
          </div>
        ))}
      </div>
      <div className={s.fbRow} style={{ paddingTop: 20, borderTop: '1px solid var(--line)' }}>
        <span className={s.small}>Then, feedback that quotes you</span>
        <p className={`${s.voice} ${s.fbQuote}`} style={{ fontSize: 19 }}>
          &ldquo;Split the fuel surcharge into its own line.&rdquo; Keep that. Ask before you trade next time.
        </p>
      </div>
    </div>
  );
}

const TIERS = [
  { name: 'Luna', role: 'Fast', text: 'Quick grades, memory notes, recaps.', price: '$0.10 in / $0.50 out', h: 260 },
  { name: 'Sol', role: 'Primary', text: 'Writes every lesson, plays every partner, gives feedback.', price: '$2 in / $10 out', h: 350 },
  { name: 'Astra', role: 'Reasoning', text: 'Maps your curriculum. Called in when you’re stuck twice.', price: '$10 in / $50 out', h: 440 },
];

const NUMBERS = [
  ['0 ms', 'to begin a session'],
  ['<$0.25', 'for a full session'],
  ['12', 'kinds of visual it can draw'],
  ['15 min', 'longest practice call'],
  ['0', 'answer keys in your browser'],
];

export function HowItWorks() {
  return (
    <>
      <section className={s.manifesto}>
        <span className={s.small}>
          How it works
        </span>
        <h1 className={`${s.display} ${s.manifestoTitle}`}>
          <span className={s.heroLine}>
            <span>Eleven systems wake up every morning to teach one person.</span>
          </span>
        </h1>
        <p className={s.lede}>
          Here is every one of them, and exactly what it does for you before
          you&rsquo;ve finished your coffee.
        </p>
        <ul className={s.systems} data-reveal>
          {SYSTEMS.map((name, i) => (
            <li key={name} style={v({ '--i': i })}>
              {name}
            </li>
          ))}
        </ul>
      </section>

      <section className={`${s.section} ${s.rule}`} aria-labelledby="morning-title">
        <div className={s.stack} style={{ gap: 22 }}>
          <h2 id="morning-title" className={`${s.h2} ${s.rv}`} data-reveal>
            A morning, minute by minute.
          </h2>
          <p className={`${s.lede} ${s.rv}`} data-reveal style={v({ '--d': 1 })}>
            Twenty-five minutes, planned to the beat, adjusted to what you knew
            yesterday.
          </p>
        </div>
        <ol className={s.timeline} data-reveal>
          {MORNING.map(([time, title, text], i) => (
            <li key={title} className={`${s.stop} ${title === 'Begin' ? s.stopLit : ''}`} style={v({ '--i': i })}>
              <span className={s.stopTime}>{time}</span>
              <span className={s.stopDot} aria-hidden />
              <div>
                <b>{title}</b>
                <p>{text}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className={`${s.section} ${s.tight}`} aria-labelledby="moves-title">
        <h2 id="moves-title" className={`${s.h2} ${s.rv}`} data-reveal>
          Six moves behind every session.
        </h2>
        <div className={s.chapters}>
          <Chapter system="Concept map" verb="Map." visual={<Graph />}>
            On day one, the reasoning model reads your whole curriculum and turns
            it into ideas that depend on each other. Review priority follows what
            you&rsquo;ll need next.
          </Chapter>
          <Chapter system="Session planner" verb="Begin." visual={<Plan />}>
            The plan for today is built in code, not generated, so it&rsquo;s ready
            the instant you are. It skips what you already know and stretches
            where you&rsquo;re shaky.
          </Chapter>
          <Chapter system="Private grader" verb="Grade." visual={<GradeFlow />}>
            Every answer is marked against a rubric you can&rsquo;t see, by the
            cheapest model that can judge it. Hard calls escalate on their own.
          </Chapter>
          <Chapter system="Learner model" verb="Model." visual={<ModelChart />}>
            Every answer updates an estimate of what you know. Answers given with
            a hint count for half. A miss pulls it down, and tomorrow&rsquo;s plan
            changes with it.
          </Chapter>
          <Chapter system="Memory" verb="Remember." visual={<Merge />}>
            After each session it notes what worked for you. A hunch stays a
            hunch until it happens twice. Only then does it change how
            you&rsquo;re taught.
          </Chapter>
          <Chapter system="Voice conductor" verb="Rehearse." visual={<CallLine />}>
            A live voice partner plays the other side. A conductor on the server
            throws in complications on cue, keeps time, and saves every word for
            feedback.
          </Chapter>
        </div>
      </section>

      <section className={`${s.section} ${s.rule}`} aria-labelledby="minds-title">
        <div className={s.stack} style={{ gap: 22 }}>
          <h2 id="minds-title" className={`${s.h2} ${s.rv}`} data-reveal>
            Three minds, routed by how hard it is.
          </h2>
          <p className={`${s.lede} ${s.rv}`} data-reveal style={v({ '--d': 1 })}>
            Easy work goes to the fast model. When you&rsquo;re stuck, the work
            climbs a tier on its own. You never pick, and you never pay for more
            than the moment needs.
          </p>
        </div>
        <div className={s.staircase} data-reveal>
          {TIERS.map((t, i) => (
            <div key={t.name} className={`${s.step} ${i === 2 ? s.stepLight : ''}`} style={v({ '--h': `${t.h}px`, '--i': i })}>
              <div className={s.stepTop}>
                <b>{t.name}</b>
                <span>{t.role}</span>
              </div>
              <div>
                <p>{t.text}</p>
                <small>{t.price} per million tokens</small>
              </div>
            </div>
          ))}
        </div>
        <p className={s.small} style={{ marginTop: 40, fontWeight: 400, fontSize: 14 }}>
          Voice practice runs on GPT-Live at about five cents a minute. Every call,
          text or voice, is logged with its cost under You → Usage.
        </p>
      </section>

      <section className={s.numbers} aria-label="By the numbers">
        {NUMBERS.map(([n, l], i) => (
          <div key={l} className={s.rv} data-reveal style={v({ '--d': i })}>
            <b>{n}</b>
            <span>{l}</span>
          </div>
        ))}
      </section>

      <Finale />
    </>
  );
}
