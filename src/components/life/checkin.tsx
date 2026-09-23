'use client';
import { useState } from 'react';
import type { ViewProps } from '@/components/app/legacy';
import { Button, Modal } from '@/components/ui';
import { Icon } from '@/components/icons';
import { selectNext } from '@/lib/schedule';
import { dayPart } from '@/lib/zone';

const CHECKIN_TITLE = {
  night: 'How are you, this late?',
  morning: 'How’s your morning?',
  afternoon: 'How’s your afternoon?',
  evening: 'How’s your evening?',
};

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
    <Modal title={CHECKIN_TITLE[dayPart(new Date().getHours())]} onClose={p.close}>
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
export function Reflection(p: ViewProps & { close: () => void }) {
  const [useful, setUseful] = useState(''),
    [hard, setHard] = useState(''),
    [next, setNext] = useState('');
  return (
    <Modal title="What is worth carrying forward?" onClose={p.close}>
      <p>Two minutes. A few words each is plenty.</p>
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
