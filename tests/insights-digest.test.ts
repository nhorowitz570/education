import { describe, expect, it } from 'vitest';
import { DIGEST_LIMIT, digest, type InsightMetrics } from '@/lib/insights';

const long = (n: number) => 'word '.repeat(n).trim();
const cal = { n: 0, right: 0 };
function week(scale: number): InsightMetrics {
  return {
    week: { start: '2026-09-14', end: '2026-09-20', zone: 'America/Los_Angeles' },
    totals: {
      minutes: 300,
      days_active: 5,
      sessions_started: 6,
      sessions_finished: 5,
      reviews: 2,
      explorations: 1,
      rehearsals: 0,
      practices: scale,
      steps_done: 40,
      steps_skipped: 2,
      answers: 30,
      questions_asked: 12,
      words_written: 2400,
      words_spoken: 900,
    },
    by_day: Array.from({ length: 7 }, (_, i) => ({ date: `2026-09-${14 + i}`, minutes: 40, answers: 4, asks: 2 })),
    by_hour: Array.from({ length: 24 }, (_, h) => (h === 9 ? 12 : h === 10 ? 8 : h === 20 ? 3 : 0)),
    schedule: { planned: 4, completed: 4, missed: 0, skipped_by_choice: 0, reduced: 0, optional_steps_taken: 3 },
    answers: {
      total: 30,
      solid: 20,
      partial: 7,
      missed: 3,
      skipped: 1,
      avg_score: 0.74,
      retries: 4,
      retries_improved: 3,
      words_written: 2400,
      avg_words: 80,
      by_type: { check: { n: 10, avg: 0.7777777 } },
      calibration: { low: cal, medium: cal, high: cal },
    },
    asks: { total: 12, by_intent: { free: 12 }, highlighted: 2, examples: Array.from({ length: scale }, () => long(60)) },
    practice: Array.from({ length: scale }, () => ({
      mode: 'debate',
      difficulty: 'hard',
      channel: 'voice',
      minutes: 12,
      words_spoken: 900,
      score: 0.7,
      headline: long(80),
      criteria: Array.from({ length: 9 }, (_, i) => ({ name: 'c' + i, rating: 'strong' })),
      best: long(120),
      finished: true,
    })),
    concepts: { total: 40, touched: 8, levels: { new: 30, learning: 10 }, due: 3, new_misconceptions: Array.from({ length: scale }, () => long(80)) },
    checkins: Array.from({ length: 7 }, (_, i) => ({ date: `2026-09-${14 + i}`, energy: 3, mood: 'Good' })),
    reflections: Array.from({ length: scale }, () => long(200)),
    workouts: 2,
    samples: Array.from({ length: 8 }, () => ({ step: 'attempt', text: long(90), verdict: 'solid', confidence: 'high', retried: false })),
    empty: false,
  };
}

describe('insight digest', () => {
  it('caps every free-text field and never sends the whole week', () => {
    const d = JSON.parse(digest(week(40)));
    expect(d.reflections.length).toBeLessThanOrEqual(3);
    expect(d.practice.length).toBeLessThanOrEqual(6);
    expect(d.samples.length).toBeLessThanOrEqual(6);
    expect(d.asks.examples.length).toBeLessThanOrEqual(6);
    expect(d.concepts.new_misconceptions.length).toBeLessThanOrEqual(4);
    for (const p of d.practice) expect(p.criteria.length).toBeLessThanOrEqual(5);
    for (const s of d.samples) expect(s.text.length).toBeLessThanOrEqual(300);
    expect(d.by_hour).toBeUndefined();
    expect(d.peak_hours).toEqual([
      { hour: 9, events: 12 },
      { hour: 10, events: 8 },
      { hour: 20, events: 3 },
    ]);
  });
  it('stays valid JSON under the limit, shedding text rather than truncating', () => {
    const out = digest(week(400));
    expect(out.length).toBeLessThanOrEqual(DIGEST_LIMIT);
    expect(() => JSON.parse(out)).not.toThrow();
    // Numbers always survive.
    expect(JSON.parse(out).totals.minutes).toBe(300);
  });
  it('keeps a quiet week small', () => {
    expect(digest(week(0)).length).toBeLessThan(6000);
  });
});
