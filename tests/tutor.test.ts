import { describe, expect, it } from 'vitest';
import { sentences } from '@/lib/stream-text';
import { minutesLeft } from '@/lib/learning/duration';
import { readPrefs } from '@/lib/prefs';
import { WRITING, writingLayer } from '@/lib/learning/voice';
import { replySchema } from '@/lib/tutor';
import { vizSchema } from '@/lib/viz/schema';

describe('streaming text', () => {
  it('shows only finished sentences while writing', () => {
    expect(sentences('Cash is king. Profit is an opin', true)).toEqual(['Cash is king. ']);
    expect(sentences('Cash is king. Profit is an opinion.', false)).toEqual(['Cash is king. ', 'Profit is an opinion.']);
  });
  it('releases a long unfinished sentence at a clause break', () => {
    const long = 'When a senator objects to unanimous consent, which is how almost everything moves, the chamber has to fall back on cloture, and that needs sixty votes to';
    const out = sentences(long, true);
    expect(out).toHaveLength(1);
    expect(out[0].endsWith(', ')).toBe(true);
  });
  it('holds back a unit with an unclosed bold marker', () => {
    expect(sentences('The **filibuster. is', true)).toEqual([]);
    expect(sentences('The **filibuster** works. More', true)).toEqual(['The **filibuster** works. ']);
  });
});

describe('minutes left in a session', () => {
  const step = (type: string, minutes: number, status = 'pending') => ({ type, minutes, status });
  it('uses the budget until the wrap-up is planned', () => {
    const beats = [step('situation', 2, 'done'), step('explain', 3, 'ready')];
    expect(Math.round(minutesLeft(beats, 1, 3, 45, false))).toBe(42);
  });
  it('counts only the remaining steps once the recap is planned', () => {
    const beats = [step('situation', 2, 'done'), step('explain', 3, 'done'), step('check', 2, 'done'), step('transfer', 4, 'ready'), step('recap', 2)];
    // 7 planned minutes done in 7 real minutes: pace 1. Half the transfer + recap.
    expect(minutesLeft(beats, 3, 7, 45, false)).toBe(4);
  });
  it('scales by the learner’s pace', () => {
    const beats = [step('situation', 2, 'done'), step('explain', 3, 'done'), step('check', 2, 'done'), step('transfer', 4, 'ready'), step('recap', 2)];
    // Twice as slow as estimated.
    expect(minutesLeft(beats, 3, 14, 45, true)).toBe(8);
  });
});

describe('writing style', () => {
  it('defaults to balanced and survives bad data', () => {
    expect(readPrefs({}).writing).toBe('balanced');
    expect(readPrefs({ writing: 'shouty' }).writing).toBe('balanced');
    expect(readPrefs({ writing: 'candid' }).writing).toBe('candid');
  });
  it('tells the tutor what each style means', () => {
    expect(writingLayer('candid')).toMatch(/swearing/);
    expect(writingLayer('concise')).toMatch(/short/i);
    for (const w of Object.values(WRITING)) expect(w.sample.length).toBeGreaterThan(20);
  });
});

describe('tutor chat', () => {
  it('accepts a reply with an action and a new visual', () => {
    const reply = replySchema.parse({
      blocks: [
        { type: 'text', md: 'Switched.' },
        {
          type: 'visual',
          visual: {
            type: 'venn',
            title: 'Two systems',
            sets: [
              { label: 'Federal', tone: 'accent' },
              { label: 'Devolved', tone: 'default' },
            ],
            regions: [{ sets: [0, 1], items: ['Regional parliaments'] }],
            takeaway: 'Both share power.',
          },
        },
      ],
      suggestions: ['Quiz me'],
      actions: [{ type: 'set_writing', writing: 'candid', href: null, label: null, content: null, energy: null, mood: null }],
    });
    expect(reply.actions[0].writing).toBe('candid');
  });
  it('knows the new visual templates', () => {
    for (const type of ['cycle', 'tree', 'parts', 'balance', 'venn'])
      expect(vizSchema.options.some((o) => o.shape.type.value === type)).toBe(true);
  });
});
