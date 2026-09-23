import { Temporal } from '@js-temporal/polyfill';
import { monday, type Horizon, type Plan, type Session, type Topic, type Track, type WeekMeta } from './plan';
import type { AppState } from './types';

// A rolling plan keeps one week concrete. Tracks carry the direction beyond
// it: goals and an ordered list of topics. Each week draws its sessions from
// those lists, one per learning day, and every weekday keeps its track
// (Monday is always finance, say), so the rhythm stays familiar while the
// content adapts.
//
// A topic keeps its id when it becomes a session, and a session that isn't
// done by the end of its week goes back to the front of its track's list.
// Nothing piles up, and anything keyed by session id (concepts, runs,
// attempts) follows the topic wherever it goes.
//
// Everything here is pure and runs on both client and server, so the same
// edit gives the same plan offline and on the server.

export type Rolling = Plan & { horizon: Horizon };
export const isRolling = (p?: Plan | null): p is Rolling => !!p?.horizon;

export const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
export const addDays = (date: string, n: number) => Temporal.PlainDate.from(date).add({ days: n }).toString();
export const weekOf = (date: string) => monday(date);
export const weekEnd = (start: string) => addDays(start, 6);
export const dayIndex = (date: string) => Temporal.PlainDate.from(date).dayOfWeek - 1;
export const nextWeek = (date: string) => addDays(weekOf(date), 7);

// A week can be reshaped until its Monday is over: a draft from Sunday, and
// the week itself on its first day.
export const editable = (start: string, today: string) => today <= start;
// Next week's draft appears from Sunday noon (local).
export const draftDue = (today: string, hour: number) => dayIndex(today) === 6 && hour >= 12;

export function slots(h: Horizon) {
  return Object.entries(h.rhythm.days)
    .map(([d, track]) => ({ day: Number(d), track }))
    .sort((a, b) => a.day - b.day);
}
export const weekMeta = (p: Rolling, start: string) => p.horizon.weeks.find((w) => w.start === start);
export const weekSessions = (p: Plan, start: string) =>
  p.sessions.filter((s) => s.date >= start && s.date <= weekEnd(start)).sort((a, b) => a.date.localeCompare(b.date));
export const trackOf = (p: Rolling, id: string) => p.horizon.tracks.find((t) => t.id === id);

const inTravel = (p: Plan, date: string) => {
  const t = p.schedule.travel_window;
  return !!t && date >= t.start && date <= t.end;
};
const knownSources = (p: Plan, ids: string[]) => {
  const known = new Set(p.sources.map((s) => s.id));
  return ids.filter((x) => known.has(x));
};

export function topicToSession(p: Rolling, t: Topic, track: string, date: string, why?: string): Session {
  return {
    id: t.id,
    date,
    start_local: p.horizon.rhythm.start_local,
    duration_minutes: t.minutes ?? p.horizon.rhythm.minutes,
    optional: false,
    subject: track,
    title: t.title,
    objective: t.objective,
    evidence: t.evidence,
    source_ids: knownSources(p, t.source_ids),
    prerequisite_ids: [],
    generation_instructions: t.generation_instructions,
    ...(t.added ? { added: true } : {}),
    ...(why ? { why: why.slice(0, 400) } : {}),
  };
}
function sessionToTopic(s: Session, rhythmMinutes: number): Topic {
  return {
    id: s.id,
    title: s.title,
    objective: s.objective,
    evidence: s.evidence,
    source_ids: s.source_ids,
    generation_instructions: s.generation_instructions,
    ...(s.duration_minutes !== rhythmMinutes ? { minutes: s.duration_minutes } : {}),
    ...(s.added ? { added: true } : {}),
  };
}

// Which track fills each slot this week. A paused (or empty) track lends its
// day to the active track with the most topics waiting, so a week is never
// thinner than the rhythm while there is anything left to learn.
export function assignSlots(p: Rolling, start: string) {
  const tracks = new Map(p.horizon.tracks.map((t) => [t.id, t]));
  const left = new Map(p.horizon.tracks.map((t) => [t.id, t.status === 'active' ? t.backlog.length : 0]));
  const out: { day: number; date: string; track: string }[] = [];
  for (const s of slots(p.horizon)) {
    const date = addDays(start, s.day);
    if (inTravel(p, date) || date < p.start_date) continue;
    let track = s.track;
    if (tracks.get(track)?.status !== 'active' || !left.get(track)) {
      const lender = [...left.entries()].sort((a, b) => b[1] - a[1])[0];
      if (!lender || !lender[1]) continue;
      track = lender[0];
    }
    left.set(track, left.get(track)! - 1);
    out.push({ day: s.day, date, track });
  }
  return out;
}

export type Pick = { day: number; date: string; track: string; topic: Topic; why?: string };
// The deterministic week: each slot takes the next topic on its track.
export function planWeek(p: Rolling, start: string): Pick[] {
  const taken = new Map<string, number>();
  return assignSlots(p, start).flatMap((slot) => {
    const track = trackOf(p, slot.track)!,
      i = taken.get(slot.track) || 0,
      topic = track.backlog[i];
    if (!topic) return [];
    taken.set(slot.track, i + 1);
    return [{ ...slot, topic }];
  });
}

const touch = (p: Rolling, change: (h: Horizon) => Horizon): Rolling => ({ ...p, horizon: change(p.horizon) });
const upsertWeek = (h: Horizon, meta: WeekMeta): Horizon => ({
  ...h,
  weeks: [...h.weeks.filter((w) => w.start !== meta.start), meta].sort((a, b) => a.start.localeCompare(b.start)),
});

// The v1 `weeks` list, kept in step with the weeks that exist so older views
// (and the session engine's week context) still read correctly.
function syncWeeks(p: Rolling): Rolling {
  const weeks = p.horizon.weeks
    .map((m) => {
      const ss = weekSessions(p, m.start);
      return {
        id: 'w' + m.start,
        start_date: m.start,
        mode: 'standard',
        topics: Object.fromEntries(ss.map((s) => [DAY_NAMES[dayIndex(s.date)].toLowerCase(), s.title.slice(0, 500)])),
        evidence: ss.find((s) => s.evidence)?.evidence || '',
      };
    })
    .filter((w, i, all) => all.findIndex((x) => x.id === w.id) === i);
  return { ...p, weeks: weeks.length ? weeks : p.weeks };
}

// Puts a week's picks into the plan: their topics leave the tracks and become
// sessions. An existing draft for that week is replaced; anything already
// done in it stays.
export function placeWeek(
  state: AppState,
  start: string,
  picks: Pick[],
  meta: Omit<WeekMeta, 'start' | 'generated_at'> & { generated_at?: string },
  done: Set<string> = new Set(state.attempts.map((a) => a.session_id)),
): AppState {
  let p = state.plan as Rolling;
  const replaced = weekSessions(p, start).filter((s) => !done.has(s.id));
  p = returnToTracks(p, replaced);
  const used = new Set(picks.map((x) => x.topic.id));
  p = touch(p, (h) => ({
    ...h,
    tracks: h.tracks.map((t) => ({ ...t, backlog: t.backlog.filter((x) => !used.has(x.id)) })),
  }));
  const keep = new Set(weekSessions(p, start).map((s) => s.id));
  const sessions = picks.filter((x) => !keep.has(x.topic.id)).map((x) => topicToSession(p, x.topic, x.track, x.date, x.why));
  const end = weekEnd(start);
  p = {
    ...p,
    sessions: [...p.sessions, ...sessions].sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id)),
    end_date: p.end_date < end ? end : p.end_date,
  };
  p = touch(p, (h) => upsertWeek(h, { ...meta, start, generated_at: meta.generated_at || new Date().toISOString() }));
  const gone = new Set(replaced.map((s) => s.id));
  return { ...state, plan: syncWeeks(p), overrides: dropKeys(state.overrides, gone) };
}

// Sessions leave the week and their topics go back to the front of their
// track, in the order they were planned. A topic the AI added goes back too,
// still labelled, unless it was removed on purpose (see removeSession).
function returnToTracks(p: Rolling, back: Session[]): Rolling {
  if (!back.length) return p;
  const gone = new Set(back.map((s) => s.id));
  const minutes = p.horizon.rhythm.minutes;
  return {
    ...touch(p, (h) => ({
      ...h,
      tracks: h.tracks.map((t) => {
        const mine = back.filter((s) => s.subject === t.id).map((s) => sessionToTopic(s, minutes));
        return mine.length ? { ...t, backlog: [...mine, ...t.backlog.filter((x) => !gone.has(x.id))] } : t;
      }),
    })),
    sessions: p.sessions.filter((s) => !gone.has(s.id)),
  };
}
const dropKeys = <T,>(o: Record<string, T>, keys: Set<string>) => Object.fromEntries(Object.entries(o).filter(([k]) => !keys.has(k)));

// Brings the plan up to today: weeks that have ended close (unfinished
// sessions go back to their tracks), a waiting draft becomes the current
// week, and a missing current week is planned. Returns null when nothing
// needed to change.
export function rollover(state: AppState, today: string, now = new Date().toISOString()): AppState | null {
  const p0 = state.plan;
  if (!isRolling(p0)) return null;
  const done = new Set(state.attempts.map((a) => a.session_id));
  const current = weekOf(today < p0.start_date ? p0.start_date : today);
  let p = p0,
    overrides = state.overrides,
    changed = false;
  for (const w of p.horizon.weeks.filter((w) => w.start < weekOf(today) && w.status !== 'done')) {
    const ss = weekSessions(p, w.start);
    const open = ss.filter((s) => !done.has(s.id));
    p = returnToTracks(p, open);
    overrides = dropKeys(overrides, new Set(open.map((s) => s.id)));
    p = touch(p, (h) => upsertWeek(h, { ...w, status: 'done', planned: ss.filter((s) => !s.optional).length, done: ss.length - open.length }));
    changed = true;
  }
  const meta = weekMeta(p, current);
  if (meta && meta.status === 'draft' && today >= current) {
    p = touch(p, (h) => upsertWeek(h, { ...meta, status: 'active' }));
    changed = true;
  }
  if (!changed && meta) return null;
  let next: AppState = { ...state, plan: syncWeeks(p), overrides };
  if (!meta) {
    const picks = planWeek(p, current);
    next = placeWeek(next, current, picks, { status: today >= current ? 'active' : 'draft', origin: 'planner', generated_at: now }, done);
  }
  return next;
}

// ---------- Edits (learner steering) ----------

export type PlanEdit =
  | { op: 'swap'; sessionId: string; topicId: string }
  | { op: 'remove'; sessionId: string }
  | { op: 'add'; week: string; track: string; day: number }
  | { op: 'dismiss-suggestion'; week: string }
  | { op: 'steer'; week: string; note: string }
  | { op: 'rhythm'; days: Record<string, string>; minutes: number }
  | { op: 'track'; track: string; status: 'active' | 'paused' }
  | { op: 'move-topic'; track: string; topicId: string; to: number };

// Applies a learner's edit. Anything that doesn't fit (a week that can no
// longer change, a topic that isn't waiting) leaves the plan as it was.
export function applyEdit(state: AppState, e: PlanEdit, today: string): AppState {
  const p = state.plan;
  if (!isRolling(p)) return state;
  const done = new Set(state.attempts.map((a) => a.session_id));
  const sessionIn = (id: string) => {
    const s = p.sessions.find((x) => x.id === id);
    return s && !done.has(s.id) && editable(weekOf(s.date), today) ? s : null;
  };
  switch (e.op) {
    case 'swap': {
      const s = sessionIn(e.sessionId);
      const track = p.horizon.tracks.find((t) => t.backlog.some((x) => x.id === e.topicId));
      if (!s || !track) return state;
      const topic = track.backlog.find((x) => x.id === e.topicId)!;
      let q = returnToTracks(p, [s]);
      q = touch(q, (h) => ({ ...h, tracks: h.tracks.map((t) => ({ ...t, backlog: t.backlog.filter((x) => x.id !== topic.id) })) }));
      q = { ...q, sessions: [...q.sessions, topicToSession(q, topic, track.id, s.date)].sort((a, b) => a.date.localeCompare(b.date)) };
      return { ...state, plan: syncWeeks(q), overrides: dropKeys(state.overrides, new Set([s.id])) };
    }
    case 'remove': {
      const s = sessionIn(e.sessionId);
      if (!s) return state;
      // A topic the AI proposed goes away when removed; a planned one waits.
      const q = s.added ? { ...p, sessions: p.sessions.filter((x) => x.id !== s.id) } : returnToTracks(p, [s]);
      return { ...state, plan: syncWeeks(q), overrides: dropKeys(state.overrides, new Set([s.id])) };
    }
    case 'add': {
      // One more session this week: the track's next topic, on the chosen day.
      const meta = weekMeta(p, e.week),
        track = trackOf(p, e.track),
        topic = track?.backlog[0];
      if (!meta || !track || !topic || !editable(e.week, today) || !Number.isInteger(e.day) || e.day < 0 || e.day > 6) return state;
      if (weekSessions(p, e.week).length >= 14) return state;
      const suggestion = meta.suggestion && meta.suggestion.extra > 1 ? { ...meta.suggestion, extra: meta.suggestion.extra - 1 } : null;
      let q = touch(p, (h) => upsertWeek({ ...h, tracks: h.tracks.map((t) => (t.id === track.id ? { ...t, backlog: t.backlog.slice(1) } : t)) }, { ...meta, suggestion }));
      const end = weekEnd(e.week);
      q = { ...q, sessions: [...q.sessions, topicToSession(q, topic, track.id, addDays(e.week, e.day))].sort((a, b) => a.date.localeCompare(b.date)), end_date: q.end_date < end ? end : q.end_date };
      return { ...state, plan: syncWeeks(q) };
    }
    case 'dismiss-suggestion': {
      const meta = weekMeta(p, e.week);
      return meta ? { ...state, plan: touch(p, (h) => upsertWeek(h, { ...meta, suggestion: null })) } : state;
    }
    case 'steer': {
      const meta = weekMeta(p, e.week);
      return meta && editable(e.week, today) ? { ...state, plan: touch(p, (h) => upsertWeek(h, { ...meta, steer: e.note.slice(0, 600) })) } : state;
    }
    case 'rhythm': {
      const ids = new Set(p.horizon.tracks.map((t) => t.id));
      const days = Object.fromEntries(Object.entries(e.days).filter(([d, t]) => /^[0-6]$/.test(d) && ids.has(t)));
      if (!Object.keys(days).length) return state;
      const minutes = Math.max(10, Math.min(240, Math.round(e.minutes)));
      // A new session length replaces the lengths topics carried over from
      // the original plan.
      return {
        ...state,
        plan: touch(p, (h) => ({
          ...h,
          rhythm: { ...h.rhythm, days, minutes },
          tracks: minutes === h.rhythm.minutes ? h.tracks : h.tracks.map((t) => ({ ...t, backlog: t.backlog.map(({ minutes: _, ...x }) => x) })),
        })),
      };
    }
    case 'track': {
      if (!trackOf(p, e.track)) return state;
      const active = p.horizon.tracks.filter((t) => t.status === 'active' && t.id !== e.track).length;
      if (e.status === 'paused' && !active) return state; // never pause the last one
      return { ...state, plan: touch(p, (h) => ({ ...h, tracks: h.tracks.map((t) => (t.id === e.track ? { ...t, status: e.status } : t)) })) };
    }
    case 'move-topic': {
      const track = trackOf(p, e.track);
      const i = track?.backlog.findIndex((x) => x.id === e.topicId) ?? -1;
      if (!track || i < 0) return state;
      const list = [...track.backlog];
      const [topic] = list.splice(i, 1);
      list.splice(Math.max(0, Math.min(list.length, e.to)), 0, topic);
      return { ...state, plan: touch(p, (h) => ({ ...h, tracks: h.tracks.map((t) => (t.id === track.id ? { ...t, backlog: list } : t)) })) };
    }
  }
}

// ---------- Converting a dated plan ----------

const TITLES: Record<string, string> = { finance: 'Finance', communication: 'Communication', judgment: 'Judgment' };
const titleOf = (id: string) => TITLES[id] || id.replace(/-/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
const trackSlug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40) || 'general';
const mode = <T,>(xs: T[]) => {
  const n = new Map<T, number>();
  xs.forEach((x) => n.set(x, (n.get(x) || 0) + 1));
  return [...n.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
};
const GOAL_HINTS: Record<string, RegExp> = {
  finance: /financ|cash|money|business|account|invest/i,
  communication: /conversation|speak|communicat|listen|present|pitch/i,
  judgment: /politic|evidence|bias|judg|argument|decision|reason/i,
};

// Turns a fully dated plan into a rolling one. Its sessions become each
// track's topic list, in their original order. The first week to come stays
// exactly as written, and anything already started or finished stays where it
// happened. Optional and one-off review sessions are left out: reviews now
// come from what each learner is forgetting.
export function toRolling(plan: Plan, o: { today: string; keep?: Set<string> }): Rolling {
  if (isRolling(plan)) return plan;
  const keep = o.keep || new Set<string>();
  const core = plan.sessions.filter((s) => !s.optional && s.subject !== 'review');
  const subjects = [...new Set(core.map((s) => trackSlug(s.subject)))];
  const first = weekOf(o.today < plan.start_date ? plan.start_date : o.today);
  const minutes = mode(core.map((s) => s.duration_minutes)) || 60;
  const sorted = [...plan.sessions].sort((a, b) => a.date.localeCompare(b.date) || a.start_local.localeCompare(b.start_local));
  const stays = (s: Session) => keep.has(s.id) || (s.date >= first && s.date <= weekEnd(first) && !s.optional && s.subject !== 'review');
  const sessions = sorted
    .filter(stays)
    .map((s) => ({ ...s, subject: trackSlug(s.subject), prerequisite_ids: [] as string[] }));
  const waiting = sorted.filter((s) => !stays(s) && !s.optional && s.subject !== 'review');
  const days: Record<string, string> = {};
  for (let d = 0; d < 7; d++) {
    const t = mode(core.filter((s) => dayIndex(s.date) === d).map((s) => trackSlug(s.subject)));
    if (t) days[String(d)] = t;
  }
  const goals = plan.profile.goals;
  const tracks: Track[] = subjects.map((id) => ({
    id,
    title: titleOf(id),
    why: '',
    goals: goals.filter((g) => GOAL_HINTS[id]?.test(g)).slice(0, 10),
    status: 'active' as const,
    backlog: waiting.filter((s) => trackSlug(s.subject) === id).map((s) => sessionToTopic(s, minutes)),
  }));
  // Goals no track claimed still belong somewhere.
  const claimed = new Set(tracks.flatMap((t) => t.goals));
  goals.filter((g) => !claimed.has(g)).forEach((g, i) => tracks[i % tracks.length].goals.push(g));
  const weekStarts = [...new Set(sessions.map((s) => weekOf(s.date)))];
  const now = new Date().toISOString();
  const weeks: WeekMeta[] = weekStarts.map((start) => ({
    start,
    status: start < weekOf(o.today) ? 'done' : start <= o.today ? 'active' : 'draft',
    origin: 'import',
    generated_at: now,
  }));
  let rolling: Rolling = {
    ...plan,
    sessions,
    horizon: {
      version: 1,
      rhythm: { days: Object.keys(days).length ? days : { '0': subjects[0] || 'general' }, minutes, start_local: plan.schedule.start_local },
      tracks: tracks.length ? tracks : [{ id: 'general', title: 'General', why: '', goals, status: 'active', backlog: [] }],
      weeks,
    },
  };
  rolling = syncWeeks(rolling);
  // A plan whose next week has nothing written yet starts with a planned one.
  if (!weekMeta(rolling, first)) {
    const state = { plan: rolling, attempts: [], records: [], overrides: {}, revisions: [], revision: 0 } as AppState;
    rolling = placeWeek(state, first, planWeek(rolling, first), { status: o.today >= first ? 'active' : 'draft', origin: 'planner', generated_at: now }).plan as Rolling;
  }
  return rolling;
}

// ---------- Reading the whole curriculum ----------

// Every scheduled session and every waiting topic, in the order they are
// likely to be learned (tracks interleaved as the rhythm interleaves them).
// This is what the concept map and the knowledge map read, so they cover the
// whole direction, not just the weeks that exist.
export function curriculumSessions(p: Plan): Session[] {
  if (!isRolling(p)) return p.sessions;
  const lanes = slots(p.horizon).map((s) => s.track);
  const queues = new Map(p.horizon.tracks.map((t) => [t.id, [...t.backlog]]));
  const later: Session[] = [];
  const order = lanes.length ? lanes : p.horizon.tracks.map((t) => t.id);
  while ([...queues.values()].some((q) => q.length)) {
    let moved = false;
    for (const id of [...order, ...p.horizon.tracks.map((t) => t.id).filter((x) => !order.includes(x))]) {
      const topic = queues.get(id)?.shift();
      if (topic) {
        later.push(topicToSession(p, topic, id, p.end_date));
        moved = true;
      }
    }
    if (!moved) break;
  }
  return [...p.sessions, ...later];
}

// A session by id, including one whose topic has gone back to its track (a
// run started last week can still be finished with its full context).
export function sessionById(p: Plan | undefined, id: string | null | undefined) {
  if (!p || !id) return undefined;
  const s = p.sessions.find((x) => x.id === id);
  if (s || !isRolling(p)) return s;
  for (const t of p.horizon.tracks) {
    const topic = t.backlog.find((x) => x.id === id);
    if (topic) return topicToSession(p, topic, t.id, p.end_date);
  }
  return undefined;
}
