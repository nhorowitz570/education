'use client';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/client/api';
import { Icon } from '@/components/icons';
import { Disclosure, Sheet, dateLabel } from '@/components/ui';
import { useApp } from '@/components/app/provider';
import type { Session, Track } from '@/lib/plan';
import type { AppState } from '@/lib/types';
import type { RunView } from '@/lib/learning/run';
import {
  DAY_NAMES,
  dayIndex,
  editable,
  nextWeek,
  slots,
  weekEnd,
  weekMeta,
  weekOf,
  weekSessions,
  type PlanEdit,
  type Rolling,
} from '@/lib/rolling';

type Concept = { key: string; title: string; track: string; strength: number; level: string; sessions: string[]; misconceptions: string[] };
const range = (start: string) => `${dateLabel(start, false)} – ${dateLabel(weekEnd(start), start.slice(0, 7) === weekEnd(start).slice(0, 7) ? { day: 'numeric' } : false)}`;
const short = (day: number) => DAY_NAMES[day].slice(0, 3);
const monthOf = (date: string) => new Date(date + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
const daysUntil = (from: string, to: string) => Math.round((Date.parse(to + 'T12:00:00Z') - Date.parse(from + 'T12:00:00Z')) / 86400000);

// The Learn page for a plan that runs a week at a time: this week, next
// week's draft (yours to shape until its Monday), and the direction beyond.
export function RollingLearn({ plan, concepts }: { plan: Rolling; concepts: Concept[] }) {
  const { w, today, toast } = useApp();
  const done = useMemo(() => new Set(w.state.attempts.map((a) => a.session_id)), [w.state.attempts]);
  const [open, setOpen] = useState<Session | null>(null),
    [swapping, setSwapping] = useState<Session | null>(null),
    [track, setTrack] = useState<Track | null>(null),
    [rhythm, setRhythm] = useState(false),
    [adding, setAdding] = useState(false);
  const current = weekOf(today < plan.start_date ? plan.start_date : today);
  const upcoming = nextWeek(current <= today ? today : current);
  const nextMeta = weekMeta(plan, upcoming);
  const thisWeek = weekSessions(plan, current);
  const nextSessions = weekSessions(plan, upcoming);
  const past = plan.horizon.weeks.filter((x) => x.start < current).reverse();
  const index = plan.horizon.weeks.filter((x) => x.start <= current && weekSessions(plan, x.start).length).length;

  // Arriving from "Next week is ready" lands on the draft.
  useEffect(() => {
    if (location.hash === '#next') setTimeout(() => document.getElementById('next')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
  }, []);

  const edit = async (e: PlanEdit, message?: string) => {
    await w.send({ type: 'plan-edit', eventId: crypto.randomUUID(), today, edit: e });
    if (message) toast(message);
  };
  const doneThisWeek = thisWeek.filter((s) => done.has(s.id)).length;

  return (
    <div className="page learn rolling">
      <header className="page-head">
        <div>
          <p className="eyebrow">Learn</p>
          <h1 className="title">{plan.title}</h1>
          <p className="label" style={{ marginTop: 6 }}>
            {today < plan.start_date ? `Starts ${dateLabel(plan.start_date)}` : `Week ${index}`} · {doneThisWeek} of {thisWeek.length} done this week
          </p>
        </div>
        <button className="btn quiet" onClick={() => setRhythm(true)}>
          <Icon name="calendar" size={17} /> Your rhythm
        </button>
      </header>

      <WeekList
        id="this-week"
        eyebrow={today < plan.start_date ? 'Your first week' : 'This week'}
        title={range(current)}
        sessions={thisWeek}
        done={done}
        today={today}
        concepts={concepts}
        onOpen={setOpen}
        canEdit={editable(current, today)}
        onSwap={setSwapping}
        onRemove={(s) => void edit({ op: 'remove', sessionId: s.id }, s.added ? 'Removed.' : `${s.title} goes back to ${trackTitle(plan, s.subject)}.`)}
        note={editable(current, today) ? (today === current ? 'You can reshape this week until tonight.' : 'You can reshape this week until it starts on Monday.') : undefined}
        empty="Nothing planned this week. Rest counts too."
      />

      {current > today || (
        <section className="rl-next" id="next" aria-labelledby="next-title">
          <div className="rl-section-head">
            <div>
              <p className="eyebrow">Next week</p>
              <h2 className="heading" id="next-title">
                {range(upcoming)}
                {nextMeta?.status === 'draft' && <span className="pill-draft">Draft</span>}
              </h2>
            </div>
          </div>
          {nextMeta ? (
            <NextWeek
              plan={plan}
              start={upcoming}
              sessions={nextSessions}
              done={done}
              today={today}
              concepts={concepts}
              onOpen={setOpen}
              onSwap={setSwapping}
              onAdd={() => setAdding(true)}
              edit={edit}
            />
          ) : (
            <DraftLater />
          )}
        </section>
      )}

      <section className="rl-direction" aria-labelledby="direction-title">
        <div className="rl-section-head">
          <div>
            <p className="eyebrow">Direction</p>
            <h2 className="heading" id="direction-title">
              What you’re working toward
            </h2>
          </div>
        </div>
        <div className="track-grid">
          {plan.horizon.tracks.map((t) => (
            <TrackCard key={t.id} plan={plan} track={t} onOpen={() => setTrack(t)} />
          ))}
        </div>
        {plan.milestones.length > 0 && (
          <div className="checkpoints">
            <p className="eyebrow">Checkpoints</p>
            <div className="rows">
              {plan.milestones
                .filter((m) => m.date >= today)
                .map((m) => {
                  const days = daysUntil(today, m.date);
                  return (
                    <div className="row" key={m.date + m.title}>
                      <span className="row-glyph">
                        <Icon name="target" size={18} />
                      </span>
                      <div className="grow">
                        <p>{m.title}</p>
                        <p className="sub">Target: {monthOf(m.date)}</p>
                      </div>
                      <span className={'countdown' + (days <= 21 ? ' soon' : '')}>
                        <b className="num">{days}</b> days
                      </span>
                    </div>
                  );
                })}
            </div>
          </div>
        )}
      </section>

      {past.length > 0 && (
        <section className="rl-past" aria-label="Past weeks">
          <p className="eyebrow">Past weeks</p>
          {past.map((m) => {
            const ss = weekSessions(plan, m.start);
            return (
              <Disclosure key={m.start} title={range(m.start)} teaser={`${m.done ?? ss.filter((s) => done.has(s.id)).length} of ${m.planned ?? ss.length} done`}>
                <div className="rows">
                  {ss.length ? (
                    ss.map((s) => <SessionRow key={s.id} s={s} done={done.has(s.id)} today={today} onOpen={() => setOpen(s)} />)
                  ) : (
                    <p className="muted">Nothing finished that week. Its topics went back to their tracks.</p>
                  )}
                </div>
              </Disclosure>
            );
          })}
        </section>
      )}

      {open && (
        <SessionSheet
          plan={plan}
          session={open}
          concepts={concepts.filter((c) => c.sessions.includes(open.id))}
          done={done.has(open.id)}
          canEdit={editable(weekOf(open.date), today) && !done.has(open.id)}
          onSwap={() => {
            setSwapping(open);
            setOpen(null);
          }}
          onRemove={() => {
            void edit({ op: 'remove', sessionId: open.id }, open.added ? 'Removed.' : `${open.title} goes back to ${trackTitle(plan, open.subject)}.`);
            setOpen(null);
          }}
          onClose={() => setOpen(null)}
        />
      )}
      {swapping && (
        <SwapSheet
          plan={plan}
          session={swapping}
          onPick={(topicId) => {
            void edit({ op: 'swap', sessionId: swapping.id, topicId }, 'Swapped.');
            setSwapping(null);
          }}
          onClose={() => setSwapping(null)}
        />
      )}
      {track && <TrackSheet plan={plan} track={plan.horizon.tracks.find((t) => t.id === track.id) || track} edit={edit} onClose={() => setTrack(null)} />}
      {rhythm && <RhythmSheet plan={plan} onClose={() => setRhythm(false)} />}
      {adding && (
        <AddSheet
          plan={plan}
          start={upcoming}
          taken={nextSessions.map((s) => dayIndex(s.date))}
          onAdd={(trackId, day) => {
            void edit({ op: 'add', week: upcoming, track: trackId, day }, 'Added.');
            setAdding(false);
          }}
          onClose={() => setAdding(false)}
        />
      )}
    </div>
  );
}

const trackTitle = (p: Rolling, id: string) => p.horizon.tracks.find((t) => t.id === id)?.title || id;

function WeekList({
  id,
  eyebrow,
  title,
  sessions,
  done,
  today,
  concepts,
  onOpen,
  canEdit,
  onSwap,
  onRemove,
  note,
  empty,
}: {
  id: string;
  eyebrow: string;
  title: string;
  sessions: Session[];
  done: Set<string>;
  today: string;
  concepts: Concept[];
  onOpen: (s: Session) => void;
  canEdit: boolean;
  onSwap: (s: Session) => void;
  onRemove: (s: Session) => void;
  note?: string;
  empty: string;
}) {
  return (
    <section className="rl-week" id={id} aria-labelledby={id + '-title'}>
      <div className="rl-section-head">
        <div>
          <p className="eyebrow">{eyebrow}</p>
          <h2 className="heading" id={id + '-title'}>
            {title}
          </h2>
        </div>
      </div>
      {sessions.length ? (
        <div className="rows">
          {sessions.map((s) => (
            <SessionRow
              key={s.id}
              s={s}
              done={done.has(s.id)}
              today={today}
              strength={strengthOf(concepts, s)}
              onOpen={() => onOpen(s)}
              actions={canEdit && !done.has(s.id) ? { onSwap: () => onSwap(s), onRemove: () => onRemove(s) } : undefined}
            />
          ))}
        </div>
      ) : (
        <p className="muted rl-empty">{empty}</p>
      )}
      {note && <p className="label rl-note">{note}</p>}
    </section>
  );
}

const strengthOf = (concepts: Concept[], s: Session) => {
  const cs = concepts.filter((c) => c.sessions.includes(s.id));
  return cs.length ? cs.reduce((a, c) => a + c.strength, 0) / cs.length : null;
};

function SessionRow({
  s,
  done,
  today,
  strength = null,
  onOpen,
  actions,
}: {
  s: Session;
  done: boolean;
  today: string;
  strength?: number | null;
  onOpen: () => void;
  actions?: { onSwap: () => void; onRemove: () => void };
}) {
  const state = done ? 'done' : s.date === today ? 'today' : s.date < today ? 'open' : 'planned';
  return (
    <div className={'rl-row t-' + s.subject + ' s-' + state}>
      <button className="row session-row" onClick={onOpen}>
        <span className="session-day">
          <span>{short(dayIndex(s.date))}</span>
          <b className="num">{Number(s.date.slice(8))}</b>
        </span>
        <i className={'dot' + (done ? '' : ' hollow') + (state === 'today' ? ' lit' : '')} />
        <div className="grow">
          <p>
            {s.title}
            {s.added && <span className="pill-new">New</span>}
          </p>
          <p className="sub">
            {s.why || `${s.subject.charAt(0).toUpperCase() + s.subject.slice(1).replace(/-/g, ' ')} · ${s.duration_minutes} min`}
            {state === 'today' ? ' · today' : state === 'open' ? ' · still open this week' : ''}
          </p>
        </div>
        {strength !== null && strength > 0 && (
          <span className="meter mini" aria-label={`${Math.round(strength * 100)}% strength`}>
            <i style={{ '--v': strength } as React.CSSProperties} />
          </span>
        )}
        {done ? <Icon name="check" size={17} /> : !actions && <Icon name="chevron" size={17} />}
      </button>
      {actions && (
        <span className="rl-actions">
          <button className="btn icon small ghost" onClick={actions.onSwap} aria-label={`Swap ${s.title}`} title="Swap for another topic">
            <Icon name="refresh" size={16} />
          </button>
          <button className="btn icon small ghost" onClick={actions.onRemove} aria-label={`Take ${s.title} out of this week`} title="Take it out of this week">
            <Icon name="close" size={16} />
          </button>
        </span>
      )}
    </div>
  );
}

// Next week, while it's still a draft: the sessions, the planner's note, any
// suggestion for more, and a way to steer it.
function NextWeek({
  plan,
  start,
  sessions,
  done,
  today,
  concepts,
  onOpen,
  onSwap,
  onAdd,
  edit,
}: {
  plan: Rolling;
  start: string;
  sessions: Session[];
  done: Set<string>;
  today: string;
  concepts: Concept[];
  onOpen: (s: Session) => void;
  onSwap: (s: Session) => void;
  onAdd: () => void;
  edit: (e: PlanEdit, message?: string) => Promise<void>;
}) {
  const { w, toast } = useApp();
  const meta = weekMeta(plan, start)!;
  const canEdit = editable(start, today);
  const [note, setNote] = useState(meta.steer || ''),
    [busy, setBusy] = useState(false);
  const s = meta.suggestion;
  const freeDay = [4, 5, 6, 0, 1, 2, 3].find((d) => !sessions.some((x) => dayIndex(x.date) === d));
  async function redraft() {
    setBusy(true);
    try {
      if (note.trim() !== (meta.steer || '')) await edit({ op: 'steer', week: start, note: note.trim() });
      await w.sync();
      const r = await api<{ state: AppState }>('/api/plan/week', { action: 'redraft' });
      await w.replace(r.state);
      toast('Redrafted.');
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      {meta.note && <p className="rl-summary serif">{meta.note}</p>}
      {sessions.length ? (
        <div className="rows">
          {sessions.map((x) => (
            <SessionRow
              key={x.id}
              s={x}
              done={done.has(x.id)}
              today={today}
              strength={strengthOf(concepts, x)}
              onOpen={() => onOpen(x)}
              actions={canEdit && !done.has(x.id) ? { onSwap: () => onSwap(x), onRemove: () => void edit({ op: 'remove', sessionId: x.id }, x.added ? 'Removed.' : `${x.title} goes back to ${trackTitle(plan, x.subject)}.`) } : undefined}
            />
          ))}
        </div>
      ) : (
        <p className="muted rl-empty">Nothing planned. A week away, or everything is paused.</p>
      )}
      {canEdit && s && freeDay !== undefined && (
        <div className="rl-suggest">
          <Icon name="spark" size={18} />
          <div className="grow">
            <p>
              Room for {s.extra === 1 ? 'one more session' : `${s.extra} more sessions`}
              {s.track ? ` of ${trackTitle(plan, s.track)}` : ''}?
            </p>
            <p className="sub">{s.why}</p>
          </div>
          <button className="btn small" onClick={() => void edit({ op: 'add', week: start, track: s.track || slots(plan.horizon)[0]?.track || plan.horizon.tracks[0].id, day: freeDay }, `Added on ${DAY_NAMES[freeDay]}.`)}>
            Add {short(freeDay)}
          </button>
          <button className="btn icon small ghost" aria-label="No thanks" onClick={() => void edit({ op: 'dismiss-suggestion', week: start })}>
            <Icon name="close" size={16} />
          </button>
        </div>
      )}
      {canEdit && (
        <div className="rl-steer">
          <label htmlFor="steer" className="eyebrow">
            Anything for this week?
          </label>
          <div className="rl-steer-field">
            <textarea
              id="steer"
              className="textarea"
              rows={2}
              maxLength={600}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="More speaking, less politics, a lighter week…"
            />
            <div className="rl-steer-actions">
              <button className="btn" onClick={() => void redraft()} disabled={busy} data-busy={busy || undefined}>
                <Icon name="refresh" size={16} /> Redraft
              </button>
              <button className="btn ghost" onClick={onAdd}>
                <Icon name="plus" size={16} /> Add a session
              </button>
            </div>
          </div>
          <p className="label">Change anything until {dateLabel(start)}. What you don’t finish goes back to its track, never into a backlog.</p>
        </div>
      )}
    </>
  );
}

function DraftLater() {
  const { w, toast } = useApp();
  const [busy, setBusy] = useState(false);
  return (
    <div className="rl-later">
      <p className="muted">Next week is drafted on Sunday at noon, from what you’ve learned this week. You’ll get a notice when it’s ready.</p>
      <button
        className="btn quiet"
        disabled={busy}
        data-busy={busy || undefined}
        onClick={async () => {
          setBusy(true);
          try {
            const r = await api<{ state: AppState }>('/api/plan/week', { action: 'draft' });
            await w.replace(r.state);
          } catch (e) {
            toast((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        Draft it now
      </button>
    </div>
  );
}

function TrackCard({ plan, track, onOpen }: { plan: Rolling; track: Track; onOpen: () => void }) {
  const days = slots(plan.horizon)
    .filter((s) => s.track === track.id)
    .map((s) => short(s.day));
  return (
    <button className={'track-card t-' + track.id + (track.status === 'paused' ? ' paused' : '')} onClick={onOpen}>
      <span className="track-top">
        <span className="track-name">
          <i className="dot" /> {track.title}
        </span>
        <span className="label">{track.status === 'paused' ? 'Paused' : days.join(' · ') || 'No day yet'}</span>
      </span>
      {track.goals[0] && <span className="track-goal">{track.goals[0]}</span>}
      <span className="track-next">
        {track.backlog.length ? (
          <>
            <span className="label">Next</span> {track.backlog[0].title}
          </>
        ) : (
          <span className="label">Everything on this track is covered.</span>
        )}
      </span>
      <span className="label num">{track.backlog.length} topics waiting</span>
    </button>
  );
}

function TrackSheet({ plan, track, edit, onClose }: { plan: Rolling; track: Track; edit: (e: PlanEdit, m?: string) => Promise<void>; onClose: () => void }) {
  const [all, setAll] = useState(false);
  const shown = all ? track.backlog : track.backlog.slice(0, 12);
  const active = plan.horizon.tracks.filter((t) => t.status === 'active').length;
  return (
    <Sheet title={track.title} subtitle={`${track.backlog.length} topics waiting, in the order weeks take them.`} onClose={onClose}>
      {track.goals.length > 0 && (
        <ul className="track-goals">
          {track.goals.map((g) => (
            <li key={g}>{g}</li>
          ))}
        </ul>
      )}
      <ol className="topic-list">
        {shown.map((t, i) => (
          <li key={t.id}>
            <span className="num topic-n">{i + 1}</span>
            <span className="grow">
              {t.title}
              {t.added && <span className="pill-new">New</span>}
            </span>
            {i > 0 && (
              <button className="btn icon small ghost" aria-label={`Move ${t.title} up`} title="Sooner" onClick={() => void edit({ op: 'move-topic', track: track.id, topicId: t.id, to: i - 1 })}>
                <Icon name="up" size={15} />
              </button>
            )}
            {i > 0 && (
              <button className="btn icon small ghost" aria-label={`Move ${t.title} to next`} title="Next up" onClick={() => void edit({ op: 'move-topic', track: track.id, topicId: t.id, to: 0 }, 'Next up.')}>
                <Icon name="arrow" size={15} style={{ transform: 'rotate(-90deg)' }} />
              </button>
            )}
          </li>
        ))}
      </ol>
      {track.backlog.length > 12 && (
        <button className="link" onClick={() => setAll((x) => !x)}>
          {all ? 'Show fewer' : `Show all ${track.backlog.length}`}
        </button>
      )}
      <div className="setting-line">
        <div className="grow">
          <p>{track.status === 'paused' ? 'Paused' : 'Active'}</p>
          <p className="label">
            {track.status === 'paused' ? 'Its days go to your other tracks until you resume it.' : 'Pausing lends its days to your other tracks. Nothing is lost.'}
          </p>
        </div>
        <button
          className="btn small"
          disabled={track.status === 'active' && active <= 1}
          onClick={() =>
            void edit(
              { op: 'track', track: track.id, status: track.status === 'active' ? 'paused' : 'active' },
              track.status === 'active' ? `${track.title} paused from the next week drafted.` : `${track.title} is back.`,
            )
          }
        >
          {track.status === 'active' ? 'Pause' : 'Resume'}
        </button>
      </div>
    </Sheet>
  );
}

// The week's shape: each weekday keeps its track, so Monday always means the
// same thing. Changes apply from the next week drafted. It opens from Learn
// and from You → Your rhythm.
export function RhythmSheet({ plan, onClose }: { plan: Rolling; onClose: () => void }) {
  const { w, today, toast } = useApp();
  const edit = async (e: PlanEdit, message?: string) => {
    await w.send({ type: 'plan-edit', eventId: crypto.randomUUID(), today, edit: e });
    if (message) toast(message);
  };
  const [days, setDays] = useState<Record<string, string>>({ ...plan.horizon.rhythm.days }),
    [minutes, setMinutes] = useState(plan.horizon.rhythm.minutes),
    [start, setStart] = useState(plan.horizon.rhythm.start_local);
  const count = Object.keys(days).length;
  const tracks = plan.horizon.tracks;
  return (
    <Sheet title="Your rhythm" subtitle="Each day keeps its subject, so the week feels familiar while what you learn adapts." onClose={onClose}>
      <div className="rhythm">
        {DAY_NAMES.map((name, d) => (
          <div className="rhythm-day" key={name}>
            <span className="rhythm-name">{name.slice(0, 3)}</span>
            <div className="chips" role="radiogroup" aria-label={name}>
              <button className="chip" role="radio" aria-checked={!days[d]} aria-pressed={!days[d]} onClick={() => setDays(({ [d]: _, ...rest }) => rest)}>
                Rest
              </button>
              {tracks.map((t) => (
                <button
                  key={t.id}
                  className={'chip t-' + t.id}
                  role="radio"
                  aria-checked={days[d] === t.id}
                  aria-pressed={days[d] === t.id}
                  onClick={() => setDays((x) => ({ ...x, [d]: t.id }))}
                >
                  {t.title}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="field">
        <span>Session length</span>
        <div className="segmented" role="group" aria-label="Session length">
          {[30, 45, 60, 90, 120].map((m) => (
            <button key={m} aria-pressed={minutes === m} onClick={() => setMinutes(m)}>
              {m < 60 ? `${m} min` : `${m / 60} h`}
            </button>
          ))}
        </div>
      </div>
      <label className="field">
        <span>Usual start</span>
        <input className="input" type="time" value={start} onChange={(e) => setStart(e.target.value)} />
        <span className="label">Reminders and the session written ahead of time use this. You can still learn whenever you like.</span>
      </label>
      <p className="label">
        {count} session{count === 1 ? '' : 's'} a week, about {Math.round((count * minutes) / 6) / 10} hours. Your planner may suggest more; it never adds them without you.
      </p>
      <button
        className="btn primary"
        disabled={!count}
        onClick={() => {
          void edit({ op: 'rhythm', days, minutes, ...(start ? { start_local: start } : {}) }, 'Saved. It applies from the next week drafted.');
          onClose();
        }}
      >
        Save rhythm
      </button>
    </Sheet>
  );
}

function SwapSheet({ plan, session, onPick, onClose }: { plan: Rolling; session: Session; onPick: (id: string) => void; onClose: () => void }) {
  const own = plan.horizon.tracks.find((t) => t.id === session.subject);
  const others = plan.horizon.tracks.filter((t) => t.id !== session.subject && t.status === 'active' && t.backlog.length);
  return (
    <Sheet title="Swap for another topic" subtitle={`Instead of “${session.title}”. It goes back to its track.`} onClose={onClose}>
      {own && own.backlog.length > 0 && (
        <div className="swap-group">
          <p className="eyebrow">{own.title}</p>
          <div className="swap-list">
            {own.backlog.slice(0, 8).map((t) => (
              <button key={t.id} className="swap-item" onClick={() => onPick(t.id)}>
                {t.title}
                {t.added && <span className="pill-new">New</span>}
              </button>
            ))}
          </div>
        </div>
      )}
      {others.map((t) => (
        <div className="swap-group" key={t.id}>
          <p className="eyebrow">{t.title}</p>
          <div className="swap-list">
            {t.backlog.slice(0, 3).map((x) => (
              <button key={x.id} className="swap-item" onClick={() => onPick(x.id)}>
                {x.title}
              </button>
            ))}
          </div>
        </div>
      ))}
    </Sheet>
  );
}

function AddSheet({ plan, start, taken, onAdd, onClose }: { plan: Rolling; start: string; taken: number[]; onAdd: (track: string, day: number) => void; onClose: () => void }) {
  const tracks = plan.horizon.tracks.filter((t) => t.status === 'active' && t.backlog.length);
  const [track, setTrack] = useState(tracks[0]?.id || ''),
    [day, setDay] = useState([4, 5, 6, 0, 1, 2, 3].find((d) => !taken.includes(d)) ?? 4);
  const next = tracks.find((t) => t.id === track)?.backlog[0];
  return (
    <Sheet title="Add a session" subtitle={`To the week of ${dateLabel(start, false)}. It takes the track’s next topic.`} onClose={onClose}>
      <div className="field">
        <span>Track</span>
        <div className="chips">
          {tracks.map((t) => (
            <button key={t.id} className={'chip t-' + t.id} aria-pressed={track === t.id} onClick={() => setTrack(t.id)}>
              {t.title}
            </button>
          ))}
        </div>
      </div>
      <div className="field">
        <span>Day</span>
        <div className="chips">
          {DAY_NAMES.map((n, d) => (
            <button key={n} className="chip" aria-pressed={day === d} onClick={() => setDay(d)}>
              {n.slice(0, 3)}
              {taken.includes(d) ? ' ·' : ''}
            </button>
          ))}
        </div>
      </div>
      {next && (
        <p className="muted">
          Next on this track: <b>{next.title}</b>
        </p>
      )}
      <button className="btn primary" disabled={!track} onClick={() => onAdd(track, day)}>
        Add to {DAY_NAMES[day]}
      </button>
    </Sheet>
  );
}

function SessionSheet({
  plan,
  session,
  concepts,
  done,
  canEdit,
  onSwap,
  onRemove,
  onClose,
}: {
  plan: Rolling;
  session: Session;
  concepts: Concept[];
  done: boolean;
  canEdit: boolean;
  onSwap: () => void;
  onRemove: () => void;
  onClose: () => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  async function start(kind: 'session' | 'review') {
    setBusy(true);
    setError('');
    try {
      const { run } = await api<{ run: RunView }>('/api/runs', {
        kind,
        sessionId: kind === 'session' ? session.id : undefined,
        concepts: kind === 'review' ? concepts.map((c) => c.key) : undefined,
      });
      router.push('/session/' + run.id);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }
  return (
    <Sheet
      title={session.title}
      subtitle={`${DAY_NAMES[dayIndex(session.date)]} · ${trackTitle(plan, session.subject)} · ${session.duration_minutes} min`}
      onClose={onClose}
    >
      {session.added && <p className="pill-new big">A new topic, proposed for this week</p>}
      <p className="serif" style={{ fontSize: 18, lineHeight: 1.5 }}>
        {session.objective}
      </p>
      {session.why && (
        <div className="field">
          <span>Why this week</span>
          <p>{session.why}</p>
        </div>
      )}
      {session.evidence && (
        <div className="field">
          <span>You’ll produce</span>
          <p>{session.evidence}</p>
        </div>
      )}
      {concepts.length > 0 && (
        <div className="rows">
          {concepts.map((c) => (
            <div className={'row t-' + c.track} key={c.key}>
              <div className="grow">
                <p>{c.title}</p>
                <p className="sub">
                  {c.level}
                  {c.misconceptions.length ? ` · watch: ${c.misconceptions[0]}` : ''}
                </p>
              </div>
              <span className="meter mini">
                <i style={{ '--v': c.strength } as React.CSSProperties} />
              </span>
            </div>
          ))}
        </div>
      )}
      {error && <p className="conversation-error">{error}</p>}
      <div className="row-inline" style={{ flexWrap: 'wrap' }}>
        {done ? (
          concepts.length > 0 && (
            <button className="btn primary" onClick={() => void start('review')} data-busy={busy || undefined}>
              Review these ideas
            </button>
          )
        ) : (
          <button className="btn primary" onClick={() => void start('session')} data-busy={busy || undefined}>
            Start this session
          </button>
        )}
        {canEdit && (
          <>
            <button className="btn quiet" onClick={onSwap}>
              <Icon name="refresh" size={16} /> Swap
            </button>
            <button className="btn ghost" onClick={onRemove}>
              Take it out
            </button>
          </>
        )}
      </div>
    </Sheet>
  );
}
