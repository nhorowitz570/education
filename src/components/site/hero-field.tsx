'use client';
import { useEffect, useRef, useState } from 'react';
import s from './site.module.css';

// A year of mornings as a 12 × 12 field: four sessions a week, coloured by
// the subject each weekday carries. Past mornings are filled, the rest are
// open rings, and tomorrow is the one lit point. Dots swell toward the
// pointer; the lit morning keeps a slow ring rather than a glow.
const COLS = 12,
  COUNT = 144,
  DONE = 27,
  LIT = 27,
  TRACK = ['#5fe0a4', '#f3b862', '#5fe0a4', '#a898ff'],
  SUBJECT = ['Finance', 'Communication', 'Finance', 'Judgment'],
  DAY = ['Monday', 'Tuesday', 'Wednesday', 'Thursday'];

export function HeroField() {
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const tip = useRef<HTMLDivElement>(null);
  const [lit, setLit] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const el = canvas.current,
      box = wrap.current;
    if (!el || !box) return;
    const ctx = el.getContext('2d');
    if (!ctx) return;
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    let w = 0,
      gap = 0,
      origin = 0,
      raf = 0,
      visible = true;
    const pointer = { x: -1e4, y: -1e4, tx: -1e4, ty: -1e4 };
    const born = performance.now();
    const pos = (i: number) => [origin + (i % COLS) * gap, origin + Math.floor(i / COLS) * gap] as const;
    const size = () => {
      const dpr = Math.min(devicePixelRatio || 1, 2);
      w = box.clientWidth;
      el.width = w * dpr;
      el.height = w * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      gap = w / (COLS + 0.6);
      origin = (w - gap * (COLS - 1)) / 2;
      const [x, y] = pos(LIT);
      setLit({ x, y });
    };
    const frame = (now: number) => {
      raf = 0;
      const t = (now - born) / 1000;
      pointer.x += (pointer.tx - pointer.x) * 0.16;
      pointer.y += (pointer.ty - pointer.y) * 0.16;
      ctx.clearRect(0, 0, w, w);
      let hover = -1,
        best = gap * 0.5;
      for (let i = 0; i < COUNT; i++) {
        const [x, y] = pos(i),
          day = i % 4,
          delay = ((i % COLS) + Math.floor(i / COLS)) * 0.035,
          intro = reduce ? 1 : Math.min(1, Math.max(0, (t - 0.2 - delay) / 0.6)),
          ease = 1 - (1 - intro) ** 3;
        if (intro <= 0) continue;
        const d = Math.hypot(x - pointer.x, y - pointer.y);
        if (d < best) {
          best = d;
          hover = i;
        }
        const near = Math.max(0, 1 - d / (gap * 3.2)) ** 1.5;
        ctx.beginPath();
        if (i === LIT) {
          const breath = reduce ? 0.5 : (Math.sin(t * 1.9) + 1) / 2;
          ctx.globalAlpha = ease * (0.2 + 0.25 * breath);
          ctx.arc(x, y, gap * (0.3 + 0.06 * breath), 0, Math.PI * 2);
          ctx.strokeStyle = '#f2f1ed';
          ctx.lineWidth = 1;
          ctx.stroke();
          ctx.beginPath();
          ctx.globalAlpha = ease;
          ctx.arc(x, y, gap * 0.135 * ease, 0, Math.PI * 2);
          ctx.fillStyle = '#f2f1ed';
          ctx.fill();
          continue;
        }
        const r = gap * 0.08 * (0.5 + 0.5 * ease) * (1 + near * 1.2);
        ctx.arc(x, y, r, 0, Math.PI * 2);
        if (i < DONE) {
          ctx.globalAlpha = ease * (0.55 + near * 0.45);
          ctx.fillStyle = TRACK[day];
          ctx.fill();
        } else {
          ctx.globalAlpha = ease * (0.3 + near * 0.6);
          ctx.strokeStyle = TRACK[day];
          ctx.lineWidth = 1.1;
          ctx.stroke();
        }
      }
      ctx.globalAlpha = 1;
      const tipEl = tip.current;
      if (tipEl) {
        if (hover >= 0 && hover !== LIT) {
          const [x, y] = pos(hover);
          tipEl.innerHTML = `<b>Week ${Math.floor(hover / 4) + 1}, ${DAY[hover % 4]}</b><span>${SUBJECT[hover % 4]}${hover < DONE ? ' · done' : ''}</span>`;
          tipEl.style.transform = `translate(${x}px, ${y}px)`;
          tipEl.classList.add(s.tipOn);
        } else tipEl.classList.remove(s.tipOn);
      }
      const settling = Math.abs(pointer.tx - pointer.x) > 0.5 || Math.abs(pointer.ty - pointer.y) > 0.5;
      if (visible && (!reduce || settling || t < 0.1)) raf = requestAnimationFrame(frame);
    };
    const kick = () => {
      if (!raf && visible) raf = requestAnimationFrame(frame);
    };
    const move = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return;
      const r = el.getBoundingClientRect();
      pointer.tx = e.clientX - r.left;
      pointer.ty = e.clientY - r.top;
      kick();
    };
    const leave = () => {
      pointer.tx = pointer.ty = -1e4;
      kick();
    };
    const ro = new ResizeObserver(() => {
      size();
      kick();
    });
    const io = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting;
      kick();
    });
    ro.observe(box);
    io.observe(box);
    box.addEventListener('pointermove', move);
    box.addEventListener('pointerleave', leave);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      box.removeEventListener('pointermove', move);
      box.removeEventListener('pointerleave', leave);
    };
  }, []);

  return (
    <div
      ref={wrap}
      className={s.field}
      role="img"
      aria-label="A year of learning mornings drawn as 144 points. Past mornings are filled and tomorrow's is lit."
    >
      <canvas ref={canvas} className={s.fieldCanvas} />
      <div ref={tip} className={s.fieldTip} aria-hidden />
      {lit && (
        <div
          className={s.nextCard}
          style={{ '--x': `${lit.x}px`, '--y': `${lit.y}px` } as React.CSSProperties}
          aria-hidden
        >
          <span className={s.connector} />
          <div className={s.nextWhen}>
            <span className={s.square} />
            Tomorrow, 7:30
          </div>
          <div className={s.nextTitle}>Why profitable studios run out of cash</div>
          <div className={s.nextMeta}>
            <span>25 min</span>
            <span>3 reviews due</span>
          </div>
        </div>
      )}
    </div>
  );
}
