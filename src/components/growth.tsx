'use client';
import { useEffect, useState } from 'react';
import type { ViewProps } from './app';
import { Button, Pill, Modal, SectionTitle } from './ui';
import { Icon } from './icons';
import { api } from '@/lib/client/workspace';
type SetLog = { reps: string; load: string; done: boolean };
type Workout = {
  name: string;
  exercises: { name: string; sets: SetLog[]; skipped?: boolean }[];
  index: number;
  comfort: string;
  notes: string;
  complete: boolean;
  date: string;
};
const names = ['Lower body', 'Upper body', 'Full body'];
const defaults = [
  ['Box squat', 'Hip hinge', 'Calf raise'],
  ['A comfortable row', 'A comfortable press', 'Carry'],
  ['Squat variation', 'Row variation', 'Hip hinge'],
];
export function Growth(p: ViewProps) {
  const day = new Date(p.today + 'T12:00Z').getUTCDay(),
    [selected, setSelected] = useState(day === 3 ? 1 : day === 5 ? 2 : 0),
    [running, setRunning] = useState(false),
    [setup, setSetup] = useState(false),
    [photo, setPhoto] = useState(false),
    [saved, setSaved] = useState(''),
    [bodyValue, setBodyValue] = useState('');
  const food =
      p.w.state.records.find((r) => r.id === 'food:' + p.today)?.data || {},
    template = p.w.state.records.find((r) => r.id === 'settings:gym')?.data,
    exerciseNames = Array.isArray(template?.exercises)
      ? (template!.exercises as string[][])
      : defaults;
  async function tap(key: string, value: number) {
    await p.w.record('food', 'food:' + p.today, {
      ...food,
      [key]: value,
      date: p.today,
    });
    setSaved('Food check-in saved' + (p.w.online ? '' : ' on this device'));
  }
  const social = p.w.state.records.find((r) => r.id === 'social:' + p.today);
  return running ? (
    <WorkoutRunner
      {...p}
      selected={selected}
      exercises={exerciseNames[selected] || defaults[selected]}
      done={() => {
        setRunning(false);
        setSaved('Workout saved. A useful step.');
      }}
    />
  ) : (
    <div className="screen-grid">
      <div className="main-lane">
        <SectionTitle eyebrow="GROWTH" title="A few habits, kept simple." />
        <section className="hero peach">
          <div className="row between">
            <span className="circle">
              <Icon name="growth" />
            </span>
            <Pill>{String(template?.time || '17:00')} · editable</Pill>
          </div>
          <h2>{names[selected]}</h2>
          <p>
            A gentle restart.
            <br />
            Choose comfortable movements and loads.
          </p>
          <Button
            onClick={() =>
              template?.reviewed ? setRunning(true) : setSetup(true)
            }
          >
            Open workout
            <Icon name="arrow" />
          </Button>
        </section>
        <div className="row between">
          <h3>This week</h3>
          <button className="text-button" onClick={() => setSetup(true)}>
            Edit workout plan
          </button>
        </div>
        <div className="growth-week">
          {names.map((n, i) => (
            <button
              key={n}
              onClick={() => setSelected(i)}
              aria-pressed={selected === i}
            >
              <small>
                {Array.isArray(template?.days)
                  ? String(template.days[i] || ['MON', 'WED', 'FRI'][i])
                  : ['MON', 'WED', 'FRI'][i]}
              </small>
              <span>{n.replace(' body', '')}</span>
            </button>
          ))}
        </div>
        <p className="muted">
          The proposed schedule and restart template are yours to adjust.
        </p>
        <div className="settings-section">
          <div className="row between">
            <h3>Recent workouts</h3>
            <button
              className="text-button"
              onClick={() => p.open('reflection')}
            >
              Reflect
              <Icon name="arrow" size={16} />
            </button>
          </div>
          {p.w.state.records
            .filter((r) => r.kind === 'workout' && r.data.complete)
            .slice(-5)
            .reverse()
            .map((r) => (
              <details key={r.id} className="white-box">
                <summary>
                  {String(r.data.name)} · {String(r.data.date)}
                </summary>
                <p>
                  {String(r.data.comfort)} ·{' '}
                  {String(r.data.notes || 'No notes')}
                </p>
              </details>
            ))}
          <details className="settings-section">
            <summary>Body trend · optional</summary>
            <p className="muted">
              Only if useful to you. No targets or automatic recommendations.
            </p>
            <label>
              Weight in kilograms
              <input
                type="number"
                min="20"
                max="500"
                step="0.1"
                inputMode="decimal"
                value={bodyValue}
                onChange={(e) => setBodyValue(e.target.value)}
              />
            </label>
            <Button
              kind="secondary"
              disabled={
                !bodyValue || Number(bodyValue) < 20 || Number(bodyValue) > 500
              }
              onClick={async () => {
                await p.w.record('body', 'body:' + p.today, {
                  date: p.today,
                  kg: Number(bodyValue),
                });
                setBodyValue('');
                setSaved('Optional measurement saved.');
              }}
            >
              Save measurement
            </Button>
            {p.w.state.records
              .filter((r) => r.kind === 'body')
              .slice(-8)
              .map((r) => (
                <p key={r.id}>
                  {String(r.data.date)} · {String(r.data.kg)} kg
                </p>
              ))}
          </details>
          <p className="muted" role="status">
            {saved}
          </p>
        </div>
      </div>
      <aside className="context growth-context">
        <h3>Food check-in</h3>
        <div className="food-field">
          <span>Protein with meals</span>
          <div className="segmented">
            {[0, 1, 2, 3].map((n) => (
              <button
                key={n}
                aria-pressed={Number(food.protein || 0) === n}
                onClick={() => void tap('protein', n)}
              >
                {n}
              </button>
            ))}
          </div>
        </div>
        <div className="food-field">
          <span>Fruit or vegetables</span>
          <div className="segmented">
            {[0, 1, 2].map((n) => (
              <button
                key={n}
                aria-pressed={Number(food.produce || 0) === n}
                onClick={() => void tap('produce', n)}
              >
                {n === 2 ? '2+' : n}
              </button>
            ))}
          </div>
        </div>
        <button className="text-button" onClick={() => setPhoto(true)}>
          Meal photo · optional
          <Icon name="arrow" size={16} />
        </button>
        <section className="callout lavender">
          <span className="eyebrow">ONE SMALL SOCIAL CHALLENGE</span>
          <h3>Ask one follow-up about what the other person just said.</h3>
          <p>An attempt counts.</p>
          <Button
            disabled={!!social}
            onClick={() =>
              void p.w.record('social', 'social:' + p.today, {
                date: p.today,
                attempted: true,
                challenge: 'Ask a relevant follow-up',
              })
            }
          >
            {social ? 'Attempt saved' : 'I gave it a try'}
          </Button>
        </section>
        <details>
          <summary>Easy meal fallbacks</summary>
          <p className="muted">
            Your own dependable options, when the day gets full.
          </p>
          <textarea
            rows={4}
            aria-label="Meal fallback list"
            defaultValue={String(
              p.w.state.records.find((r) => r.id === 'settings:food')?.data
                .fallbacks ||
                'Prepared protein + rice + vegetables\nA familiar takeout bowl\nEggs or beans + toast + fruit',
            )}
            onBlur={(e) =>
              void p.w.record('settings', 'settings:food', {
                fallbacks: e.target.value,
              })
            }
          />
        </details>
        <p>Gym times are proposed until you set them.</p>
      </aside>
      {setup && (
        <GymSetup
          {...p}
          selected={selected}
          close={() => setSetup(false)}
          start={() => {
            setSetup(false);
            setRunning(true);
          }}
        />
      )}
      {photo && <FoodPhoto {...p} close={() => setPhoto(false)} />}
    </div>
  );
}
function GymSetup(
  p: ViewProps & { selected: number; close: () => void; start: () => void },
) {
  const prior = p.w.state.records.find((r) => r.id === 'settings:gym')?.data;
  const [text, setText] = useState(
      (Array.isArray(prior?.exercises) ? prior.exercises : defaults)
        .map((x) => (x as string[]).join(', '))
        .join('\n'),
    ),
    [reviewed, setReviewed] = useState(false),
    [notes, setNotes] = useState(String(prior?.restrictions || '')),
    [time, setTime] = useState(String(prior?.time || '17:00')),
    [days, setDays] = useState(
      Array.isArray(prior?.days) ? prior.days.join(', ') : 'Mon, Wed, Fri',
    );
  async function save() {
    await p.w.record('settings', 'settings:gym', {
      reviewed: true,
      time,
      days: days
        .split(',')
        .slice(0, 3)
        .map((s) => s.trim()),
      exercises: text
        .split('\n')
        .slice(0, 3)
        .map((s) =>
          s
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean),
        ),
      restrictions: notes,
    });
    p.start();
  }
  return (
    <Modal title="Start where you are." onClose={p.close}>
      <p>
        Review these proposed movements against your current comfort, shoulder
        tolerance, and any clinician restrictions. Substitute or skip anything
        unsuitable.
      </p>
      <label>
        Lower / upper / full body · one line each
        <textarea
          rows={4}
          value={text}
          maxLength={1200}
          onChange={(e) => setText(e.target.value)}
        />
      </label>
      <label>
        Workout days
        <input
          value={days}
          onChange={(e) => setDays(e.target.value)}
          maxLength={80}
        />
      </label>
      <label>
        Preferred time
        <input
          type="time"
          value={time}
          onChange={(e) => setTime(e.target.value)}
        />
      </label>
      <label>
        Restrictions or reminders
        <textarea
          rows={2}
          value={notes}
          maxLength={1500}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Anything you want the workout to respect"
        />
      </label>
      <label className="checkbox">
        <input
          type="checkbox"
          checked={reviewed}
          onChange={(e) => setReviewed(e.target.checked)}
        />
        I’ve reviewed my restart and shoulder context.
      </label>
      <Button
        disabled={
          !reviewed ||
          text.split('\n').length !== 3 ||
          text.split('\n').some((s) => !s.trim())
        }
        onClick={() => void save()}
      >
        Save & open workout
        <Icon name="arrow" />
      </Button>
    </Modal>
  );
}
function WorkoutRunner(
  p: ViewProps & { selected: number; exercises: string[]; done: () => void },
) {
  const id = `workout:${p.today}:${p.selected}`,
    prior = p.w.state.records.find((r) => r.id === id)?.data as
      | Workout
      | undefined;
  const [data, setData] = useState<Workout>(
      prior || {
        name: names[p.selected],
        exercises: p.exercises.map((name) => ({
          name,
          sets: [
            { reps: '', load: '', done: false },
            { reps: '', load: '', done: false },
          ],
        })),
        index: 0,
        comfort: 'Comfortable',
        notes: '',
        complete: false,
        date: p.today,
      },
    ),
    [restUntil, setRestUntil] = useState(0),
    [remaining, setRemaining] = useState(0),
    [sub, setSub] = useState('');
  const exercise = data.exercises[data.index],
    last = p.w.state.records
      .filter((r) => r.kind === 'workout' && r.data.complete && r.id !== id)
      .at(-1)?.data as Workout | undefined,
    lastExercise = last?.exercises.find((e) => e.name === exercise.name);
  useEffect(() => {
    const t = setTimeout(() => void p.w.record('workout', id, data), 600);
    return () => clearTimeout(t);
  }, [data, id, p.w.record]);
  useEffect(() => {
    const t = setInterval(
      () =>
        setRemaining(Math.max(0, Math.ceil((restUntil - Date.now()) / 1000))),
      1000,
    );
    return () => clearInterval(t);
  }, [restUntil]);
  function set(i: number, patch: Partial<SetLog>) {
    setData((d) => ({
      ...d,
      exercises: d.exercises.map((e, ei) =>
        ei === d.index
          ? {
              ...e,
              sets: e.sets.map((s, si) => (si === i ? { ...s, ...patch } : s)),
            }
          : e,
      ),
    }));
  }
  async function finish(workout = data) {
    const complete = { ...workout, complete: true };
    setData(complete);
    await p.w.record('workout', id, complete);
    p.done();
  }
  return (
    <div className="screen-grid">
      <div className="main-lane">
        <div className="row between meta">
          <span>
            {data.name} · {data.index + 1} of {data.exercises.length}
          </span>
          <button
            className="text-button"
            onClick={async () => {
              await p.w.record('workout', id, data);
              p.done();
            }}
          >
            Save & exit
          </button>
        </div>
        <h1>{exercise.name}</h1>
        <div className="row between">
          <Pill>Choose a comfortable load</Pill>
          <span className="muted">kg · editable</span>
        </div>
        <table className="set-table">
          <thead>
            <tr>
              <th>Set</th>
              <th>Reps</th>
              <th>Load (kg)</th>
              <th>Log</th>
            </tr>
          </thead>
          <tbody>
            {exercise.sets.map((s, i) => (
              <tr key={i} className={s.done ? 'set-logged' : ''}>
                <td>{i + 1}</td>
                <td>
                  <input
                    type="number"
                    min="0"
                    max="200"
                    inputMode="numeric"
                    aria-label={`Set ${i + 1} reps`}
                    value={s.reps}
                    onChange={(e) =>
                      set(i, { reps: e.target.value, done: false })
                    }
                  />
                </td>
                <td>
                  <input
                    type="number"
                    min="0"
                    max="500"
                    step="0.5"
                    inputMode="decimal"
                    aria-label={`Set ${i + 1} kilograms`}
                    value={s.load}
                    onChange={(e) =>
                      set(i, { load: e.target.value, done: false })
                    }
                  />
                </td>
                <td>
                  <button
                    className={'circle ' + (s.done ? 'mint' : '')}
                    aria-label={`Log set ${i + 1}`}
                    disabled={
                      !s.reps ||
                      Number(s.reps) <= 0 ||
                      Number(s.reps) > 200 ||
                      Number(s.load) < 0 ||
                      Number(s.load) > 500
                    }
                    aria-pressed={s.done}
                    onClick={() => {
                      set(i, { done: !s.done });
                      if (!s.done) setRestUntil(Date.now() + 90000);
                    }}
                  >
                    <Icon name="check" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {remaining > 0 && (
          <div className="rest-timer">
            <span>
              Take a breath
              <br />
              <strong>
                {Math.floor(remaining / 60)}:
                {String(remaining % 60).padStart(2, '0')}
              </strong>
            </span>
            <Button
              kind="secondary"
              onClick={() => {
                setRestUntil(0);
                setRemaining(0);
              }}
            >
              Skip rest
            </Button>
          </div>
        )}
        <label>
          How does this feel?
          <select
            value={data.comfort}
            onChange={(e) =>
              setData((d) => ({ ...d, comfort: e.target.value }))
            }
          >
            <option>Comfortable</option>
            <option>Uncertain or unstable</option>
            <option>Discomfort</option>
          </select>
        </label>
        {data.comfort !== 'Comfortable' && (
          <div className="callout peach">
            <p>
              Leave progression alone today. You can reduce, substitute, or skip
              this movement.
            </p>
          </div>
        )}
        <label>
          Notes
          <textarea
            rows={2}
            value={data.notes}
            maxLength={1500}
            onChange={(e) => setData((d) => ({ ...d, notes: e.target.value }))}
          />
        </label>
        <div className="row wrap">
          <Button
            onClick={() =>
              data.index < data.exercises.length - 1
                ? setData((d) => ({ ...d, index: d.index + 1 }))
                : void finish()
            }
          >
            {data.index < data.exercises.length - 1
              ? 'Next exercise'
              : 'Finish workout'}
            <Icon name="arrow" />
          </Button>
          <Button kind="secondary" onClick={() => void finish()}>
            Finish a shorter session
          </Button>
        </div>
      </div>
      <aside className="context">
        <h3>Your last time</h3>
        <p>
          {lastExercise
            ? lastExercise.sets
                .filter((s) => s.done)
                .map((s) => `${s.reps} × ${s.load || '0'} kg`)
                .join(' · ')
            : 'A fresh starting point. No previous load to match.'}
        </p>
        <p>
          {last?.comfort && last.comfort !== 'Comfortable'
            ? 'Your last session included a comfort concern. No load increase is suggested.'
            : 'Use your comfort and completed logs to decide what is appropriate today.'}
        </p>
        <h3>Make it yours</h3>
        <label>
          Substitute movement
          <input
            value={sub}
            onChange={(e) => setSub(e.target.value)}
            maxLength={100}
          />
        </label>
        <Button
          kind="secondary"
          disabled={!sub.trim()}
          onClick={() => {
            setData((d) => ({
              ...d,
              exercises: d.exercises.map((e, i) =>
                i === d.index ? { ...e, name: sub } : e,
              ),
            }));
            setSub('');
          }}
        >
          Use this movement
        </Button>
        <Button
          kind="secondary"
          onClick={() => {
            if (data.index === data.exercises.length - 1)
              void finish({
                ...data,
                exercises: data.exercises.map((e, i) =>
                  i === data.index ? { ...e, skipped: true } : e,
                ),
              });
            else
              setData((d) => ({
                ...d,
                index: d.index + 1,
                exercises: d.exercises.map((e, i) =>
                  i === d.index ? { ...e, skipped: true } : e,
                ),
              }));
          }}
        >
          Skip exercise
        </Button>
        <p>
          {String(
            p.w.state.records.find((r) => r.id === 'settings:gym')?.data
              .restrictions || 'Your saved restrictions will appear here.',
          )}
        </p>
      </aside>
    </div>
  );
}
function FoodPhoto(p: ViewProps & { close: () => void }) {
  const [image, setImage] = useState(''),
    [portions, setPortions] = useState(''),
    [estimate, setEstimate] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [retention, setRetention] = useState('7');
  async function pick(file: File) {
    setError('');
    try {
      if (
        !['image/jpeg', 'image/png', 'image/webp'].includes(file.type) ||
        file.size > 20e6
      )
        throw new Error('Choose a JPEG, PNG, or WebP photo under 20 MB.');
      const bitmap = await createImageBitmap(file),
        canvas = document.createElement('canvas');
      const scale = Math.min(1, 1200 / Math.max(bitmap.width, bitmap.height));
      canvas.width = Math.round(bitmap.width * scale);
      canvas.height = Math.round(bitmap.height * scale);
      canvas
        .getContext('2d')!
        .drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      bitmap.close();
      setImage(canvas.toDataURL('image/jpeg', 0.78));
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function submit() {
    setBusy(true);
    setError('');
    try {
      if (p.config.demo)
        throw new Error(
          'Photo estimates are available in a connected account with an OpenRouter API key.',
        );
      const r = await api<{ estimate: string }>('/api/food-photo', {
        image,
        portions,
        retentionDays: Number(retention),
        eventId: crypto.randomUUID(),
      });
      setEstimate(r.estimate);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal title="A little context for your meal." onClose={p.close}>
      <p>
        Optional estimates use ranges. A photo cannot reveal every ingredient or
        portion.
      </p>
      <label>
        Meal photo
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void pick(f);
          }}
        />
      </label>
      {image && (
        <img src={image} alt="Your selected meal" className="photo-preview" />
      )}
      <label>
        What is in it? Correct the portions.
        <textarea
          value={portions}
          onChange={(e) => setPortions(e.target.value)}
          maxLength={1000}
          rows={2}
          placeholder="For example: one cup of rice, two eggs, olive oil"
        />
      </label>
      <label>
        Keep the private photo
        <select
          value={retention}
          onChange={(e) => setRetention(e.target.value)}
        >
          <option value="0">Don’t retain it</option>
          <option value="7">7 days</option>
          <option value="30">30 days</option>
        </select>
      </label>
      <Button disabled={!image || busy} onClick={() => void submit()}>
        {busy ? 'Estimating…' : 'Estimate this meal'}
      </Button>
      {estimate && (
        <div className="callout mint">
          <p className="preserve">{estimate}</p>
          <Button
            kind="secondary"
            onClick={() =>
              void p.w.record('food', 'food-photo:' + p.today, {
                date: p.today,
                notes: portions,
                estimate,
              })
            }
          >
            Save the corrected note
          </Button>
        </div>
      )}
      {error && (
        <p className="form-message" role="alert">
          {error}
        </p>
      )}
    </Modal>
  );
}
