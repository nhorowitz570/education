import { z } from 'zod';
import { voiceSchema } from './practice/harness';
import { writingSchema, type Writing } from './learning/voice';

// The learner's preferences, as one synced setting. The server reads the parts
// that change what it does (how sessions are shaped, which notifications to
// send); the browser applies the rest (type, motion, sound, game elements).
// Every field falls back to its default on its own, so an old or partial
// record never breaks anything and new settings arrive already set.
export const PREFS_RECORD = 'settings:prefs';

export const FONTS = {
  sans: { label: 'Instrument Sans', note: 'Clean and even' },
  serif: { label: 'Newsreader', note: 'A book serif' },
  hyperlegible: { label: 'Atkinson Hyperlegible', note: 'Designed for low vision' },
  dyslexic: { label: 'OpenDyslexic', note: 'Weighted letters for dyslexia' },
} as const;
export type Font = keyof typeof FONTS;
const font = z.enum(Object.keys(FONTS) as [Font, ...Font[]]);

const DEFAULTS = {
  session: { familiarity: true, confidence: true, dontKnow: true, breaks: 5 as 0 | 5 | 10 },
  voice: 'cedar' as z.infer<typeof voiceSchema>,
  writing: 'balanced' as Writing,
  game: { xp: true, streak: true, quests: true, pops: true },
  reading: {
    size: 'm' as 's' | 'm' | 'l' | 'xl',
    lessonFont: 'serif' as Font,
    appFont: 'sans' as Font,
    width: 'normal' as 'narrow' | 'normal' | 'wide',
    motion: 'system' as 'system' | 'reduce' | 'full',
  },
  sound: false,
  notify: { morning: true, nudge: true, breaks: true, insights: true, week: true },
};

export const prefsSchema = z.object({
  session: z
    .object({
      familiarity: z.boolean().catch(DEFAULTS.session.familiarity),
      confidence: z.boolean().catch(DEFAULTS.session.confidence),
      dontKnow: z.boolean().catch(DEFAULTS.session.dontKnow),
      breaks: z.union([z.literal(0), z.literal(5), z.literal(10)]).catch(DEFAULTS.session.breaks),
    })
    .catch(DEFAULTS.session),
  voice: voiceSchema.catch(DEFAULTS.voice),
  writing: writingSchema.catch(DEFAULTS.writing),
  game: z
    .object({
      xp: z.boolean().catch(true),
      streak: z.boolean().catch(true),
      quests: z.boolean().catch(true),
      pops: z.boolean().catch(true),
    })
    .catch(DEFAULTS.game),
  reading: z
    .object({
      size: z.enum(['s', 'm', 'l', 'xl']).catch(DEFAULTS.reading.size),
      lessonFont: font.catch(DEFAULTS.reading.lessonFont),
      appFont: font.catch(DEFAULTS.reading.appFont),
      width: z.enum(['narrow', 'normal', 'wide']).catch(DEFAULTS.reading.width),
      motion: z.enum(['system', 'reduce', 'full']).catch(DEFAULTS.reading.motion),
    })
    .catch(DEFAULTS.reading),
  sound: z.boolean().catch(DEFAULTS.sound),
  notify: z
    .object({
      morning: z.boolean().catch(true),
      nudge: z.boolean().catch(true),
      breaks: z.boolean().catch(true),
      insights: z.boolean().catch(true),
      week: z.boolean().catch(true),
    })
    .catch(DEFAULTS.notify),
});
export type Prefs = z.infer<typeof prefsSchema>;

type Recorded = { records?: { id: string; data: Record<string, unknown> }[] };
export const readPrefs = (data: unknown): Prefs => prefsSchema.parse(data && typeof data === 'object' ? data : {});
export const prefsOf = (state: Recorded): Prefs => readPrefs(state.records?.find((r) => r.id === PREFS_RECORD)?.data);

// A change to one field of one group, merged over everything else.
export function patchPrefs<G extends keyof Prefs>(prefs: Prefs, group: G, value: Prefs[G] extends object ? Partial<Prefs[G]> : Prefs[G]): Prefs {
  const current = prefs[group];
  return {
    ...prefs,
    [group]: current && typeof current === 'object' ? { ...current, ...(value as object) } : value,
  } as Prefs;
}

// The game elements are all optional; when every one is off, nothing about
// points appears anywhere.
export const anyGame = (p: Prefs) => p.game.xp || p.game.streak || p.game.quests;

// Which push each notification switch governs, by the key it's sent under.
export function allowsPush(p: Prefs, key: string) {
  if (/:morning$/.test(key)) return p.notify.morning;
  if (/:followup$/.test(key)) return p.notify.nudge;
  if (key.startsWith('break:')) return p.notify.breaks;
  if (key.startsWith('insights:')) return p.notify.insights;
  if (key.startsWith('week:')) return p.notify.week;
  return true;
}
