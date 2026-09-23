'use client';
import { useEffect, useRef, useState } from 'react';
import s from './site.module.css';

const LINES = [
  { who: 'them', text: 'Your quote is 12% above last year. Give me one reason to sign it.', ms: 1800 },
  { who: 'you', text: 'Fuel and driver costs moved. I can hold this price if we agree net-15 terms.', ms: 2300 },
  { who: 'them', text: 'Walk me through the fuel number first.', ms: 1500 },
  { who: 'them', text: 'And finance pays every supplier 30 days after invoice. No exceptions.', ms: 2100 },
  { who: 'you', text: 'Then keep net-30, and we split the fuel surcharge into its own line you review each quarter.', ms: 2400 },
] as const;
const TOTAL = 480;

const check = (
  <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden>
    <circle cx="12" cy="12" r="10" fill="#5fe0a4" />
    <path d="M7.5 12.5l3 3 6-6.5" stroke="#08130d" strokeWidth="2.2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export function PracticeCall() {
  const root = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const speaker = useRef<0 | 1 | 2>(0);
  const run = useRef(0);
  const [shown, setShown] = useState(0);
  const [cue, setCue] = useState(false);
  const [done, setDone] = useState(false);
  const [seconds, setSeconds] = useState(252);

  // Waveform: drawn every frame while on screen, from whoever is speaking.
  useEffect(() => {
    const el = canvas.current;
    const ctx = el?.getContext('2d');
    if (!el || !ctx) return;
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    let raf = 0,
      visible = false,
      level = 0;
    const size = () => {
      const d = Math.min(devicePixelRatio || 1, 2);
      el.width = el.clientWidth * d;
      el.height = el.clientHeight * d;
      ctx.setTransform(d, 0, 0, d, 0, 0);
    };
    const draw = (now: number) => {
      raf = 0;
      const w = el.clientWidth,
        h = el.clientHeight,
        n = Math.floor(w / 5),
        t = now / 1000,
        target = speaker.current ? 1 : 0;
      level += (target - level) * 0.08;
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = speaker.current === 2 ? '#5fe0a4' : '#f2f1ed';
      for (let i = 0; i < n; i++) {
        const u = i / n,
          env = Math.sin(Math.PI * u) ** 1.4,
          voice = Math.abs(Math.sin(t * 5.3 + i * 0.35) * Math.cos(t * 2.1 + i * 0.12)),
          idle = 0.05 + 0.03 * Math.sin(t * 2 + i * 0.6),
          amp = idle * (1 - level) + (0.2 + 0.8 * voice) * env * level,
          bh = Math.max(2, amp * h * 0.92);
        ctx.globalAlpha = 0.25 + 0.7 * level;
        ctx.beginPath();
        ctx.roundRect(i * 5, (h - bh) / 2, 2.4, bh, 1.2);
        ctx.fill();
      }
      if (visible && !reduce) raf = requestAnimationFrame(draw);
    };
    const io = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting;
      if (visible && !raf) raf = requestAnimationFrame(draw);
    });
    const ro = new ResizeObserver(size);
    ro.observe(el);
    io.observe(el);
    size();
    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
      ro.disconnect();
    };
  }, []);

  async function play() {
    const id = ++run.current;
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const wait = (ms: number) => new Promise((r) => setTimeout(r, reduce ? 0 : ms));
    setShown(0);
    setCue(false);
    setDone(false);
    const start = performance.now();
    const clock = setInterval(() => {
      if (run.current !== id) return clearInterval(clock);
      setSeconds(Math.min(TOTAL, 252 + Math.round(((performance.now() - start) / 1000) * 9)));
    }, 250);
    for (let i = 0; i < LINES.length; i++) {
      if (i === 3) {
        setCue(true);
        await wait(1300);
      }
      if (run.current !== id) return;
      speaker.current = LINES[i].who === 'you' ? 2 : 1;
      setShown(i + 1);
      await wait(LINES[i].ms);
      speaker.current = 0;
      await wait(450);
    }
    if (run.current !== id) return;
    clearInterval(clock);
    setDone(true);
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
      { threshold: 0.3 },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      run.current++;
    };
  }, []);

  const mm = String(Math.floor(seconds / 60)).padStart(2, '0'),
    ss = String(seconds % 60).padStart(2, '0');
  const bubble = (i: number) => {
    const line = LINES[i];
    return (
      <li
        key={i}
        className={`${s.bubble} ${line.who === 'you' ? s.you : s.them} ${i < shown ? '' : s.hidden}`}
      >
        {line.text}
      </li>
    );
  };
  return (
    <div ref={root} className={s.call}>
      <div className={`${s.card} ${s.callMain}`}>
        <div className={s.callTop}>
          <div className={s.avatar} aria-hidden>
            DO
          </div>
          <div className={s.who}>
            <b>Dana Okafor</b>
            <span>Procurement lead, Halvard Freight</span>
          </div>
          <div className={s.live}>
            <span className={s.rec} aria-hidden />
            <span>
              {mm}:{ss}
            </span>
            <span style={{ color: 'var(--text-4)' }}>/ 08:00</span>
          </div>
        </div>
        <canvas ref={canvas} className={s.wave} aria-hidden />
        <div className={s.progress} aria-hidden>
          <div className={s.progressFill} style={{ transform: `scaleX(${seconds / TOTAL})` }} />
          <span className={s.cue} style={{ left: '38%' }} />
          <span className={s.cue} style={{ left: '66%' }} />
        </div>
        <ol className={s.transcript} aria-label="Call transcript">
          {[0, 1, 2].map(bubble)}
          <li className={`${s.complication} ${cue ? '' : s.hidden}`}>
            <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden>
              <path d="M13 2L4 14h7l-1 8 9-12h-7l1-8z" fill="#f3b862" />
            </svg>
            Complication: finance pays every supplier 30 days after invoice.
          </li>
          {[3, 4].map(bubble)}
        </ol>
      </div>
      <aside className={`${s.card} ${s.feedback} ${done ? '' : s.feedbackDim}`} aria-label="Feedback after the call">
        <div className={s.feedbackHead}>
          <span className={s.small}>Feedback</span>
          <button className={s.replay} onClick={play}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
              <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
              <path d="M3 3v5h5" />
            </svg>
            Replay
          </button>
        </div>
        <div className={s.fbRow}>
          <span className={s.small}>Your best line</span>
          <p className={`${s.voice} ${s.fbQuote}`}>
            &ldquo;Split the fuel surcharge into its own line you review each quarter.&rdquo;
          </p>
        </div>
        <div className={s.fbRow}>
          <span className={s.small}>One change</span>
          <p>You offered a trade before she named her constraint. Ask first, then trade.</p>
        </div>
        <ul className={s.criteria}>
          <li>{check}Held the price under pressure</li>
          <li>{check}Turned a no into an option</li>
          <li>
            <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden>
              <circle cx="12" cy="12" r="9" fill="none" stroke="#f3b862" strokeWidth="2" />
              <path d="M12 3a9 9 0 0 1 0 18z" fill="#f3b862" />
            </svg>
            Asked before conceding
          </li>
        </ul>
      </aside>
    </div>
  );
}
