'use client';
import { useEffect, useRef, useState } from 'react';
import s from './site.module.css';

const BEATS = ['Recall', 'Situation', 'Explain', 'Check', 'Feedback'];
const SAY = {
  base: 'Profitable on paper, short on cash. The studio earned $8,000, but $6,000 hasn’t arrived and $5,000 of costs are due Friday. The gap is timing, not income.',
  deeper:
    'Profit counts a sale when the work is billed. Cash counts it when the money lands. Between those two moments sits the receivable, and a small studio can run dry while every invoice is perfectly good.',
  example:
    'Picture a café that pre-sells 200 holiday cakes. The profit shows up in December, but the flour, butter and overtime were paid in November. Same shape, different business.',
  shorter: 'Earned $8,000. Holding $2,000. Owes $5,000 on Friday.',
} as const;
const ANSWER = 'Ask for a deposit on their next project.';
type Say = keyof typeof SAY;

export function SessionDemo() {
  const root = useRef<HTMLDivElement>(null);
  const run = useRef(0);
  const [beat, setBeat] = useState(0);
  const [bars, setBars] = useState(false);
  const [text, setText] = useState('');
  const [streaming, setStreaming] = useState<'tutor' | 'answer' | null>(null);
  const [asked, setAsked] = useState(false);
  const [answer, setAnswer] = useState('');
  const [graded, setGraded] = useState(false);
  const [chosen, setChosen] = useState<Say | null>(null);

  const reduce = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  const wait = (ms: number) => new Promise((r) => setTimeout(r, reduce() ? 0 : ms));

  async function stream(id: number, target: 'tutor' | 'answer', words: string, pace: number) {
    const set = target === 'tutor' ? setText : setAnswer;
    setStreaming(target);
    const parts = words.split(' ');
    for (let i = 1; i <= parts.length; i++) {
      if (run.current !== id) return false;
      set(parts.slice(0, i).join(' '));
      if (!reduce()) await wait(pace + Math.random() * pace * 1.3);
    }
    setStreaming(null);
    return true;
  }

  async function play() {
    const id = ++run.current;
    setChosen(null);
    setBars(false);
    setText('');
    setAsked(false);
    setAnswer('');
    setGraded(false);
    setBeat(1);
    await wait(450);
    if (run.current !== id) return;
    setBars(true);
    await wait(900);
    if (run.current !== id) return;
    setBeat(2);
    if (!(await stream(id, 'tutor', SAY.base, 26))) return;
    await wait(500);
    if (run.current !== id) return;
    setAsked(true);
    setBeat(3);
    await wait(1100);
    if (!(await stream(id, 'answer', ANSWER, 55))) return;
    await wait(700);
    if (run.current !== id) return;
    setGraded(true);
    setBeat(4);
  }

  async function follow(k: Say) {
    const id = ++run.current;
    setChosen(k);
    setBars(true);
    setAsked(true);
    setAnswer(ANSWER);
    setGraded(true);
    setBeat(4);
    await stream(id, 'tutor', SAY[k], 18);
  }

  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (!e.isIntersecting) return;
        io.disconnect();
        play();
      },
      { threshold: 0.35 },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      run.current++;
    };
  }, []);

  const show = (on: boolean) => `${s.appear} ${on ? '' : s.hidden}`;
  return (
    <div ref={root} className={`${s.card} ${s.session}`} aria-label="A live example of a Fieldwork session">
      <div className={s.sessionHead}>
        <div className={s.sessionTopic}>
          <span className={s.square} />
          Finance: cash vs. profit
        </div>
        <ol className={s.beats} aria-label="Session progress">
          {BEATS.map((b, i) => (
            <li
              key={b}
              className={i === beat ? s.beatNow : i < beat ? s.beatDone : ''}
              aria-current={i === beat ? 'step' : undefined}
            >
              {b}
            </li>
          ))}
        </ol>
      </div>
      <div className={s.sessionBody}>
        <p className={s.case}>
          Harbor &amp; Pine, a two-person design studio, billed $8,000 in March.
          Rent and contractors, $5,000, are due Friday. So far, $2,000 has
          arrived.
        </p>
        <div
          className={`${s.cash} ${bars ? s.cashGo : ''}`}
          role="img"
          aria-label="Billed $8,000, of which $2,000 received. $5,000 due Friday. Short $3,000 this week."
        >
          <div className={s.cashRow}>
            <span>Billed</span>
            <div className={s.cashTrack}>
              <div className={`${s.cashBar} ${s.cashPaid}`} style={{ width: '25%', borderRadius: '6px 0 0 6px' }} />
              <div
                className={`${s.cashBar} ${s.cashOwed}`}
                style={{ width: '75%', borderRadius: '0 6px 6px 0', transitionDelay: '250ms' }}
              />
            </div>
            <b>$8,000</b>
          </div>
          <div className={s.cashRow}>
            <span>Received</span>
            <div className={s.cashTrack}>
              <div className={`${s.cashBar} ${s.cashPaid}`} style={{ width: '25%', transitionDelay: '150ms' }} />
            </div>
            <b>$2,000</b>
          </div>
          <div className={s.cashRow}>
            <span>Due Friday</span>
            <div className={s.cashTrack}>
              <div className={`${s.cashBar} ${s.cashDue}`} style={{ width: '62.5%', transitionDelay: '300ms' }} />
            </div>
            <b>$5,000</b>
          </div>
          <div className={s.cashGap}>
            <span>Short this week</span>
            <b>−$3,000</b>
          </div>
        </div>
        <div className={s.tutor}>
          <span className={s.tutorDot} aria-hidden />
          <p className={`${s.voice} ${s.tutorText} ${streaming === 'tutor' ? s.caret : ''}`} aria-live="polite">
            {text}
          </p>
        </div>
        <div className={`${s.ask} ${show(asked)}`}>
          <p className={`${s.voice} ${s.question}`}>What would you ask the client for first?</p>
          <div className={s.answer}>
            <span className={streaming === 'answer' ? s.caret : ''}>{answer}</span>
          </div>
        </div>
        <div className={`${s.grade} ${show(graded)}`} aria-hidden={!graded}>
          <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden>
            <circle cx="12" cy="12" r="10" fill="#5fe0a4" />
            <path d="M7.5 12.5l3 3 6-6.5" stroke="#08130d" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <div>
            <b style={{ fontWeight: 600 }}>Close.</b> A deposit helps next month. This
            week, ask for the $6,000 they already owe, on shorter terms.
            <div className={s.gradeLevel}>
              Cash vs. profit <b>Learning → Practised</b>
            </div>
          </div>
        </div>
        <div className={s.follow}>
          {(['deeper', 'example', 'shorter'] as const).map((k) => (
            <button key={k} className={s.chip} aria-pressed={chosen === k} onClick={() => follow(k)}>
              {k === 'deeper' ? 'Go deeper' : k === 'example' ? 'Another example' : 'Shorter'}
            </button>
          ))}
          <button className={s.replay} onClick={play}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
              <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
              <path d="M3 3v5h5" />
            </svg>
            Replay
          </button>
        </div>
      </div>
    </div>
  );
}
