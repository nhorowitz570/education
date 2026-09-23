'use client';
import { useState } from 'react';
import {
  parsePlan,
  planSchema,
  planDiff,
  type Plan,
  MAX_IMPORT_BYTES,
} from '@/lib/plan';
import { EMPTY_TEMPLATE } from '@/lib/seed';
import { DAY_NAMES, dayIndex, isRolling, slots, toRolling, weekSessions } from '@/lib/rolling';
import { api } from '@/lib/client/api';
import type { AppState } from '@/lib/types';
import type { ViewProps } from './app/legacy';
import { Button, Pill, SectionTitle, download, dateLabel } from './ui';
import { Icon } from './icons';
export function ImportView(p: ViewProps) {
  const [file, setFile] = useState<{ name: string; text: string }>(),
    [plan, setPlan] = useState<Plan>(),
    [uncertain, setUncertain] = useState<string[]>([]),
    [accepted, setAccepted] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [done, setDone] = useState(false),
    [edit, setEdit] = useState(false),
    [json, setJson] = useState('');
  async function upload(f: File) {
    setBusy(true);
    setError('');
    setPlan(undefined);
    setAccepted(false);
    try {
      if (f.size > MAX_IMPORT_BYTES)
        throw new Error('Choose a JSON or Markdown plan smaller than 2 MB.');
      if (!/\.(json|md|markdown|txt)$/i.test(f.name))
        throw new Error('Choose JSON or Markdown.');
      const text = await f.text();
      setFile({ name: f.name, text });
      let parsed: Plan,
        issues: string[] = [];
      if (p.config.demo) {
        parsed = toRolling(parsePlan(text), { today: p.today });
      } else {
        const result = await api<{ plan: Plan; uncertain: string[] }>(
          '/api/import',
          {
            action: 'preview',
            filename: f.name,
            original: text,
            eventId: crypto.randomUUID(),
          },
        );
        parsed = result.plan;
        issues = result.uncertain;
      }
      setPlan(parsed);
      setJson(JSON.stringify(parsed, null, 2));
      setUncertain(issues);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function activate() {
    if (!plan || !file) return;
    setBusy(true);
    setError('');
    try {
      if (p.config.demo) {
        await p.w.send({
          type: 'activate',
          eventId: crypto.randomUUID(),
          plan,
        });
      } else {
        const r = await api<{ state: AppState }>('/api/import', {
          action: 'activate',
          filename: file.name,
          original: file.text,
          plan,
          eventId: crypto.randomUUID(),
        });
        await p.w.replace(r.state);
      }
      setDone(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const diff = plan ? planDiff(p.w.state.plan, plan) : null;
  return (
    <div className="screen-grid">
      <div className="main-lane">
        <SectionTitle
          eyebrow="YOUR PLAN, YOUR PACE"
          title={
            done
              ? 'Your next chapter is ready.'
              : plan
                ? 'Make sure it feels right.'
                : 'Bring your plan to life.'
          }
          description={
            done
              ? 'Start with one useful situation. Everything else can wait.'
              : plan
                ? 'Review the interpretation before it becomes your schedule.'
                : 'A ChatGPT plan becomes small, useful steps you can actually start.'
          }
        />
        {done ? (
          <section className="hero mint">
            <span className="circle">
              <Icon name="check" />
            </span>
            <h2>{plan?.title}</h2>
            <p>Your first week is ready · private to your account</p>
            <Button onClick={() => p.go('today')}>
              Go to Today
              <Icon name="arrow" />
            </Button>
          </section>
        ) : !plan ? (
          <>
            <label className={'upload-zone ' + (busy ? 'loading' : '')}>
              <span className="circle large lavender">
                <Icon name="upload" size={30} />
              </span>
              <h3>{busy ? 'Reading your plan…' : 'Drop your plan here'}</h3>
              <span>or choose a file</span>
              <small>JSON or Markdown · up to 2 MB</small>
              <input
                type="file"
                accept=".json,.md,.markdown,.txt"
                aria-label="Upload a ChatGPT plan"
                disabled={busy}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void upload(f);
                }}
              />
            </label>
            <div className="row wrap">
              <Button
                kind="secondary"
                onClick={() =>
                  download('fieldwork-plan-template.json', EMPTY_TEMPLATE)
                }
              >
                Get the empty template
                <Icon name="arrow" />
              </Button>
            </div>
            <p className="muted">
              Ask ChatGPT to fill this format with your goals, learning dates,
              weekly topics, and source links.
            </p>
          </>
        ) : (
          <>
            <section className="import-card lavender">
              <Pill>Plan interpretation</Pill>
              <h2>{plan.title}</h2>
              <div className="import-facts">
                <div>
                  <small>Starts</small>
                  <strong>{dateLabel(plan.start_date)}</strong>
                </div>
                <div>
                  <small>Learning rhythm</small>
                  <strong>
                    {isRolling(plan)
                      ? slots(plan.horizon)
                          .map((x) => `${DAY_NAMES[x.day].slice(0, 3)} ${plan.horizon.tracks.find((t) => t.id === x.track)?.title}`)
                          .join(' · ')
                      : `${plan.weeks.length} weeks · ${plan.sessions.length} sessions`}
                  </strong>
                </div>
                <div>
                  <small>Time zone</small>
                  <strong>{plan.schedule.timezone}</strong>
                </div>
                <div>
                  <small>Typical window</small>
                  <strong>
                    {plan.schedule.start_local} – {plan.schedule.end_local}
                  </strong>
                </div>
              </div>
            </section>
            {isRolling(plan) ? (
              <>
                <div className="callout white-box">
                  <h3>Your first week</h3>
                  <ol className="import-week">
                    {weekSessions(plan, plan.horizon.weeks.find((w) => w.status !== 'done')?.start || plan.start_date).map((s) => (
                      <li key={s.id}>
                        <small>{DAY_NAMES[dayIndex(s.date)]}</small>
                        <strong>{s.title}</strong>
                      </li>
                    ))}
                  </ol>
                </div>
                <div className="callout white-box">
                  <h3>Beyond that, a direction</h3>
                  <p>
                    Only the first week is scheduled. Everything else waits in{' '}
                    {plan.horizon.tracks.length} tracks, in the order you wrote it, and each week is drafted
                    on Sunday from what you’ve learned so far. You can change any week until its Monday.
                  </p>
                  <div className="row wrap">
                    {plan.horizon.tracks.map((t) => (
                      <Pill key={t.id}>
                        {t.title} · {t.backlog.length} topics
                      </Pill>
                    ))}
                  </div>
                  <p>Completed work stays in your history. Milestones travel with the plan.</p>
                </div>
              </>
            ) : (
              <div className="callout white-box">
                <h3>{p.w.state.plan ? 'What changes' : 'What comes with it'}</h3>
                <p>
                  {diff?.added} new sessions · {diff?.changed} changed · {diff?.removed} removed from the schedule.
                </p>
              </div>
            )}
            {(uncertain.length > 0 ||
              plan.schedule.travel_window?.dates_confirmed === false) && (
              <div className="callout peach">
                <h3>A few things to check</h3>
                <ul>
                  {uncertain.map((s) => (
                    <li key={s}>{s}</li>
                  ))}
                  {plan.schedule.travel_window?.dates_confirmed === false && (
                    <li>
                      Travel {dateLabel(plan.schedule.travel_window.start)} –{' '}
                      {dateLabel(plan.schedule.travel_window.end)} is proposed.
                    </li>
                  )}
                </ul>
                <label className="checkbox">
                  <input
                    type="checkbox"
                    checked={accepted}
                    onChange={(e) => setAccepted(e.target.checked)}
                  />
                  I reviewed these assumptions.
                </label>
              </div>
            )}
            <button className="text-button" onClick={() => setEdit(!edit)}>
              Edit the interpreted JSON
              <Icon name="down" size={16} />
            </button>
            {edit && (
              <>
                <label>
                  Plan JSON
                  <textarea
                    className="code-input"
                    rows={12}
                    value={json}
                    onChange={(e) => setJson(e.target.value)}
                  />
                </label>
                <Button
                  kind="secondary"
                  onClick={() => {
                    try {
                      const next = planSchema.parse(JSON.parse(json));
                      setPlan(next);
                      setEdit(false);
                      setError('');
                    } catch {
                      setError(
                        'Check the required fields, real dates, and stable IDs in the edited plan.',
                      );
                    }
                  }}
                >
                  Validate changes
                </Button>
              </>
            )}
            <div className="row wrap">
              <Button
                disabled={
                  busy ||
                  edit ||
                  ((uncertain.length > 0 ||
                    plan.schedule.travel_window?.dates_confirmed === false) &&
                    !accepted)
                }
                onClick={() => void activate()}
              >
                {busy ? 'Activating…' : 'Activate this plan'}
                <Icon name="arrow" />
              </Button>
              <Button kind="secondary" onClick={() => setPlan(undefined)}>
                Choose another file
              </Button>
            </div>
          </>
        )}
        {error && (
          <p className="form-message preserve" role="alert">
            {error}
          </p>
        )}
      </div>
      <aside className="context">
        <span className="circle large mint">
          <Icon name="book" />
        </span>
        <h3>A plan you can live with.</h3>
        <p>Short lessons. Flexible mornings. Progress that stays.</p>
        <ol className="lesson-stages">
          {[
            'Upload your plan',
            'Review the interpretation',
            'Start your first lesson',
          ].map((s, i) => (
            <li key={s}>
              <span
                className={
                  'circle small ' +
                  ((done ? 2 : plan ? 1 : 0) === i ? 'mint' : '')
                }
              >
                {i + 1}
              </span>
              {s}
            </li>
          ))}
        </ol>
        <p>New versions preserve the original file and your completed work.</p>
      </aside>
    </div>
  );
}
