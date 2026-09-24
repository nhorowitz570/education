import { z } from 'zod';
import { Temporal } from '@js-temporal/polyfill';
import { planSchema, dateSchema, timeSchema, timezoneSchema, safeUrl, type Plan } from '@/lib/plan';

// A Markdown plan is read into this compact skeleton, which a model can
// produce within its output budget even for a year of sessions. Everything
// derivable (IDs, dates, times, week records) is filled in by expand().
export const skeletonSchema = z.object({
  title: z.string(),
  learner_name: z.string(),
  timezone: z.string().describe('IANA zone, or empty if the plan does not say.'),
  start_date: z.string().describe('YYYY-MM-DD'),
  end_date: z.string().describe('YYYY-MM-DD'),
  weekdays: z.array(z.number().int()).describe('Learning days, Monday=0 … Sunday=6.'),
  start_local: z.string().describe('HH:MM'),
  end_local: z.string().describe('HH:MM'),
  goals: z.array(z.string()),
  weeks: z.array(
    z.object({
      start_date: z.string().describe('Monday of the week, YYYY-MM-DD'),
      mode: z.string().describe('standard, light, review, travel, …'),
      sessions: z.array(
        z.object({
          weekday: z.number().int().describe('Monday=0'),
          subject: z.string().describe('Short track name, e.g. finance'),
          title: z.string(),
          objective: z.string().describe('One sentence: what the learner can do after.'),
          evidence: z.string().describe('How they show it, a few words.'),
          optional: z.boolean(),
        }),
      ),
    }),
  ),
  milestones: z.array(z.object({ date: z.string(), title: z.string() })),
  sources: z.array(z.object({ title: z.string(), url: z.string(), use: z.string() })),
  uncertain: z.array(z.string()).describe('Every mapping you guessed or could not find.'),
});
export type Skeleton = z.infer<typeof skeletonSchema>;

const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60) || 'plan';
const ok = <T>(schema: z.ZodType<T>, v: unknown): v is T => schema.safeParse(v).success;
const minutes = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));

export function expand(s: Skeleton, fallback: { timezone?: string } = {}): { plan: Plan; uncertain: string[] } {
  const uncertain = [...s.uncertain];
  const guess = (what: string) => uncertain.push(`${what} was not clear in the plan; check it before activating.`);
  const timezone = ok(timezoneSchema, s.timezone)
    ? s.timezone
    : ok(timezoneSchema, fallback.timezone)
      ? fallback.timezone!
      : (guess('Time zone'), 'America/Los_Angeles');
  let start_local = ok(timeSchema, s.start_local) ? s.start_local : (guess('Start time'), '10:00');
  let end_local = ok(timeSchema, s.end_local) ? s.end_local : (guess('End time'), '11:00');
  if (minutes(end_local) <= minutes(start_local)) {
    guess('The daily window');
    end_local = `${String(Math.min(23, Math.floor(minutes(start_local) / 60) + 1)).padStart(2, '0')}:${start_local.slice(3)}`;
    if (minutes(end_local) <= minutes(start_local)) (start_local = '10:00'), (end_local = '11:00');
  }
  const duration = Math.max(5, Math.min(240, minutes(end_local) - minutes(start_local)));
  const weekdays = [...new Set(s.weekdays.filter((d) => d >= 0 && d <= 6))].sort();

  // Weeks are anchored to their Monday, whatever date the model gave.
  const monday = (d: string) => {
    const p = Temporal.PlainDate.from(d);
    return p.subtract({ days: p.dayOfWeek - 1 });
  };
  const weeks = s.weeks
    .filter((w) => ok(dateSchema, w.start_date))
    .sort((a, b) => a.start_date.localeCompare(b.start_date))
    .slice(0, 104);
  if (!weeks.length) throw new Error('No dated weeks were found in this plan.');
  const planStart = ok(dateSchema, s.start_date) ? s.start_date : (guess('Start date'), monday(weeks[0].start_date).toString());
  const lastWeek = monday(weeks.at(-1)!.start_date).add({ days: 6 }).toString();
  const planEnd = ok(dateSchema, s.end_date) && s.end_date >= planStart ? s.end_date : (guess('End date'), lastWeek);

  const ids = new Set<string>();
  const unique = (base: string) => {
    let id = base,
      n = 2;
    while (ids.has(id)) id = `${base}-${n++}`;
    ids.add(id);
    return id;
  };
  const sessions: Plan['sessions'] = [];
  const weekRows: Plan['weeks'] = weeks.map((w, i) => {
    const wid = unique(`w${String(i + 1).padStart(2, '0')}`);
    const base = monday(w.start_date);
    const topics: Record<string, string> = {};
    for (const x of w.sessions) {
      if (x.weekday < 0 || x.weekday > 6 || !x.title.trim()) continue;
      const date = base.add({ days: x.weekday }).toString();
      if (date < planStart || date > planEnd) continue;
      topics[DAYS[x.weekday]] = x.title.slice(0, 500);
      sessions.push({
        id: unique(`${wid}-${DAYS[x.weekday]}`),
        date,
        start_local,
        duration_minutes: duration,
        optional: x.optional,
        subject: (x.subject.trim().toLowerCase() || 'general').slice(0, 100),
        title: x.title.trim().slice(0, 300),
        objective: (x.objective.trim() || x.title.trim()).slice(0, 6000),
        evidence: x.evidence.trim().slice(0, 6000),
        source_ids: [],
        prerequisite_ids: [],
        generation_instructions: '',
      });
    }
    return { id: wid, start_date: base.toString(), mode: (w.mode || 'standard').slice(0, 80), topics, evidence: '' };
  });
  if (!sessions.length) throw new Error('No sessions could be placed on dates inside the plan.');

  const plan = {
    schema_version: '1.0' as const,
    plan_id: `${slug(s.title)}-${planStart.slice(0, 4)}`.slice(0, 100),
    title: (s.title.trim() || 'My learning plan').slice(0, 200),
    start_date: planStart,
    end_date: planEnd,
    profile: {
      name: (s.learner_name.trim() || 'Me').slice(0, 80),
      timezone,
      goals: s.goals.map((g) => g.slice(0, 6000)).slice(0, 30),
      preferences: {},
    },
    schedule: {
      weekdays: weekdays.length ? weekdays : [...new Set(sessions.map((x) => Temporal.PlainDate.from(x.date).dayOfWeek - 1))].sort(),
      start_local,
      end_local,
      timezone,
    },
    sources: s.sources
      .filter((x) => ok(safeUrl, x.url) && x.title.trim())
      .slice(0, 100)
      .map((x, i) => ({ id: `s${i + 1}`, title: x.title.slice(0, 300), url: x.url, use: x.use.slice(0, 6000) })),
    weeks: weekRows,
    sessions: sessions.slice(0, 1000),
    adaptation: {},
    milestones: s.milestones
      .filter((m) => ok(dateSchema, m.date) && m.date >= planStart && m.date <= planEnd && m.title.trim())
      .slice(0, 30)
      .map((m) => ({ date: m.date, title: m.title.slice(0, 300) })),
  };
  const parsed = planSchema.safeParse(plan);
  if (!parsed.success)
    throw new Error(parsed.error.issues.slice(0, 3).map((i) => i.path.join('.') + ': ' + i.message).join('\n'));
  return { plan: parsed.data, uncertain: [...new Set(uncertain)].slice(0, 20) };
}
