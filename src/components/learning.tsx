'use client';
import { useState } from 'react';
import { Temporal } from '@js-temporal/polyfill';
import {
  selectNext,
  weeklyConsistency,
  scheduled,
  dueReview,
  demonstrated,
} from '@/lib/schedule';
import { practicePoints } from '@/lib/progress';
import { monday } from '@/lib/plan';
import type { ViewProps } from './app';
import { Icon } from './icons';
import { Button, Pill, SectionTitle, dateLabel, Modal, download } from './ui';
export function Context({ p }: { p: ViewProps }) {
  const { state } = p.w,
    plan = state.plan!,
    week = weeklyConsistency(state, p.today),
    milestone =
      plan.milestones.find((m) => m.date >= p.today) || plan.milestones.at(-1);
  return (
    <aside className="context">
      <div className="row between">
        <span className="eyebrow">YOUR SPACE</span>
        <button
          className="icon-button"
          aria-label="Settings"
          onClick={() => p.go('settings')}
        >
          <Icon name="settings" size={20} />
        </button>
      </div>
      <div className="profile">
        <div className="circle large lavender">
          <Icon name="book" />
        </div>
        <h3>{plan.profile.name}</h3>
        <p>Education & growth</p>
      </div>
      <section className="white-box">
        <div className="row between">
          <strong>This week</strong>
          <span className="muted">
            {week.done} / {week.total}
          </span>
        </div>
        <div className="week-dots">
          {(week.dates.length
            ? week.dates
            : plan.schedule.weekdays.map((n) =>
                Temporal.PlainDate.from(monday(p.today))
                  .add({ days: n })
                  .toString(),
              )
          ).map((d) => (
            <span
              key={d}
              className={
                'circle ' +
                (week.completed.includes(d)
                  ? 'mint'
                  : d === p.today
                    ? 'lavender'
                    : 'soft')
              }
              title={dateLabel(d)}
            >
              {week.completed.includes(d) ? (
                <Icon name="check" size={16} />
              ) : (
                new Date(d + 'T12:00Z').toLocaleDateString('en', {
                  weekday: 'narrow',
                  timeZone: 'UTC',
                })
              )}
            </span>
          ))}
        </div>
        <p>
          {week.total === 0
            ? 'Your next week is ahead.'
            : 'Reduced days count.'}
          <br />
          {plan.schedule.friday ? 'Friday stays open.' : 'Your pace is yours.'}
        </p>
      </section>
      {milestone && (
        <>
          <div className="eyebrow">WORKING TOWARD</div>
          <section className="mini-card lavender">
            <Pill>{dateLabel(milestone.date)}</Pill>
            <h3>
              {milestone.title.includes('Cash')
                ? 'A cash briefing you can explain.'
                : milestone.title}
            </h3>
            <p>Useful work you can carry forward.</p>
          </section>
        </>
      )}
      <p>
        Your progress stays with you,
        <br />
        even when plans change.
      </p>
    </aside>
  );
}
export function Today(p: ViewProps) {
  const { w, today, start, go, open } = p,
    plan = w.state.plan!,
    next = selectNext(w.state, today),
    review = next?.kind === 'lesson' ? dueReview(w.state, today) : undefined,
    [later, setLater] = useState(false);
  const session = next?.session;
  const cash = session?.title.toLowerCase().includes('profit versus cash'),
    week = Math.max(
      1,
      Math.min(
        plan.weeks.length,
        (Temporal.PlainDate.from(plan.start_date).until(
          Temporal.PlainDate.from(today),
          { largestUnit: 'days' },
        ).days /
          7 +
          1) |
          0,
      ),
    );
  const checkin = w.state.records.find((r) => r.id === 'checkin:' + today);
  return (
    <div className="screen-grid">
      <div className="main-lane">
        <div className="row between meta">
          <span>
            {new Date(today + 'T12:00Z').toLocaleDateString('en-US', {
              weekday: 'long',
              month: 'long',
              day: 'numeric',
              timeZone: 'UTC',
            })}
          </span>
          <span>
            Week {week} of {plan.weeks.length}
          </span>
        </div>
        <h1>
          {next?.returning ? (
            <>
              Good to have
              <br />
              you back.
            </>
          ) : (
            <>
              Good morning,
              <br />
              {plan.profile.name.split(' ')[0]}.
            </>
          )}
        </h1>
        {next?.returning && (
          <p className="return-note">
            Your progress is still here. One short session is enough to restart.
          </p>
        )}
        {session ? (
          <section className="hero mint">
            <div className="row between">
              <div className="row small">
                <span className="circle small">
                  <Icon name="finance" size={20} />
                </span>
                <span className="subject">
                  {review ? 'Recall & apply' : session.subject}
                </span>
              </div>
              <Pill>{review ? review.minutes : 20} min</Pill>
            </div>
            <h2>
              {review ? (
                <>
                  A new situation.
                  <br />
                  Use what you know.
                </>
              ) : cash ? (
                <>
                  Explain why
                  <br />
                  profit isn’t cash.
                </>
              ) : (
                session.title
              )}
            </h2>
            <p>
              {review ? (
                review.attempt.objective_id
              ) : cash ? (
                <>
                  A studio made the sale.
                  <br />
                  Can it pay the bills?
                </>
              ) : (
                session.objective
              )}
            </p>
            <div className="row between hero-action">
              <Button
                onClick={() => {
                  if (review)
                    start(review.attempt.session_id, review.attempt.id);
                  else start(session.id);
                }}
              >
                {review
                  ? 'Start review'
                  : w.state.records.some(
                        (r) =>
                          r.kind === 'draft' && r.data.sessionId === session.id,
                      )
                    ? 'Continue lesson'
                    : next?.returning
                      ? 'Start a short return'
                      : 'Start lesson'}
                <Icon name="arrow" size={18} />
              </Button>
              <span className="hero-note">
                {next?.returning ? '20 minutes. A fresh start.' : next?.reason}
              </span>
            </div>
          </section>
        ) : (
          <section className="hero mint">
            <Icon name="check" />
            <h2>
              You’ve made room
              <br />
              for growth.
            </h2>
            <p>
              Your planned lessons are complete. Take your work into the world.
            </p>
            <Button onClick={() => go('progress')}>
              See your progress
              <Icon name="arrow" />
            </Button>
          </section>
        )}
        <div className="row between">
          <span className="muted">
            {session?.duration_minutes || 0} min planned{' '}
            {session && session.date > today
              ? dateLabel(session.date, true)
              : 'today'}
          </span>
          <Button kind="secondary" onClick={() => open('short')}>
            Make it shorter
          </Button>
        </div>
        <div className="later">
          <button
            className="later-toggle"
            aria-expanded={later}
            onClick={() => setLater(!later)}
          >
            <span>Later today</span>
            <span className="muted">
              Learning · optional growth{' '}
              <Icon name={later ? 'down' : 'chevron'} size={16} />
            </span>
          </button>
          {later && (
            <div className="later-list">
              <button onClick={() => go('voice')}>
                <Icon name="mic" />
                <span>
                  Practice a clear delegation
                  <small>Prepare first · 5–10 minutes</small>
                </span>
                <Icon name="arrow" />
              </button>
              <button onClick={() => go('growth')}>
                <Icon name="growth" />
                <span>
                  A little movement<small>Proposed workout · your pace</small>
                </span>
                <Icon name="arrow" />
              </button>
              <button onClick={() => open('reflection')}>
                <Icon name="book" />
                <span>
                  Weekly reflection
                  <small>Inside your Thursday learning block</small>
                </span>
                <Icon name="arrow" />
              </button>
            </div>
          )}
        </div>
        <div className="row between wrap">
          <p className="muted">
            {week <= 2
              ? 'The first hour is enough for your first two weeks.'
              : 'A shorter day still counts.'}
          </p>
          <button className="text-button" onClick={() => open('checkin')}>
            {checkin ? 'Update check-in' : 'Two-minute check-in'}
            <Icon name="arrow" size={16} />
          </button>
        </div>
      </div>
      <Context p={p} />
    </div>
  );
}
export function Learn(p: ViewProps) {
  const [resource, setResource] = useState(''),
    [reflection, setReflection] = useState(''),
    [resourceSaved, setResourceSaved] = useState(false);
  const plan = p.w.state.plan!,
    current = Math.max(
      0,
      plan.weeks.findLastIndex((w) => w.start_date <= p.today),
    ),
    [index, setIndex] = useState(current),
    week = plan.weeks[index],
    end = Temporal.PlainDate.from(week.start_date).add({ days: 6 }).toString();
  const sessions = plan.sessions
    .map((s) => scheduled(s, p.w.state))
    .filter((s) => s.date >= week.start_date && s.date <= end);
  return (
    <div className="screen-grid">
      <div className="main-lane">
        <SectionTitle
          eyebrow="YOUR LEARNING PLAN"
          title="A little further, every week."
          description={`${dateLabel(plan.start_date)} – ${dateLabel(plan.end_date)} · ${plan.schedule.timezone.replaceAll('_', ' ')}`}
        />
        <div className="row between wrap">
          <div className="row">
            <button
              className="icon-button"
              disabled={index === 0}
              onClick={() => setIndex(index - 1)}
              aria-label="Previous week"
            >
              <Icon name="chevron" style={{ transform: 'rotate(180deg)' }} />
            </button>
            <h3>
              Week {index + 1}{' '}
              <span className="muted">
                · {dateLabel(week.start_date, true)}
              </span>
            </h3>
            <button
              className="icon-button"
              disabled={index >= plan.weeks.length - 1}
              onClick={() => setIndex(index + 1)}
              aria-label="Next week"
            >
              <Icon name="chevron" />
            </button>
          </div>
          <Button kind="secondary" onClick={() => p.open('schedule')}>
            Adjust week
          </Button>
        </div>
        <section className="week-plan">
          {sessions.map((s, i) => {
            const done = p.w.state.attempts.some((a) => a.session_id === s.id);
            return (
              <div className="session-row" key={s.id}>
                <div
                  className={
                    'date-tile ' + ['mint', 'lavender', 'peach', 'blush'][i % 4]
                  }
                >
                  <span>
                    {new Date(s.date + 'T12:00Z').toLocaleDateString('en', {
                      weekday: 'short',
                      timeZone: 'UTC',
                    })}
                  </span>
                  <strong>{Number(s.date.slice(-2))}</strong>
                </div>
                <div className="session-info">
                  <span className="eyebrow">
                    {s.subject} · {s.start_local}
                  </span>
                  <h3>{s.title}</h3>
                  <p>
                    {done
                      ? 'Practice saved'
                      : s.status === 'skipped'
                        ? 'Dropped to preserve the finish date'
                        : `${s.duration_minutes} min${s.optional ? ' · optional' : ''}`}
                  </p>
                </div>
                <button
                  className="circle"
                  disabled={s.status === 'skipped'}
                  aria-label={done ? 'View saved progress' : 'Start ' + s.title}
                  onClick={() => (done ? p.go('progress') : p.start(s.id))}
                >
                  <Icon name={done ? 'check' : 'arrow'} />
                </button>
              </div>
            );
          })}
          {!sessions.length && (
            <p className="empty-state">
              Nothing scheduled here. Leave some room.
            </p>
          )}
        </section>
        <section className="callout lavender">
          <span className="eyebrow">THIS WEEK’S USEFUL WORK</span>
          <h3>{week.evidence}</h3>
        </section>
        <button className="text-button" onClick={() => p.go('voice')}>
          <Icon name="mic" />
          Practice a conversation
          <Icon name="arrow" />
        </button>
        <details className="settings-section">
          <summary>Optional reading & resources</summary>
          <p className="muted">
            Read in the original app or website. Save one useful idea here.
          </p>
          <label>
            Choose a resource
            <select
              value={resource}
              onChange={(e) => {
                setResource(e.target.value);
                setResourceSaved(false);
              }}
            >
              <option value="">Choose when useful</option>
              {plan.sources.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.title}
                </option>
              ))}
            </select>
          </label>
          {resource && (
            <>
              <a
                className="text-button"
                href={plan.sources.find((s) => s.id === resource)?.url}
                target="_blank"
                rel="noreferrer"
              >
                Open original resource ↗
              </a>
              <label>
                What will you use or question?
                <textarea
                  rows={3}
                  maxLength={2000}
                  value={reflection}
                  onChange={(e) => {
                    setReflection(e.target.value);
                    setResourceSaved(false);
                  }}
                />
              </label>
              <Button
                kind="secondary"
                disabled={reflection.trim().length < 10 || resourceSaved}
                onClick={async () => {
                  const source = plan.sources.find((s) => s.id === resource)!;
                  await p.w.record(
                    'external',
                    'resource:' + resource + ':' + p.today,
                    {
                      date: p.today,
                      kind: 'resource',
                      sourceId: resource,
                      title: source.title,
                      url: source.url,
                      reflection,
                    },
                  );
                  setResourceSaved(true);
                }}
              >
                {resourceSaved
                  ? 'Reflection saved'
                  : 'Mark read & save reflection'}
              </Button>
            </>
          )}
        </details>
        <div className="row between wrap">
          <h3>Milestones</h3>
          <button className="text-button" onClick={() => p.go('import')}>
            Import or revise a plan
            <Icon name="upload" size={18} />
          </button>
        </div>
        <div className="milestones">
          {plan.milestones.map((m, i) => (
            <div key={m.date} className="milestone">
              <span className="circle lavender">{i + 1}</span>
              <span>
                <small>{dateLabel(m.date)}</small>
                <strong>{m.title}</strong>
              </span>
            </div>
          ))}
        </div>
      </div>
      <Context p={p} />
    </div>
  );
}
export function Progress(p: ViewProps) {
  const attempts = p.w.state.attempts,
    points = practicePoints(p.w.state),
    skills = [...new Set(attempts.map((a) => a.objective_id))],
    week = weeklyConsistency(p.w.state, p.today),
    [selected, setSelected] = useState<string | null>(null);
  const attempt = attempts.find((a) => a.id === selected),
    work = p.w.state.records.find((r) => r.id === selected);
  return (
    <div className="screen-grid">
      <div className="main-lane">
        <div className="row between meta">
          <span>YOUR PROGRESS</span>
          <Pill>
            Level {1 + Math.floor(points / 200)} · {points} points
          </Pill>
        </div>
        <h1>
          Skills you
          <br />
          can use.
        </h1>
        {skills.length ? (
          skills.map((skill, i) => (
            <section
              key={skill}
              className={i === 0 ? 'hero mint' : 'skill-row white-box'}
            >
              <Pill>
                {demonstrated(p.w.state, skill)
                  ? 'Demonstrated'
                  : 'In practice'}
              </Pill>
              <h2>
                {skill === 'profit-versus-cash'
                  ? 'Explain profit versus cash.'
                  : skill.replace(/^Explain and apply: /, '')}
              </h2>
              <p>
                {demonstrated(p.w.state, skill)
                  ? 'Independent explanation and later transfer.'
                  : 'A useful start. A later independent situation will test this skill.'}
              </p>
              <button
                className="text-button"
                onClick={() =>
                  setSelected(
                    attempts.find((a) => a.objective_id === skill)!.id,
                  )
                }
              >
                View the evidence
                <Icon name="arrow" size={18} />
              </button>
            </section>
          ))
        ) : (
          <section className="hero mint">
            <span className="circle">
              <Icon name="book" />
            </span>
            <h2>
              Your first useful
              <br />
              step starts here.
            </h2>
            <p>Complete a lesson to see your reasoning and progress here.</p>
            <Button onClick={() => p.go('today')}>
              Go to Today
              <Icon name="arrow" />
            </Button>
          </section>
        )}
        <div className="row between">
          <h3>Useful work</h3>
          <button
            className="text-button"
            onClick={() =>
              download('fieldwork-progress.json', {
                attempts,
                reflections: p.w.state.records.filter(
                  (r) => r.kind === 'reflection',
                ),
              })
            }
          >
            Export
            <Icon name="arrow" size={16} />
          </button>
        </div>
        <div>
          {attempts
            .slice()
            .reverse()
            .map((a) => (
              <button
                key={a.id}
                className="work-row"
                onClick={() => setSelected(a.id)}
              >
                <span className="circle">
                  <Icon name="book" />
                </span>
                <span>
                  {a.objective_id === 'profit-versus-cash'
                    ? 'Cash-flow reasoning'
                    : a.objective_id}
                  <small>
                    {a.reduced ? 'Reduced practice · ' : ''}
                    {a.assisted ? 'With tutor support' : 'Independent attempt'}
                  </small>
                </span>
                <span className="muted">{dateLabel(a.date, true)}</span>
              </button>
            ))}
          {p.w.state.records
            .filter((r) => r.kind === 'reflection' || r.kind === 'external')
            .slice(-8)
            .reverse()
            .map((r) => (
              <button
                className="work-row"
                key={r.id}
                onClick={() => setSelected(r.id)}
              >
                <span className="circle lavender">
                  <Icon name={r.data.kind === 'voice' ? 'mic' : 'book'} />
                </span>
                <span>
                  {String(
                    r.data.title ||
                      (r.data.kind === 'voice'
                        ? 'Communication practice'
                        : 'Weekly reflection'),
                  )}
                  <small>Useful work saved</small>
                </span>
              </button>
            ))}
        </div>
      </div>
      <aside className="context">
        <h3>Showing up</h3>
        <div className="row between">
          <span className="big-number">
            {week.done} / {week.total}
          </span>
          <span className="muted">planned mornings</span>
        </div>
        <section className="white-box">
          <div
            className="bar-chart"
            role="img"
            aria-label={`${attempts.length} completed learning activities`}
          >
            {Array.from({ length: 5 }, (_, i) => {
              const end = Temporal.PlainDate.from(monday(p.today))
                  .subtract({ weeks: 4 - i })
                  .add({ days: 6 })
                  .toString(),
                start = Temporal.PlainDate.from(end)
                  .subtract({ days: 6 })
                  .toString(),
                count = attempts.filter(
                  (a) => a.date >= start && a.date <= end,
                ).length;
              return (
                <div key={i}>
                  <span
                    className={
                      ['mint', 'lavender', 'peach', 'blush', 'mint'][i]
                    }
                    style={{ height: Math.max(4, count * 20) + 'px' }}
                  />
                  <small>W{i + 1}</small>
                </div>
              );
            })}
          </div>
          <p>
            Reduced days count.
            <br />
            Your progress doesn’t reset.
          </p>
        </section>
        <p>
          Points reflect practice.
          <br />
          Evidence demonstrates a skill.
        </p>
        <Button kind="secondary" onClick={() => p.open('reflection')}>
          Weekly reflection
        </Button>
      </aside>
      {attempt && (
        <Modal title="Your saved reasoning" onClose={() => setSelected(null)}>
          <Pill>
            {attempt.feedback.independent
              ? 'Independent attempt'
              : 'Supported practice'}
          </Pill>
          <h3>Your decision</h3>
          <p className="preserve">{attempt.reasoning}</p>
          <h3>A changed situation</h3>
          <p className="preserve">{attempt.transfer}</p>
          <div className="callout mint">
            <strong>{attempt.feedback.strength}</strong>
            <p>{attempt.feedback.gap}</p>
          </div>
          <p>{attempt.feedback.next}</p>
          <span className="muted">
            Saved {dateLabel(attempt.date)} · +{attempt.points} points
          </span>
        </Modal>
      )}
      {work && (
        <Modal
          title={String(work.data.title || 'Your saved practice')}
          onClose={() => setSelected(null)}
        >
          <p className="preserve">
            {String(
              work.data.reflection ||
                work.data.useful ||
                'You made time to practice.',
            )}
          </p>
          {!!work.data.next && <p>{String(work.data.next)}</p>}
          {!!work.data.feedback && (
            <p>
              {String((work.data.feedback as { next?: string }).next || '')}
            </p>
          )}
        </Modal>
      )}
    </div>
  );
}
