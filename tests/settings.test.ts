import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { allowsPush, anyGame, patchPrefs, prefsOf, readPrefs, PREFS_RECORD } from '@/lib/prefs';
import { findTerms, phrasesOf, type Term } from '@/lib/notebook';
import { validRecord } from '@/lib/records';
import { build, OUT } from '../scripts/tokens';

describe('preferences', () => {
  it('fills every setting from defaults, one field at a time', () => {
    const p = readPrefs({ session: { confidence: false, breaks: 7 }, reading: { lessonFont: 'comic-sans' }, voice: 'nobody' });
    expect(p.session).toEqual({ familiarity: true, confidence: false, dontKnow: true, breaks: 5 });
    expect(p.reading.lessonFont).toBe('serif');
    expect(p.voice).toBe('cedar');
    expect(p.sound).toBe(false);
    expect(readPrefs(null)).toEqual(readPrefs({}));
  });
  it('reads the synced record and patches one group without touching others', () => {
    const records = [{ id: PREFS_RECORD, kind: 'settings' as const, data: { game: { xp: false } }, updated_at: '' }];
    const p = prefsOf({ records });
    expect(p.game).toEqual({ xp: false, streak: true, quests: true, pops: true });
    const q = patchPrefs(p, 'reading', { lessonFont: 'dyslexic' });
    expect(q.reading.lessonFont).toBe('dyslexic');
    expect(q.reading.size).toBe('m');
    expect(q.game.xp).toBe(false);
    expect(patchPrefs(q, 'sound', true).sound).toBe(true);
  });
  it('hides game elements only when every one is off', () => {
    const off = readPrefs({ game: { xp: false, streak: false, quests: false } });
    expect(anyGame(off)).toBe(false);
    expect(anyGame(readPrefs({ game: { xp: false } }))).toBe(true);
  });
  it('lets each kind of notification be turned off on its own', () => {
    const p = readPrefs({ notify: { nudge: false, insights: false } });
    expect(allowsPush(p, '2026-09-28:morning')).toBe(true);
    expect(allowsPush(p, '2026-09-28:followup')).toBe(false);
    expect(allowsPush(p, 'insights:2026-09-21')).toBe(false);
    expect(allowsPush(p, 'break:run:beat')).toBe(true);
    expect(allowsPush(p, 'week:2026-10-05')).toBe(true);
  });
  it('only accepts real time zones in settings', () => {
    expect(validRecord('settings', { timezone: 'Europe/Lisbon' })).toBe(true);
    expect(validRecord('settings', { timezone: 'Nowhere/Else' })).toBe(false);
  });
});

describe('recognising ideas met before', () => {
  const term = (title: string, key = title): Term => ({ key, title, track: 'finance', strength: 0.5, level: 'solid', words: null, phrases: phrasesOf(title) });
  it('takes phrases from a title, splitting comparisons', () => {
    expect(phrasesOf('Profit vs cash')).toEqual(['profit vs cash', 'profit']);
    expect(phrasesOf('Working capital')).toEqual(['working capital']);
    expect(phrasesOf('Naming the problem before proposing the fix')).toEqual([]);
  });
  it('marks whole words once, prefers the longer phrase, and allows plurals', () => {
    const terms = [term('Profit vs cash'), term('Working capital'), term('Margins')];
    const hits = findTerms('Profit vs cash explains nonprofit margins; profit again, and working capital.', terms);
    expect(hits.map((h) => h.term.key)).toEqual(['Profit vs cash', 'Margins', 'Working capital']);
    expect(hits[0]).toMatchObject({ start: 0, end: 14 });
    expect(findTerms('the margin', [term('Margins')])).toEqual([]);
  });
  it('skips ideas already marked or being taught', () => {
    expect(findTerms('working capital', [term('Working capital', 'wc')], new Set(['wc']))).toEqual([]);
  });
});

describe('design tokens for native apps', () => {
  it('are generated from the current tokens.css', () => {
    for (const [name, body] of Object.entries(build())) expect(readFileSync(join(OUT, name), 'utf8')).toBe(body);
  });
});
