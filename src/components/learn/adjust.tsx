'use client';
import { useState } from 'react';
import type { ViewProps } from '@/components/app/legacy';
import { Button, Modal, dateLabel } from '@/components/ui';
import { Icon } from '@/components/icons';
import { selectNext, recoveryRevision, shortRevision, moveRevision } from '@/lib/schedule';
import type { Revision } from '@/lib/types';

// Adjust week for plans that are fixed up front: shorten, move, or return
// gently after time away. Every change can be undone.
export function Schedule(p: ViewProps & { mode: string; close: () => void }) {
  const plan = p.w.state.plan,
    next = selectNext(p.w.state, p.today);
  const [sid, setSid] = useState(next?.session.id || ''),
    [date, setDate] = useState(next?.session.date || p.today),
    [time, setTime] = useState(next?.session.start_local || '10:00'),
    [minutes, setMinutes] = useState<20 | 60 | 120>(20),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [type, setType] = useState(p.mode === 'short' ? 'shorten' : 'move');
  if (!plan || !next)
    return (
      <Modal title="Your schedule" onClose={p.close}>
        <p>Import a plan to set your learning rhythm.</p>
      </Modal>
    );
  let preview: Revision | undefined;
  try {
    preview =
      type === 'recover'
        ? recoveryRevision(p.w.state, p.today)
        : type === 'shorten'
          ? shortRevision(p.w.state, sid, minutes, p.today)
          : moveRevision(p.w.state, sid, date, time);
  } catch {}
  async function apply() {
    setBusy(true);
    setError('');
    try {
      if (!preview) throw new Error('Choose a date inside your plan.');
      const eventId = crypto.randomUUID();
      await p.w.send(
        type === 'recover'
          ? { type: 'recover', eventId, today: p.today }
          : type === 'shorten'
            ? {
                type: 'shorten',
                eventId,
                sessionId: sid,
                minutes,
                today: p.today,
              }
            : { type: 'move', eventId, sessionId: sid, date, time },
      );
      p.close();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title={
        p.mode === 'short'
          ? 'A smaller session. Same direction.'
          : 'Make the week fit.'
      }
      onClose={p.close}
    >
      <div className="segmented">
        {[
          ['shorten', 'Shorten'],
          ['move', 'Move'],
          ['recover', 'Return gently'],
        ].map(([v, l]) => (
          <button key={v} aria-pressed={type === v} onClick={() => setType(v)}>
            {l}
          </button>
        ))}
      </div>
      {type !== 'recover' && (
        <label>
          Session
          <select
            value={sid}
            onChange={(e) => {
              setSid(e.target.value);
              const s = plan.sessions.find((x) => x.id === e.target.value)!;
              setDate(s.date);
              setTime(s.start_local);
            }}
          >
            {plan.sessions
              .filter(
                (s) => !p.w.state.attempts.some((a) => a.session_id === s.id),
              )
              .slice(0, 1000)
              .map((s) => (
                <option value={s.id} key={s.id}>
                  {dateLabel(s.date, true)} · {s.title}
                </option>
              ))}
          </select>
        </label>
      )}
      {type === 'shorten' && (
        <div className="segmented">
          {([20, 60, 120] as const).map((n) => (
            <button
              key={n}
              aria-pressed={minutes === n}
              onClick={() => setMinutes(n)}
            >
              {n} min
            </button>
          ))}
        </div>
      )}
      {type === 'move' && (
        <div className="row">
          <label>
            Date
            <input
              type="date"
              min={plan.start_date}
              max={plan.end_date}
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </label>
          <label>
            Start
            <input
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
            />
          </label>
        </div>
      )}
      <div className="callout mint">
        <span className="eyebrow">BEFORE YOU APPLY</span>
        <h3>
          {type === 'shorten'
            ? 'Keep the core objective.'
            : type === 'recover'
              ? 'A short return. No doubled sessions.'
              : 'One session moves.'}
        </h3>
        <p>{preview?.reason || 'Choose a date within the plan.'}</p>
        {type === 'recover' && preview && (
          <p>
            {
              Object.values(preview.after).filter((s) => s.status === 'skipped')
                .length
            }{' '}
            sessions leave the active schedule. Full original coverage is no
            longer implied.
          </p>
        )}
      </div>
      <Button disabled={busy || !preview} onClick={() => void apply()}>
        {busy ? 'Applying…' : 'Apply with undo'}
        <Icon name="arrow" />
      </Button>
      {error && (
        <p className="form-message" role="alert">
          {error}
        </p>
      )}
      {p.w.state.revisions.length > 0 && (
        <>
          <h3>Change history</h3>
          <div className="plan-history">
            {p.w.state.revisions
              .slice(-8)
              .reverse()
              .map((r) => (
                <div className="history-item" key={r.id}>
                  <p>{r.reason}</p>
                  <small>{new Date(r.created_at).toLocaleString()}</small>
                  <Button
                    kind="secondary"
                    disabled={!!r.undone_at}
                    onClick={async () => {
                      setError('');
                      try {
                        await p.w.send({
                          type: 'undo',
                          eventId: crypto.randomUUID(),
                          revisionId: r.id,
                          today: p.today,
                        });
                      } catch (e) {
                        setError((e as Error).message);
                      }
                    }}
                  >
                    {r.undone_at ? 'Undone' : 'Undo future changes'}
                  </Button>
                </div>
              ))}
          </div>
        </>
      )}
    </Modal>
  );
}
