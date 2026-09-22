'use client';
import { useEffect, useState } from 'react';
import { PasskeySettings } from './passkeys';
import type { ViewProps } from './app';
import { Button, Pill, Modal, SectionTitle, download, dateLabel } from './ui';
import { Icon } from './icons';
import {
  selectNext,
  recoveryRevision,
  shortRevision,
  moveRevision,
} from '@/lib/schedule';
import { api } from '@/lib/client/workspace';
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
    if (next && (minutes === 20 || energy === 1))
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
                      await p.w.send({
                        type: 'undo',
                        eventId: crypto.randomUUID(),
                        revisionId: r.id,
                        today: p.today,
                      });
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
export function Settings(
  p: ViewProps & {
    dark: boolean;
    setDark: (v: boolean) => void;
    logout: () => Promise<void>;
  },
) {
  const [memory, setMemory] = useState(''),
    [message, setMessage] = useState(''),
    [usage, setUsage] = useState<{
      used: number;
      limit: number;
      textModel: string;
      voiceModel: string;
    }>(),
    [calendar, setCalendar] = useState<{
      connected: boolean;
      lastSync?: string;
      busy?: { start: string; end: string }[];
    }>(),
    [manualDate, setManualDate] = useState(p.today),
    [manualStart, setManualStart] = useState('10:00'),
    [manualEnd, setManualEnd] = useState('11:00'),
    [deleteOpen, setDeleteOpen] = useState(false),
    [confirm, setConfirm] = useState('');
  const preferences =
    p.w.state.records.find((r) => r.id === 'settings:reminders')?.data || {};
  const [morning, setMorning] = useState(
      String(preferences.morning || '09:45'),
    ),
    [followup, setFollowup] = useState(String(preferences.followup || '10:30')),
    [quietStart, setQuietStart] = useState(
      String(preferences.quietStart || '21:00'),
    ),
    [quietEnd, setQuietEnd] = useState(String(preferences.quietEnd || '08:00')),
    [travel, setTravel] = useState(!!preferences.travel),
    [retain, setRetain] = useState(
      !!p.w.state.records.find((r) => r.id === 'settings:voice')?.data
        .retainTranscript,
    );
  useEffect(() => {
    if (p.config.demo) return;
    void api<typeof usage>('/api/account')
      .then(setUsage)
      .catch((e) => setMessage(e.message));
    void api<typeof calendar>('/api/calendar')
      .then(setCalendar)
      .catch(() => {});
  }, [p.config.demo]);
  async function action(fn: () => Promise<unknown>, success: string) {
    setMessage('');
    try {
      await fn();
      setMessage(success);
    } catch (e) {
      setMessage((e as Error).message);
    }
  }
  async function deleteAccount() {
    await api('/api/account', { confirm }, 'DELETE');
    await clearLocal();
    location.href = '/';
  }
  return (
    <div className="screen-grid">
      <div className="main-lane">
        <SectionTitle eyebrow="YOUR SPACE" title="Make this yours." />
        <div className="settings-section">
          <h3>Appearance & account</h3>
          <div className="setting-row">
            <div>
              <strong>Dark appearance</strong>
              <p>A softer canvas after hours.</p>
            </div>
            <Button kind="secondary" onClick={() => p.setDark(!p.dark)}>
              {p.dark ? 'Use light' : 'Use dark'}
              <Icon name={p.dark ? 'sun' : 'moon'} />
            </Button>
          </div>
          <PasskeySettings demo={p.config.demo} />
          <Button kind="secondary" onClick={() => void p.logout()}>
            Sign out
            <Icon name="logout" />
          </Button>
        </div>
        <div className="settings-section">
          <h3>Your plan</h3>
          <div className="row wrap">
            <Button kind="secondary" onClick={() => p.go('import')}>
              Import a plan
            </Button>
            <Button
              kind="secondary"
              disabled={!p.w.state.plan}
              onClick={() => download('fieldwork-plan.json', p.w.state.plan)}
            >
              Export active plan
            </Button>
            <Button
              kind="secondary"
              onClick={() =>
                download('fieldwork-progress.json', {
                  attempts: p.w.state.attempts,
                  records: p.w.state.records,
                })
              }
            >
              Export progress
            </Button>
          </div>
        </div>
        <div className="settings-section">
          <h3>Calendar & availability</h3>
          <p className="muted">
            Google Calendar reads busy times. It does not edit your calendar.
          </p>
          <div className="row wrap">
            <Pill>
              {calendar?.connected
                ? 'Google connected'
                : p.config.calendar
                  ? 'Google ready to connect'
                  : 'Google awaits OAuth credentials'}
            </Pill>
            {!calendar?.connected ? (
              <Button
                kind="secondary"
                disabled={!p.config.calendar || p.config.demo}
                onClick={() =>
                  void action(async () => {
                    const r = await api<{ url: string }>(
                      '/api/calendar/connect',
                      {},
                    );
                    location.href = r.url;
                  }, 'Opening Google…')
                }
              >
                Connect Google
              </Button>
            ) : (
              <>
                <Button
                  kind="secondary"
                  onClick={() =>
                    void action(async () => {
                      const r = await api<NonNullable<typeof calendar>>(
                        '/api/calendar',
                        {},
                      );
                      setCalendar(r);
                    }, 'Busy times refreshed.')
                  }
                >
                  Refresh busy times
                </Button>
                <Button
                  kind="secondary"
                  onClick={() =>
                    void action(async () => {
                      await api('/api/calendar', {}, 'DELETE');
                      setCalendar({ connected: false });
                    }, 'Calendar disconnected.')
                  }
                >
                  Disconnect
                </Button>
              </>
            )}
          </div>
          {calendar?.lastSync && (
            <p className="muted">
              Last synced {new Date(calendar.lastSync).toLocaleString()}.
              Refresh before relying on old availability.
            </p>
          )}
          {calendar?.busy?.slice(0, 10).map((b) => (
            <p key={b.start + b.end} className="muted">
              Busy {new Date(b.start).toLocaleString()} –{' '}
              {new Date(b.end).toLocaleTimeString()}
            </p>
          ))}
          <div className="row wrap">
            <label>
              Date
              <input
                type="date"
                value={manualDate}
                onChange={(e) => setManualDate(e.target.value)}
              />
            </label>
            <label>
              From
              <input
                type="time"
                value={manualStart}
                onChange={(e) => setManualStart(e.target.value)}
              />
            </label>
            <label>
              Until
              <input
                type="time"
                value={manualEnd}
                onChange={(e) => setManualEnd(e.target.value)}
              />
            </label>
          </div>
          <Button
            kind="secondary"
            disabled={manualEnd <= manualStart}
            onClick={() =>
              void action(
                () =>
                  p.w.record('busy', 'busy:' + crypto.randomUUID(), {
                    date: manualDate,
                    start: manualStart,
                    end: manualEnd,
                  }),
                'Busy block added. Adjust your week to move a learning session.',
              )
            }
          >
            Add a manual busy block
          </Button>
          {p.w.state.records
            .filter((r) => r.kind === 'busy')
            .map((r) => (
              <div className="row between" key={r.id}>
                <span>
                  {String(r.data.date)} · {String(r.data.start)}–
                  {String(r.data.end)}
                </span>
                <button
                  className="text-button"
                  onClick={() =>
                    void p.w.send({
                      type: 'delete-record',
                      eventId: crypto.randomUUID(),
                      id: r.id,
                    })
                  }
                >
                  Remove
                </button>
              </div>
            ))}
          <Button kind="secondary" onClick={() => p.open('schedule')}>
            Adjust week
          </Button>
        </div>
        <div className="settings-section">
          <h3>Reminders that leave room</h3>
          <p className="muted">
            A morning preview and one follow-up if you haven’t started. No
            sensitive details on the lock screen.
          </p>
          <div className="row wrap">
            <label>
              Morning
              <input
                type="time"
                value={morning}
                onChange={(e) => setMorning(e.target.value)}
              />
            </label>
            <label>
              Follow-up
              <input
                type="time"
                value={followup}
                onChange={(e) => setFollowup(e.target.value)}
              />
            </label>
          </div>
          <div className="row wrap">
            <label>
              Quiet from
              <input
                type="time"
                value={quietStart}
                onChange={(e) => setQuietStart(e.target.value)}
              />
            </label>
            <label>
              Until
              <input
                type="time"
                value={quietEnd}
                onChange={(e) => setQuietEnd(e.target.value)}
              />
            </label>
          </div>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={travel}
              onChange={(e) => setTravel(e.target.checked)}
            />
            Travel mode · pause reminders
          </label>
          <div className="row wrap">
            <Button
              kind="secondary"
              onClick={() =>
                void action(
                  () =>
                    p.w.record('settings', 'settings:reminders', {
                      ...preferences,
                      morning,
                      followup,
                      quietStart,
                      quietEnd,
                      travel,
                    }),
                  'Reminder preferences saved.',
                )
              }
            >
              Save preferences
            </Button>
            <Button
              kind="secondary"
              disabled={!p.config.push || p.config.demo}
              onClick={() =>
                void action(async () => {
                  await requestPush();
                  await p.w.record('settings', 'settings:reminders', {
                    ...preferences,
                    morning,
                    followup,
                    quietStart,
                    quietEnd,
                    travel,
                    enabled: true,
                  });
                }, 'Notifications enabled on this device.')
              }
            >
              Enable notifications
            </Button>
            <Button
              kind="secondary"
              onClick={() =>
                void action(
                  () =>
                    p.w.record('settings', 'settings:reminders', {
                      ...preferences,
                      enabled: false,
                    }),
                  'Reminders paused.',
                )
              }
            >
              Pause reminders
            </Button>
          </div>
          <p className="muted">
            {p.config.push
              ? 'On iPhone: Safari → Share → Add to Home Screen. Open the installed app, then enable notifications. If permission was denied, change it in device settings.'
              : 'Push needs deployment configuration. Install guidance is still available in your browser.'}{' '}
            Delivery is best-effort.
          </p>
        </div>
        <div className="settings-section">
          <h3>What your tutor remembers</h3>
          <p className="muted">
            Only the notes here and your learning evidence inform your tutor.
            Edit or forget any note.
          </p>
          {p.w.state.records
            .filter((r) => r.kind === 'memory')
            .map((r) => (
              <div className="memory-item" key={r.id}>
                <textarea
                  aria-label="Memory note"
                  defaultValue={String(r.data.text || '')}
                  rows={2}
                  maxLength={2000}
                  onBlur={(e) =>
                    void p.w.record('memory', r.id, { text: e.target.value })
                  }
                />
                <button
                  className="text-button"
                  onClick={() =>
                    void p.w.send({
                      type: 'delete-record',
                      eventId: crypto.randomUUID(),
                      id: r.id,
                    })
                  }
                >
                  Forget this note
                </button>
              </div>
            ))}
          <label>
            Add context
            <textarea
              value={memory}
              rows={2}
              maxLength={2000}
              placeholder="For example: use small creative-business examples."
              onChange={(e) => setMemory(e.target.value)}
            />
          </label>
          <Button
            kind="secondary"
            disabled={!memory.trim()}
            onClick={async () => {
              await p.w.record('memory', 'memory:' + crypto.randomUUID(), {
                text: memory,
              });
              setMemory('');
            }}
          >
            Remember this
          </Button>
        </div>
        <div className="settings-section">
          <h3>Voice & retention</h3>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={retain}
              onChange={(e) => {
                setRetain(e.target.checked);
                void p.w.record('settings', 'settings:voice', {
                  ...p.w.state.records.find((r) => r.id === 'settings:voice')
                    ?.data,
                  retainTranscript: e.target.checked,
                });
              }}
            />
            Keep an editable transcript and feedback after voice practice
          </label>
          <p className="muted">
            Raw audio is not stored. Live calls require the app in the
            foreground.
          </p>
          <Button kind="secondary" onClick={() => p.go('voice')}>
            Open practice
            <Icon name="mic" />
          </Button>
        </div>
        <div className="settings-section">
          <h3>Data & privacy</h3>
          <Button
            kind="secondary"
            disabled={p.config.demo}
            onClick={() =>
              void action(async () => {
                download('fieldwork-account.json', await api('/api/export'));
              }, 'Account export downloaded.')
            }
          >
            Export all account data
          </Button>
          <Button kind="danger" onClick={() => setDeleteOpen(true)}>
            Delete my account
          </Button>
        </div>
        {message && (
          <p role="status" className="form-message">
            {message}
          </p>
        )}
      </div>
      <aside className="context">
        <h3>Connections</h3>
        {[
          [
            'Supabase',
            p.config.backend ? 'Connected' : 'Awaiting configuration',
          ],
          [
            'AI lessons & tutor',
            p.config.ai
              ? 'Key configured · verify access'
              : 'Awaiting OpenRouter API key',
          ],
          [
            'Google Calendar',
            calendar?.connected
              ? 'Connected'
              : p.config.calendar
                ? 'Ready to authorize'
                : 'Awaiting OAuth setup',
          ],
        ].map(([a, b]) => (
          <div key={a}>
            <strong>{a}</strong>
            <p className="muted">{b}</p>
          </div>
        ))}
        <div className="white-box">
          <span className="eyebrow">MONTHLY AI ALLOWANCE</span>
          <h3>
            ${usage?.used.toFixed(2) || '0.00'}{' '}
            <span className="muted">/ ${usage?.limit || 20}</span>
          </h3>
          <p>
            Includes active reservations.
            <br />
            Shared project cap: $40 by default.
          </p>
        </div>
        <p>
          {usage?.textModel || 'openai/gpt-5.6-luna'} via OpenRouter.
          <br />
          {usage?.voiceModel || 'gpt-live-1'} via OpenAI for live speech.
        </p>
        <p>
          Models and hard budget caps are server configuration. No automatic
          upgrades.
        </p>
      </aside>
      {deleteOpen && (
        <Modal
          title="Delete your private account?"
          onClose={() => setDeleteOpen(false)}
        >
          <p>
            This removes your plans, progress, memories, and private files.
            Export anything you want to keep first.
          </p>
          <label>
            Type DELETE MY ACCOUNT
            <input
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
          </label>
          <Button
            kind="danger"
            disabled={confirm !== 'DELETE MY ACCOUNT' || p.config.demo}
            onClick={() => void action(deleteAccount, 'Account deleted.')}
          >
            Permanently delete account
          </Button>
        </Modal>
      )}
    </div>
  );
}
