'use client';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '@/lib/client/api';
import { Icon } from '@/components/icons';
import {
  ACHIEVEMENTS,
  KINDS,
  MONTHS,
  bounds,
  breakEven,
  calendarOf,
  capacityOf,
  demandAt,
  forecast,
  unitMargin,
  value,
  type Levers,
  type MonthResult,
  type Venture,
} from '@/lib/venture/engine';
import { XP } from '@/lib/gamify';
import { Scene } from './scene';
import { Portrait } from './portrait';
import { Onboarding } from './onboarding';
import { reducedMotion } from '@/lib/client/motion';

export type Tool = { id: 'forecast' | 'margin' | 'breakeven' | 'receivables' | 'capacity'; label: string; detail: string; hint: string; unlocked: boolean };
export type View = {
  venture: Venture | null;
  revision: number | null;
  months: { earned: number; used: number; available: number } | null;
  tools: Tool[];
  founder: string;
};
type Save = 'saved' | 'saving' | 'error';

const $ = (n: number) => (n < 0 ? '−$' : '$') + Math.abs(Math.round(n)).toLocaleString();

export default function Game({ initial }: { initial: View }) {
  const [view, setView] = useState(initial);
  const [draft, setDraft] = useState<Levers | null>(initial.venture?.levers || null);
  const [save, setSave] = useState<Save>('saved');
  const [error, setError] = useState('');
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<{ result: MonthResult; before: Venture; unlocked: string[] } | null>(null);
  const revision = useRef(initial.revision);
  const queue = useRef(Promise.resolve());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const v = view.venture;

  // Every change is saved in order, so the revision always lines up.
  const send = useCallback(<T,>(body: Record<string, unknown>) => {
    const job = queue.current.then(() => api<T & { venture: Venture; revision: number }>('/api/venture', { ...body, revision: revision.current }));
    queue.current = job.then(
      (r) => void (revision.current = r.revision),
      () => undefined,
    );
    return job;
  }, []);

  // Autosave: lever changes are written a moment after the last touch.
  const latest = useRef(draft);
  const change = useCallback(
    (patch: Partial<Levers>) => {
      if (!latest.current) return;
      latest.current = { ...latest.current, ...patch };
      setDraft(latest.current);
      setSave('saving');
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        send({ action: 'levers', levers: latest.current })
          .then((r) => {
            setView((x) => ({ ...x, venture: r.venture }));
            setSave('saved');
          })
          .catch((e) => {
            setSave('error');
            setError((e as Error).message);
          });
      }, 700);
    },
    [send],
  );
  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);

  const decide = async (index: number) => {
    setSave('saving');
    try {
      const r = await send({ action: 'choose', index });
      setView((x) => ({ ...x, venture: r.venture }));
      // A decision can change the team; keep any unsaved edits to the rest.
      if (latest.current) setDraft((latest.current = { ...latest.current, staff: r.venture.levers.staff }));
      setSave('saved');
    } catch (e) {
      setSave('error');
      setError((e as Error).message);
    }
  };

  const advance = async () => {
    if (!v || !draft) return;
    if (timer.current) clearTimeout(timer.current);
    setRunning(true);
    setError('');
    const started = Date.now();
    try {
      const r = await send<{ result: MonthResult; months: View['months'] }>({ action: 'advance', levers: latest.current });
      // Let the days fly by for at least a moment.
      await new Promise((ok) => setTimeout(ok, Math.max(0, 2200 - (Date.now() - started))));
      const unlocked = r.venture.achievements.filter((a) => !v.achievements.includes(a));
      setResult({ result: r.result, before: v, unlocked });
      setView((x) => ({ ...x, venture: r.venture, months: r.months }));
      setDraft((latest.current = r.venture.levers));
      setSave('saved');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setRunning(false);
    }
  };

  if (!v || !draft)
    return (
      <Onboarding
        founder={view.founder}
        onCreate={async (input: { kind: Venture['kind']; name: string; founder: string; loan: boolean }) => {
          const r = await api<{ venture: Venture; revision: number }>('/api/venture', { action: 'create', ...input });
          revision.current = r.revision;
          setView((x) => ({ ...x, venture: r.venture, revision: r.revision, months: x.months || { earned: 3, used: 0, available: 3 } }));
          setDraft((latest.current = r.venture.levers));
        }}
      />
    );

  const k = KINDS[v.kind];
  const last = v.history.at(-1);
  const months = view.months || { earned: 3, used: 0, available: 3 };
  const decided = !v.event || v.event.chosen !== undefined;
  const live: Venture = { ...v, levers: draft };

  if (v.status === 'bankrupt')
    return (
      <Closed
        v={v}
        onRestart={async () => {
          const r = await api<{ venture: Venture; revision: number }>('/api/venture', {
            action: 'create',
            kind: v.kind,
            name: v.name,
            founder: v.founder,
            loan: false,
            restart: true,
          });
          revision.current = r.revision;
          setView((x) => ({ ...x, venture: r.venture }));
          setDraft((latest.current = r.venture.levers));
        }}
      />
    );

  return (
    <div className="vg">
      <Hud v={v} months={months.available} save={save} />
      <div className="vg-stage">
        <div className="px-frame">
          <Scene
            kind={v.kind}
            name={v.name}
            equipment={v.equipment}
            staff={draft.staff}
            busy={last ? Math.min(1, last.units / Math.max(1, k.demand * 1.3)) : 0.3}
            queue={!!last && last.turnedAway > last.demand * 0.1}
            reputation={v.reputation}
            calendar={calendarOf(v)}
            playing={running}
          />
          {running && (
            <div className="px-running" role="status">
              <span className="px-font">Running {MONTHS[calendarOf(v)]}…</span>
            </div>
          )}
        </div>
      </div>

      {error && (
        <p className="vg-error" role="alert">
          {error}{' '}
          <button className="link" onClick={() => setError('')}>
            Dismiss
          </button>
        </p>
      )}

      <div className="vg-grid">
        <div className="vg-col">
          {v.debrief && <Debrief text={v.debrief} month={v.month} />}
          {v.event && <EventCard event={v.event} onChoose={(i) => void decide(i)} disabled={running} />}
        </div>
        <div className="vg-col">
          <PlanPanel v={live} onChange={change} tools={view.tools} />
          <div className="vg-run">
            {months.available > 0 ? (
              <button className="px-btn primary big" disabled={!decided || running} onClick={() => void advance()} data-busy={running || undefined}>
                {running ? 'Running…' : `Run ${MONTHS[calendarOf(v)]}`} <Icon name="play" size={16} />
              </button>
            ) : (
              <div className="vg-earn">
                <p className="px-font">No months left</p>
                <p className="muted">Finish a session to earn two more months; a review or practice earns one.</p>
                <Link href="/" className="btn primary">
                  Go to today’s session
                </Link>
              </div>
            )}
            <p className="label">
              {!decided
                ? 'Decide how to handle this month’s event first.'
                : `${months.available} month${months.available === 1 ? '' : 's'} available · +2 per session, +1 per review or practice`}
            </p>
          </div>
        </div>
      </div>

      {last && <Books v={v} last={last} tools={view.tools} />}
      <Trophies v={v} />
      {result && <ResultModal {...result} v={v} onClose={() => setResult(null)} />}
    </div>
  );
}

// ---------- HUD ----------

function Hud({ v, months, save }: { v: Venture; months: number; save: Save }) {
  const last = v.history.at(-1);
  return (
    <header className="vg-hud">
      <div className="vg-title">
        <p className="px-font vg-name">{v.name}</p>
        <p className="label">
          {KINDS[v.kind].label} · Month {v.month + 1} · {MONTHS[calendarOf(v)]}
        </p>
      </div>
      <div className="vg-stats">
        <Stat label="Cash" value={$(v.cash)} tone={v.cash < KINDS[v.kind].rent * 2 ? 'bad' : undefined} />
        <Stat label="Last profit" value={last ? $(last.profit) : '—'} tone={last ? (last.profit >= 0 ? 'good' : 'bad') : undefined} />
        <Stat label="Value" value={$(value(v))} />
        <Stat label="Reputation" value={<Pips n={v.reputation} />} />
        <Stat label="Team" value={<Pips n={v.morale} kind="heart" />} />
        <Stat label="Months" value={String(months)} tone={months ? undefined : 'bad'} />
      </div>
      <span className={'vg-save s-' + save} role="status" aria-live="polite">
        {save === 'saving' ? 'Saving…' : save === 'error' ? 'Not saved' : 'Saved'}
      </span>
    </header>
  );
}
function Stat({ label, value, tone }: { label: string; value: React.ReactNode; tone?: 'good' | 'bad' }) {
  return (
    <div className={'vg-stat' + (tone ? ' ' + tone : '')}>
      <span className="px-font">{label}</span>
      <b className="num">{value}</b>
    </div>
  );
}
// Five pixel pips for a 0–100 score.
function Pips({ n, kind = 'star' }: { n: number; kind?: 'star' | 'heart' }) {
  const on = Math.round(n / 20);
  return (
    <span className={'px-pips ' + kind} aria-label={`${Math.round(n)} out of 100`}>
      {Array.from({ length: 5 }, (_, i) => (
        <i key={i} className={i < on ? 'on' : ''} />
      ))}
    </span>
  );
}

// ---------- Story ----------

function Typewriter({ text }: { text: string }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (reducedMotion()) return setN(text.length);
    setN(0);
    const t = setInterval(() => setN((x) => (x >= text.length ? (clearInterval(t), x) : x + 3)), 16);
    return () => clearInterval(t);
  }, [text]);
  return (
    <p className="vg-story" onClick={() => setN(text.length)}>
      {text.slice(0, n)}
      <span className="sr-only">{text.slice(n)}</span>
    </p>
  );
}

function EventCard({ event, onChoose, disabled }: { event: NonNullable<Venture['event']>; onChoose: (i: number) => void; disabled: boolean }) {
  const chosen = event.chosen;
  return (
    <section className="px-box vg-event" aria-label="This month’s event">
      <div className="vg-event-head">
        <Portrait size={44} />
        <div>
          <p className="px-font vg-kicker">This month</p>
          <h2 className="vg-headline">{event.headline}</h2>
        </div>
      </div>
      <Typewriter text={event.story} />
      <p className="vg-concept">
        <Icon name="spark" size={13} /> Uses: {event.concept}
      </p>
      <div className="vg-choices" role="group" aria-label="Your options">
        {event.choices.map((c, i) => (
          <button
            key={i}
            className={'px-choice' + (chosen === i ? ' chosen' : '') + (chosen !== undefined && chosen !== i ? ' faded' : '')}
            disabled={disabled || chosen !== undefined}
            onClick={() => onChoose(i)}
          >
            <span className="px-font px-key">{String.fromCharCode(65 + i)}</span>
            <span>
              <b>{c.label}</b>
              <span className="muted">{c.detail}</span>
            </span>
          </button>
        ))}
      </div>
      {chosen !== undefined && <p className="label">Decided. Its effects play out over the coming months.</p>}
    </section>
  );
}

function Debrief({ text, month }: { text: string; month: number }) {
  return (
    <section className="px-box vg-debrief" aria-label="Last month, read by your accountant">
      <div className="vg-event-head">
        <Portrait size={36} />
        <div>
          <p className="px-font vg-kicker">Marta · month {month} review</p>
          <p className="vg-debrief-text">{text}</p>
        </div>
      </div>
    </section>
  );
}

// ---------- The plan for the month ----------

function PlanPanel({ v, onChange, tools }: { v: Venture; onChange: (p: Partial<Levers>) => void; tools: Tool[] }) {
  const k = KINDS[v.kind];
  const b = bounds(v);
  const L = v.levers;
  const demand = Math.round(demandAt(v, L.price, L.marketing));
  const capacity = Math.round(capacityOf(v, L.staff, v.equipment + (L.upgrade ? 1 : 0)));
  const next = k.equipment[v.equipment + 1];
  const unlocked = (id: Tool['id']) => tools.find((t) => t.id === id)?.unlocked;
  return (
    <section className="px-box vg-plan" aria-label="This month’s plan">
      <p className="px-font vg-kicker">This month’s plan</p>
      <Slider
        label={`Price per ${k.unit}`}
        value={L.price}
        min={b.price.min}
        max={b.price.max}
        step={k.price >= 100 ? 50 : 0.5}
        format={(n) => '$' + n.toLocaleString()}
        note={`About ${demand.toLocaleString()} ${k.units} of demand at this price`}
        onChange={(price) => onChange({ price })}
      />
      <Slider
        label="Marketing"
        value={L.marketing}
        min={0}
        max={b.marketing.max}
        step={k.price * k.demand >= 20000 ? 100 : 50}
        format={(n) => $(n) + '/mo'}
        note="Brings in customers, with diminishing returns"
        onChange={(marketing) => onChange({ marketing })}
      />
      <Stepper
        label="Staff"
        value={L.staff}
        min={0}
        max={b.staff.max}
        onChange={(staff) => onChange({ staff })}
        note={`${L.staff ? `${$(L.staff * k.wage)}/mo in wages · ` : ''}capacity ${capacity.toLocaleString()} ${k.units}`}
      />
      {k.inventory && (
        <Stepper
          label={`Buy stock (${k.units})`}
          value={L.restock}
          min={0}
          max={b.restock.max}
          step={k.demand >= 500 ? 50 : 5}
          onChange={(restock) => onChange({ restock })}
          note={`${$(L.restock * k.unitCost)} paid now · ${v.inventory.toLocaleString()} already in stock${k.spoil > 0.3 ? ' · leftovers spoil' : ''}`}
        />
      )}
      <div className="vg-finance">
        <Stepper
          label="Borrow"
          value={L.borrow}
          min={0}
          max={b.borrow.max}
          step={1000}
          format={$}
          onChange={(borrow) => onChange({ borrow })}
          note={`9% a year over two years · debt now ${$(v.debt)}`}
        />
        {v.debt > 0 && (
          <Stepper label="Extra repayment" value={L.repay} min={0} max={b.repay.max} step={500} format={$} onChange={(repay) => onChange({ repay })} />
        )}
      </div>
      {next && (
        <label className={'vg-upgrade' + (L.upgrade ? ' on' : '')}>
          <input type="checkbox" checked={L.upgrade} onChange={(e) => onChange({ upgrade: e.target.checked })} disabled={v.cash < next.cost && !L.upgrade} />
          <span>
            <b>Upgrade: {next.name}</b>
            <span className="muted">
              {$(next.cost)} now · capacity ×{(next.mult / k.equipment[v.equipment].mult).toFixed(1)} · shows up as depreciation, not one big loss
            </span>
          </span>
        </label>
      )}
      {(unlocked('capacity') || unlocked('margin') || unlocked('breakeven')) && (
        <div className="vg-insights">
          {unlocked('capacity') && <Meter label="Demand vs capacity" a={demand} b={capacity} unit={k.units} />}
          {unlocked('margin') && (
            <p>
              <span className="px-font">Unit margin</span> {$(unitMargin(v))} per {k.unit} ({Math.round((unitMargin(v) / L.price) * 100)}%)
            </p>
          )}
          {unlocked('breakeven') && (
            <p>
              <span className="px-font">Break-even</span>{' '}
              {Number.isFinite(breakEven(v)) ? `${breakEven(v).toLocaleString()} ${k.units} a month` : 'never at this price'}
            </p>
          )}
        </div>
      )}
      {unlocked('forecast') && <Forecast v={v} />}
    </section>
  );
}

function Slider(p: { label: string; value: number; min: number; max: number; step: number; format: (n: number) => string; note?: string; onChange: (n: number) => void }) {
  return (
    <label className="vg-field">
      <span className="vg-field-head">
        <span>{p.label}</span>
        <b className="num">{p.format(p.value)}</b>
      </span>
      <input
        type="range"
        className="px-range"
        min={p.min}
        max={p.max}
        step={p.step}
        value={p.value}
        onChange={(e) => p.onChange(Number(e.target.value))}
        style={{ '--p': (p.value - p.min) / (p.max - p.min || 1) } as React.CSSProperties}
      />
      {p.note && <span className="label">{p.note}</span>}
    </label>
  );
}
function Stepper(p: { label: string; value: number; min: number; max: number; step?: number; format?: (n: number) => string; note?: string; onChange: (n: number) => void }) {
  const step = p.step || 1;
  const set = (n: number) => p.onChange(Math.min(p.max, Math.max(p.min, n)));
  return (
    <div className="vg-field">
      <span className="vg-field-head">
        <span>{p.label}</span>
        <span className="px-stepper">
          <button className="px-btn small" onClick={() => set(p.value - step)} disabled={p.value <= p.min} aria-label={`Less ${p.label.toLowerCase()}`}>
            −
          </button>
          <b className="num">{p.format ? p.format(p.value) : p.value.toLocaleString()}</b>
          <button className="px-btn small" onClick={() => set(p.value + step)} disabled={p.value >= p.max} aria-label={`More ${p.label.toLowerCase()}`}>
            +
          </button>
        </span>
      </span>
      {p.note && <span className="label">{p.note}</span>}
    </div>
  );
}
function Meter({ label, a, b, unit }: { label: string; a: number; b: number; unit: string }) {
  const max = Math.max(a, b, 1);
  return (
    <div className="vg-meter">
      <span className="px-font">{label}</span>
      <div className="vg-bars">
        <i className="d" style={{ width: `${(a / max) * 100}%` }} />
        <i className="c" style={{ width: `${(b / max) * 100}%` }} />
      </div>
      <span className="label">
        {a.toLocaleString()} wanted · {b.toLocaleString()} {unit} you can deliver
      </span>
    </div>
  );
}
function Forecast({ v }: { v: Venture }) {
  const f = useMemo(() => forecast(v), [v]);
  return (
    <div className="vg-forecast">
      <p className="px-font">Cash forecast</p>
      <p>
        Profit about <b className={'num ' + (f.profit >= 0 ? 'good' : 'bad')}>{$(f.profit)}</b>; cash {f.cashEnd >= f.cashStart ? 'up' : 'down'} to{' '}
        <b className="num">{$(f.cashEnd)}</b>.
      </p>
      {f.profit > 0 && f.cashEnd < f.cashStart && <p className="label">Profitable, yet cash falls: stock paid for now, or money still owed to you.</p>}
    </div>
  );
}

// ---------- The books ----------

function Books({ v, last, tools }: { v: Venture; last: MonthResult; tools: Tool[] }) {
  const k = KINDS[v.kind];
  const receivables = tools.find((t) => t.id === 'receivables')?.unlocked;
  const cashMove = last.cashEnd - last.cashStart;
  const gap = last.profit - cashMove;
  return (
    <section className="vg-books">
      <p className="eyebrow">The books · month {last.month}</p>
      <div className="vg-statements">
        <div className="px-box">
          <p className="px-font vg-kicker">Profit: what you earned</p>
          <Line label={`Revenue (${last.units.toLocaleString()} ${k.units})`} n={last.revenue} />
          <Line label="Cost of what you sold" n={-last.cogs} />
          {last.waste > 0 && <Line label="Spoiled stock" n={-last.waste} />}
          <Line label="Rent" n={-last.opex.rent} />
          <Line label="Wages (including your own pay)" n={-last.opex.wages} />
          <Line label="Marketing" n={-last.opex.marketing} />
          {last.opex.interest > 0 && <Line label="Interest" n={-last.opex.interest} />}
          {last.opex.depreciation > 0 && <Line label="Depreciation" n={-last.opex.depreciation} />}
          <Line label="Profit" n={last.profit} total />
        </div>
        <div className="px-box">
          <p className="px-font vg-kicker">Cash: what moved in the bank</p>
          <Line label="Collected from customers" n={last.collected} />
          {last.borrowed > 0 && <Line label="Borrowed" n={last.borrowed} />}
          {last.spent.stock > 0 && <Line label="Stock bought" n={-last.spent.stock} />}
          {last.spent.costs > 0 && <Line label="Costs of delivery" n={-last.spent.costs} />}
          <Line label="Rent, wages, marketing, interest" n={-last.spent.opex} />
          {last.spent.loan > 0 && <Line label="Loan repaid" n={-last.spent.loan} />}
          {last.spent.equipment > 0 && <Line label="Equipment" n={-last.spent.equipment} />}
          <Line label="Change in cash" n={cashMove} total />
        </div>
      </div>
      {Math.abs(gap) > 50 && (
        <p className="vg-gap">
          Profit and cash differ by <b className="num">{$(Math.abs(gap))}</b> this month.{' '}
          {gap > 0
            ? 'You earned more than you banked: money is still owed to you, or it went into stock or equipment.'
            : 'You banked more than you earned: you collected old invoices, sold stock bought earlier, or borrowed.'}
        </p>
      )}
      {last.notes.length > 0 && (
        <ul className="vg-notes">
          {last.notes.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      )}
      {receivables && v.receivables.length > 0 && (
        <div className="vg-owed">
          <p className="px-font vg-kicker">Who owes you</p>
          {[...new Set(v.receivables.map((r) => r.month))].sort((a, b) => a - b).map((m) => (
            <Line key={m} label={`Due in ${MONTHS[calendarOf(v, m)]}`} n={v.receivables.filter((r) => r.month === m).reduce((s, r) => s + r.amount, 0)} />
          ))}
        </div>
      )}
      {v.history.length >= 2 && <History v={v} />}
      <ToolList tools={tools} />
    </section>
  );
}
function Line({ label, n, total }: { label: string; n: number; total?: boolean }) {
  return (
    <p className={'vg-line' + (total ? ' total' : '')}>
      <span>{label}</span>
      <b className={'num' + (total ? (n >= 0 ? ' good' : ' bad') : '')}>{$(n)}</b>
    </p>
  );
}

// Cash as a line, profit as bars, month by month.
function History({ v }: { v: Venture }) {
  const h = v.history.slice(-12);
  const wide = 320,
    tall = 90,
    pad = 6;
  const vals = [...h.map((x) => x.cashEnd), ...h.map((x) => x.profit), 0];
  const lo = Math.min(...vals),
    hi = Math.max(...vals);
  const y = (n: number) => pad + (1 - (n - lo) / (hi - lo || 1)) * (tall - pad * 2);
  const x = (i: number) => pad + (i / Math.max(1, h.length - 1)) * (wide - pad * 2);
  const bw = Math.max(4, (wide - pad * 2) / h.length - 6);
  return (
    <figure className="vg-history">
      <figcaption className="px-font vg-kicker">
        Cash <i className="key cash" /> and profit <i className="key profit" /> by month
      </figcaption>
      <svg viewBox={`0 0 ${wide} ${tall}`} role="img" aria-label={`Cash went from ${$(h[0].cashEnd)} to ${$(h.at(-1)!.cashEnd)} over ${h.length} months.`}>
        <line x1={0} x2={wide} y1={y(0)} y2={y(0)} className="zero" />
        {h.map((m, i) => (
          <rect key={m.month} x={x(i) - bw / 2} width={bw} y={Math.min(y(0), y(m.profit))} height={Math.max(1, Math.abs(y(m.profit) - y(0)))} className={m.profit >= 0 ? 'bar good' : 'bar bad'} />
        ))}
        <polyline points={h.map((m, i) => `${x(i)},${y(m.cashEnd)}`).join(' ')} className="cash" />
        {h.map((m, i) => (
          <rect key={'p' + m.month} x={x(i) - 2} y={y(m.cashEnd) - 2} width={4} height={4} className="cash-pt" />
        ))}
      </svg>
    </figure>
  );
}

function ToolList({ tools }: { tools: Tool[] }) {
  const locked = tools.filter((t) => !t.unlocked);
  if (!locked.length) return null;
  return (
    <div className="vg-tools">
      <p className="px-font vg-kicker">Learn to unlock</p>
      <div className="vg-tool-grid">
        {tools.map((t) => (
          <div key={t.id} className={'vg-tool' + (t.unlocked ? ' on' : '')}>
            <Icon name={t.unlocked ? 'check' : 'key'} size={14} />
            <b>{t.label}</b>
            <span className="label">{t.unlocked ? t.detail : t.hint}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Trophies({ v }: { v: Venture }) {
  if (!v.achievements.length) return null;
  return (
    <section className="vg-trophies" aria-label="Company milestones">
      <p className="eyebrow">Milestones</p>
      <div className="vg-trophy-row">
        {Object.entries(ACHIEVEMENTS).map(([id, a]) => (
          <span key={id} className={'px-trophy' + (v.achievements.includes(id) ? ' on' : '')} title={a.detail}>
            <Icon name={v.achievements.includes(id) ? 'star' : 'key'} size={14} />
            {a.label}
          </span>
        ))}
      </div>
    </section>
  );
}

// ---------- A month's result ----------

function Count({ to, format = $ }: { to: number; format?: (n: number) => string }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (reducedMotion()) return setN(to);
    const start = performance.now();
    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / 900);
      setN(to * (1 - Math.pow(1 - p, 3)));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [to]);
  return <>{format(n)}</>;
}

function ResultModal({ result, before, unlocked, v, onClose }: { result: MonthResult; before: Venture; unlocked: string[]; v: Venture; onClose: () => void }) {
  const k = KINDS[v.kind];
  const close = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    close.current?.focus();
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onClose]);
  return (
    <div className="vg-modal" role="dialog" aria-modal="true" aria-labelledby="vg-result-title">
      <div className="px-box vg-result">
        <p className="px-font vg-kicker">{MONTHS[result.calendar]} · month {result.month}</p>
        <h2 id="vg-result-title" className="px-font vg-result-title">
          {result.profit >= 0 ? 'Month closed in the black' : 'Month closed at a loss'}
        </h2>
        <div className="vg-result-stats">
          <div>
            <span className="px-font">Sold</span>
            <b className="num">
              <Count to={result.units} format={(n) => Math.round(n).toLocaleString()} />
            </b>
            <span className="label">
              of {result.demand.toLocaleString()} {k.units} wanted
            </span>
          </div>
          <div>
            <span className="px-font">Profit</span>
            <b className={'num ' + (result.profit >= 0 ? 'good' : 'bad')}>
              <Count to={result.profit} />
            </b>
          </div>
          <div>
            <span className="px-font">Cash</span>
            <b className="num">
              <Count to={result.cashEnd} />
            </b>
            <span className="label">was {$(before.cash)}</span>
          </div>
        </div>
        {v.debrief && (
          <div className="vg-event-head">
            <Portrait size={36} />
            <p className="vg-debrief-text">{v.debrief}</p>
          </div>
        )}
        {unlocked.length > 0 && (
          <div className="vg-unlocked">
            {unlocked.map((id) => (
              <span key={id} className="px-trophy on">
                <Icon name="star" size={14} /> {ACHIEVEMENTS[id]?.label}
              </span>
            ))}
          </div>
        )}
        <p className="vg-xp num">+{XP.ventureMonth} XP</p>
        <button ref={close} className="px-btn primary" onClick={onClose}>
          {v.status === 'bankrupt' ? 'See what happened' : 'Plan the next month'}
        </button>
      </div>
    </div>
  );
}

function Closed({ v, onRestart }: { v: Venture; onRestart: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const best = v.history.reduce((m, h) => (h.profit > m ? h.profit : m), -Infinity);
  return (
    <div className="vg vg-closed">
      <section className="px-box">
        <p className="px-font vg-kicker">Closed after {v.month} months</p>
        <h1 className="px-font vg-result-title">{v.name} ran out of cash</h1>
        <p className="vg-debrief-text">{v.debrief}</p>
        <p className="muted">
          Best month: {Number.isFinite(best) ? $(best) : '—'} profit. Most companies that close were profitable at some point; they ran out of cash first. Start again with what you’ve learned.
        </p>
        <button
          className="px-btn primary"
          data-busy={busy || undefined}
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            await onRestart().finally(() => setBusy(false));
          }}
        >
          Start again
        </button>
      </section>
    </div>
  );
}
