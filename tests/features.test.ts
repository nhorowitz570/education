import { describe, expect, it } from 'vitest';
import { calibration, fresh, projected, update } from '@/lib/learning/model';
import { outline, total } from '@/lib/learning/outline';
import { today } from '@/lib/learning/today';
import { canRetry, type Beat } from '@/lib/learning/run';
import { openingCommentary, liveInstructions, type Brief } from '@/lib/practice/harness';
import { lastWeek, trailingWeek } from '@/lib/server/insights';
import { DEMO_PLAN } from '@/lib/seed';
import { emptyState, type AppState } from '@/lib/types';

const at = (day: number) => new Date(Date.UTC(2026, 9, 1) + day * 86400000).toISOString();

describe('confidence in the learner model', () => {
  it('counts a right answer called a guess as weaker evidence', () => {
    const start = update(fresh('x'), { kind: 'exposure', at: at(0) });
    const sure = update(start, { kind: 'explain', score: 0.9, confidence: 'medium', at: at(0) });
    const guess = update(start, { kind: 'explain', score: 0.9, confidence: 'low', at: at(0) });
    expect(guess.p_known).toBeLessThan(sure.p_known);
  });
  it('treats a confident miss as harder than an honest one', () => {
    const start = update(fresh('x'), { kind: 'exposure', at: at(0) });
    const honest = update(start, { kind: 'explain', score: 0.1, confidence: 'low', at: at(0) });
    const certain = update(start, { kind: 'explain', score: 0.1, confidence: 'high', at: at(0) });
    expect(certain.difficulty).toBeGreaterThan(honest.difficulty);
  });
  it('measures calibration per confidence level', () => {
    const c = calibration([
      { score: 1, confidence: 'high' },
      { score: 0.2, confidence: 'high' },
      { score: 0.8, confidence: 'low' },
      { score: null, confidence: 'low' },
      { score: 1, confidence: null },
    ]);
    expect(c.high).toEqual({ n: 2, right: 1 });
    expect(c.low).toEqual({ n: 1, right: 1 });
    expect(c.medium.n).toBe(0);
  });
  it('projects strength falling without review', () => {
    let s = update(fresh('x'), { kind: 'explain', score: 0.9, at: at(0) });
    s = update(s, { kind: 'recall', score: 0.9, at: at(2) });
    const now = projected(s, Date.parse(at(2)));
    const later = projected(s, Date.parse(at(32)));
    expect(later.strength).toBeLessThan(now.strength);
    expect(later.recall).toBeLessThan(now.recall);
  });
});

describe('rehearsals', () => {
  it('builds a mock of the milestone around a produce step', () => {
    const b = outline({ kind: 'rehearsal', minutes: 30, concepts: ['a', 'b', 'c'], dueReviews: [], evidence: 'A cash briefing' });
    expect(b.map((x) => x.type)).toEqual(['recall', 'recall', 'check', 'produce', 'recap']);
    expect(b.find((x) => x.type === 'produce')!.intent).toContain('A cash briefing');
    expect(total(b)).toBeLessThanOrEqual(35);
  });
  it('offers a rehearsal two weeks before a milestone, until one is done', () => {
    const plan = structuredClone(DEMO_PLAN);
    const m = plan.milestones[0];
    const state: AppState = { ...structuredClone(emptyState), plan };
    const d = new Date(m.date + 'T12:00:00Z');
    d.setUTCDate(d.getUTCDate() - 10);
    const date = d.toISOString().slice(0, 10);
    const all = (v: ReturnType<typeof today>) => [v.primary, ...v.secondary].filter(Boolean);
    const offered = today({ state, date, hour: 9, dueCount: 0, voice: false });
    expect(all(offered).some((a) => a!.kind === 'rehearsal' && a!.milestone === m.date)).toBe(true);
    const done = today({ state, date, hour: 9, dueCount: 0, voice: false, rehearsed: [m.date] });
    expect(all(done).some((a) => a!.kind === 'rehearsal')).toBe(false);
  });
});

describe('retries', () => {
  const beat = (over: Partial<Beat>): Beat =>
    ({ id: 'b', type: 'attempt', minutes: 5, intent: '', status: 'done', question: { kind: 'text', options: null, placeholder: null, long: true }, ...over }) as Beat;
  it('allows one retry of a text answer that missed', () => {
    const f = { verdict: 'partial' as const, score: 0.5, blocks: [] };
    expect(canRetry(beat({ feedback: f }))).toBe(true);
    expect(canRetry(beat({ feedback: { ...f, verdict: 'solid' } }))).toBe(false);
    expect(canRetry(beat({ feedback: f, attempts: [{ response: { at: '' }, feedback: f }] }))).toBe(false);
    expect(canRetry(beat({ feedback: f, question: { kind: 'choice', options: ['a'], placeholder: null, long: false } }))).toBe(false);
  });
});

describe('practice redo', () => {
  const brief = {
    title: 't',
    partner: { name: 'Priya', role: 'CFO', stance: 's', temperament: '' },
    situation: 's',
    learner_role: 'r',
    learner_goal: 'g',
    opening: 'Hello there.',
    complications: [],
    success: [],
    prep: [],
  } as unknown as Brief;
  it('picks the conversation back up at the partner’s last line', () => {
    expect(openingCommentary(brief)).toContain('Hello there.');
    const resume = [
      { role: 'assistant' as const, text: 'Why now?' },
      { role: 'user' as const, text: 'Because cash is tight.' },
      { role: 'assistant' as const, text: 'Prove it.' },
    ];
    expect(openingCommentary(brief, resume)).toContain('Prove it.');
    expect(liveInstructions(brief, { mode: 'conversation', difficulty: 'realistic', minutes: 5, pause: 3, resume })).toContain(
      'Because cash is tight.',
    );
  });
});

describe('insight weeks', () => {
  it('reads the last complete Monday–Sunday week', () => {
    // Wednesday 2026-10-14 in Los Angeles.
    const w = lastWeek('America/Los_Angeles', new Date('2026-10-14T18:00:00Z'));
    expect(w).toEqual({ start: '2026-10-05', end: '2026-10-11' });
  });
  it('reads the seven days up to today for a first read', () => {
    const w = trailingWeek('America/Los_Angeles', new Date('2026-10-14T18:00:00Z'));
    expect(w).toEqual({ start: '2026-10-08', end: '2026-10-14' });
  });
});
