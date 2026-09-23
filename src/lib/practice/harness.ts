import { z } from 'zod';

// Spoken practice: debate, hard conversations, pitches, interviews,
// negotiation, delegation. A brief is generated per practice; the live voice
// instructions and the text partner are both built from it.

export const MODES = {
  debate: { label: 'Debate', blurb: 'Argue a position against a sharp, fair opponent.' },
  conversation: { label: 'Hard conversation', blurb: 'Feedback, disagreement, a missed commitment.' },
  negotiation: { label: 'Negotiation', blurb: 'Interests, alternatives, a walk-away point.' },
  pitch: { label: 'Pitch & questions', blurb: 'Make the case, then handle the skeptic.' },
  delegation: { label: 'Delegation', blurb: 'Hand off work so it comes back right.' },
  interview: { label: 'Interview', blurb: 'Answer well under follow-up questions.' },
  explain: { label: 'Explain it', blurb: 'Teach an idea to a smart non-expert.' },
  free: { label: 'Anything', blurb: 'Describe the conversation you want to rehearse.' },
} as const;
export type Mode = keyof typeof MODES;
export const modeSchema = z.enum(Object.keys(MODES) as [Mode, ...Mode[]]);
export const difficultySchema = z.enum(['gentle', 'realistic', 'tough']);
export type Difficulty = z.infer<typeof difficultySchema>;

// Voices verified with GPT-Live. Descriptions come from the provider's table.
export const VOICES = {
  cedar: { label: 'Cedar', note: 'Grounded, North American' },
  willow: { label: 'Willow', note: 'Warm, Irish' },
  meridian: { label: 'Meridian', note: 'Clear, North American' },
  gleam: { label: 'Gleam', note: 'Bright, North American' },
  vesper: { label: 'Vesper', note: 'Measured, British' },
  stone: { label: 'Stone', note: 'Low, Irish' },
} as const;
export type Voice = keyof typeof VOICES;
export const voiceSchema = z.enum(Object.keys(VOICES) as [Voice, ...Voice[]]);

export const briefSchema = z.object({
  title: z.string().describe('Short title, ≤ 6 words.'),
  partner: z.object({
    name: z.string(),
    role: z.string().describe('Who they are to the learner.'),
    stance: z.string().describe('What they want or believe going in.'),
    temperament: z.string().describe('How they come across; one line.'),
  }),
  situation: z.string().describe('2–3 sentences the learner reads before starting.'),
  learner_role: z.string(),
  learner_goal: z.string().describe('What a good outcome is for the learner, one sentence.'),
  opening: z.string().describe('The partner’s natural first line (≤ 25 words).'),
  complications: z
    .array(z.string())
    .describe('One or two realistic turns the partner introduces later, in order.'),
  success: z.array(z.string()).describe('3–4 observable things good performance includes.'),
  prep: z.array(z.string()).describe('2–3 short prompts to think about before starting.'),
});
export type Brief = z.infer<typeof briefSchema>;

const DIFFICULTY: Record<Difficulty, string> = {
  gentle:
    'Be cooperative. Push back mildly and only once or twice. If the learner stalls, give them an easy opening to continue.',
  realistic:
    'Behave like a plausible real person: reasonable, with your own interests. Push back when their point is vague or unsupported; accept it when it is good.',
  tough:
    'Be demanding but fair. Probe weak reasoning, ask pointed follow-ups, hold your position until given a genuinely good reason. Never rude, never personal.',
};

// GPT-Live instructions follow the provider's recommended structure: role and
// tone, then explicit backchannel, interruption and delegation policies.
export function liveInstructions(
  b: Brief,
  o: { mode: Mode; difficulty: Difficulty; minutes: number; pause: number; resume?: Line[] },
) {
  const debate =
    o.mode === 'debate'
      ? `
Debate conduct: Argue your side with the strongest honest case. Use real, widely known facts and say "roughly" or "as I understand it" rather than inventing precise statistics, studies or quotes. Concede a good point explicitly, then show why your position still holds. Never strawman the learner. Keep each turn to one argument. Separate factual disputes from value disagreements when that helps.`
      : '';
  return `You are ${b.partner.name}, ${b.partner.role}. This is a practice conversation inside a private learning app; the learner knows you are an AI playing a role, so never mention it. ${b.partner.temperament}

Scenario: ${b.situation}
Your position: ${b.partner.stance}
The learner is ${b.learner_role}. Their goal: ${b.learner_goal}

How to converse: Sound like a real person talking, not a narrator. Usually one or two short sentences per turn. Respond to exactly what they said. Ask at most one question at a time. Do not lecture, summarise, or coach. Vary your wording; no filler praise.
Difficulty: ${DIFFICULTY[o.difficulty]}${debate}

Backchannel policy: Use sparse, quiet acknowledgements only when natural. Give the learner about ${Math.max(2, Math.min(8, o.pause))} seconds of thinking room: a pause, "um", or self-correction is not your turn. If they say "let me think", wait.

Interruption policy: If the learner interrupts, stop and respond to their new point. Ignore coughs, background speech and noise. If something was unclear, ask rather than guess.

Complications: Introduce a complication only when the app tells you to, and then weave it in naturally.

Time: The conversation lasts about ${o.minutes} minutes. When the app says it is time to wrap up, bring things to a natural close within one or two turns.

Delegation policy:
Backend tools: None.
Delegate to the backend when: Never.
Do not delegate to the backend when: Always respond in character yourself.

Boundaries: Stay in character throughout. Do not evaluate the learner or give feedback; if asked, say you can talk about it after. Never claim to take real actions, send messages or schedule anything. Speak English unless the learner switches language.${
    o.resume?.length
      ? `

Resuming: the learner is redoing this conversation from a point partway through. Everything below already happened; continue from exactly there, in the same character and mood, as if no time has passed.
${o.resume.map((l) => `${l.role === 'user' ? 'Learner' : b.partner.name}: ${l.text}`).join('\n')}`
      : ''
  }`;
}

export const openingCommentary = (b: Brief, resume?: Line[]) => {
  const last = resume?.at(-1);
  if (!last) return `Open the conversation now, in character, with a line close to: "${b.opening}" Then listen.`;
  return last.role === 'assistant'
    ? `Pick the conversation back up: say your last line again, naturally, close to: "${last.text}" Then listen.`
    : `Pick the conversation back up by responding, in character, to the learner's last line: "${last.text}"`;
};
export const complicationInstruction = (c: string) =>
  `At the next natural moment, introduce this development in character: ${c}`;
export const WRAP_UP = 'Time is nearly up. Steer toward a natural close within your next one or two turns.';

export const feedbackSchema = z.object({
  headline: z.string().describe('One honest sentence on how it went.'),
  best: z.object({ quote: z.string().describe('A short quote of the learner’s best line.'), why: z.string() }),
  change: z.string().describe('The single most useful change, one or two sentences.'),
  rewrite: z.object({
    original: z.string().describe('A line the learner actually said.'),
    better: z.string().describe('A stronger version in their voice.'),
  }),
  criteria: z.array(
    z.object({
      name: z.string(),
      rating: z.enum(['strong', 'developing', 'focus']),
      note: z.string(),
    }),
  ),
  score: z.number().describe('0–1 overall against the success criteria.'),
  notes: z
    .array(
      z.object({
        line: z.number().int().describe('The [n] number of the learner line this note is about.'),
        kind: z.enum(['strength', 'change', 'moment']),
        note: z.string().describe('One or two sentences about that exact line.'),
      }),
    )
    .describe('Three to six notes pinned to specific learner lines, in transcript order: what worked, what to change, turning points.'),
});
export type PracticeNote = z.infer<typeof feedbackSchema>['notes'][number];
// Feedback written before notes existed has none.
export type PracticeFeedback = Omit<z.infer<typeof feedbackSchema>, 'notes'> & { notes?: PracticeNote[] };

export type Line = { role: 'user' | 'assistant'; text: string };
export const liveCost = (seconds: number) => (Math.max(15, seconds) * 0.05) / 60;
