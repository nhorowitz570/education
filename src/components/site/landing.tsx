import Link from 'next/link';
import { HeroField } from './hero-field';
import { ForgettingCurve } from './forgetting-curve';
import { SessionDemo } from './session-demo';
import { PracticeCall } from './practice-call';
import { CashSim } from './cash-sim';
import { Finale } from './finale';
import s from './site.module.css';

// The public page describes the method, not a person: every figure here is
// an example, and no account or progress data is ever rendered.
const d = (n: number) => ({ '--d': n }) as React.CSSProperties;

const Icon = ({ path }: { path: React.ReactNode }) => (
  <span className={s.noteIcon} aria-hidden>
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#f2f1ed" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      {path}
    </svg>
  </span>
);

const PIN = <path d="M15 3l6 6-3 1-4 4 1 5-2 2-4-5-5 5-1-1 5-5-5-4 2-2 5 1 4-4z" />;
const BIN = <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" />;
const Tool = ({ children, on }: { children: React.ReactNode; on?: boolean }) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill={on ? '#f2f1ed' : 'none'} stroke={on ? 'none' : '#707075'} strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round">
    {children}
  </svg>
);

const MEMORIES = [
  ['Learns faster from a real case than a definition', 'Seen in 9 sessions', true],
  ['Runs a two-person design studio', 'Background', false],
  ['Goal: read a cash-flow statement unaided by June', 'Goal', false],
  ['Wants the picture before the formula', 'Style', false],
] as const;

const CONCEPTS = [
  { name: 'Cash vs. profit', c: 'var(--mint)', on: 3, label: 'Practised' },
  { name: 'Framing a hard ask', c: 'var(--amber)', on: 4, label: 'Solid' },
  { name: 'Base rates', c: 'var(--violet)', on: 2, fading: true, label: 'Fading' },
  { name: 'Unit economics', c: 'var(--mint)', on: 1, label: 'New' },
];

const REPLACES = [
  ['Lectures', 'A case, a decision, and a clear why.'],
  ['Grades', 'Proof you can show: a memo, a briefing, a role-play.'],
  ['Cramming', 'Spaced recall, never more than ten minutes a day.'],
  ['One pace', 'A model of what you know that decides what comes next.'],
];

export function Landing() {
  return (
    <>
      <section className={s.hero}>
        <div>
          <h1 className={`${s.display} ${s.heroTitle}`}>
            <span className={s.heroLine}>
              <span>Learning that</span>
            </span>
            <span className={s.heroLine}>
              <span>remembers you.</span>
            </span>
          </h1>
          <div className={s.heroCopy}>
            <p className={s.lede}>
              A private tutor that runs your curriculum every morning, learns how
              you think, and brings each idea back right before it fades.
            </p>
            <div className={s.ctas}>
              <Link className={`${s.btn} ${s.primary}`} href="/request-access">
                Request access <span className={s.arrow}>→</span>
              </Link>
              <Link className={s.btn} href="/how-it-works">
                See how it works
              </Link>
            </div>
          </div>
        </div>
        <HeroField />
      </section>

      <section className={s.section} aria-labelledby="forget-title">
        <div className={s.curveHead}>
          <h2 id="forget-title" className={`${s.h2} ${s.rv}`} data-reveal>
            Most of what you learn is gone within a week. Fieldwork was built to
            fix exactly that.
          </h2>
          <p className={`${s.lede} ${s.rv}`} data-reveal style={d(1)}>
            It tracks how strong each idea is in your memory, then brings it back
            in a fresh situation just as it starts to slip. Each return makes the
            next one further away.
          </p>
        </div>
        <ForgettingCurve />
      </section>

      <section className={`${s.section} ${s.tight}`} aria-labelledby="demo-title">
        <div className={s.demo}>
          <div className={s.demoCopy}>
            <h2 id="demo-title" className={`${s.h2} ${s.rv}`} data-reveal>
              It opens on a problem, not a lecture.
            </h2>
            <p className={`${s.body} ${s.rv}`} data-reveal style={{ ...d(1), fontSize: 17 }}>
              Every session starts with a real situation. The idea arrives the
              moment you need it to make a decision: a few lines, a picture when a
              picture is faster, and one good question.
            </p>
            <ul className={s.notes}>
              <li className={s.rv} data-reveal style={d(2)}>
                <Icon path={<path d="M13 2L4 14h7l-1 8 9-12h-7l1-8z" />} />
                <div>
                  <b>Opens instantly</b>
                  <span>No spinner. The session is planned before you tap Begin.</span>
                </div>
              </li>
              <li className={s.rv} data-reveal style={d(3)}>
                <Icon
                  path={
                    <>
                      <rect x="5" y="10.5" width="14" height="10" rx="2.5" />
                      <path d="M8.5 10.5V7.5a3.5 3.5 0 0 1 7 0v3" />
                    </>
                  }
                />
                <div>
                  <b>Graded where you can&rsquo;t peek</b>
                  <span>Answer keys stay on the server, always.</span>
                </div>
              </li>
              <li className={s.rv} data-reveal style={d(4)}>
                <Icon path={<path d="M14 4h6v6M10 20H4v-6M20 4l-7 7M4 20l7-7" />} />
                <div>
                  <b>Short, then deeper on request</b>
                  <span>You decide when it&rsquo;s worth another paragraph.</span>
                </div>
              </li>
            </ul>
          </div>
          <div className={s.rv} data-reveal style={d(1)}>
            <SessionDemo />
          </div>
        </div>
      </section>

      <section className={`${s.section} ${s.tight}`} aria-labelledby="practice-title" style={{ paddingInline: 'clamp(12px, 4vw, 72px)' }}>
        <div className={s.practice}>
          <div className={s.practiceHead}>
            <span className={`${s.small} ${s.rv}`} data-reveal>
              Live voice practice
            </span>
            <h2 id="practice-title" className={`${s.h2} ${s.rv}`} data-reveal style={d(1)}>
              Rehearse the hard conversation before it&rsquo;s real.
            </h2>
            <p className={`${s.lede} ${s.rv}`} data-reveal style={d(2)}>
              Say it out loud to a partner who pushes back, changes the terms
              halfway through, then hands you a coach who quotes your own words.
            </p>
            <div className={`${s.chips} ${s.rv}`} data-reveal style={d(3)}>
              {['Negotiation', 'Pitch', 'Debate', 'Interview', 'Delegation', 'Hard conversation', 'Explaining an idea'].map(
                (c) => (
                  <span key={c} className={`${s.chip} ${s.chipStatic}`}>
                    {c}
                  </span>
                ),
              )}
            </div>
          </div>
          <div className={s.rv} data-reveal style={{ width: '100%' }}>
            <PracticeCall />
          </div>
        </div>
      </section>

      <section className={`${s.section} ${s.tight}`} aria-labelledby="bento-title">
        <h2 id="bento-title" className={`${s.h2} ${s.rv}`} data-reveal style={{ maxWidth: '11em' }}>
          Everything a great tutor does. None of the invoices.
        </h2>
        <div className={s.bento}>
          <article className={`${s.card} ${s.cell} ${s.cellMemory} ${s.rv}`} data-reveal>
            <div className={s.stack} style={{ gap: 12 }}>
              <h3 className={s.h3}>It remembers how you think.</h3>
              <p className={s.body} style={{ fontSize: 15, maxWidth: '30em' }}>
                What clicked, what didn&rsquo;t, which examples land. The next
                explanation starts from there, and you can read, pin or delete
                every memory.
              </p>
            </div>
            <ul className={s.memories}>
              {MEMORIES.map(([text, kind, pinned]) => (
                <li key={text} className={s.memory}>
                  <div>
                    {text}
                    <small>{kind}</small>
                  </div>
                  <div className={s.memoryActs} aria-hidden>
                    {pinned ? (
                      <Tool on>{PIN}</Tool>
                    ) : (
                      <>
                        <Tool>{PIN}</Tool>
                        <Tool>{BIN}</Tool>
                      </>
                    )}
                  </div>
                </li>
              ))}
              <li className={`${s.memory} ${s.candidate}`}>
                <div>
                  Gets impatient with long recaps?
                  <small>Noticed once. Waiting to see it again.</small>
                </div>
              </li>
            </ul>
          </article>
          <article className={`${s.card} ${s.cell} ${s.cellSim} ${s.rv}`} data-reveal style={d(1)}>
            <h3 className={s.h3}>It draws when words are slower.</h3>
            <p className={s.body} style={{ fontSize: 15 }}>
              Charts, flows and simulations you can pull on. Try this one.
            </p>
            <CashSim />
          </article>
          <article className={`${s.card} ${s.cell} ${s.cellMap} ${s.rv}`} data-reveal style={d(2)}>
            <h3 className={s.h3}>A map of what you actually know.</h3>
            <p className={s.body} style={{ fontSize: 15 }}>
              Ideas you stop using fade on the map, so you always know what&rsquo;s
              solid.
            </p>
            <ul className={s.map}>
              {CONCEPTS.map((c) => (
                <li key={c.name}>
                  <span>{c.name}</span>
                  <span className={s.levels} style={{ '--c': c.c } as React.CSSProperties} aria-label={c.label}>
                    {Array.from({ length: 5 }, (_, i) => (
                      <i
                        key={i}
                        data-on={i < c.on && !(c.fading && i === c.on - 1) ? '' : undefined}
                        data-fading={c.fading && i === c.on - 1 ? '' : undefined}
                      />
                    ))}
                  </span>
                  <small data-warn={c.fading ? '' : undefined}>{c.label}</small>
                </li>
              ))}
            </ul>
          </article>
          <article className={`${s.card} ${s.cell} ${s.cellCost} ${s.rv}`} data-reveal style={d(1)}>
            <p className={s.costNum}>
              <sup>$</sup>0.25
            </p>
            <div className={s.stack} style={{ gap: 10 }}>
              <h3 className={s.h3}>Private tutoring for under a quarter a morning.</h3>
              <p className={s.costBody}>Every call is logged, priced and visible to you.</p>
            </div>
          </article>
          <article className={`${s.card} ${s.cell} ${s.cellPrivate} ${s.rv}`} data-reveal style={d(2)}>
            <div className={s.stack} style={{ gap: 20 }}>
              <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="#f2f1ed" strokeWidth="1.3" strokeLinejoin="round" strokeLinecap="round" aria-hidden>
                <path d="M12 3l7 3v5c0 4.5-3 8.3-7 10-4-1.7-7-5.5-7-10V6l7-3z" />
                <path d="M8.8 12.2l2.2 2.2 4.2-4.6" />
              </svg>
              <h3 className={s.h3}>Private by construction, not by promise.</h3>
            </div>
            <ul className={s.guarantees}>
              <li>Answer keys never reach your browser.</li>
              <li>Prompts only go to providers that don&rsquo;t keep them.</li>
              <li>One button deletes every memory it has of you.</li>
            </ul>
          </article>
        </div>
      </section>

      <section className={`${s.section} ${s.tight}`} aria-labelledby="old-title">
        <h2 id="old-title" className={`${s.h2} ${s.rv}`} data-reveal>
          Out with the old school.
        </h2>
        <ol className={s.replaceList}>
          {REPLACES.map(([old, next], i) => (
            <li key={old} data-reveal style={d(i)}>
              <span className={s.old}>{old}</span>
              <span className={s.to} aria-hidden>
                →
              </span>
              <span className={s.new}>{next}</span>
            </li>
          ))}
        </ol>
      </section>

      <Finale />
    </>
  );
}
