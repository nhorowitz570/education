import { describe, it, expect } from 'vitest';
import { outline } from '@/lib/learning/outline';
import { extend, nextStep, preview, remaining, type PlanInput, type Step } from '@/lib/learning/planner';

const base: PlanInput = {
  kind: 'session',
  minutes: 60,
  elapsed: 0,
  track: 'finance',
  concepts: ['profit-vs-cash', 'cash-timing'],
  familiarity: {},
  dueReviews: [],
  ahead: ['working-capital'],
  steps: [],
};

// Play a session through the planner: each question gets the verdict the
// script gives it (solid by default) and takes the step's estimated time.
function play(input: PlanInput, verdicts: Record<string, ('solid' | 'partial' | 'missed' | 'unknown')[]> = {}, gauge: PlanInput['familiarity'] = {}) {
  const steps: Step[] = [];
  const familiarity = { ...input.familiarity };
  let elapsed = 0;
  const seen: Record<string, number> = {};
  for (let n = 0; n < 60; n++) {
    const next = nextStep({ ...input, familiarity, steps, elapsed });
    if (!next) break;
    if (next.type === 'gauge') {
      familiarity[next.concept!] = gauge[next.concept!] || 'new';
      steps.push({ type: 'gauge', concept: next.concept, status: 'done', minutes: next.minutes });
      continue;
    }
    const question = ['recall', 'check', 'attempt', 'transfer', 'produce'].includes(next.type);
    const k = next.concept || '';
    const v = question ? (verdicts[k]?.[(seen[k] = (seen[k] ?? -1) + 1)] ?? 'solid') : undefined;
    steps.push({
      type: next.type,
      concept: next.concept,
      status: 'done',
      minutes: next.minutes,
      ...(v === 'unknown' ? { unknown: true, verdict: 'missed' as const } : v ? { verdict: v } : {}),
    });
    elapsed += next.minutes;
    if (next.type === 'recap') break;
  }
  return steps;
}
const types = (s: Step[]) => s.map((x) => x.type);

describe('adaptive planner', () => {
  it('asks how familiar a new idea is before teaching it', () => {
    expect(nextStep(base)?.type).toBe('gauge');
  });
  it('opens with retrieval when an earlier idea is fading', () => {
    expect(nextStep({ ...base, dueReviews: ['old-idea'] })?.type).toBe('recall');
  });
  it('orients a newcomer and shows a worked example before any question', () => {
    const s = play(base);
    const firstQuestion = s.findIndex((x) => x.type === 'check');
    expect(types(s).slice(0, firstQuestion)).toEqual(['gauge', 'situation', 'orient', 'worked']);
  });
  it('lets someone who has used the idea skip straight to a harder decision', () => {
    const s = play(base, {}, { 'profit-vs-cash': 'fluent' });
    expect(types(s).slice(0, 3)).toEqual(['gauge', 'situation', 'check']);
    expect(s.some((x) => x.concept === 'profit-vs-cash' && (x.type === 'orient' || x.type === 'explain'))).toBe(false);
  });
  it('re-teaches after a miss and checks again', () => {
    const s = play(base, { 'profit-vs-cash': ['missed', 'solid'] }, { 'profit-vs-cash': 'familiar' });
    const miss = s.findIndex((x) => x.verdict === 'missed');
    expect(['explain', 'worked']).toContain(s[miss + 1].type);
    expect(s[miss + 2].type).toBe('check');
  });
  it('teaches with a worked example after "I don’t know yet"', () => {
    const s = play(base, { 'profit-vs-cash': ['unknown'] }, { 'profit-vs-cash': 'familiar' });
    const miss = s.findIndex((x) => x.unknown);
    expect(s[miss + 1].type).toBe('worked');
  });
  it('fills the time budget when the learner is fast, instead of ending early', () => {
    const s = play({ ...base, minutes: 60 });
    const used = s.reduce((n, x) => n + x.minutes, 0);
    expect(used).toBeGreaterThanOrEqual(50);
    expect(used).toBeLessThanOrEqual(64);
    expect(s.at(-1)!.type).toBe('recap');
    // Being fast means getting ahead: today's second idea is reached.
    expect(s.some((x) => x.concept === 'cash-timing')).toBe(true);
  });
  it('fits a short session and still closes properly', () => {
    const s = play({ ...base, kind: 'return', minutes: 20 });
    expect(s.reduce((n, x) => n + x.minutes, 0)).toBeLessThanOrEqual(22);
    expect(s.at(-1)!.type).toBe('recap');
  });
  it('waits for a question to be answered before deciding what follows it', () => {
    const steps: Step[] = [
      { type: 'gauge', concept: 'profit-vs-cash', status: 'done', minutes: 0.5 },
      { type: 'situation', concept: 'profit-vs-cash', status: 'done', minutes: 2 },
      { type: 'check', concept: 'profit-vs-cash', status: 'ready', minutes: 2 },
    ];
    expect(nextStep({ ...base, familiarity: { 'profit-vs-cash': 'fluent' }, steps })).toBeNull();
  });
  it('plans ahead only up to the next decision point', () => {
    const planned = extend({ ...base, familiarity: { 'profit-vs-cash': 'new' } });
    expect(planned.map((b) => b.type)).toEqual(['situation', 'orient', 'worked', 'check']);
  });
  it('wraps up immediately when asked', () => {
    const steps: Step[] = [{ type: 'gauge', concept: 'profit-vs-cash', status: 'done', minutes: 0.5 }];
    expect(nextStep({ ...base, steps, wrap: true })?.type).toBe('recap');
  });
  it('counts real time: little left means closing soon', () => {
    const steps: Step[] = [
      { type: 'gauge', concept: 'profit-vs-cash', status: 'done', minutes: 0.5 },
      { type: 'situation', concept: 'profit-vs-cash', status: 'done', minutes: 2 },
    ];
    const i = { ...base, familiarity: { 'profit-vs-cash': 'fluent' as const }, steps, elapsed: 58 };
    expect(remaining(i)).toBeLessThan(3);
    expect(nextStep(i)?.type).toBe('recap');
  });
  it('adds a break in long sessions', () => {
    expect(types(play({ ...base, minutes: 120, evidence: 'Explain why a profitable company could run out of cash' }))).toContain('break');
  });
  it('produces the week’s evidence once the idea has been practised', () => {
    const s = play({ ...base, minutes: 90, evidence: 'Explain why a profitable company could run out of cash' });
    const produce = s.findIndex((x) => x.type === 'produce');
    expect(produce).toBeGreaterThan(s.findIndex((x) => x.type === 'check'));
  });
  it('uses spoken role-play for communication sessions when voice is available', () => {
    expect(types(play({ ...base, minutes: 90, track: 'communication', voice: true }))).toContain('roleplay');
  });
  it('previews a plausible session for Today', () => {
    const p = preview({ ...base, familiarity: {} });
    expect(p[0].type).toBe('gauge');
    expect(p.at(-1)!.type).toBe('recap');
  });
});

describe('fixed outlines', () => {
  it('builds review runs from due concepts only', () => {
    const b = outline({ kind: 'review', minutes: 10, concepts: [], dueReviews: ['a', 'b', 'c', 'd'] });
    expect(b.filter((x) => x.type === 'recall').map((x) => x.concept)).toEqual(['a', 'b', 'c']);
  });
  it('answers an exploration directly', () => {
    const b = outline({ kind: 'explore', minutes: 20, concepts: ['explore'], dueReviews: [] });
    expect(b[0].type).toBe('explain');
  });
});
