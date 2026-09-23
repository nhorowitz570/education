import { Temporal } from '@js-temporal/polyfill';
import type { Plan } from '@/lib/plan';
import type { AppState } from '@/lib/types';
import { scheduled } from '@/lib/schedule';

export type Action = {
  kind: 'resume' | 'session' | 'review' | 'return' | 'explore' | 'practice' | 'rehearsal';
  label: string;
  detail: string;
  sessionId?: string;
  milestone?: string; // rehearsal: the milestone's date
  runId?: string;
  minutes?: number;
  track?: string;
};
export type DayMark = {
  date: string;
  weekday: string;
  status: 'done' | 'planned' | 'today' | 'missed' | 'skipped' | 'travel' | 'reduced' | 'rest';
  track?: string;
  title?: string;
};
export type TodayView = {
  phase: 'no-plan' | 'before-start' | 'learning-day' | 'rest-day' | 'done-today' | 'after-end';
  greeting: string;
  headline: string;
  why: string;
  primary: Action | null;
  secondary: Action[];
  week: { index: number; total: number; days: DayMark[]; done: number; planned: number } | null;
  focus: { title: string; subject: string; objective: string; evidence: string; date: string; minutes: number } | null;
  due: { count: number; minutes: number };
  milestone: { title: string; date: string; days: number } | null;
  startsIn: number | null;
};

const dayName = (d: string) => Temporal.PlainDate.from(d).toLocaleString('en-US', { weekday: 'short' });
const between = (a: string, b: string) => Temporal.PlainDate.from(a).until(Temporal.PlainDate.from(b)).days;

export function greetingFor(hour: number, name?: string) {
  const part = hour < 5 ? 'Late night' : hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  return name ? `${part}, ${name.split(' ')[0]}.` : `${part}.`;
}

export function today(input: {
  state: AppState;
  date: string; // local date in the plan's timezone
  hour: number;
  dueCount: number;
  activeRun?: { id: string; title: string; session_id: string | null; progress: number; updated_at: string } | null;
  voice: boolean;
  rehearsed?: string[]; // milestone dates already rehearsed
}): TodayView {
  const { state, date, hour } = input;
  const plan: Plan | undefined = state.plan;
  const due = { count: input.dueCount, minutes: Math.min(10, Math.max(3, input.dueCount * 3)) };
  const explore: Action = {
    kind: 'explore',
    label: 'Explore something',
    detail: 'Ask about anything you’re curious about. It still counts.',
  };
  const practice: Action = {
    kind: 'practice',
    label: 'Practise out loud',
    detail: input.voice ? 'A debate, a hard conversation or a pitch, by voice.' : 'Role-play a conversation in text.',
  };
  const review: Action | null = input.dueCount
    ? {
        kind: 'review',
        label: `Review ${input.dueCount} idea${input.dueCount === 1 ? '' : 's'}`,
        detail: `About ${due.minutes} minutes, before they fade.`,
        minutes: due.minutes,
      }
    : null;
  if (!plan)
    return {
      phase: 'no-plan',
      greeting: greetingFor(hour),
      headline: 'Start with your plan.',
      why: 'Import a curriculum and Fieldwork will run each session for you.',
      primary: null,
      secondary: [explore],
      week: null,
      focus: null,
      due,
      milestone: null,
      startsIn: null,
    };

  const done = new Set(state.attempts.map((a) => a.session_id));
  const sessions = plan.sessions
    .map((s) => scheduled(s, state))
    .sort((a, b) => a.date.localeCompare(b.date) || a.start_local.localeCompare(b.start_local));
  const upcoming = sessions.filter((s) => !done.has(s.id) && s.status !== 'skipped');
  const todays = upcoming.find((s) => s.date === date && s.status !== 'travel');
  const doneToday = sessions.some((s) => s.date === date && done.has(s.id));
  const next = upcoming.find((s) => s.date >= date && !s.optional);
  const missed = sessions.filter(
    (s) => s.date < date && s.date >= plan.start_date && !s.optional && !done.has(s.id) && !['skipped', 'travel'].includes(s.status),
  );
  const returning = missed.length >= 2;

  // The current week strip (Mon–Sun containing today, or the first week).
  const anchor = date < plan.start_date ? plan.start_date : date;
  const monday = Temporal.PlainDate.from(anchor).subtract({ days: Temporal.PlainDate.from(anchor).dayOfWeek - 1 });
  const days: DayMark[] = [];
  for (let i = 0; i < 7; i++) {
    const d = monday.add({ days: i }).toString(),
      s = sessions.find((x) => x.date === d && !x.optional) || sessions.find((x) => x.date === d);
    if (!s && i >= 4) continue;
    days.push({
      date: d,
      weekday: dayName(d),
      track: s?.subject,
      title: s?.title,
      status: !s
        ? 'rest'
        : done.has(s.id)
          ? 'done'
          : s.status === 'skipped' || s.status === 'travel'
            ? (s.status as DayMark['status'])
            : d === date
              ? 'today'
              : d < date
                ? 'missed'
                : s.status === 'reduced'
                  ? 'reduced'
                  : 'planned',
    });
  }
  const weekIndex = Math.max(0, Math.floor(between(plan.start_date, monday.toString()) / 7));
  const weekPlanned = days.filter((d) => d.track && !['skipped', 'travel', 'rest'].includes(d.status));
  const milestone = plan.milestones
    .filter((m) => m.date >= date)
    .sort((a, b) => a.date.localeCompare(b.date))[0];
  // Two weeks out, a milestone earns a rehearsal: a mock of its deliverable
  // while there's still time to close the gaps it finds.
  const soon = milestone && between(date, milestone.date) <= 14 && !(input.rehearsed || []).includes(milestone.date);
  const rehearse: Action | null = soon
    ? {
        kind: 'rehearsal',
        label: `Rehearse: ${milestone.title.split(':')[0]}`.slice(0, 80),
        detail: `A 30-minute mock, ${between(date, milestone.date)} days out, to find what still needs work.`,
        milestone: milestone.date,
        minutes: 30,
      }
    : null;
  const focusSession = todays || next;
  const base = {
    greeting: greetingFor(hour, plan.profile.name),
    week: {
      index: weekIndex + 1,
      total: plan.weeks.length,
      days,
      done: weekPlanned.filter((d) => d.status === 'done').length,
      planned: weekPlanned.length,
    },
    focus: focusSession
      ? {
          title: focusSession.title,
          subject: focusSession.subject,
          objective: focusSession.objective,
          evidence: focusSession.evidence,
          date: focusSession.date,
          minutes: focusSession.duration_minutes,
        }
      : null,
    due,
    milestone: milestone ? { title: milestone.title, date: milestone.date, days: between(date, milestone.date) } : null,
    startsIn: date < plan.start_date ? between(date, plan.start_date) : null,
  };

  // An unfinished session is the obvious next step while it is fresh. Once it
  // has gone stale, today's own session leads and the old one waits aside.
  const r = input.activeRun;
  const resume: Action | null = r
    ? { kind: 'resume', label: 'Continue', detail: r.title, runId: r.id, sessionId: r.session_id || undefined }
    : null;
  if (r && resume && (!todays || r.session_id === todays.id || between(r.updated_at.slice(0, 10), date) <= 1)) {
    const pct = Math.round(r.progress * 100);
    return {
      ...base,
      phase: todays ? 'learning-day' : 'rest-day',
      headline: 'Pick up where you left off.',
      why: pct < 5 ? `${r.title} is ready, right where you stopped.` : `You’re ${pct}% through ${r.title}.`,
      primary: resume,
      secondary: [rehearse, review, practice, explore].filter(Boolean) as Action[],
    };
  }
  if (date > plan.end_date)
    return {
      ...base,
      phase: 'after-end',
      headline: 'The plan is complete.',
      why: 'Keep ideas fresh with review, or explore what comes next.',
      primary: review || explore,
      secondary: [practice, ...(review ? [explore] : [])],
    };
  if (todays) {
    const minutes = returning ? 20 : todays.duration_minutes;
    return {
      ...base,
      phase: 'learning-day',
      headline: returning ? 'Ease back in.' : todays.title,
      why: returning
        ? 'A couple of mornings slipped. Twenty minutes restarts the thread; nothing piles up.'
        : todays.status === 'reduced'
          ? `A shorter session today · ${minutes} min`
          : `${cap(todays.subject)} · ${minutes} min${input.dueCount ? ` · starts with ${Math.min(2, input.dueCount)} quick recall${input.dueCount > 1 ? 's' : ''}` : ''}`,
      primary: {
        kind: returning ? 'return' : 'session',
        label: 'Begin',
        detail: todays.title,
        sessionId: todays.id,
        minutes,
        track: todays.subject,
      },
      secondary: [
        ...(resume ? [{ ...resume, label: 'Finish the earlier session' }] : []),
        ...(returning ? [] : [{ kind: 'session' as const, label: 'Only 20 minutes', detail: 'Keep the objective, trim the rest.', sessionId: todays.id, minutes: 20, track: todays.subject }]),
        ...(rehearse ? [rehearse] : []),
        practice,
        explore,
      ],
    };
  }
  const ahead = next && date < plan.start_date;
  return {
    ...base,
    phase: ahead ? 'before-start' : doneToday ? 'done-today' : 'rest-day',
    headline: ahead
      ? `Begins ${Temporal.PlainDate.from(plan.start_date).toLocaleString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}.`
      : doneToday
        ? 'Today’s session is done.'
        : review
          ? 'A few ideas are ready to review.'
          : 'No session today.',
    why: ahead
      ? 'Everything is ready. Start the first session early, or explore something first.'
      : doneToday
        ? 'Anything more is optional. Momentum without obligation.'
        : next
          ? `Next: ${next.title}, ${Temporal.PlainDate.from(next.date).toLocaleString('en-US', { weekday: 'long' })}.`
          : 'Rest, or learn a bit more if you feel like it.',
    primary:
      review ||
      (ahead && next ? { kind: 'session', label: 'Start early', detail: next.title, sessionId: next.id, minutes: next.duration_minutes, track: next.subject } : null) ||
      rehearse,
    secondary: [
      ...(review && ahead && next ? [{ kind: 'session' as const, label: 'Start the first session', detail: next.title, sessionId: next.id, minutes: next.duration_minutes, track: next.subject }] : []),
      ...(rehearse && (review || (ahead && next)) ? [rehearse] : []),
      practice,
      explore,
    ],
  };
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
