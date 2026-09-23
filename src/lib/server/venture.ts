import 'server-only';
import { z } from 'zod';
import { adminClient } from '@/lib/supabase/server';
import { generate } from '@/lib/ai/engine';
import { HttpError } from './http';
import { readState } from './state';
import { concepts, states } from './learner';
import { dateInZone, type Plan } from '@/lib/plan';
import { level } from '@/lib/learning/model';
import {
  KINDS,
  choose,
  create,
  sanitize,
  simulate,
  summary,
  type KindId,
  type Levers,
  type Venture,
  type VentureEvent,
} from '@/lib/venture/engine';
import { fallbackDebrief, fallbackEvent } from '@/lib/venture/story';
import { TOOLS, type Tool } from '@/lib/venture/tools';
import { APP_NAME } from '@/lib/brand';

const db = () => adminClient();

async function load(userId: string): Promise<{ state: Venture; revision: number } | null> {
  const { data, error } = await db().from('ventures').select('state,revision').eq('user_id', userId).maybeSingle();
  if (error) throw new Error('Your company could not be loaded.');
  return data ? { state: data.state as Venture, revision: data.revision } : null;
}

// Saved after every change. The revision check means two open tabs can't
// silently overwrite each other's months.
async function save(userId: string, state: Venture, revision: number | null) {
  if (revision === null) {
    const { error } = await db().from('ventures').upsert({ user_id: userId, state, revision: 1, updated_at: new Date().toISOString() });
    if (error) throw new Error('Your company could not be saved.');
    return 1;
  }
  const { data, error } = await db()
    .from('ventures')
    .update({ state, revision: revision + 1, updated_at: new Date().toISOString() })
    .eq('user_id', userId)
    .eq('revision', revision)
    .select('revision');
  if (error) throw new Error('Your company could not be saved.');
  if (!data?.length) throw new HttpError('Your company changed in another tab. Reload to continue.', 409);
  return revision + 1;
}

// Months are earned by learning: a few to start, more for each session.
export const START_MONTHS = 3;
const EARN: Record<string, number> = { session: 2, return: 2, rehearsal: 2, review: 1, practice: 1, explore: 1 };
async function months(userId: string, v: Venture) {
  const { data } = await db()
    .from('runs')
    .select('kind')
    .eq('user_id', userId)
    .eq('status', 'done')
    .gte('ended_at', v.created_at)
    .limit(2000);
  const earned = START_MONTHS + (data || []).reduce((n, r) => n + (EARN[r.kind] || 0), 0);
  const used = v.month + (v.carried || 0);
  return { earned, used, available: Math.max(0, earned - used) };
}

// What the learner has studied, for the tools it unlocks and for the story.
async function learning(userId: string, plan?: Plan) {
  if (!plan) return { practised: [] as string[], recent: [] as string[], upcoming: [] as string[] };
  const [graph, learned] = await Promise.all([concepts(userId, plan), states(userId, plan.plan_id)]);
  const now = new Date().toISOString();
  const title = (k: string) => graph.list.find((c) => c.key === k)?.title || k;
  const seen = [...learned.values()].filter((s) => s.exposures > 0);
  const practised = seen.filter((s) => ['practiced', 'solid', 'mastered'].includes(level(s, now))).map((s) => title(s.concept_key));
  const recent = seen
    .sort((a, b) => (b.last_seen_at || '').localeCompare(a.last_seen_at || ''))
    .slice(0, 6)
    .map((s) => title(s.concept_key));
  const upcoming = graph.list
    .filter((c) => !learned.get(c.key)?.exposures)
    .slice(0, 4)
    .map((c) => c.title);
  return { practised, recent, upcoming };
}

function tools(studied: string[]): (Tool & { unlocked: boolean })[] {
  return TOOLS.map((t) => ({ ...t, unlocked: studied.some((s) => t.match.test(s)) }));
}

export async function ventureView(userId: string) {
  const [row, state] = await Promise.all([load(userId), readState(userId)]);
  const [l, m] = await Promise.all([learning(userId, state.plan), row ? months(userId, row.state) : Promise.resolve(null)]);
  const studied = [...new Set([...l.practised, ...l.recent])];
  return {
    venture: row?.state || null,
    revision: row?.revision ?? null,
    months: m,
    tools: tools(studied).map(({ match: _m, ...t }) => t),
    founder: state.plan?.profile.name || '',
  };
}

// ---------- The month's story ----------

const effectsSchema = z.object({
  cash: z.number().nullable().describe('Immediate cash in (+) or out (−), in dollars.'),
  cash_later: z.object({ amount: z.number(), months: z.number().int() }).nullable().describe('Money that arrives (+) or a bill that falls due (−) in 1–3 months.'),
  demand_pct: z.number().nullable().describe('Change in customer demand, percent, for demand_months.'),
  demand_months: z.number().int().nullable(),
  reputation: z.number().nullable().describe('−15..15'),
  morale: z.number().nullable().describe('−15..15'),
  unit_cost_pct: z.number().nullable().describe('Change in the variable cost of each unit, percent, for demand_months.'),
  capacity_pct: z.number().nullable().describe('Change in capacity, percent, for demand_months.'),
  staff: z.number().int().nullable().describe('−1, 0 or 1'),
});
const monthSchema = z.object({
  debrief: z
    .string()
    .nullable()
    .describe('2–3 sentences on last month: what happened in the numbers and the one idea that explains it. Null before the first month.'),
  event: z.object({
    headline: z.string().describe('At most 8 words.'),
    story: z.string().describe('60–110 words, second person, specific people and numbers.'),
    concept: z.string().describe('The idea this decision exercises, in a few plain words.'),
    choices: z.array(z.object({ label: z.string(), detail: z.string(), effects: effectsSchema })).describe('Two or three genuinely different options with real trade-offs.'),
  }),
});
const noNulls = (o: Record<string, unknown>) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== null));

async function story(userId: string, v: Venture): Promise<{ debrief: string | null; event: VentureEvent }> {
  const l = await readState(userId)
    .then((s) => learning(userId, s.plan))
    .catch(() => ({ practised: [], recent: [] as string[], upcoming: [] as string[] }));
  const k = KINDS[v.kind];
  const last = v.history.at(-1);
  try {
    const { data } = await generate({
      task: 'venture.month',
      userId,
      schema: monthSchema,
      input: [
        summary(v),
        last
          ? `Last month in full: demand ${last.demand}, capacity ${last.capacity}, sold ${last.units} at $${last.price}; revenue $${last.revenue}, cost of goods $${last.cogs}, waste $${last.waste}, rent $${last.opex.rent}, wages $${last.opex.wages}, marketing $${last.opex.marketing}, interest $${last.opex.interest}, depreciation $${last.opex.depreciation}; profit $${last.profit}. Cash $${last.cashStart} → $${last.cashEnd} (collected $${last.collected}; spent on stock $${last.spent.stock}; loan repaid $${last.spent.loan}; equipment $${last.spent.equipment}). Notes: ${last.notes.join(' ') || 'none'}.`
          : '',
        `Typical monthly revenue for this business is about $${Math.round(k.price * k.demand)}; keep money effects proportionate.`,
        l.recent.length ? `Ideas the learner has been studying recently (prefer an event that makes them use one): ${l.recent.join('; ')}.` : '',
        l.upcoming.length ? `Coming up in their plan: ${l.upcoming.join('; ')}.` : '',
        v.history.length ? `Recent events to avoid repeating: ${v.history.slice(-4).map((h) => h.choice).filter(Boolean).join('; ') || 'none'}.` : '',
      ]
        .filter(Boolean)
        .join('\n'),
    });
    return {
      debrief: last ? data.debrief : null,
      event: {
        headline: data.event.headline.slice(0, 80),
        story: data.event.story.slice(0, 900),
        concept: data.event.concept.slice(0, 80),
        choices: data.event.choices.slice(0, 3).map((c) => ({
          label: c.label.slice(0, 80),
          detail: c.detail.slice(0, 200),
          effects: noNulls(c.effects),
        })),
      },
    };
  } catch (e) {
    console.error('venture story', e instanceof Error ? e.message : e);
    return { debrief: fallbackDebrief(v), event: fallbackEvent(v) };
  }
}

// ---------- Actions ----------

export type VentureAction =
  | { action: 'create'; kind: KindId; name: string; founder: string; loan: boolean; restart?: boolean }
  | { action: 'levers'; revision: number; levers: Partial<Levers> }
  | { action: 'choose'; revision: number; index: number }
  | { action: 'advance'; revision: number; levers?: Partial<Levers> };

export async function ventureAct(userId: string, a: VentureAction) {
  const row = await load(userId);
  if (a.action === 'create') {
    if (row && row.state.status === 'running' && !a.restart) throw new HttpError('You already run a company.', 409);
    let v = create({ kind: a.kind, name: a.name, founder: a.founder, loan: a.loan, now: new Date() });
    // A fresh start keeps count of months already played, so the months
    // earned by learning aren't handed out twice.
    if (row) v = { ...v, created_at: row.state.created_at, carried: (row.state.carried || 0) + row.state.month };
    const s = await story(userId, v);
    v = { ...v, event: s.event };
    const revision = row ? await save(userId, v, row.revision) : await save(userId, v, null);
    return { venture: v, revision };
  }
  if (!row) throw new HttpError('Start a company first.', 404);
  if (a.revision !== row.revision) throw new HttpError('Your company changed in another tab. Reload to continue.', 409);
  let v = row.state;
  if (v.status !== 'running') throw new HttpError('This company has closed. Start a new one.', 409);
  if (a.action === 'levers') {
    v = { ...v, levers: sanitize(v, { ...v.levers, ...a.levers }) };
    return { venture: v, revision: await save(userId, v, row.revision) };
  }
  if (a.action === 'choose') {
    v = choose(v, a.index);
    return { venture: v, revision: await save(userId, v, row.revision) };
  }
  // Advance one month.
  if (v.event && v.event.chosen === undefined) throw new HttpError('Decide how to handle this month’s event first.', 409);
  const m = await months(userId, v);
  if (m.available < 1) throw new HttpError('No months left. Finish a session to earn more.', 409);
  if (a.levers) v = { ...v, levers: sanitize(v, { ...v.levers, ...a.levers }) };
  const zone = (await readState(userId)).plan?.schedule.timezone || 'America/Los_Angeles';
  const { venture, result } = simulate(v, dateInZone(zone));
  let next = venture;
  if (next.status === 'running') {
    const s = await story(userId, next);
    next = { ...next, event: s.event, debrief: s.debrief };
  } else next = { ...next, debrief: fallbackDebrief(next) };
  const revision = await save(userId, next, row.revision);
  return { venture: next, revision, result, months: { ...m, used: m.used + 1, available: m.available - 1 } };
}

// For the tutor: the learner's company, so lessons can use it as a scenario.
export async function ventureLayer(userId: string) {
  const row = await load(userId).catch(() => null);
  if (!row || row.state.status !== 'running' || !row.state.month) return null;
  return `${summary(row.state)}\nThis is the learner's own fictional company in Venture, ${APP_NAME}'s business simulation. When it genuinely fits the idea being taught, you may use it as the scenario or connect the idea to a decision they made there. Keep its facts exactly as stated; never invent results for it.`;
}
