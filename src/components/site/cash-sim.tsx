'use client';
import { useState } from 'react';
import s from './site.module.css';

// The kind of visual the tutor can hand you: pull on payment terms and watch
// this month's cash move. A toy model, labelled as one.
const DUE = 5000;
const money = (n: number) => (n < 0 ? '−$' : '$') + Math.abs(n).toLocaleString('en-US');

export function CashSim() {
  const [days, setDays] = useState(45);
  const received = Math.round((8000 * Math.max(0, 1 - days / 60)) / 50) * 50,
    gap = received - DUE;
  return (
    <div className={s.sim}>
      <label className={s.simRow} htmlFor="terms">
        <span>Client pays</span>
        <output htmlFor="terms">{days === 0 ? 'on delivery' : `${days} days`}</output>
      </label>
      <input
        id="terms"
        className={s.range}
        type="range"
        min={0}
        max={60}
        step={5}
        value={days}
        onChange={(e) => setDays(Number(e.target.value))}
        style={{ '--p': `${(days / 60) * 100}%` } as React.CSSProperties}
        aria-valuetext={`${days} days, ${money(gap)} after costs`}
      />
      <div className={s.simRow}>
        <span>Cash in this month</span>
        <b>{money(received)}</b>
      </div>
      <div className={s.simBar} style={{ transform: `scaleX(${Math.max(0.02, received / 8000)})` }} />
      <div className={s.simRow}>
        <span>After $5,000 of costs</span>
        <b className={gap < 0 ? s.simNeg : s.simPos}>{money(gap)}</b>
      </div>
    </div>
  );
}
