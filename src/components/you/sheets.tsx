'use client';
import { useState } from 'react';
import { useApp } from '@/components/app/provider';
import { Field, Segmented, Sheet, Switch } from '@/components/ui';
import { VoicePicker } from '@/components/practice/voice-picker';
import { requestPush } from '@/components/pwa';
import { FONTS, type Font, type Prefs } from '@/lib/prefs';
import { play, setSound } from '@/lib/client/sound';
import type { Style } from '@/lib/learning/style';

// ---------- Your tutor ----------

// Each axis, with what its current position means in practice. The style is
// inferred from what the learner does and moves slowly on purpose.
const band = (x: number, lo: string, mid: string, hi: string) => (x < 0.35 ? lo : x > 0.65 ? hi : mid);
export const STYLE_AXES: { key: keyof Style; name: string; left: string; right: string; means: (x: number) => string }[] = [
  { key: 'depth', name: 'Depth', left: 'Brief', right: 'Thorough', means: (x) => `Replies of about ${Math.round((50 + x * 140) / 10) * 10} words` },
  {
    key: 'challenge',
    name: 'Challenge',
    left: 'Gentle',
    right: 'Stretching',
    means: (x) => band(x, 'Small steps that build confidence', 'A steady pace', 'Pushes harder and skips the obvious'),
  },
  {
    key: 'visual',
    name: 'Visuals',
    left: 'Words',
    right: 'Pictures',
    means: (x) => band(x, 'Diagrams only when essential', 'Diagrams when they clarify', 'Diagrams and charts often'),
  },
  {
    key: 'questions',
    name: 'Questions',
    left: 'Explain',
    right: 'Ask me',
    means: (x) => band(x, 'Explains clearly before asking', 'A balance of explaining and asking', 'Asks you first, then explains'),
  },
  {
    key: 'examples',
    name: 'Examples',
    left: 'Abstract',
    right: 'Concrete',
    means: (x) => band(x, 'Comfortable with abstract framing', 'A mix of framing and examples', 'Always anchored in a concrete example'),
  },
];

export function StyleSheet({ style, onClose }: { style: Style | null; onClose: () => void }) {
  const s = style && style.observations > 0 ? style : null;
  return (
    <Sheet title="Teaching style" subtitle="How your tutor writes for you, learned from what you do." onClose={onClose}>
      {s ? (
        <div className="style-list">
          {STYLE_AXES.map((a) => {
            const x = s[a.key] as number;
            return (
              <div className="style-axis" key={a.key}>
                <div className="style-axis-head">
                  <b>{a.name}</b>
                  <span className="label">{a.means(x)}</span>
                </div>
                <div className="axis">
                  <span className="label">{a.left}</span>
                  <div className="axis-track">
                    <i style={{ left: `${Math.round(x * 100)}%` }} />
                  </div>
                  <span className="label">{a.right}</span>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="muted">Nothing learned yet. After a few sessions this shows how your tutor has adapted to you.</p>
      )}
      <p className="label">
        {s ? `Learned from ${s.observations} moments. ` : ''}
        Asking for “simpler”, “go deeper”, an example or a picture moves these, and one session can’t swing them. To reset
        them, use Forget everything in Memory.
      </p>
    </Sheet>
  );
}

export function VoiceSheet({ onClose }: { onClose: () => void }) {
  const { prefs, setPrefs } = useApp();
  return (
    <Sheet title="Practice voice" subtitle="Who you talk to in practice conversations. You can still pick another for a single session." onClose={onClose}>
      <VoicePicker value={prefs.voice} onChange={(v) => setPrefs('voice', v)} />
    </Sheet>
  );
}

// ---------- Notifications ----------

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

const KINDS: { key: keyof Prefs['notify']; title: string; detail: string; time?: 'morning' | 'followup' }[] = [
  { key: 'morning', title: 'Session preview', detail: 'What today’s session is about, on learning days.', time: 'morning' },
  { key: 'nudge', title: 'One nudge', detail: 'Only if you haven’t started by then. Never more than one.', time: 'followup' },
  { key: 'breaks', title: 'Break’s over', detail: 'When a break in a long session ends.' },
  { key: 'insights', title: 'Weekly Insights', detail: 'When last week’s read is ready, Monday morning.' },
  { key: 'week', title: 'Next week’s draft', detail: 'When next week is drafted and yours to shape, Sunday.' },
];

export function notifySummary(on: boolean, prefs: Prefs) {
  if (!on) return 'Off';
  const n = Object.values(prefs.notify).filter(Boolean).length;
  return n === KINDS.length ? 'All on' : n ? `${n} of ${KINDS.length}` : 'None';
}

export function NotificationsSheet({ onClose }: { onClose: () => void }) {
  const { w, config, prefs, setPrefs } = useApp();
  const saved = reminderPrefs(w.state.records);
  const [on, setOn] = useState(!!saved.enabled && !saved.travel),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const [times, setTimes] = useState({
    morning: saved.morning || '09:45',
    followup: saved.followup || '10:30',
    quietStart: saved.quietStart || '21:00',
    quietEnd: saved.quietEnd || '08:00',
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
    <Sheet title="Notifications" subtitle="Sent to this device. Nothing sensitive shows on the lock screen." onClose={onClose}>
      <div className="setting-line">
        <div className="grow">
          <p>Allow notifications</p>
          <p className="label">{unavailable ? 'Push needs deployment configuration.' : on ? 'On for this device' : 'Off for this device'}</p>
        </div>
        <Switch checked={on} onChange={(v) => void toggle(v)} label="Allow notifications" disabled={busy || unavailable} />
      </div>
      {error && (
        <p className="form-message" role="alert">
          {error}
        </p>
      )}
      <fieldset className="setting-list" disabled={!on}>
        <legend className="eyebrow">What to send</legend>
        {KINDS.map((k) => (
          <div className="setting-line" key={k.key}>
            <div className="grow">
              <p>{k.title}</p>
              <p className="label">{k.detail}</p>
            </div>
            {k.time && (
              <input
                className="input time"
                type="time"
                aria-label={`${k.title} time`}
                value={times[k.time]}
                disabled={!prefs.notify[k.key]}
                onChange={(e) => setTime(k.time!, e.target.value)}
              />
            )}
            <Switch checked={prefs.notify[k.key]} onChange={(v) => setPrefs('notify', { [k.key]: v })} label={k.title} />
          </div>
        ))}
      </fieldset>
      <fieldset className="setting-list" disabled={!on}>
        <legend className="eyebrow">Quiet hours</legend>
        <p className="label">Nothing is sent between these times, whatever else is on.</p>
        <div className="time-grid">
          <label>
            From
            <input type="time" value={times.quietStart} onChange={(e) => setTime('quietStart', e.target.value)} />
          </label>
          <label>
            Until
            <input type="time" value={times.quietEnd} onChange={(e) => setTime('quietEnd', e.target.value)} />
          </label>
        </div>
      </fieldset>
      <p className="label">On iPhone, add Fieldwork to your Home Screen first (Share → Add to Home Screen). Delivery is best-effort.</p>
    </Sheet>
  );
}

// ---------- Look & feel ----------

const SIZES: { value: Prefs['reading']['size']; label: string }[] = [
  { value: 's', label: 'Small' },
  { value: 'm', label: 'Default' },
  { value: 'l', label: 'Large' },
  { value: 'xl', label: 'Largest' },
];

function FontChoice({ value, onChange, label, standard }: { value: Font; onChange: (f: Font) => void; label: string; standard: Font }) {
  return (
    <div className="font-choice" role="radiogroup" aria-label={label}>
      {(Object.keys(FONTS) as Font[]).map((f) => (
        <button key={f} type="button" role="radio" aria-checked={value === f} className={'font-option f-' + f} onClick={() => onChange(f)}>
          <span className="font-sample" aria-hidden="true">
            Aa
          </span>
          <b>{FONTS[f].label}</b>
          <span className="label">
            {FONTS[f].note}
            {f === standard ? ' · default' : ''}
          </span>
        </button>
      ))}
    </div>
  );
}

const SHORT: Record<Font, string> = { sans: 'Instrument Sans', serif: 'Newsreader', hyperlegible: 'Atkinson', dyslexic: 'OpenDyslexic' };
export function fontSummary(r: Prefs['reading']) {
  const parts: string[] = [];
  if (r.lessonFont === r.appFont && r.appFont !== 'sans') parts.push(`${SHORT[r.appFont]} everywhere`);
  else {
    if (r.lessonFont !== 'serif') parts.push(`${SHORT[r.lessonFont]} in lessons`);
    if (r.appFont !== 'sans') parts.push(`${SHORT[r.appFont]} in the app`);
  }
  if (r.size !== 'm') parts.push(SIZES.find((x) => x.value === r.size)!.label + ' text');
  return parts.join(' · ') || 'Default';
}

export function ReadingSheet({ onClose }: { onClose: () => void }) {
  const { prefs, setPrefs } = useApp();
  const r = prefs.reading;
  return (
    <Sheet title="Reading" subtitle="Type for lessons and for everything else. Changes apply as you choose." onClose={onClose}>
      <div className="reading-preview" aria-label="Preview">
        <p className="eyebrow">Preview · a lesson</p>
        <div className="prose">
          <p>
            A sale on credit is <strong>profit</strong> the day you make it, but it isn’t <em>cash</em> until the customer pays. That gap is
            where healthy businesses run out of money.
          </p>
        </div>
      </div>
      <Field label="Lesson font" hint="Used for everything you read and write inside a session.">
        <FontChoice label="Lesson font" standard="serif" value={r.lessonFont} onChange={(f) => setPrefs('reading', { lessonFont: f })} />
      </Field>
      <Field label="Lesson text size">
        <Segmented label="Lesson text size" value={r.size} onChange={(v) => setPrefs('reading', { size: v })} options={SIZES} />
      </Field>
      <Field label="Line length" hint="Shorter lines are easier to track; longer ones fit more on screen.">
        <Segmented
          label="Line length"
          value={r.width}
          onChange={(v) => setPrefs('reading', { width: v })}
          options={[
            { value: 'narrow', label: 'Shorter' },
            { value: 'normal', label: 'Default' },
            { value: 'wide', label: 'Longer' },
          ]}
        />
      </Field>
      <Field label="App font" hint="Menus, pages and everything outside lessons.">
        <FontChoice label="App font" standard="sans" value={r.appFont} onChange={(f) => setPrefs('reading', { appFont: f })} />
      </Field>
    </Sheet>
  );
}

const GAME: { key: keyof Prefs['game']; title: string; detail: string }[] = [
  { key: 'xp', title: 'XP and levels', detail: 'Points for answers and sessions, and the level they add up to.' },
  { key: 'streak', title: 'Streak', detail: 'How many learning days or weeks in a row. Planned time off never breaks it.' },
  { key: 'quests', title: 'Daily quests', detail: 'Three small goals a day, with a bonus for all three.' },
  { key: 'pops', title: 'In-session celebrations', detail: '“+XP” and “3 in a row” as answers are marked.' },
];
export function gameSummary(p: Prefs) {
  const on = GAME.filter((g) => p.game[g.key]).length;
  return on === GAME.length ? 'All on' : on === 0 ? 'All off' : `${on} of ${GAME.length}`;
}

export function GameSheet({ onClose }: { onClose: () => void }) {
  const { prefs, setPrefs } = useApp();
  return (
    <Sheet title="Game elements" subtitle="Optional extras. Your learning, memory and progress work the same with all of them off." onClose={onClose}>
      <div className="setting-list">
        {GAME.map((g) => (
          <div className="setting-line" key={g.key}>
            <div className="grow">
              <p>{g.title}</p>
              <p className="label">{g.detail}</p>
            </div>
            <Switch
              checked={prefs.game[g.key]}
              disabled={g.key === 'pops' && !prefs.game.xp}
              onChange={(v) => setPrefs('game', { [g.key]: v })}
              label={g.title}
            />
          </div>
        ))}
      </div>
    </Sheet>
  );
}

// Sound is a switch on the index, with a sample when it's turned on.
export function toggleSound(on: boolean, setPrefs: ReturnType<typeof useApp>['setPrefs']) {
  setPrefs('sound', on);
  setSound(on);
  if (on) play('solid');
}
