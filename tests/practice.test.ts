import { describe, expect, it } from 'vitest';
import { liveInstructions, liveCost, openingCommentary, type Brief } from '@/lib/practice/harness';

const brief: Brief = {
  title: 'Deposit before the shoot',
  partner: { name: 'Callum Reed', role: 'a client', stance: 'Wants to pay after delivery.', temperament: 'Direct.' },
  situation: 'Callum wants filming next week.',
  learner_role: 'the production lead',
  learner_goal: 'Agree a deposit before booking.',
  opening: 'Can you book the crew for Tuesday?',
  complications: ['Finance pays in 30 days.'],
  success: ['Asks about the constraint'],
  prep: ['What will you commit to?'],
};

describe('practice harness', () => {
  it('gives GPT-Live explicit backchannel, interruption and delegation policies', () => {
    const prompt = liveInstructions(brief, { mode: 'negotiation', difficulty: 'realistic', minutes: 5, pause: 6 });
    expect(prompt).toContain('Backchannel policy');
    expect(prompt).toContain('Interruption policy');
    expect(prompt).toContain('Delegation policy');
    expect(prompt).toContain('about 6 seconds');
    expect(prompt).toContain('Do not evaluate the learner');
    expect(prompt).not.toContain('Debate conduct');
    expect(prompt.length).toBeLessThan(4000);
  });
  it('adds honest-argument rules only to debates', () => {
    const prompt = liveInstructions(brief, { mode: 'debate', difficulty: 'tough', minutes: 5, pause: 20 });
    expect(prompt).toContain('Debate conduct');
    expect(prompt).toContain('about 8 seconds');
  });
  it('lets tough partners get heated and speak fast, gentle ones stay calm', () => {
    const persona: Brief = {
      ...brief,
      partner: { ...brief.partner, pronouns: 'she/her', from: 'Cork', triggers: ['being talked down to'], delivery: 'Quick and dry.' },
    };
    const tough = liveInstructions(persona, { mode: 'debate', difficulty: 'tough', minutes: 5, pause: 4 });
    expect(tough).toContain('(she/her, from Cork)');
    expect(tough).toContain('Speak faster');
    expect(tough).toContain('genuinely angry');
    expect(tough).toContain('being talked down to');
    expect(tough).toContain('no slurs');
    const gentle = liveInstructions(persona, { mode: 'negotiation', difficulty: 'gentle', minutes: 5, pause: 4 });
    expect(gentle).toContain('unhurried');
    expect(gentle).not.toContain('genuinely angry');
  });
  it('gives every voice a gender and accent to write the character around', async () => {
    const { VOICES } = await import('@/lib/practice/harness');
    for (const v of Object.values(VOICES)) {
      expect(['man', 'woman']).toContain(v.gender);
      expect(v.accent.length).toBeGreaterThan(2);
    }
    expect(VOICES.willow.gender).toBe('woman');
    expect(VOICES.willow.accent).toBe('Irish');
  });
  it('opens with the brief line', () => {
    expect(openingCommentary(brief)).toContain(brief.opening);
  });
  it('uses the 15-second Live minimum', () => {
    expect(liveCost(0)).toBe(0.0125);
    expect(liveCost(60)).toBe(0.05);
  });
});
