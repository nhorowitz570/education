import { z } from 'zod';
import { Temporal } from '@js-temporal/polyfill';

export const MAX_IMPORT_BYTES = 2 * 1024 * 1024;
const bounded = z.string().trim().max(6000);
const id = z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,99}$/);
export const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((v) => {
    try {
      return Temporal.PlainDate.from(v).toString() === v;
    } catch {
      return false;
    }
  }, 'Use a real date.');
export const timeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
export const timezoneSchema = z
  .string()
  .max(80)
  .refine((v) => {
    try {
      new Intl.DateTimeFormat('en', { timeZone: v });
      return true;
    } catch {
      return false;
    }
  }, 'Use a valid IANA time zone.');
export const safeUrl = z
  .string()
  .url()
  .max(2000)
  .refine((v) => {
    const u = new URL(v);
    return (
      u.protocol === 'https:' &&
      !u.username &&
      !u.password &&
      !u.search.match(/(?:key|token|secret|password)=/i)
    );
  }, 'Use a public HTTPS URL without credentials.');
const extensions = z
  .record(z.string().max(100), z.unknown())
  .refine(
    (v) => JSON.stringify(v).length <= 32000,
    'Preferences are too large.',
  );
export const sessionSchema = z.object({
  id,
  date: dateSchema,
  start_local: timeSchema,
  duration_minutes: z.number().int().min(5).max(240),
  optional: z.boolean(),
  subject: z.string().min(1).max(100),
  title: z.string().min(1).max(300),
  objective: bounded.min(1),
  evidence: bounded,
  source_ids: z.array(id).max(30),
  prerequisite_ids: z.array(id).max(30),
  generation_instructions: bounded,
  // Rolling plans: a topic the AI proposed that wasn't in the plan, and why
  // this session was chosen for the week.
  added: z.boolean().optional(),
  why: z.string().max(400).optional(),
});

// ---------- Rolling plans ----------
// Only the coming week is concrete. Beyond it are tracks: a direction, goals,
// and an ordered list of topics that weeks are drawn from.
export const trackIdSchema = z.string().regex(/^[a-z0-9][a-z0-9-]{0,39}$/);
export const topicSchema = z.object({
  id,
  title: z.string().min(1).max(300),
  objective: bounded,
  evidence: bounded,
  source_ids: z.array(id).max(30),
  generation_instructions: bounded,
  minutes: z.number().int().min(5).max(240).optional(),
  added: z.boolean().optional(),
});
export const trackSchema = z.object({
  id: trackIdSchema,
  title: z.string().min(1).max(60),
  why: z.string().max(600),
  goals: z.array(z.string().max(300)).max(10),
  status: z.enum(['active', 'paused']),
  backlog: z.array(topicSchema).max(500),
});
export const weekMetaSchema = z.object({
  start: dateSchema,
  status: z.enum(['draft', 'active', 'done']),
  origin: z.enum(['import', 'planner', 'ai']),
  generated_at: z.string().max(40),
  note: z.string().max(400).optional(),
  steer: z.string().max(600).optional(),
  suggestion: z
    .object({ extra: z.number().int().min(1).max(2), track: trackIdSchema.nullable(), why: z.string().max(300) })
    .nullable()
    .optional(),
  planned: z.number().int().min(0).max(50).optional(),
  done: z.number().int().min(0).max(50).optional(),
});
export const horizonSchema = z.object({
  version: z.literal(1),
  rhythm: z.object({
    // Weekday (0 = Monday) to track: the same day always means the same thing.
    days: z.record(z.string().regex(/^[0-6]$/), trackIdSchema),
    minutes: z.number().int().min(10).max(240),
    start_local: timeSchema,
  }),
  tracks: z.array(trackSchema).min(1).max(12),
  weeks: z.array(weekMetaSchema).max(260),
});
export type Horizon = z.infer<typeof horizonSchema>;
export type Track = z.infer<typeof trackSchema>;
export type Topic = z.infer<typeof topicSchema>;
export type WeekMeta = z.infer<typeof weekMetaSchema>;

export const planSchema = z
  .object({
    schema_version: z.literal('1.0'),
    plan_id: id,
    title: z.string().min(1).max(200),
    start_date: dateSchema,
    end_date: dateSchema,
    profile: z.object({
      name: z.string().min(1).max(80),
      timezone: timezoneSchema,
      goals: z.array(bounded).max(30),
      preferences: extensions,
    }),
    schedule: z.object({
      weekdays: z.array(z.number().int().min(0).max(6)).min(1).max(7),
      start_local: timeSchema,
      end_local: timeSchema,
      timezone: timezoneSchema,
      travel_window: z
        .object({
          start: dateSchema,
          end: dateSchema,
          dates_confirmed: z.boolean(),
        })
        .optional(),
      weekly_review: z.string().max(300).optional(),
      friday: z.string().max(100).optional(),
    }),
    sources: z
      .array(
        z.object({
          id,
          title: z.string().min(1).max(300),
          url: safeUrl,
          use: bounded,
        }),
      )
      .max(100),
    weeks: z
      .array(
        z.object({
          id,
          start_date: dateSchema,
          mode: z.string().max(80),
          topics: z.record(z.string().max(30), z.string().max(500)),
          evidence: bounded,
        }),
      )
      .min(1)
      .max(104),
    sessions: z.array(sessionSchema).max(1000),
    growth: extensions,
    adaptation: extensions,
    milestones: z
      .array(z.object({ date: dateSchema, title: z.string().min(1).max(300) }))
      .max(30),
    horizon: horizonSchema.optional(),
  })
  .superRefine((p, ctx) => {
    const err = (message: string, path: (string | number)[] = []) =>
      ctx.addIssue({ code: 'custom', message, path });
    // A rolling plan can be between weeks (say, away) with nothing scheduled.
    if (!p.sessions.length && !p.horizon) err('A plan needs at least one session.', ['sessions']);
    if (p.end_date < p.start_date)
      err('The end date must follow the start date.', ['end_date']);
    if (p.schedule.end_local <= p.schedule.start_local)
      err('The learning window must end after it starts.', ['schedule']);
    if (new Set(p.schedule.weekdays).size !== p.schedule.weekdays.length)
      err('Weekdays cannot repeat.', ['schedule', 'weekdays']);
    const sources = new Set(p.sources.map((s) => s.id));
    const sessions = new Map(p.sessions.map((s) => [s.id, s]));
    if (sources.size !== p.sources.length)
      err('Source IDs must be unique.', ['sources']);
    if (sessions.size !== p.sessions.length)
      err('Session IDs must be unique.', ['sessions']);
    if (new Set(p.weeks.map((w) => w.id)).size !== p.weeks.length)
      err('Week IDs must be unique.', ['weeks']);
    p.sessions.forEach((s, i) => {
      if (s.date < p.start_date || s.date > p.end_date)
        err('Session date is outside the plan.', ['sessions', i, 'date']);
      if (s.source_ids.some((x) => !sources.has(x)))
        err('Unknown source reference.', ['sessions', i, 'source_ids']);
      if (s.prerequisite_ids.some((x) => !sessions.has(x) || x === s.id))
        err('Unknown or self-referencing prerequisite.', [
          'sessions',
          i,
          'prerequisite_ids',
        ]);
    });
    p.milestones.forEach((m, i) => {
      if (m.date < p.start_date || m.date > p.end_date)
        err('Milestone is outside the plan.', ['milestones', i]);
    });
    const visiting = new Set<string>(),
      visited = new Set<string>();
    const visit = (sid: string): boolean => {
      if (visiting.has(sid)) return true;
      if (visited.has(sid)) return false;
      visiting.add(sid);
      if (sessions.get(sid)?.prerequisite_ids.some(visit)) return true;
      visiting.delete(sid);
      visited.add(sid);
      return false;
    };
    if (p.sessions.some((s) => visit(s.id)))
      err('Prerequisites contain a cycle.', ['sessions']);
    if (p.horizon) {
      const h = p.horizon,
        tracks = new Set(h.tracks.map((t) => t.id));
      if (tracks.size !== h.tracks.length) err('Track IDs must be unique.', ['horizon', 'tracks']);
      if (!Object.keys(h.rhythm.days).length) err('Choose at least one learning day.', ['horizon', 'rhythm']);
      if (Object.values(h.rhythm.days).some((t) => !tracks.has(t)))
        err('A learning day points at an unknown track.', ['horizon', 'rhythm']);
      const topics = h.tracks.flatMap((t) => t.backlog.map((x) => x.id));
      if (new Set(topics).size !== topics.length) err('Topic IDs must be unique.', ['horizon', 'tracks']);
      if (topics.some((t) => sessions.has(t))) err('A topic is both scheduled and waiting.', ['horizon', 'tracks']);
      if (new Set(h.weeks.map((w) => w.start)).size !== h.weeks.length) err('Weeks must be unique.', ['horizon', 'weeks']);
      h.weeks.forEach((w, i) => {
        if (Temporal.PlainDate.from(w.start).dayOfWeek !== 1) err('A week starts on Monday.', ['horizon', 'weeks', i]);
      });
    }
  });
export type Plan = z.infer<typeof planSchema>;
export type Session = z.infer<typeof sessionSchema>;
export function parsePlan(text: string) {
  if (new TextEncoder().encode(text).length > MAX_IMPORT_BYTES)
    throw new Error('Choose a plan smaller than 2 MB.');
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error(
      'This file is not valid JSON. Choose JSON or use the Markdown importer.',
    );
  }
  const parsed = planSchema.safeParse(value);
  if (!parsed.success)
    throw new Error(
      parsed.error.issues
        .slice(0, 4)
        .map((i) => i.path.join('.') + ': ' + i.message)
        .join('\n'),
    );
  return parsed.data;
}
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object')
    return (
      '{' +
      Object.keys(value)
        .sort()
        .map(
          (k) =>
            JSON.stringify(k) +
            ':' +
            canonical((value as Record<string, unknown>)[k]),
        )
        .join(',') +
      '}'
    );
  return JSON.stringify(value);
}
export function planDiff(previous: Plan | undefined, next: Plan) {
  if (!previous) return { added: next.sessions.length, changed: 0, removed: 0 };
  const old = new Map(previous.sessions.map((s) => [s.id, s])),
    fresh = new Set(next.sessions.map((s) => s.id));
  return {
    added: next.sessions.filter((s) => !old.has(s.id)).length,
    changed: next.sessions.filter(
      (s) => old.has(s.id) && canonical(s) !== canonical(old.get(s.id)),
    ).length,
    removed: previous.sessions.filter((s) => !fresh.has(s.id)).length,
  };
}
export function monday(date: string) {
  return Temporal.PlainDate.from(date)
    .subtract({ days: Temporal.PlainDate.from(date).dayOfWeek - 1 })
    .toString();
}
export function dateInZone(zone: string, now = new Date()) {
  return Temporal.Instant.fromEpochMilliseconds(now.getTime())
    .toZonedDateTimeISO(zone)
    .toPlainDate()
    .toString();
}
export function instantFor(date: string, time: string, zone: string) {
  return Temporal.PlainDate.from(date)
    .toZonedDateTime({
      timeZone: zone,
      plainTime: Temporal.PlainTime.from(time),
    })
    .toInstant()
    .toString();
}
