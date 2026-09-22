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
});
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
    sessions: z.array(sessionSchema).min(1).max(1000),
    growth: extensions,
    adaptation: extensions,
    milestones: z
      .array(z.object({ date: dateSchema, title: z.string().min(1).max(300) }))
      .max(30),
  })
  .superRefine((p, ctx) => {
    const err = (message: string, path: (string | number)[] = []) =>
      ctx.addIssue({ code: 'custom', message, path });
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
