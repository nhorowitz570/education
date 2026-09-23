'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { ViewProps } from './app/legacy';
import { useApp } from './app/provider';
import { Button, Modal, Sheet, Switch, download, dateLabel } from './ui';
import { Icon } from './icons';
import {
  selectNext,
  recoveryRevision,
  shortRevision,
  moveRevision,
} from '@/lib/schedule';
import { api } from '@/lib/client/api';
import { clearLocal } from '@/lib/client/storage';
import { requestPush } from './pwa';
import type { Revision } from '@/lib/types';
import {
  allBusy,
  sessionInterval,
  overlap,
  openSlot,
  type BusyInterval,
} from '@/lib/availability';
export function Checkin(p: ViewProps & { close: () => void }) {
  const old = p.w.state.records.find(
    (r) => r.id === 'checkin:' + p.today,
  )?.data;
  const [energy, setEnergy] = useState(Number(old?.energy || 3)),
    [mood, setMood] = useState(String(old?.mood || 'Okay')),
    [minutes, setMinutes] = useState(Number(old?.minutes || 60)),
    [busy, setBusy] = useState(false);
  async function save() {
    setBusy(true);
    await p.w.record('checkin', 'checkin:' + p.today, {
      date: p.today,
      energy,
      mood,
      minutes,
    });
    const next = selectNext(p.w.state, p.today);
    // Only today's session is shortened; a rest-day check-in never pulls a
    // future session forward.
    if (next && next.session.date === p.today && (minutes === 20 || energy === 1))
      await p.w.send({
        type: 'shorten',
        eventId: crypto.randomUUID(),
        sessionId: next.session.id,
        minutes: 20,
        today: p.today,
      });
    setBusy(false);
    p.close();
  }
  return (
    <Modal title="How’s your morning?" onClose={p.close}>
      <div className="food-field">
        <span>Energy</span>
        <div className="segmented">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              aria-label={`Energy ${n} of 5`}
              aria-pressed={energy === n}
              onClick={() => setEnergy(n)}
            >
              {n}
            </button>
          ))}
        </div>
        <small className="muted">Low → plenty</small>
      </div>
      <label>
        Mood
        <select value={mood} onChange={(e) => setMood(e.target.value)}>
          <option>Okay</option>
          <option>Good</option>
          <option>Flat</option>
          <option>Stressed</option>
          <option>Prefer not to say</option>
        </select>
      </label>
      <div className="food-field">
        <span>Time available</span>
        <div className="segmented">
          {[20, 60, 120].map((n) => (
            <button
              key={n}
              aria-pressed={minutes === n}
              onClick={() => setMinutes(n)}
            >
              {n === 120 ? '2 hours' : n + ' min'}
            </button>
          ))}
        </div>
      </div>
      {(minutes === 20 || energy === 1) && (
        <div className="callout mint">
          <p>
            Today becomes a 20-minute session with the same objective. The
            longer application moves out; undo is in Adjust week.
          </p>
        </div>
      )}
      <Button disabled={busy} onClick={() => void save()}>
        {busy ? 'Saving…' : 'Settle into today'}
        <Icon name="arrow" />
      </Button>
    </Modal>
  );
}
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
  const [calendarBusy, setCalendarBusy] = useState<BusyInterval[]>([]);
  useEffect(() => {
    if (!p.config.demo)
      void api<{ busy: BusyInterval[] }>('/api/calendar')
        .then((r) => setCalendarBusy(r.busy || []))
        .catch(() => {});
  }, [p.config.demo]);
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
      {type === 'move' &&
        date &&
        time &&
        allBusy(p.w.state, calendarBusy).some((b) =>
          overlap(
            sessionInterval(
              p.w.state,
              date,
              time,
              plan.sessions.find((s) => s.id === sid)?.duration_minutes || 20,
            ),
            b,
          ),
        ) && (
          <div className="callout peach">
            <p>
              This overlaps a busy block. Google times reflect the last
              successful sync.
            </p>
            <Button
              kind="secondary"
              onClick={() => {
                const found = openSlot(
                  p.w.state,
                  plan.sessions.find((s) => s.id === sid)!,
                  date,
                  calendarBusy,
                );
                if (found) {
                  setDate(found.date);
                  setTime(found.time);
                } else
                  setError(
                    'No open slot within the next five weeks. Choose a shorter session or a date manually.',
                  );
              }}
            >
              Find the next open slot
            </Button>
          </div>
        )}
      <div className="callout mint">
        <span className="eyebrow">BEFORE YOU APPLY</span>
        <h3>
          {type === 'shorten'
            ? 'Keep the core objective.'
            : type === 'recover'
              ? 'A short return. No doubled mornings.'
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
export function Reflection(p: ViewProps & { close: () => void }) {
  const [useful, setUseful] = useState(''),
    [hard, setHard] = useState(''),
    [next, setNext] = useState('');
  return (
    <Modal title="What is worth carrying forward?" onClose={p.close}>
      <p>Two minutes inside your Thursday learning block.</p>
      <label>
        Something you can use
        <textarea
          rows={2}
          value={useful}
          maxLength={2000}
          onChange={(e) => setUseful(e.target.value)}
        />
      </label>
      <label>
        Where you got stuck
        <textarea
          rows={2}
          value={hard}
          maxLength={2000}
          onChange={(e) => setHard(e.target.value)}
        />
      </label>
      <label>
        One adjustment for next week
        <textarea
          rows={2}
          value={next}
          maxLength={2000}
          onChange={(e) => setNext(e.target.value)}
        />
      </label>
      <Button
        disabled={!useful.trim()}
        onClick={async () => {
          await p.w.record('reflection', 'reflection:' + p.today, {
            date: p.today,
            useful,
            hard,
            next,
          });
          p.close();
        }}
      >
        Save reflection
        <Icon name="check" />
      </Button>
    </Modal>
  );
}
// The You page's settings, each in its own sheet.

export function PlanSheet({ onClose }: { onClose: () => void }) {
  const { w } = useApp();
  const router = useRouter();
  const plan = w.state.plan;
  return (
    <Sheet title="Your plan" subtitle={plan ? plan.title : 'No plan imported yet.'} onClose={onClose}>
      <div className="sheet-actions">
        <button className="btn primary" onClick={() => router.push('/import')}>
          <Icon name="import" size={17} /> {plan ? 'Import a new plan' : 'Import a plan'}
        </button>
        <button className="btn" disabled={!plan} onClick={() => download('fieldwork-plan.json', plan)}>
          <Icon name="download" size={17} /> Export this plan
        </button>
        <button
          className="btn"
          onClick={() => download('fieldwork-progress.json', { attempts: w.state.attempts, records: w.state.records })}
        >
          <Icon name="download" size={17} /> Export progress
        </button>
      </div>
    </Sheet>
  );
}

export type ReminderPrefs = {
  enabled?: boolean;
  travel?: boolean;
  morning?: string;
  followup?: string;
  quietStart?: string;
  quietEnd?: string;
};
export const reminderPrefs = (records: { id: string; data: Record<string, unknown> }[]) =>
  (records.find((r) => r.id === 'settings:reminders')?.data || {}) as ReminderPrefs;

// One switch, and times that save as they change.
export function RemindersSheet({ onClose }: { onClose: () => void }) {
  const { w, config } = useApp();
  const prefs = reminderPrefs(w.state.records);
  const [on, setOn] = useState(!!prefs.enabled && !prefs.travel),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const [times, setTimes] = useState({
    morning: prefs.morning || '09:45',
    followup: prefs.followup || '10:30',
    quietStart: prefs.quietStart || '21:00',
    quietEnd: prefs.quietEnd || '08:00',
  });
  const unavailable = !config.push || config.demo;
  const save = (patch: ReminderPrefs) => w.record('settings', 'settings:reminders', { ...reminderPrefs(w.state.records), ...times, ...patch });
  async function toggle(next: boolean) {
    setBusy(true);
    setError('');
    setOn(next);
    try {
      if (next) {
        await requestPush();
        await save({ enabled: true, travel: false });
      } else await save({ enabled: false });
    } catch (e) {
      setOn(!next);
      setError((e as Error).message || 'Notifications couldn’t be turned on.');
    } finally {
      setBusy(false);
    }
  }
  function setTime(key: keyof typeof times, value: string) {
    const next = { ...times, [key]: value };
    setTimes(next);
    if (value) void w.record('settings', 'settings:reminders', { ...reminderPrefs(w.state.records), ...next });
  }
  return (
    <Sheet title="Reminders" subtitle="A morning preview, and one nudge if you haven’t started." onClose={onClose}>
      <div className="setting-line">
        <div className="grow">
          <p>Reminders</p>
          <p className="label">{on ? 'On for this device' : 'Off'}</p>
        </div>
        <Switch checked={on} onChange={(v) => void toggle(v)} label="Reminders" disabled={busy || unavailable} />
      </div>
      <fieldset className="time-grid" disabled={!on}>
        <label>
          Morning
          <input type="time" value={times.morning} onChange={(e) => setTime('morning', e.target.value)} />
        </label>
        <label>
          Follow-up
          <input type="time" value={times.followup} onChange={(e) => setTime('followup', e.target.value)} />
        </label>
        <label>
          Quiet from
          <input type="time" value={times.quietStart} onChange={(e) => setTime('quietStart', e.target.value)} />
        </label>
        <label>
          Until
          <input type="time" value={times.quietEnd} onChange={(e) => setTime('quietEnd', e.target.value)} />
        </label>
      </fieldset>
      {error && (
        <p className="form-message" role="alert">
          {error}
        </p>
      )}
      <p className="label">
        {unavailable
          ? 'Push needs deployment configuration.'
          : 'Nothing sensitive shows on the lock screen. On iPhone, add Fieldwork to your Home Screen first (Share → Add to Home Screen). Delivery is best-effort.'}
      </p>
    </Sheet>
  );
}

export function DataSheet({ onClose }: { onClose: () => void }) {
  const { config, toast } = useApp();
  const [deleting, setDeleting] = useState(false),
    [confirm, setConfirm] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  async function exportAll() {
    setBusy(true);
    try {
      download('fieldwork-account.json', await api('/api/export'));
      toast('Account export downloaded.');
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function deleteAccount() {
    setError('');
    try {
      await api('/api/account', { confirm }, 'DELETE');
      await clearLocal();
      location.href = '/welcome';
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <Sheet title="Data & privacy" subtitle="Everything is yours to take or remove." onClose={onClose}>
      <div className="sheet-actions">
        <button className="btn" disabled={config.demo || busy} data-busy={busy || undefined} onClick={() => void exportAll()}>
          <Icon name="download" size={17} /> Export all account data
        </button>
        <button className="btn danger" onClick={() => setDeleting(true)}>
          <Icon name="trash" size={17} /> Delete my account
        </button>
      </div>
      {deleting && (
        <Sheet title="Delete your account?" onClose={() => setDeleting(false)}>
          <p className="muted">
            This removes your plans, progress, memories and private files. Export anything you want to keep first.
          </p>
          <label>
            Type DELETE MY ACCOUNT
            <input value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="off" />
          </label>
          <button className="btn danger" disabled={confirm !== 'DELETE MY ACCOUNT' || config.demo} onClick={() => void deleteAccount()}>
            Permanently delete account
          </button>
          {error && (
            <p className="form-message" role="alert">
              {error}
            </p>
          )}
        </Sheet>
      )}
    </Sheet>
  );
}
